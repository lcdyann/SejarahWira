import db from '../config/db.js';
import { detectMode, hashPassword, generatePassword } from '../utils/passwordUtil.js';
import { ClassModel } from '../models/Class.js';
import { passwordMessage } from '../utils/passwordPolicy.js';

/**
 * ============================================================================
 * classManagerController.js       Teacher: manage classes and students
 * Mounted behind requireTeacher:  app.use('/api/classes', classRoutes)
 *
 *   GET    /                              list my classes (+ student counts)
 *   POST   /                              create class
 *   PUT    /:classID                      rename / change year
 *   DELETE /:classID                      delete (only when it has no students)
 *   GET    /:classID/students             students of a class
 *   POST   /:classID/students             add one student      (creates User + Student)
 *   POST   /:classID/students/bulk        add many from a list of names (passwords generated)
 *   PUT    /students/:studentID           edit name / move to another of my classes
 *   POST   /students/:studentID/reset-password
 *   DELETE /students/:studentID           delete the student AND their login + progress
 *
 * Every class / student is checked against req.teacher.teacherID (from the signed token):
 * a teacher can never touch another teacher's class. Validation errors: 422 {errors:{field:msg}}.
 * Plain passwords are only ever returned ONCE, in the response that created / reset them.
 * ============================================================================
 */

const MARKUP = /[<>]/;
const NAME_MAX = 100;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,50}$/;
const STUDENT_ID_RE = /^[A-Za-z0-9_-]{1,20}$/;
const BULK_MAX = 60;
const trim = (v) => (typeof v === 'string' ? v.trim() : '');

/* ------------------------------ validation (pure) ------------------------------ */
export function validateClass(body = {}) {
  const className = trim(body.className);
  const year = Number(body.batchYear);
  const errors = {};
  if (!className) errors.className = 'Nama kelas wajib diisi.';
  else if (className.length > 20) errors.className = 'Nama kelas terlalu panjang (maksimum 20 aksara).';
  else if (MARKUP.test(className)) errors.className = 'Aksara < dan > tidak dibenarkan.';
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.batchYear = 'Tahun kumpulan mesti antara 2000 dan 2100.';
  return { errors, value: { className, batchYear: year } };
}

export function validateStudent(body = {}, { needAccount = true } = {}) {
  const v = {
    studentName: trim(body.studentName), username: trim(body.username),
    password: typeof body.password === 'string' ? body.password : '', studentID: trim(body.studentID)
  };
  const errors = {};
  if (!v.studentName) errors.studentName = 'Nama pelajar wajib diisi.';
  else if (v.studentName.length > NAME_MAX) errors.studentName = `Nama terlalu panjang (maksimum ${NAME_MAX} aksara).`;
  else if (MARKUP.test(v.studentName)) errors.studentName = 'Aksara < dan > tidak dibenarkan.';
  if (needAccount) {
    if (!v.username) errors.username = 'Nama pengguna wajib diisi.';
    else if (!USERNAME_RE.test(v.username)) errors.username = 'Nama pengguna 3-50 aksara: huruf, nombor, titik, garis bawah atau sengkang.';
    if (!v.password) errors.password = 'Kata laluan wajib diisi.';
    else {
      // peraturan kata laluan (utils/passwordPolicy.js): 8-72 aksara, huruf + nombor, bukan kata laluan biasa, bukan nama pengguna
      const pm = passwordMessage(v.password, { username: v.username, name: v.studentName });
      if (pm) errors.password = pm;
    }
    if (v.studentID && !STUDENT_ID_RE.test(v.studentID)) errors.studentID = 'ID pelajar: huruf, nombor, garis bawah atau sengkang (maksimum 20).';
  }
  return { errors, value: v };
}

/** "Ahmad bin Ali" -> "ahmadbinali" (max 20, at least 3 chars) */
export function usernameBase(name) {
  const base = name.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return base.length >= 3 ? base : `${base}pelajar`.slice(0, 20);
}

/* ------------------------------ helpers ------------------------------ */
const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const invalid = (res, errors) => fail(res, 422, 'Sila betulkan ruangan yang ditandakan.', { errors });

async function ownClass(classID, teacherID, conn = db) {
  const [[row]] = await conn.query('SELECT classID, className, batchYear FROM Class WHERE classID = ? AND teacherID = ? LIMIT 1', [classID, teacherID]);
  return row || null;
}
async function ownStudent(studentID, teacherID, conn = db) {
  const [[row]] = await conn.query(
    `SELECT s.studentID, s.studentName, s.userID, s.classID FROM Student s
       JOIN Class c ON c.classID = s.classID WHERE s.studentID = ? AND c.teacherID = ? LIMIT 1`, [studentID, teacherID]);
  return row || null;
}
async function nextStudentNumber(conn) {
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(studentID, 2) AS UNSIGNED)) AS n FROM Student WHERE studentID REGEXP '^S[0-9]+$'`);
  return Math.max(1000, Number(row && row.n) || 0) + 1;
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

const shapeStudent = (r) => ({ studentID: r.studentID, studentName: r.studentName, username: r.username, classID: r.classID });

/* ------------------------------ classes ------------------------------ */
export const listClasses = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.classID, c.className, c.batchYear, COUNT(s.studentID) AS studentCount
         FROM Class c LEFT JOIN Student s ON s.classID = c.classID WHERE c.teacherID = ?
        GROUP BY c.classID, c.className, c.batchYear ORDER BY c.batchYear DESC, c.className`, [req.teacher.teacherID]);
    return res.json({ success: true, classes: rows.map((c) => ({ ...c, batchYear: Number(c.batchYear), studentCount: Number(c.studentCount), joinCode: ClassModel.joinCodeOf(c.classID) })) });
  } catch (err) {
    console.error('listClasses error:', err);
    return fail(res, 500, 'Senarai kelas tidak dapat dimuatkan. Sila cuba lagi.');
  }
};

export const createClass = async (req, res) => {
  const { errors, value } = validateClass(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);
  try {
    const [[dup]] = await db.query('SELECT classID FROM Class WHERE teacherID = ? AND className = ? AND batchYear = ? LIMIT 1',
      [req.teacher.teacherID, value.className, value.batchYear]);
    if (dup) return invalid(res, { className: 'Anda sudah mempunyai kelas dengan nama dan tahun ini.' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [[row]] = await db.query(
        `SELECT MAX(CAST(SUBSTRING_INDEX(classID, '-', -1) AS UNSIGNED)) AS n FROM Class WHERE classID LIKE ?`, [`C${value.batchYear}-%`]);
      const classID = `C${value.batchYear}-${(Number(row && row.n) || 0) + 1 + attempt}`;
      try {
        await db.query('INSERT INTO Class (classID, className, batchYear, teacherID) VALUES (?, ?, ?, ?)',
          [classID, value.className, value.batchYear, req.teacher.teacherID]);
        return res.status(201).json({ success: true, message: 'Kelas berjaya dicipta.', class: { classID, ...value, studentCount: 0 } });
      } catch (err) { if (!isDup(err)) throw err; }
    }
    return fail(res, 409, 'Kelas tidak dapat dicipta kerana pertembungan ID. Sila cuba lagi.');
  } catch (err) {
    console.error('createClass error:', err);
    return fail(res, 500, 'Kelas tidak dapat dicipta. Sila cuba lagi.');
  }
};

export const editClass = async (req, res) => {
  const { errors, value } = validateClass(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);
  try {
    const cls = await ownClass(req.params.classID, req.teacher.teacherID);
    if (!cls) return fail(res, 404, 'Kelas tidak dijumpai.');
    const [[dup]] = await db.query('SELECT classID FROM Class WHERE teacherID = ? AND className = ? AND batchYear = ? AND classID <> ? LIMIT 1',
      [req.teacher.teacherID, value.className, value.batchYear, cls.classID]);
    if (dup) return invalid(res, { className: 'Anda sudah mempunyai kelas dengan nama dan tahun ini.' });
    await db.query('UPDATE Class SET className = ?, batchYear = ? WHERE classID = ?', [value.className, value.batchYear, cls.classID]);
    return res.json({ success: true, message: 'Kelas dikemas kini.', class: { classID: cls.classID, ...value } });
  } catch (err) {
    console.error('editClass error:', err);
    return fail(res, 500, 'Kelas tidak dapat dikemas kini. Sila cuba lagi.');
  }
};

export const removeClass = async (req, res) => {
  try {
    const cls = await ownClass(req.params.classID, req.teacher.teacherID);
    if (!cls) return fail(res, 404, 'Kelas tidak dijumpai.');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM Student WHERE classID = ?', [cls.classID]);
    if (Number(n) > 0) return fail(res, 409, `Kelas ini masih mempunyai ${n} pelajar. Pindahkan atau padam pelajar dahulu.`);
    await db.query('DELETE FROM Class WHERE classID = ?', [cls.classID]);
    return res.json({ success: true, message: 'Kelas dipadam.' });
  } catch (err) {
    console.error('removeClass error:', err);
    return fail(res, 500, 'Kelas tidak dapat dipadam. Sila cuba lagi.');
  }
};

/* ------------------------------ students ------------------------------ */
export const listStudents = async (req, res) => {
  try {
    const cls = await ownClass(req.params.classID, req.teacher.teacherID);
    if (!cls) return fail(res, 404, 'Kelas tidak dijumpai.');
    const [rows] = await db.query(
      `SELECT s.studentID, s.studentName, s.classID, u.username FROM Student s JOIN User u ON u.userID = s.userID
        WHERE s.classID = ? ORDER BY s.studentName`, [cls.classID]);
    return res.json({ success: true, class: { ...cls, batchYear: Number(cls.batchYear), joinCode: ClassModel.joinCodeOf(cls.classID) }, students: rows.map(shapeStudent) });
  } catch (err) {
    console.error('listStudents error:', err);
    return fail(res, 500, 'Senarai pelajar tidak dapat dimuatkan. Sila cuba lagi.');
  }
};

export const addStudent = async (req, res) => {
  const { errors, value } = validateStudent(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);
  try {
    const cls = await ownClass(req.params.classID, req.teacher.teacherID);
    if (!cls) return fail(res, 404, 'Kelas tidak dijumpai.');
    const mode = await detectMode(db, req.teacher.userID || await teacherUserID(req.teacher.teacherID));
    const hash = await hashPassword(value.password, mode);

    const created = await inTransaction(async (conn) => {
      const [[uDup]] = await conn.query('SELECT userID FROM User WHERE username = ? LIMIT 1', [value.username]);
      if (uDup) { const e = new Error('username'); e.field = 'username'; throw e; }
      let studentID = value.studentID;
      if (studentID) {
        const [[sDup]] = await conn.query('SELECT studentID FROM Student WHERE studentID = ? LIMIT 1', [studentID]);
        if (sDup) { const e = new Error('studentID'); e.field = 'studentID'; throw e; }
      } else studentID = `S${await nextStudentNumber(conn)}`;
      const [u] = await conn.query('INSERT INTO User (username, role, password) VALUES (?, ?, ?)', [value.username, 'Student', hash]);
      await conn.query('INSERT INTO Student (studentID, studentName, userID, classID) VALUES (?, ?, ?, ?)',
        [studentID, value.studentName, u.insertId, cls.classID]);
      return studentID;
    });
    return res.status(201).json({ success: true, message: 'Pelajar berjaya ditambah.',
      student: { studentID: created, studentName: value.studentName, username: value.username, classID: cls.classID } });
  } catch (err) {
    if (err.field === 'username') return invalid(res, { username: 'Nama pengguna ini sudah digunakan.' });
    if (err.field === 'studentID') return invalid(res, { studentID: 'ID pelajar ini sudah wujud.' });
    if (isDup(err)) return fail(res, 409, 'Pertembungan data semasa menambah pelajar. Sila cuba lagi.');
    console.error('addStudent error:', err.message);
    return fail(res, 500, err.message && err.message.startsWith('Pakej') ? err.message : 'Pelajar tidak dapat ditambah. Sila cuba lagi.');
  }
};

export const addStudentsBulk = async (req, res) => {
  const names = Array.isArray(req.body && req.body.names) ? req.body.names.map(trim).filter(Boolean) : [];
  if (!names.length) return invalid(res, { names: 'Masukkan sekurang-kurangnya satu nama.' });
  if (names.length > BULK_MAX) return invalid(res, { names: `Maksimum ${BULK_MAX} pelajar sekali gus.` });
  const rowErrors = [];
  names.forEach((n, i) => {
    const e = validateStudent({ studentName: n }, { needAccount: false }).errors.studentName;
    if (e) rowErrors.push(`Baris ${i + 1}: ${e}`);
  });
  if (rowErrors.length) return invalid(res, { names: rowErrors.slice(0, 5).join(' ') });

  try {
    const cls = await ownClass(req.params.classID, req.teacher.teacherID);
    if (!cls) return fail(res, 404, 'Kelas tidak dijumpai.');
    const mode = await detectMode(db, req.teacher.userID || await teacherUserID(req.teacher.teacherID));

    const prepared = [];
    for (const name of names) {
      const password = generatePassword(8);
      prepared.push({ name, password, hash: await hashPassword(password, mode) });
    }

    const result = await inTransaction(async (conn) => {
      let n = await nextStudentNumber(conn);
      const taken = new Set();
      const out = [];
      for (const p of prepared) {
        const base = usernameBase(p.name);
        let username = base; let i = 1;
        // eslint-disable-next-line no-await-in-loop
        while (taken.has(username) || (await conn.query('SELECT 1 FROM User WHERE username = ? LIMIT 1', [username]))[0].length) {
          i += 1; username = `${base.slice(0, 20 - String(i).length)}${i}`;
        }
        taken.add(username);
        const studentID = `S${n}`; n += 1;
        const [u] = await conn.query('INSERT INTO User (username, role, password) VALUES (?, ?, ?)', [username, 'Student', p.hash]);
        await conn.query('INSERT INTO Student (studentID, studentName, userID, classID) VALUES (?, ?, ?, ?)', [studentID, p.name, u.insertId, cls.classID]);
        out.push({ studentID, studentName: p.name, username, password: p.password });
      }
      return out;
    });
    return res.status(201).json({ success: true, message: `${result.length} pelajar berjaya ditambah.`, students: result });
  } catch (err) {
    if (isDup(err)) return fail(res, 409, 'Pertembungan data semasa menambah pelajar. Tiada pelajar ditambah, sila cuba lagi.');
    console.error('addStudentsBulk error:', err.message);
    return fail(res, 500, err.message && err.message.startsWith('Pakej') ? err.message : 'Pelajar tidak dapat ditambah. Tiada perubahan dibuat.');
  }
};

export const editStudent = async (req, res) => {
  const { errors, value } = validateStudent(req.body, { needAccount: false });
  const targetClass = trim(req.body && req.body.classID);
  if (Object.keys(errors).length) return invalid(res, errors);
  try {
    const stu = await ownStudent(req.params.studentID, req.teacher.teacherID);
    if (!stu) return fail(res, 404, 'Pelajar tidak dijumpai.');
    let classID = stu.classID;
    if (targetClass && targetClass !== stu.classID) {
      const cls = await ownClass(targetClass, req.teacher.teacherID);
      if (!cls) return invalid(res, { classID: 'Kelas sasaran tidak dijumpai.' });
      classID = cls.classID;
    }
    await db.query('UPDATE Student SET studentName = ? WHERE studentID = ?', [value.studentName, stu.studentID]);
    if (classID !== stu.classID) await ClassModel.joinClass(stu.studentID, classID);        // Class.joinClass()
    return res.json({ success: true, message: 'Maklumat pelajar dikemas kini.', student: { studentID: stu.studentID, studentName: value.studentName, classID } });
  } catch (err) {
    console.error('editStudent error:', err);
    return fail(res, 500, 'Pelajar tidak dapat dikemas kini. Sila cuba lagi.');
  }
};

/** Class.leaveClass(): the student keeps the account and all progress and becomes a public learner (PUBLIC/0000) */
export const leaveClassStudent = async (req, res) => {
  try {
    const stu = await ownStudent(req.params.studentID, req.teacher.teacherID);
    if (!stu) return fail(res, 404, 'Pelajar tidak dijumpai.');
    await ClassModel.leaveClass(stu.studentID);
    return res.json({ success: true, message: `${stu.studentName} telah dikeluarkan daripada kelas dan tidak lagi dalam kelas anda.` });
  } catch (err) {
    console.error('leaveClass error:', err);
    return fail(res, 500, 'Pelajar tidak dapat dikeluarkan daripada kelas. Sila cuba lagi.');
  }
};

export const resetPassword = async (req, res) => {
  try {
    const stu = await ownStudent(req.params.studentID, req.teacher.teacherID);
    if (!stu) return fail(res, 404, 'Pelajar tidak dijumpai.');
    const typed = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (typed) {
      const [[acc]] = await db.query('SELECT username FROM User WHERE userID = ? LIMIT 1', [stu.userID]);
      const pe = validateStudent({ studentName: stu.studentName, username: (acc && acc.username) || 'pelajar', password: typed }).errors.password;
      if (pe) return invalid(res, { password: pe });
    }
    const password = typed || generatePassword(8);
    const mode = await detectMode(db, req.teacher.userID || await teacherUserID(req.teacher.teacherID));
    await db.query('UPDATE User SET password = ? WHERE userID = ?', [await hashPassword(password, mode), stu.userID]);
    return res.json({ success: true, message: 'Kata laluan ditetapkan semula.', studentID: stu.studentID, password });
  } catch (err) {
    console.error('resetPassword error:', err.message);
    return fail(res, 500, err.message && err.message.startsWith('Pakej') ? err.message : 'Kata laluan tidak dapat ditetapkan semula. Sila cuba lagi.');
  }
};

export const removeStudent = async (req, res) => {
  try {
    const stu = await ownStudent(req.params.studentID, req.teacher.teacherID);
    if (!stu) return fail(res, 404, 'Pelajar tidak dijumpai.');
    // Student.userID -> User ON DELETE CASCADE: deleting the login removes the student and all their progress.
    await db.query('DELETE FROM User WHERE userID = ? AND role = ?', [stu.userID, 'Student']);
    return res.json({ success: true, message: 'Pelajar dipadam.' });
  } catch (err) {
    console.error('removeStudent error:', err);
    return fail(res, 500, 'Pelajar tidak dapat dipadam. Sila cuba lagi.');
  }
};

async function teacherUserID(teacherID) {
  const [[row]] = await db.query('SELECT userID FROM Teacher WHERE teacherID = ? LIMIT 1', [teacherID]);
  return row && row.userID;
}