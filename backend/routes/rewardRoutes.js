import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import { viewBadges, viewArtifacts } from '../controllers/rewardController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// Student.viewBadges() / Student.viewArtifacts()  (read-only)
router.get('/badges', viewBadges);
router.get('/artifacts', viewArtifacts);

export default router;