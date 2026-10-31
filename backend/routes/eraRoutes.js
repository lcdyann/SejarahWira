import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import {
  loadEra,
  loadEraDetail,
  checkCompletion,
  verifyConditions,
  displayBadge
} from '../controllers/eraController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// HistoricalEra
router.get('/list', loadEra);
router.get('/detail', loadEraDetail);

// EraProgression
router.get('/check-completion', checkCompletion);
router.post('/verify-conditions', verifyConditions);

// Badge
router.get('/badge-detail', displayBadge);

export default router;