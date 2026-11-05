import db from '../config/db.js';
import { verifyToken } from '../utils/authToken.js';
import { isAdminUsername } from '../utils/adminUtil.js';
import { PUBLIC_CLASS_ID, SYSTEM_TEACHER_ID } from '../models/Class.js';

/**
 * ============================================================================
 * middleware/requireTeacher.js
 * Lets a request through only when it carries a valid Teacher login token
 * (header  Authorization: Bearer <token>)  AND that teacher still exists in the database.
 * The teacher comes from the SIGNED token, never from the request body or query,
 * so one teacher cannot pretend to be another.
 * On success:  req.teacher = { teacherID, teacherName, userID, username, isAdmin, scopeIDs }
 * ============================================================================
 */
export const requireTeacher = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = verifyToken(token);

    if (!payload || payload.role !== 'Teacher' || !payload.teacherID) {
      return res.status(401).json({
        success: false,
        message: 'Sesi tamat atau akses tidak dibenarkan. Sila log masuk semula sebagai guru.'
      });
    }

    const [rows] = await db.query(
      `SELECT t.teacherID, t.teacherName, t.userID, t.canEditFixed, u.username
         FROM Teacher t JOIN User u ON u.userID = t.userID WHERE t.teacherID = ? LIMIT 1`,
      [payload.teacherID]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Akaun guru tidak dijumpai. Sila log masuk semula.' });
    }

    const teacher = rows[0];
    teacher.canEditFixed = Boolean(teacher.canEditFixed);          // suis admin: boleh salin & ubah kandungan tetap untuk kelasnya
    teacher.isAdmin = isAdminUsername(teacher.username);          // from the server setting, not from the token
    // whose students this teacher may SEE: their own, and (admin only) the public students too
    teacher.scopeIDs = teacher.isAdmin ? [teacher.teacherID, SYSTEM_TEACHER_ID] : [teacher.teacherID];
    teacher.publicClassID = PUBLIC_CLASS_ID;
    req.teacher = teacher;
    return next();
  } catch (err) {
    console.error('requireTeacher error:', err);
    return res.status(500).json({ success: false, message: 'Pengesahan akaun gagal. Sila cuba lagi.' });
  }
};