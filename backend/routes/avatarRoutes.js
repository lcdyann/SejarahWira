import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import { loadAvatarAsset, saveCustomization } from '../controllers/avatarController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

router.get('/options', loadAvatarAsset);     // Avatar.loadAvatarAsset()
router.post('/save', saveCustomization);     // Avatar.saveCustomization()

export default router;