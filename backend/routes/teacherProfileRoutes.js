import express from 'express';
import { requireTeacher } from '../middleware/requireTeacher.js';
import { loadTeacherProfile } from '../controllers/teacherProfileController.js';

/** server.js:  app.use('/api/teacher-profile', teacherProfileRoutes)     GET /  */
const router = express.Router();
router.use(requireTeacher);
router.get('/', loadTeacherProfile);
export default router;