import db from '../config/db.js';
import { verifyToken } from '../utils/authToken.js';

/**
 * ============================================================================
 * middleware/requireStudent.js
 * Student routes used to trust a studentID typed into the URL or body, so any
 * student could read or change another student's data.
 * Now the student comes ONLY from the signed login token:
 *   - the token must be a Student token and the student must still exist
 *   - req.student = { studentID }
 *   - any studentID / teacherID in the query or body is replaced by the token's own
 * ============================================================================
 */
export const requireStudent = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = verifyToken(token);

    if (!payload || payload.role !== 'Student' || !payload.studentID) {
      return res.status(401).json({ success: false, message: 'Sesi tamat. Sila log masuk semula.' });
    }

    const [rows] = await db.query('SELECT studentID FROM Student WHERE studentID = ? LIMIT 1', [payload.studentID]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Akaun pelajar tidak dijumpai. Sila log masuk semula.' });
    }

    req.student = rows[0];
    // Express 5: req.query is a getter, so work on a copy
    const query = { ...req.query, studentID: payload.studentID };
    delete query.teacherID;
    Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true });
    if (req.body && typeof req.body === 'object') {
      req.body.studentID = payload.studentID;
      delete req.body.teacherID;
    }
    return next();
  } catch (err) {
    console.error('requireStudent error:', err);
    return res.status(500).json({ success: false, message: 'Pengesahan akaun gagal. Sila cuba lagi.' });
  }
};
