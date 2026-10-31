import express from 'express';
import { protectParams } from '../utils/inputGuard.js';
import { adminForWrites } from '../middleware/requireAdmin.js';
import { requireTeacher } from '../middleware/requireTeacher.js';
import {
  manageLearningContent,
  viewEraContent,
  listQuestions,
  addQuestion,
  editQuestion,
  removeQuestion,
  viewChanges
} from '../controllers/contentController.js';
import {
  viewNarratives, viewNarrative, narrativeImpact,
  addNarrative, editNarrative, removeNarrative,
  addScene, editScene, removeScene, reorderScenes,
  saveDialogue,
  addQuest, editQuest, removeQuest
} from '../controllers/contentStoryController.js';
import {
  listAssets, uploadAsset, renameAsset,
  listNpcs, addNpc, editNpc, removeNpc
} from '../controllers/contentAssetController.js';
import {
  listEntityLines, saveEntityLine, removeEntityLine, loadRoleLines, saveRoleLines
} from '../controllers/entityController.js';

const router = express.Router();
protectParams(router);      // ID dalam alamat mesti nombor / bentuk ID yang sah (utils/inputGuard.js)

// Every content route needs a logged-in teacher (signed token)
router.use(requireTeacher);
// Reading and playing the content is for every teacher; changing it is for the admin only
router.use(adminForWrites);

// Teacher.manageLearningContent()
router.get('/eras', manageLearningContent);
router.get('/overview', viewEraContent);

// QuestionBank
router.get('/questions', listQuestions);
router.post('/questions', addQuestion);
router.put('/questions/:questionID', editQuestion);
router.delete('/questions/:questionID', removeQuestion);

// Narratives (A1)
router.get('/narratives', viewNarratives);
router.get('/narrative', viewNarrative);
router.get('/narratives/:narrativeID/impact', narrativeImpact);
router.post('/narratives', addNarrative);
router.put('/narratives/:narrativeID', editNarrative);
router.delete('/narratives/:narrativeID', removeNarrative);
router.put('/narratives/:narrativeID/scene-order', reorderScenes);

// Scenes, dialogue (A2) and quests (A3)
router.post('/scenes', addScene);
router.put('/scenes/:sceneID', editScene);
router.delete('/scenes/:sceneID', removeScene);
router.put('/scenes/:sceneID/dialogue', saveDialogue);
router.post('/quests', addQuest);
router.put('/quests/:questID', editQuest);
router.delete('/quests/:questID', removeQuest);

// Image library + NPC library
router.get('/assets', listAssets);
router.post('/assets/upload',
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '2mb' }),   // raw bytes, no multer needed
  uploadAsset);
router.put('/assets/:assetID', renameAsset);
router.get('/npcs', listNpcs);
router.post('/npcs', addNpc);
router.put('/npcs/:npcID', editNpc);
router.delete('/npcs/:npcID', removeNpc);

// ContentManager change log (visible to all teachers)
router.get('/changes', viewChanges);

// Pendekar Bayang's voice + the student's role (UC-10, tab "Suara Pendekar Bayang")
router.get('/entity-lines', listEntityLines);
router.put('/entity-lines', saveEntityLine);
router.delete('/entity-lines', removeEntityLine);
router.get('/narratives/:narrativeID/role-lines', loadRoleLines);
router.put('/narratives/:narrativeID/role-lines', saveRoleLines);

export default router;