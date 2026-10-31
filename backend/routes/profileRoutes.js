import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import { loadProfile, joinClass, leaveClass } from '../controllers/profileController.js';
import { joinClassLimiter } from '../middleware/loginLimiter.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// GET /api/profile?studentID=
router.get('/', loadProfile);
// POST /api/profile/join-class  { classCode }   POST /api/profile/leave-class
router.post('/join-class', joinClassLimiter, joinClass);
router.post('/leave-class', leaveClass);

export default router;

/*
 * In server.js add (next to your other routes):
 *
 *   import profileRoutes from './routes/profileRoutes.js';
 *   app.use('/api/profile', profileRoutes);
 */