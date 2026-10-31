import db from '../config/db.js';

/**
 * ============================================================================
 * teacherProfileController.js            Teacher profile page (teacher_profile.html)
 * Mounted behind requireTeacher:  app.use('/api/teacher-profile', teacherProfileRoutes)
 *
 *   GET /api/teacher-profile      the logged-in teacher's info + their classes (with student counts)
 *
 * READ ONLY. The teacher comes from the signed token (req.teacher), never from the query string.
 * The password column is never selected.
 * ============================================================================
 */
export const loadTeacherProfile = async (req, res) => {
  try {
    const teacherID = req.teacher.teacherID;

    const [[teacher]] = await db.query(
      `SELECT t.teacherID, t.teacherName, u.username
         FROM Teacher t INNER JOIN User u ON u.userID = t.userID
        WHERE t.teacherID = ? LIMIT 1`,
      [teacherID]
    );
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Profil guru tidak dijumpai.' });
    }

    const [classes] = await db.query(
      `SELECT c.classID, c.className, c.batchYear, COUNT(s.studentID) AS studentCount
         FROM Class c LEFT JOIN Student s ON s.classID = c.classID
        WHERE c.teacherID = ?
        GROUP BY c.classID, c.className, c.batchYear
        ORDER BY c.batchYear DESC, c.className`,
      [teacherID]
    );

    const [[{ changes }]] = await db.query(
      'SELECT COUNT(*) AS changes FROM ContentManager WHERE teacherID = ?',
      [teacherID]
    );

    const list = classes.map((c) => ({
      classID: c.classID, className: c.className, batchYear: Number(c.batchYear), studentCount: Number(c.studentCount)
    }));

    return res.json({
      success: true,
      profile: {
        teacherID: teacher.teacherID,
        teacherName: teacher.teacherName,
        username: teacher.username,
        isAdmin: Boolean(req.teacher.isAdmin),
        classCount: list.length,
        studentCount: list.reduce((n, c) => n + c.studentCount, 0),
        contentChanges: Number(changes) || 0,
        classes: list
      }
    });
  } catch (err) {
    console.error('loadTeacherProfile error:', err);
    return res.status(500).json({ success: false, message: 'Profil guru tidak dapat dimuatkan. Sila cuba lagi.' });
  }
};