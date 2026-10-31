import db from '../config/db.js';
import { deriveCode, sameCode } from '../utils/authToken.js';
import { hashPassword } from '../utils/passwordUtil.js';
import { passwordMessage } from '../utils/passwordPolicy.js';
import { isAdminUsername } from '../utils/adminUtil.js';
import { PUBLIC_CLASS_ID, SYSTEM_USERNAME } from '../models/Class.js';
import { sendMail } from '../utils/mailer.js';

/**
 * ============================================================================
 * resetController.js        forgotten password, no e-mail server needed
 *
 *   POST /api/auth/reset-code      (teacher logged in)  { username }  -> one-time code for that person
 *   POST /api/auth/reset-password  (anyone)  { username, code, password }
 *
 * How it works
 *   1. The person who forgot tells their teacher (student in a class) or the admin (teacher, or a
 *      public student). That helper types the person's username in "Kod tetapan semula kata laluan"
 *      on the class manager page and reads out the code (e.g. K7Q2-M9XD).
 *   2. The person opens "Lupa kata laluan?" on the login page and enters username + code + new password.
 *
 * The code is made from: the username's userID + the CURRENT password hash + a 30 minute time slot
 * + the server secret. So it
 *   - only works for that one username (typing another username fails),
 *   - stops working the moment the password changes (one use),
 *   - expires after 30-60 minutes,
 *   - needs nothing new in the database.
 * Who may issue a code: a teacher for the students of their own classes; the admin for public students
 * and for other teachers. Admin accounts reset with  node scripts/set-password.js  on the server.
 * ============================================================================
 */
const SLOT_MS = 30 * 60 * 1000;
const trim = (v) => (typeof v === 'string' ? v.trim() : '');
const fail = (res, code, message, errors = null) => res.status(code).json({ success: false, message, ...(errors ? { errors } : {}) });

const codeFor = (user, slot) => deriveCode('reset', `${user.userID}|${user.password}|${slot}`, 8);
const nowSlot = () => Math.floor(Date.now() / SLOT_MS);

async function findUser(username) {
  const name = trim(username).toLowerCase();
  if (!name || name.length > 50 || name === SYSTEM_USERNAME) return null;
  const [[u]] = await db.query('SELECT userID, username, role, password FROM User WHERE LOWER(username) = ? LIMIT 1', [name]);
  return u || null;
}

/** POST /api/auth/reset-code      (behind requireTeacher) */
export const issueResetCode = async (req, res) => {
  try {
    const user = await findUser(req.body && req.body.username);
    const notYours = () => fail(res, 404, 'Pengguna ini tidak dijumpai di bawah jagaan anda. Guru boleh menetapkan semula pelajar kelas sendiri; admin menguruskan murid awam dan guru lain.');
    if (!user || isAdminUsername(user.username)) return notYours();

    let allowed = false;
    if (user.role === 'Student') {
      const [[row]] = await db.query(
        `SELECT s.classID, c.teacherID FROM Student s JOIN Class c ON c.classID = s.classID WHERE s.userID = ? LIMIT 1`, [user.userID]);
      allowed = Boolean(row) && (row.teacherID === req.teacher.teacherID || (req.teacher.isAdmin && row.classID === PUBLIC_CLASS_ID));
    } else if (user.role === 'Teacher') {
      allowed = req.teacher.isAdmin;                      // only the admin helps a teacher who is locked out
    }
    if (!allowed) return notYours();
    return res.json({ success: true, username: user.username, code: codeFor(user, nowSlot()), minutes: 30 });
  } catch (err) {
    console.error('issueResetCode error:', err.message);
    return fail(res, 500, 'Kod tidak dapat dijana. Sila cuba lagi.');
  }
};

/** POST /api/auth/reset-password */
export const redeemResetCode = async (req, res) => {
  const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
  const errors = {};
  if (password !== password.trim()) errors.password = 'Kata laluan tidak boleh bermula atau berakhir dengan ruang kosong.';
  else {
    // peraturan kata laluan (utils/passwordPolicy.js)
    const typedUser = typeof (req.body && req.body.username) === 'string' ? req.body.username.trim().toLowerCase() : '';
    const pm = passwordMessage(password, { username: typedUser });
    if (pm) errors.password = pm;
  }
  if (Object.keys(errors).length) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', errors);
  try {
    const user = await findUser(req.body.username);
    const slot = nowSlot();
    const ok = user && !isAdminUsername(user.username)
      && (sameCode(req.body.code, codeFor(user, slot)) || sameCode(req.body.code, codeFor(user, slot - 1)));
    // same answer for "no such user" and "wrong code": nobody can use this to find out which usernames exist
    if (!ok) return fail(res, 401, 'Nama pengguna atau kod tidak betul, atau kod sudah tamat tempoh. Minta kod baharu.');
    if (password.toLowerCase() === user.username.toLowerCase()) return fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { password: 'Kata laluan tidak boleh sama dengan nama pengguna.' });
    await db.query('UPDATE User SET password = ? WHERE userID = ?', [await hashPassword(password, 'scrypt'), user.userID]);
    return res.json({ success: true, message: 'Kata laluan telah ditukar. Sila log masuk.' });
  } catch (err) {
    console.error('redeemResetCode error:', err.message);
    return fail(res, 500, 'Kata laluan tidak dapat ditukar. Sila cuba lagi.');
  }
};

/**
 * POST /api/auth/forgot   { username }   (tanpa log masuk)
 * Jika nama pengguna ialah e-mel yang berdaftar, hantar kod + pautan ke e-mel itu.
 * Jawapan SENTIASA sama (sama ada akaun ada atau tidak) supaya orang tidak boleh menyemak e-mel siapa yang berdaftar.
 */
export const forgotByEmail = async (req, res) => {
  const reply = () => res.json({ success: true, message: 'Jika e-mel itu berdaftar, kod tetapan semula telah dihantar. Semak peti masuk (dan folder spam). Kod sah 30 minit.' });
  try {
    const user = await findUser(req.body && req.body.username);
    if (!user || isAdminUsername(user.username) || !user.username.includes('@')) return reply();
    const code = codeFor(user, nowSlot());
    const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const link = `${base}/index.html?reset=${encodeURIComponent(user.role)}&u=${encodeURIComponent(user.username)}&c=${encodeURIComponent(code)}`;
    await sendMail({
      to: user.username,
      subject: 'SejarahWira: kod tetapan semula kata laluan',
      text: `Kod tetapan semula anda: ${code}\n\nAtau buka pautan ini:\n${link}\n\nKod sah 30 minit dan hanya boleh digunakan sekali. Jika bukan anda yang memintanya, abaikan e-mel ini.`,
      html: `<p>Kod tetapan semula anda:</p><p style="font-size:24px;letter-spacing:3px"><b>${code}</b></p><p><a href="${link}">Tukar kata laluan sekarang</a></p><p>Kod sah 30 minit dan hanya boleh digunakan sekali. Jika bukan anda yang memintanya, abaikan e-mel ini.</p>`
    });
  } catch (err) {
    console.error('forgotByEmail error:', err.message);
  }
  return reply();
};
