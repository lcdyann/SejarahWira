import db from '../config/db.js';
import { failServer } from '../utils/dbError.js';

/**
 * ============================================================================
 * teacherNoteController.js       NOTA GURU (lapisan tambahan di atas dialog tetap)
 *
 *   GET  /api/teacher-notes?narrativeID=   senarai dialog naratif + nota guru INI sahaja
 *   PUT  /api/teacher-notes/:dialogueID    simpan / kemas kini nota (teks kosong = padam nota)
 *
 * PERATURAN (sengaja dikunci di sini, bukan di skrin):
 *   1. Guru hanya boleh menulis / membaca nota miliknya sendiri. teacherID datang daripada token
 *      yang ditandatangani (req.teacher), tidak pernah daripada badan permintaan.
 *   2. Dialog tetap (DialogueLine) TIDAK PERNAH diubah di sini; nota ialah baris berasingan.
 *   3. Pelajar melihat nota guru kelas mereka dalam storyController.loadNarrative.
 * ============================================================================
 */

const MAX_NOTE = 500;
const MARKUP = /[<>]/;
const toID = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const fail = (res, code, message) => res.status(code).json({ success: false, message });

export const listNotes = async (req, res) => {
  try {
    const narrativeID = toID(req.query.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');

    const [lines] = await db.query(
      `SELECT d.dialogueID, d.sceneID, d.dialogueLine, d.sequenceOrder, s.sceneOrder,
              COALESCE(n.name, 'Pemain') AS speaker, t.noteText
       FROM DialogueLine d
       JOIN Scene s ON s.sceneID = d.sceneID
       JOIN Narrative nr ON nr.narrativeID = s.narrativeID
       LEFT JOIN NPC n ON n.npcID = d.npcID
       LEFT JOIN TeacherNote t ON t.dialogueID = d.dialogueID AND t.teacherID = ?
       WHERE s.narrativeID = ? AND (? = 1 OR nr.ownerTeacherID IS NULL OR nr.ownerTeacherID = ?)
       ORDER BY s.sceneOrder ASC, d.sequenceOrder ASC, d.dialogueID ASC`,
      [req.teacher.teacherID, narrativeID, req.teacher.isAdmin ? 1 : 0, req.teacher.teacherID]);

    return res.status(200).json({
      success: true,
      maxLength: MAX_NOTE,
      lines: lines.map((l) => ({
        dialogueID: l.dialogueID,
        sceneID: l.sceneID,
        scene: l.sceneOrder,
        speaker: l.speaker,
        text: l.dialogueLine,
        note: l.noteText || ''
      }))
    });
  } catch (err) {
    console.error('listNotes error:', err);
    return failServer(res, err, 'Senarai nota tidak dapat dimuatkan.');
  }
};

export const saveNote = async (req, res) => {
  try {
    const dialogueID = toID(req.params.dialogueID);
    if (!dialogueID) return fail(res, 400, 'Baris dialog tidak sah.');

    const text = typeof req.body.noteText === 'string' ? req.body.noteText.trim() : '';
    if (text.length > MAX_NOTE) return fail(res, 422, `Nota terlalu panjang (maksimum ${MAX_NOTE} aksara).`);
    if (MARKUP.test(text)) return fail(res, 422, 'Aksara < dan > tidak dibenarkan.');

    // hanya baris dialog dalam sesuatu babak (bukan baris peranan / Pendekar Bayang)
    const [rows] = await db.query(`SELECT dialogueID FROM DialogueLine WHERE dialogueID = ? AND sceneID IS NOT NULL`, [dialogueID]);
    if (rows.length === 0) return fail(res, 404, 'Baris dialog tidak dijumpai.');

    if (!text) {
      await db.query(`DELETE FROM TeacherNote WHERE teacherID = ? AND dialogueID = ?`, [req.teacher.teacherID, dialogueID]);
      return res.status(200).json({ success: true, message: 'Nota dipadam.', note: '' });
    }
    await db.query(
      `INSERT INTO TeacherNote (teacherID, dialogueID, noteText) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE noteText = VALUES(noteText)`,
      [req.teacher.teacherID, dialogueID, text]);
    return res.status(200).json({ success: true, message: 'Nota disimpan.', note: text });
  } catch (err) {
    console.error('saveNote error:', err);
    return failServer(res, err, 'Nota gagal disimpan. Sila cuba lagi.');
  }
};
