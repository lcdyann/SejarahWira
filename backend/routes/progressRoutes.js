import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import { viewLearningProgress } from '../controllers/progressController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// UC-09 View Learning Progress (read-only)
router.get('/view', viewLearningProgress);

export default router;