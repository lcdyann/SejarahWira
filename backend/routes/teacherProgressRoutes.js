import express from 'express';
import { protectParams } from '../utils/inputGuard.js';
import { requireTeacher } from '../middleware/requireTeacher.js';
import { getClassOverview, getStudentProgress } from '../controllers/teacherProgressController.js';

/**
 * UC-09 View Learning Progress (teacher).
 * server.js:  app.use('/api/teacher-progress', teacherProgressRoutes)
 *   GET /overview?classID=
 *   GET /student/:studentID
 */
const router = express.Router();
protectParams(router);      // ID dalam alamat mesti nombor / bentuk ID yang sah (utils/inputGuard.js)
router.use(requireTeacher);
router.get('/overview', getClassOverview);
router.get('/student/:studentID', getStudentProgress);
export default router;