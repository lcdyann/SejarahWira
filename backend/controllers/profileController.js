import db from '../config/db.js';
import { Student } from '../models/Student.js';

/**
 * ============================================================================
 * profileController.js  (Application tier - BCE)
 * Student profile page (profile.html). Read-only for students.
 *
 *   Student   loadProfile()   GET /api/profile?studentID=
 *               Student + Class + Teacher + Avatar (Avatar.loadAvatarAsset())
 *
 * Students can only VIEW their info. Creating / editing students is a teacher
 * feature that will be added later (it will live in its own handlers, guarded by
 * the Teacher role). The password column is never selected here.
 * ============================================================================
 */

/** Prefix a bare filename with its asset folder; leave full paths/URLs alone (same rule as storyController). */
const resolveAsset = (raw, folder, fallback) => {
  if (!raw) return fallback;
  return raw.startsWith('../') || raw.startsWith('http') ? raw : `../assets/gameAsset/${folder}/${raw}`;
};

const DEFAULT_AVATAR = '../assets/gameAsset/avatar/avatar_melayu_lelaki.png';

/**
 * Student.loadProfile()                 GET /api/profile?studentID=
 * Returns the student's own info, class and avatar.
 */
export const loadProfile = async (req, res) => {
  try {
    const { studentID = 'S1001' } = req.query;

    const [rows] = await db.query(
      `SELECT s.studentID, s.studentName,
              u.username,
              c.classID, c.className, c.batchYear,
              t.teacherName,
              a.avatarID, a.avatarName, a.asset AS avatarAsset
       FROM Student s
       INNER JOIN User  u ON s.userID  = u.userID
       INNER JOIN Class c ON s.classID = c.classID
       LEFT  JOIN Teacher t ON c.teacherID = t.teacherID
       LEFT  JOIN Avatar  a ON s.avatarID  = a.avatarID
       WHERE s.studentID = ?
       LIMIT 1`,
      [studentID]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profil pelajar tidak dijumpai.' });
    }

    const r = rows[0];
    return res.status(200).json({
      success: true,
      profile: {
        studentID: r.studentID,
        studentName: r.studentName,
        username: r.username,
        classID: r.classID,
        // kelas awam disembunyikan daripada murid: hanya admin tahu tentangnya
        className: r.classID === 'PUBLIC-0000' ? null : r.className,
        batchYear: r.classID === 'PUBLIC-0000' ? null : r.batchYear,
        teacherName: r.classID === 'PUBLIC-0000' ? null : (r.teacherName || null),
        avatarID: r.avatarID || null,
        avatarName: r.avatarName || null,
        // Avatar.loadAvatarAsset()
        avatarAsset: resolveAsset(r.avatarAsset, 'avatar', DEFAULT_AVATAR)
      }
    });
  } catch (err) {
    console.error('loadProfile error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/** Student.joinClass()   POST /api/profile/join-class   body { classCode }  (the join code the teacher shows in the class manager) */
export const joinClass = async (req, res) => {
  try {
    const code = typeof req.body.classCode === 'string' ? req.body.classCode.trim() : '';
    if (!code) return res.status(400).json({ success: false, message: 'Sila masukkan kod kelas daripada guru anda (contoh: K7Q2-M9XD).' });
    const student = await Student.findByID(req.student.studentID);
    if (!student) return res.status(404).json({ success: false, message: 'Pelajar tidak dijumpai.' });
    const cls = await student.joinClass(code);
    if (!cls) return res.status(404).json({ success: false, message: 'Kod kelas tidak dijumpai. Semak dengan guru anda.' });
    return res.status(200).json({ success: true, message: `Anda kini dalam kelas ${cls.className}.`, class: cls });
  } catch (err) {
    console.error('joinClass error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menyertai kelas. Sila cuba lagi.' });
  }
};

/** Student.leaveClass()  POST /api/profile/leave-class   (progress is kept; the student moves to the holding class) */
export const leaveClass = async (req, res) => {
  try {
    const student = await Student.findByID(req.student.studentID);
    if (!student) return res.status(404).json({ success: false, message: 'Pelajar tidak dijumpai.' });
    if (!(await student.leaveClass())) return res.status(500).json({ success: false, message: 'Gagal keluar kelas.' });
    return res.status(200).json({ success: true, message: 'Anda telah keluar daripada kelas. Kemajuan anda dikekalkan.',
      class: { classID: student.classID, className: null } });
  } catch (err) {
    console.error('leaveClass error:', err);
    return res.status(500).json({ success: false, message: 'Gagal keluar kelas. Sila cuba lagi.' });
  }
};
