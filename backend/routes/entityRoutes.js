import express from 'express';
import { requireStudent } from '../middleware/requireStudent.js';
import { loadEntityLines } from '../controllers/entityController.js';

const router = express.Router();
router.use(requireStudent);          // the student comes from the signed token only

// Student side, read only. Mounted at /api/entity in server.js
router.get('/lines', loadEntityLines);

export default router;
