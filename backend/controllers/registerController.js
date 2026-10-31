import { passwordMessage } from '../utils/passwordPolicy.js';
import db from '../config/db.js';
import { Student } from '../models/Student.js';
import { Teacher } from '../models/Teacher.js';
import { User } from '../models/User.js';
import { ClassModel, PUBLIC_CLASS_ID } from '../models/Class.js';
import { hashPassword } from '../utils/passwordUtil.js';
import { issueSession } from './authController.js';
import { isAdminUsername } from '../utils/adminUtil.js';
import { cleanCode, deriveCode, sameCode } from '../utils/authToken.js';
import { sendMail, mailReady } from '../utils/mailer.js';

/**
 * ============================================================================
 * registerController.js          sign-up (no admin approval)
 *
 *   POST /api/auth/register-student   a student: joins the public class PUBLIC/0000, or - when they type the
 *                                     class code from their teacher (classCode) - that teacher's class
 *   POST /api/auth/register-teacher   a teacher: gets an empty account, then adds their own classes
 *                                     and students. Optional TEACHER_SIGNUP_CODE in .env (a shared
 *                                     secret you give to real teachers) if you ever see abuse.
 *
 * Both log the new user in at once (same answer as /login). Passwords are stored hashed.
 * Nothing new in the database: User + Student / Teacher rows only.
 * ============================================================================
 */
const MARKUP = /[<>]/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;                 // old style name (students only)
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;   // e-mail used as the username (max 50, the User.username size)
/* ---------- pengesahan e-mel guru: kod dihantar ke e-mel, guru taip kod itu semasa daftar ---------- */
const SLOT_MS = 30 * 60 * 1000;
const slotNow = () => Math.floor(Date.now() / SLOT_MS);
const verifyCodeFor = (email, slot) => deriveCode('verify-teacher', `${email}|${slot}`, 8);   // sama e-mel + sama masa = sama kod
const verifyCodeOk = (email, code) => sameCode(code, verifyCodeFor(email, slotNow())) || sameCode(code, verifyCodeFor(email, slotNow() - 1));
/** TEACHER_EMAIL_DOMAINS=moe.edu.my,moe-dl.edu.my  (kosong = semua domain dibenarkan) */
function domainError(email) {
  const list = String(process.env.TEACHER_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  if (!list.length) return null;
  const domain = email.split('@')[1] || '';
  return list.some((d) => domain === d || domain.endsWith(`.${d}`)) ? null : `E-mel guru mesti daripada: ${list.join(', ')}.`;
}
/** guru boleh langkau pengesahan e-mel dengan TEACHER_SIGNUP_CODE (pilihan, untuk guru luar senarai atau ujian tanpa SMTP) */
const bypassCode = (body) => Boolean(process.env.TEACHER_SIGNUP_CODE) && trim(body && body.code) === process.env.TEACHER_SIGNUP_CODE;

const trim = (v) => (typeof v === 'string' ? v.trim() : '');
const fail = (res, code, message, errors = null) => res.status(code).json({ success: false, message, ...(errors ? { errors } : {}) });

function validate(body, { needCode = false, emailOnly = false } = {}) {
  const errors = {};
  const name = trim(body && body.name);
  const username = trim(body && body.username).toLowerCase();
  const password = typeof (body && body.password) === 'string' ? body.password : '';

  if (!name) errors.name = 'Nama wajib diisi.';
  else if (name.length < 2 || name.length > 100) errors.name = 'Nama mesti 2 hingga 100 aksara.';
  else if (MARKUP.test(name)) errors.name = 'Aksara < dan > tidak dibenarkan.';

  // an admin username can never be claimed through public sign-up (admins come from the seed or scripts/create-admin.js)
  if (isAdminUsername(username)) errors.username = 'Nama pengguna ini sudah digunakan.';
  else if (username.length > 50) errors.username = 'E-mel terlalu panjang (maksimum 50 aksara).';
  else if (EMAIL_RE.test(username)) { if (emailOnly && domainError(username)) errors.username = domainError(username); }
  else if (emailOnly) errors.username = 'Guru mesti mendaftar dengan e-mel (contoh: cikgu@sekolah.edu.my).';
  else if (!USERNAME_RE.test(username)) errors.username = 'Gunakan e-mel, atau nama pengguna 3-30 aksara: huruf kecil, nombor, titik, garis bawah atau sengkang.';
  // peraturan kata laluan (utils/passwordPolicy.js): panjang, huruf + nombor, bukan kata laluan biasa, bukan nama pengguna
  if (password !== password.trim()) errors.password = 'Kata laluan tidak boleh bermula atau berakhir dengan ruang kosong.';
  else {
    const pm = passwordMessage(password, { username, name });
    if (pm) errors.password = pm;
  }

  // guru: mesti taip kod pengesahan yang dihantar ke e-mel (atau guna kod pendaftaran guru sebagai ganti)
  if (needCode && !errors.username && !bypassCode(body)) {
    if (process.env.TEACHER_SIGNUP_CODE && trim(body && body.code)) errors.code = 'Kod pendaftaran guru tidak betul.';
    else if (!verifyCodeOk(username, body && body.verifyCode)) errors.verifyCode = 'Kod pengesahan salah atau sudah tamat tempoh. Tekan "Hantar kod pengesahan" untuk kod baharu.';
  }
  return { errors, value: { name, username, password } };
}

const isDup = (err) => err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);

async function inTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// nama jadual / lajur dimasukkan terus ke dalam teks SQL, jadi MESTI daripada senarai ini sahaja
const NUMBER_TARGETS = { Student: ['studentID'], Class: ['classID'], Teacher: ['teacherID'], User: ['username'] };

async function nextNumber(conn, table, column, prefix, floor) {
  if (!NUMBER_TARGETS[table] || !NUMBER_TARGETS[table].includes(column)) throw new Error(`Jadual / lajur tidak dibenarkan: ${table}.${column}`);
  if (!/^[A-Za-z0-9_]{0,10}$/.test(prefix)) throw new Error('Awalan tidak sah.');
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(${column}, ?) AS UNSIGNED)) AS n FROM ${table} WHERE ${column} REGEXP ?`,
    [prefix.length + 1, `^${prefix}[0-9]+$`]);
  return Math.max(floor, Number(row && row.n) || 0) + 1;
}

/** POST /api/auth/register-student */
export const registerStudent = async (req, res) => {
  const { errors, value } = validate(req.body);
  if (Object.keys(errors).length) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', errors);
  try {
    // optional: the class code from the teacher. Without it the student learns in the public class.
    let classID = PUBLIC_CLASS_ID;
    if (cleanCode(req.body && req.body.classCode)) {
      const cls = await ClassModel.findByJoinCode(String(req.body.classCode));
      if (!cls) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { classCode: 'Kod kelas tidak dijumpai. Semak dengan guru anda, atau kosongkan dan masukkannya kemudian.' });
      classID = cls.classID;
    }
    const hash = await hashPassword(value.password, 'scrypt');
    await inTransaction(async (conn) => {
      const [[dup]] = await conn.query('SELECT userID FROM User WHERE username = ? LIMIT 1', [value.username]);
      if (dup) { const e = new Error('username'); e.field = 'username'; throw e; }
      const studentID = `S${await nextNumber(conn, 'Student', 'studentID', 'S', 1000)}`;
      const [u] = await conn.query('INSERT INTO User (username, role, password) VALUES (?, ?, ?)', [value.username, 'Student', hash]);
      await conn.query('INSERT INTO Student (studentID, studentName, userID, classID, avatarID) VALUES (?, ?, ?, ?, 1)',
        [studentID, value.name, u.insertId, classID]);
      // Class.joinClass(): makes sure the class really exists
      if (!(await ClassModel.joinClass(studentID, classID, conn))) throw new Error('Kelas tiada.');
    });
    const user = await User.findByUsernameAndRole(value.username, 'Student');
    return res.status(201).json({ success: true, data: await issueSession(user, await Student.getProfile(user)) });
  } catch (err) {
    if (err.field === 'username' || isDup(err)) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { username: 'Nama pengguna ini sudah digunakan.' });
    console.error('registerStudent error:', err.message);
    return fail(res, 500, 'Pendaftaran gagal. Sila cuba lagi.');
  }
};

/** POST /api/auth/register-teacher */
export const registerTeacher = async (req, res) => {
  const { errors, value } = validate(req.body, { needCode: true, emailOnly: true });
  if (Object.keys(errors).length) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', errors);
  try {
    const hash = await hashPassword(value.password, 'scrypt');
    await inTransaction(async (conn) => {
      const [[dup]] = await conn.query('SELECT userID FROM User WHERE username = ? LIMIT 1', [value.username]);
      if (dup) { const e = new Error('username'); e.field = 'username'; throw e; }
      const teacherID = `T${await nextNumber(conn, 'Teacher', 'teacherID', 'T', 1000)}`;
      const [u] = await conn.query('INSERT INTO User (username, role, password) VALUES (?, ?, ?)', [value.username, 'Teacher', hash]);
      await conn.query('INSERT INTO Teacher (teacherID, teacherName, userID) VALUES (?, ?, ?)', [teacherID, value.name, u.insertId]);
    });
    const user = await User.findByUsernameAndRole(value.username, 'Teacher');
    return res.status(201).json({ success: true, data: await issueSession(user, await Teacher.getProfile(user)) });
  } catch (err) {
    if (err.field === 'username' || isDup(err)) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { username: 'Nama pengguna ini sudah digunakan.' });
    console.error('registerTeacher error:', err.message);
    return fail(res, 500, 'Pendaftaran gagal. Sila cuba lagi.');
  }
};

/**
 * POST /api/auth/verify-teacher-email   { username }
 * Hantar kod pengesahan ke e-mel guru yang mahu mendaftar. Hanya pemilik peti e-mel itu boleh menerimanya.
 */
export const sendTeacherVerifyCode = async (req, res) => {
  const username = trim(req.body && req.body.username).toLowerCase();
  if (!EMAIL_RE.test(username) || username.length > 50) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { username: 'Masukkan e-mel yang sah (contoh: cikgu@moe.edu.my).' });
  if (domainError(username)) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { username: domainError(username) });
  if (!mailReady()) return fail(res, 503, 'Pengesahan e-mel belum tersedia di pelayan ini. Minta admin tetapkan SMTP, atau guna kod pendaftaran guru.');
  try {
    const [[dup]] = await db.query('SELECT userID FROM User WHERE username = ? LIMIT 1', [username]);
    if (dup) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { username: 'E-mel ini sudah didaftarkan. Cuba log masuk atau "Lupa kata laluan?".' });
    const code = verifyCodeFor(username, slotNow());
    const sent = await sendMail({
      to: username,
      subject: 'SejarahWira: kod pengesahan e-mel guru',
      text: `Kod pengesahan anda: ${code}\n\nTaip kod ini pada borang pendaftaran guru. Kod sah 30 minit. Jika bukan anda yang mendaftar, abaikan e-mel ini.`,
      html: `<p>Kod pengesahan anda:</p><p style="font-size:24px;letter-spacing:3px"><b>${code}</b></p><p>Taip kod ini pada borang pendaftaran guru. Kod sah 30 minit. Jika bukan anda yang mendaftar, abaikan e-mel ini.</p>`
    });
    if (!sent) return fail(res, 500, 'E-mel tidak dapat dihantar. Sila cuba lagi sebentar.');
    return res.json({ success: true, message: 'Kod pengesahan telah dihantar ke e-mel anda. Semak peti masuk (dan folder spam).' });
  } catch (err) {
    console.error('sendTeacherVerifyCode error:', err.message);
    return fail(res, 500, 'Kod tidak dapat dihantar. Sila cuba lagi.');
  }
};
