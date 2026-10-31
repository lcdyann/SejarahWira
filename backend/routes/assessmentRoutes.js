import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import {
  retrieveRandomQuestions,
  startAssessment,
  checkAnswer,
  saveScore
} from '../controllers/assessmentController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// Assessment.retrieveRandomQuestions() - Wira Training Grounds (Formative)
router.get('/formative', retrieveRandomQuestions);

// Assessment.startAssessment() - The Great Siege (Summative)
router.get('/summative', startAssessment);

// Semak satu jawapan di pelayan
router.post('/summative/answer', checkAnswer);

// AssessmentAttempt.saveScore() (+ evaluateArtifactUnlock)
router.post('/summative/submit', saveScore);

export default router;