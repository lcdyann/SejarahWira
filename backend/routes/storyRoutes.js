import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import {
  loadNarrative,
  assignQuest,
  loadQuest,
  verifyCompletion,
  evaluateBadgeUnlock,
  evaluateUnlockAssessment,
  provideHint,
  resetReplay
} from '../controllers/storyController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// Narrative / Scene / DialogueLine / NPC
router.get('/load-narrative', loadNarrative);

// Quest ("hanger"): which quests (one per quest scene) are switched on for this play-through
router.get('/assign-quest', assignQuest);
router.get('/load-quest', loadQuest);

// QuestCompletion
router.post('/verify-completion', verifyCompletion);
router.post('/reset-replay', resetReplay);

// End of narrative: badge + assessment unlock
router.post('/evaluate-badge-unlock', evaluateBadgeUnlock);
router.get('/evaluate-unlock-assessment', evaluateUnlockAssessment);

// LearningSupport
router.get('/provide-hint', provideHint);

export default router;