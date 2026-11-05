import express from 'express';
import { requireTeacher } from '../middleware/requireTeacher.js';
import { listNotes, saveNote } from '../controllers/teacherNoteController.js';

// Nota guru: tiada adminForWrites di sini kerana setiap guru MEMANG boleh menulis nota miliknya sendiri
// (kandungan tetap dikunci oleh /api/content, nota guru ialah lapisan berasingan).
const router = express.Router();
router.use(requireTeacher);
router.get('/', listNotes);
router.put('/:dialogueID', saveNote);

export default router;
