import express from 'express';
import { protectParams } from '../utils/inputGuard.js';
import { requireTeacher } from '../middleware/requireTeacher.js';
import {
  listClasses, createClass, editClass, removeClass,
  listStudents, leaveClassStudent, addStudent, addStudentsBulk, editStudent, resetPassword, removeStudent
} from '../controllers/classManagerController.js';

/**
 * Teacher: classes and students.   server.js:  app.use('/api/classes', classRoutes)
 *   GET /                         POST /                      PUT /:classID     DELETE /:classID
 *   GET /:classID/students        POST /:classID/students     POST /:classID/students/bulk
 *   PUT /students/:studentID      POST /students/:studentID/reset-password      DELETE /students/:studentID
 */
const router = express.Router();
protectParams(router);      // ID dalam alamat mesti nombor / bentuk ID yang sah (utils/inputGuard.js)
router.use(requireTeacher);

// the fixed "students/..." paths go before "/:classID" so they are never read as a class id
router.put('/students/:studentID', editStudent);
router.post('/students/:studentID/reset-password', resetPassword);
router.post('/students/:studentID/leave-class', leaveClassStudent);
router.delete('/students/:studentID', removeStudent);

router.get('/', listClasses);
router.post('/', createClass);
router.put('/:classID', editClass);
router.delete('/:classID', removeClass);
router.get('/:classID/students', listStudents);
router.post('/:classID/students', addStudent);
router.post('/:classID/students/bulk', addStudentsBulk);

export default router;