import { failServer } from '../utils/dbError.js';
import db from '../config/db.js';
import { saveChanges } from './contentController.js';
import {
  ENTITY_NAME, MAX_ERA, CATEGORY_BY_CODE, ROLE_LINES, encodeOrder, decodeOrder, isEntityOrder, validateLineText
} from '../utils/entityLines.js';

/**
 * ============================================================================
 * entityController.js  (Application tier - BCE)      Pendekar Bayang's voice
 *
 * The entity is an NPC row named "Pendekar Bayang". Each of its lines is a DialogueLine
 * row with that NPC as speaker, no scene and no narrative. The database is NOT changed:
 *   sequenceOrder = era * 10000 + category * 100 + line      (era 0 = all eras)
 *
 *   Student   loadEntityLines()   GET    /api/entity/lines?eraID=          read only
 *   Teacher   listEntityLines()   GET    /api/content/entity-lines?eraID=  (0 = all eras)
 *   Teacher   saveEntityLine()    PUT    /api/content/entity-lines
 *   Teacher   removeEntityLine()  DELETE /api/content/entity-lines?eraID=&category=&line=
 *   Teacher   saveRoleLines()     PUT    /api/content/narratives/:narrativeID/role-lines
 *
 * Role lines: DialogueLine rows with narrativeID set and NO scene; line 1 = thank-you / badge line,
 * line 2 = opener of the moral lesson, line 3 = Pendekar Bayang's introduction of the role;
 * speaker = the NPC the teacher picks as the role. The student POSSESSES that character: the player's own
 * lines in the story are spoken as this character, and so are the badge and moral lines.
 * ============================================================================
 */

const ENTITY_ASSET = 'pendekar_bayang_smirk.png';

const findEntityNpc = async (conn = db) => {
  const [rows] = await conn.query('SELECT npcID FROM NPC WHERE name = ? ORDER BY npcID ASC LIMIT 1', [ENTITY_NAME]);
  return rows[0] ? rows[0].npcID : null;
};

/** The content manager creates the NPC row when it is missing. */
const ensureEntityNpc = async () => {
  const id = await findEntityNpc();
  if (id) return id;
  const [res] = await db.query(
    'INSERT INTO NPC (name, biography, contribution, asset) VALUES (?, ?, ?, ?)',
    [ENTITY_NAME, 'Penjaga kitab Sejarah yang menarik jiwa pelajar ke dalam buku.', 'Memandu pelajar melalui setiap era.', ENTITY_ASSET]
  );
  return res.insertId;
};

const toLine = (r) => {
  const d = decodeOrder(r.sequenceOrder);
  return { dialogueID: r.dialogueID, era: d.era, category: d.category, line: d.line, text: r.dialogueLine };
};

const toEra = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_ERA ? n : null;
};

const eraExists = async (eraID) => {
  if (eraID === 0) return true;
  const [rows] = await db.query('SELECT 1 FROM HistoricalEra WHERE eraID = ? LIMIT 1', [eraID]);
  return rows.length > 0;
};

/** Student side: only teacher overrides for this era and for "all eras". Defaults live in code. */
export const loadEntityLines = async (req, res) => {
  try {
    const eraID = toEra(req.query.eraID) ?? 0;
    const npcID = await findEntityNpc();
    if (!npcID) return res.status(200).json({ success: true, lines: [] });

    const [rows] = await db.query(
      `SELECT dialogueID, dialogueLine, sequenceOrder FROM DialogueLine
       WHERE npcID = ? AND narrativeID IS NULL AND sceneID IS NULL
       ORDER BY sequenceOrder ASC`,
      [npcID]
    );
    const lines = rows
      .filter((r) => isEntityOrder(r.sequenceOrder))
      .map(toLine)
      .filter((l) => l.era === 0 || l.era === eraID)
      .map(({ era, category, line, text }) => ({ era, category, line, text }));
    return res.status(200).json({ success: true, lines });
  } catch (err) {
    console.error('loadEntityLines error:', err);
    // the game falls back to the defaults in code
    return res.status(200).json({ success: true, lines: [] });
  }
};

export const listEntityLines = async (req, res) => {
  try {
    const eraID = toEra(req.query.eraID ?? 0);
    if (eraID === null) return res.status(400).json({ success: false, message: 'Era tidak sah.' });
    const npcID = await findEntityNpc();
    if (!npcID) return res.status(200).json({ success: true, npcExists: false, lines: [] });

    const [rows] = await db.query(
      `SELECT dialogueID, dialogueLine, sequenceOrder FROM DialogueLine
       WHERE npcID = ? AND narrativeID IS NULL AND sceneID IS NULL ORDER BY sequenceOrder ASC`,
      [npcID]
    );
    const lines = rows.filter((r) => isEntityOrder(r.sequenceOrder)).map(toLine).filter((l) => l.era === eraID);
    return res.status(200).json({ success: true, npcExists: true, lines });
  } catch (err) {
    console.error('listEntityLines error:', err);
    return failServer(res, err, 'Gagal memuatkan suara Pendekar Bayang.');
  }
};

export const saveEntityLine = async (req, res) => {
  try {
    const eraID = toEra(req.body.eraID);
    const category = Number(req.body.category);
    const line = Number(req.body.line ?? 1);
    if (eraID === null) return res.status(400).json({ success: false, message: 'Era tidak sah.' });
    if (!CATEGORY_BY_CODE[category]) return res.status(400).json({ success: false, message: 'Kategori tidak sah.' });
    if (!Number.isInteger(line) || line < 1 || line > 9) return res.status(400).json({ success: false, message: 'Nombor ayat mesti antara 1 dan 9.' });
    const check = validateLineText(req.body.text);
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    if (!(await eraExists(eraID))) return res.status(404).json({ success: false, message: 'Era tidak dijumpai.' });

    const npcID = await ensureEntityNpc();
    const order = encodeOrder(eraID, category, line);
    const [found] = await db.query(
      'SELECT dialogueID FROM DialogueLine WHERE npcID = ? AND narrativeID IS NULL AND sceneID IS NULL AND sequenceOrder = ? LIMIT 1',
      [npcID, order]
    );
    if (found.length) {
      await db.query('UPDATE DialogueLine SET dialogueLine = ? WHERE dialogueID = ?', [check.text, found[0].dialogueID]);
    } else {
      await db.query(
        'INSERT INTO DialogueLine (npcID, narrativeID, sceneID, dialogueLine, sequenceOrder) VALUES (?, NULL, NULL, ?, ?)',
        [npcID, check.text, order]
      );
    }
    await saveChanges(req.teacher, eraID || null, 'Suara Pendekar Bayang',
      `${CATEGORY_BY_CODE[category].label} (${eraID ? `Era ${eraID}` : 'semua era'}, ayat ${line}): "${check.text}"`);
    return res.status(200).json({ success: true, message: 'Ayat Pendekar Bayang disimpan.' });
  } catch (err) {
    console.error('saveEntityLine error:', err);
    return failServer(res, err, 'Ayat tidak dapat disimpan. Tiada perubahan dibuat.');
  }
};

export const removeEntityLine = async (req, res) => {
  try {
    const eraID = toEra(req.query.eraID);
    const category = Number(req.query.category);
    const line = Number(req.query.line ?? 1);
    if (eraID === null || !CATEGORY_BY_CODE[category] || !Number.isInteger(line) || line < 1) {
      return res.status(400).json({ success: false, message: 'Permintaan tidak sah.' });
    }
    const npcID = await findEntityNpc();
    if (!npcID) return res.status(200).json({ success: true, message: 'Ayat lalai digunakan semula.' });
    await db.query(
      'DELETE FROM DialogueLine WHERE npcID = ? AND narrativeID IS NULL AND sceneID IS NULL AND sequenceOrder = ?',
      [npcID, encodeOrder(eraID, category, line)]
    );
    await saveChanges(req.teacher, eraID || null, 'Suara Pendekar Bayang',
      `Ayat ${CATEGORY_BY_CODE[category].label} (${eraID ? `Era ${eraID}` : 'semua era'}, ayat ${line}) dipadam; ayat lalai digunakan semula.`);
    return res.status(200).json({ success: true, message: 'Ayat lalai digunakan semula.' });
  } catch (err) {
    console.error('removeEntityLine error:', err);
    return failServer(res, err, 'Ayat tidak dapat dipadam.');
  }
};

/** Teacher: the role (speaker + two lines) saved for a narrative. GET /api/content/narratives/:narrativeID/role-lines */
export const loadRoleLines = async (req, res) => {
  try {
    const narrativeID = Number(req.params.narrativeID);
    const [narr] = await db.query('SELECT narrativeID FROM Narrative WHERE narrativeID = ?', [narrativeID]);
    if (!narr.length) return res.status(404).json({ success: false, message: 'Narrative tidak dijumpai.' });
    const [rows] = await db.query(
      'SELECT npcID, dialogueLine, sequenceOrder FROM DialogueLine WHERE narrativeID = ? AND sceneID IS NULL ORDER BY sequenceOrder ASC',
      [narrativeID]
    );
    const by = (n) => (rows.find((r) => Number(r.sequenceOrder) === n) || {}).dialogueLine || '';
    return res.status(200).json({
      success: true,
      role: { npcID: rows.length ? rows[0].npcID : null, badgeLine: by(1), moralLine: by(2), introLine: by(3) }
    });
  } catch (err) {
    console.error('loadRoleLines error:', err);
    return failServer(res, err, 'Peranan tidak dapat dimuatkan.');
  }
};

/** body: { npcID, badgeLine, moralLine, introLine }  (npcID null = role removed; empty lines get the defaults so the role always exists) */
export const saveRoleLines = async (req, res) => {
  try {
    const narrativeID = Number(req.params.narrativeID);
    const [narr] = await db.query('SELECT narrativeID, eraID, narrativeTitle FROM Narrative WHERE narrativeID = ?', [narrativeID]);
    if (!narr.length) return res.status(404).json({ success: false, message: 'Narrative tidak dijumpai.' });

    const npcID = req.body.npcID ? Number(req.body.npcID) : null;
    const texts = { 1: req.body.badgeLine, 2: req.body.moralLine, 3: req.body.introLine };
    const clean = {};
    for (const k of [1, 2, 3]) {
      const raw = (typeof texts[k] === 'string' ? texts[k].trim() : '') || (npcID ? ROLE_LINES[k].fallback : '');
      if (!raw) continue;
      const v = validateLineText(raw);
      if (!v.ok) return res.status(400).json({ success: false, message: v.message });
      clean[k] = v.text;
    }
    if (npcID) {
      const [n] = await db.query('SELECT npcID FROM NPC WHERE npcID = ?', [npcID]);
      if (!n.length) return res.status(404).json({ success: false, message: 'NPC tidak dijumpai.' });
    }
    await db.query('DELETE FROM DialogueLine WHERE narrativeID = ? AND sceneID IS NULL', [narrativeID]);
    if (npcID) {
      for (const k of [1, 2, 3]) {
        if (!clean[k]) continue;
        await db.query(
          'INSERT INTO DialogueLine (npcID, narrativeID, sceneID, dialogueLine, sequenceOrder) VALUES (?, ?, NULL, ?, ?)',
          [npcID, narrativeID, clean[k], k]
        );
      }
    }
    await saveChanges(req.teacher, narr[0].eraID, 'Peranan pelajar', `Narrative "${narr[0].narrativeTitle}": peranan dikemas kini.`);
    return res.status(200).json({ success: true, message: 'Peranan pelajar disimpan.' });
  } catch (err) {
    console.error('saveRoleLines error:', err);
    return failServer(res, err, 'Peranan tidak dapat disimpan.');
  }
};
