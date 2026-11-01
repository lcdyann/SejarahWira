import { failServer } from '../utils/dbError.js';
import crypto from 'crypto';
import db from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { assetExists, urlOf, prettifyName, fileOf } from '../utils/assetStore.js';
import '../utils/questRules.js';
import { saveChanges } from './contentController.js';
import { ContentManager } from '../models/ContentManager.js';

/**
 * ============================================================================
 * contentStoryController.js  (Application tier - BCE)       UC-10 A1 / A2 / A3
 * Narratives, scenes, dialogue lines and quests. All routes sit behind requireTeacher.
 *
 *   ContentManager   addNarrative(), editNarrative(), removeNarrative()   (diagram names)
 *   ContentManager   addScene(), editScene(), removeScene(), reorderScenes()
 *   ContentManager   saveDialogue()          replaces the lines of one scene
 *   ContentManager   addQuest(), editQuest(), removeQuest()
 *   ContentManager   viewNarratives(), viewNarrative(), narrativeImpact()
 *
 * Every change is written to the ContentManager log (saveChanges) so other teachers can see it.
 * Multi-step changes run inside a transaction: all of it is saved, or none of it.
 * Quest rules come from utils/questRules.js, the same file the browser uses.
 * ============================================================================
 */

const Rules = globalThis.QuestRules;

const MARKUP = /[<>]/;
const SCENE_ID = /^[A-Za-z0-9_.\-]{1,100}$/;
const MAX_LINES = 80;
const MAX_QUESTS_PER_SCENE = 5;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const toID = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}\u2026` : text);
const newSceneID = () => `sc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
const fail = (res, code, message, extra = {}) => res.status(code).json({ success: false, message, ...extra });
const first = async (conn, sql, params = []) => { const [rows] = await conn.query(sql, params); return rows[0] || null; };

const parseJson = (value) => {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return null; } }
  return null;
};

/** Same fallback as quest_game.html when questType is empty or invalid. */
const effectiveType = (quest) => {
  const n = parseInt(quest.questType, 10);
  return n >= 1 && n <= 5 ? n : ((Number(quest.questID) - 1) % 5) + 1;
};

/* ------------------------------------------------------------------------ */
/* LOOKUPS                                                                  */
/* ------------------------------------------------------------------------ */

const getNarrative = (id, conn = db) =>
  first(conn, `SELECT narrativeID, eraID, narrativeTitle, summary FROM Narrative WHERE narrativeID = ?`, [id]);

/** a narrative must keep this many scenes that have a quest (the quest IS the gameplay of a scene) */
const MIN_QUEST_SCENES = 3;
const questSceneCount = async (narrativeID) => Number((await first(db,
  `SELECT COUNT(DISTINCT q.sceneID) AS c FROM Quest q INNER JOIN Scene s ON q.sceneID = s.sceneID WHERE s.narrativeID = ?`, [narrativeID])).c);
const QUEST_MIN_MSG = `Naratif mesti mempunyai sekurang-kurangnya ${MIN_QUEST_SCENES} babak yang ada misi. Tambah misi pada babak lain dahulu.`;

const getScene = (sceneID, conn = db) =>
  first(conn,
    `SELECT s.sceneID, s.narrativeID, s.sceneOrder, s.asset, s.sceneStoryline, n.eraID, n.narrativeTitle
     FROM Scene s INNER JOIN Narrative n ON s.narrativeID = n.narrativeID WHERE s.sceneID = ?`, [sceneID]);

const getQuest = (questID, conn = db) =>
  first(conn,
    `SELECT q.questID, q.sceneID, q.questName, s.sceneOrder, s.narrativeID, n.eraID, n.narrativeTitle
     FROM Quest q INNER JOIN Scene s ON q.sceneID = s.sceneID INNER JOIN Narrative n ON s.narrativeID = n.narrativeID
     WHERE q.questID = ?`, [questID]);

/**
 * LearningSupport rows hold the hint / explanation / success message. The story and quest pages
 * read the FIRST row they find, so there is exactly ONE row per scene or quest.
 */
const setSupport = async (conn, kind, id, { hint = '', explanation = '', feedback = '' }) => {
  if (kind === 'quest') await conn.query(`DELETE FROM LearningSupport WHERE questID = ?`, [id]);
  else await conn.query(`DELETE FROM LearningSupport WHERE sceneID = ? AND questID IS NULL`, [id]);

  if (!hint && !explanation && !feedback) return;
  const sql = kind === 'quest'
    ? `INSERT INTO LearningSupport (questID, supportType, hint, explanation, feedback) VALUES (?, 'hint', ?, ?, ?)`
    : `INSERT INTO LearningSupport (sceneID, supportType, hint, explanation, feedback) VALUES (?, 'hint', ?, ?, ?)`;
  await conn.query(sql, [id, hint || null, explanation || null, feedback || null]);
};

/* ------------------------------------------------------------------------ */
/* VALIDATION                                                               */
/* ------------------------------------------------------------------------ */

const validateNarrative = (b = {}) => {
  const value = { narrativeTitle: str(b.narrativeTitle), summary: str(b.summary) };
  const errors = {};
  if (!value.narrativeTitle) errors.narrativeTitle = 'Tajuk naratif wajib diisi.';
  else if (value.narrativeTitle.length > 100) errors.narrativeTitle = 'Tajuk terlalu panjang (maksimum 100 aksara).';
  if (!value.summary) errors.summary = 'Ringkasan wajib diisi.';
  else if (value.summary.length > 2000) errors.summary = 'Ringkasan terlalu panjang (maksimum 2000 aksara).';
  ['narrativeTitle', 'summary'].forEach((f) => {
    if (!errors[f] && MARKUP.test(value[f])) errors[f] = 'Aksara < dan > tidak dibenarkan.';
  });
  return { valid: Object.keys(errors).length === 0, errors, value };
};

const validateScene = (b = {}) => {
  const value = { sceneStoryline: str(b.sceneStoryline), asset: fileOf(str(b.asset)), hint: str(b.hint) };
  const errors = {};
  if (!value.sceneStoryline) errors.sceneStoryline = 'Penerangan babak wajib diisi.';
  else if (value.sceneStoryline.length > 2000) errors.sceneStoryline = 'Penerangan terlalu panjang (maksimum 2000 aksara).';
  if (!value.asset) errors.asset = 'Sila pilih gambar latar.';
  else if (!assetExists('background', value.asset)) errors.asset = 'Gambar latar tidak dijumpai. Sila pilih semula.';
  if (value.hint.length > 255) errors.hint = 'Petunjuk terlalu panjang (maksimum 255 aksara).';
  ['sceneStoryline', 'hint'].forEach((f) => {
    if (!errors[f] && MARKUP.test(value[f])) errors[f] = 'Aksara < dan > tidak dibenarkan.';
  });
  return { valid: Object.keys(errors).length === 0, errors, value };
};

/* ------------------------------------------------------------------------ */
/* NARRATIVES                                                               */
/* ------------------------------------------------------------------------ */

/** The narratives of one era (for the narrative tabs). */
export const viewNarratives = async (req, res) => {
  try {
    const eraID = toID(req.query.eraID);
    if (!eraID) return fail(res, 400, 'Era tidak sah.');

    const [rows] = await db.query(
      `SELECT n.narrativeID, n.narrativeTitle, n.summary,
              (SELECT COUNT(*) FROM Scene s WHERE s.narrativeID = n.narrativeID) AS sceneCount,
              (SELECT COUNT(DISTINCT q.sceneID) FROM Quest q
                 INNER JOIN Scene s ON q.sceneID = s.sceneID WHERE s.narrativeID = n.narrativeID) AS questSceneCount
       FROM Narrative n WHERE n.eraID = ? ORDER BY n.narrativeID ASC`,
      [eraID]
    );
    return res.status(200).json({
      success: true,
      narratives: rows.map((r) => ({ ...r, sceneCount: Number(r.sceneCount), questSceneCount: Number(r.questSceneCount) }))
    });
  } catch (err) {
    console.error('viewNarratives error:', err);
    return failServer(res, err, 'Senarai naratif tidak dapat dimuatkan.');
  }
};

/** One narrative with everything the board needs: scenes in order, dialogue, quests. */
export const viewNarrative = async (req, res) => {
  try {
    const narrativeID = toID(req.query.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');

    const narrative = await getNarrative(narrativeID);
    if (!narrative) return fail(res, 404, 'Naratif tidak dijumpai.');

    const [scenes] = await db.query(
      `SELECT sceneID, sceneStoryline, sceneOrder, asset FROM Scene
       WHERE narrativeID = ? ORDER BY sceneOrder ASC, sceneID ASC`, [narrativeID]);
    const [lines] = await db.query(
      `SELECT d.dialogueID, d.sceneID, d.npcID, d.dialogueLine, d.sequenceOrder
       FROM DialogueLine d INNER JOIN Scene s ON d.sceneID = s.sceneID
       WHERE s.narrativeID = ? ORDER BY d.sceneID, d.sequenceOrder ASC, d.dialogueID ASC`, [narrativeID]);
    const [quests] = await db.query(
      `SELECT q.questID, q.sceneID, q.questName, q.instruction, q.questType, q.description, q.questContent
       FROM Quest q INNER JOIN Scene s ON q.sceneID = s.sceneID
       WHERE s.narrativeID = ? ORDER BY q.questID ASC`, [narrativeID]);

    const sceneIDs = scenes.map((s) => s.sceneID);
    const questIDs = quests.map((q) => q.questID);
    let support = [];
    if (sceneIDs.length || questIDs.length) {
      const parts = [];
      const params = [];
      if (sceneIDs.length) { parts.push('(sceneID IN (?) AND questID IS NULL)'); params.push(sceneIDs); }
      if (questIDs.length) { parts.push('questID IN (?)'); params.push(questIDs); }
      [support] = await db.query(
        `SELECT questID, sceneID, hint, explanation, feedback FROM LearningSupport WHERE ${parts.join(' OR ')} ORDER BY supportID ASC`,
        params);
    }
    const [names] = await db.query(`SELECT filePath, displayName FROM MediaAsset WHERE assetType = 'background'`);
    const nameOf = new Map(names.map((n) => [n.filePath, n.displayName]));

    const merged = (rows) => rows.reduce((acc, r) => ({
      hint: acc.hint || r.hint || '',
      explanation: acc.explanation || r.explanation || '',
      feedback: acc.feedback || r.feedback || ''
    }), { hint: '', explanation: '', feedback: '' });
    const supportOfScene = (id) => merged(support.filter((r) => r.questID === null && r.sceneID === id));
    const supportOfQuest = (id) => merged(support.filter((r) => Number(r.questID) === Number(id)));

    return res.status(200).json({
      success: true,
      narrative,
      scenes: scenes.map((s) => ({
        sceneID: s.sceneID,
        order: s.sceneOrder,
        storyline: s.sceneStoryline,
        asset: fileOf(s.asset),
        assetUrl: urlOf('background', s.asset),
        assetName: nameOf.get(fileOf(s.asset)) || prettifyName(fileOf(s.asset) || ''),
        assetMissing: !assetExists('background', s.asset),
        hint: supportOfScene(s.sceneID).hint,
        dialogues: lines
          .filter((l) => l.sceneID === s.sceneID)
          .map((l) => ({ dialogueID: l.dialogueID, npcID: l.npcID, text: l.dialogueLine, order: l.sequenceOrder })),
        quests: quests
          .filter((q) => q.sceneID === s.sceneID)
          .map((q) => {
            const type = effectiveType(q);
            return {
              questID: q.questID,
              questName: q.questName,
              description: q.description || '',
              instruction: q.instruction,
              questType: type,
              form: Rules.toForm(type, parseJson(q.questContent)),
              ...supportOfQuest(q.questID)
            };
          })
      }))
    });
  } catch (err) {
    console.error('viewNarrative error:', err);
    return failServer(res, err, 'Naratif tidak dapat dimuatkan.');
  }
};

/** What deleting this narrative would remove (shown in the confirmation). */
export const narrativeImpact = async (req, res) => {
  try {
    const narrativeID = toID(req.params.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');
    const narrative = await getNarrative(narrativeID);
    if (!narrative) return fail(res, 404, 'Naratif tidak dijumpai.');

    const count = async (sql) => Number((await first(db, sql, [narrativeID])).c);
    const impact = {
      scenes: await count(`SELECT COUNT(*) AS c FROM Scene WHERE narrativeID = ?`),
      dialogues: await count(`SELECT COUNT(*) AS c FROM DialogueLine d INNER JOIN Scene s ON d.sceneID = s.sceneID WHERE s.narrativeID = ?`),
      quests: await count(`SELECT COUNT(*) AS c FROM Quest q INNER JOIN Scene s ON q.sceneID = s.sceneID WHERE s.narrativeID = ?`),
      completions: await count(`SELECT COUNT(*) AS c FROM QuestCompletion qc INNER JOIN Quest q ON qc.questID = q.questID INNER JOIN Scene s ON q.sceneID = s.sceneID WHERE s.narrativeID = ?`)
    };
    const siblings = Number((await first(db, `SELECT COUNT(*) AS c FROM Narrative WHERE eraID = ?`, [narrative.eraID])).c);
    return res.status(200).json({ success: true, impact: { ...impact, isLastInEra: siblings <= 1 } });
  } catch (err) {
    console.error('narrativeImpact error:', err);
    return failServer(res, err, 'Maklumat naratif tidak dapat dimuatkan.');
  }
};

/** ContentManager.addNarrative() */
export const addNarrative = async (req, res) => {
  try {
    const eraID = toID(req.body.eraID);
    if (!eraID) return fail(res, 400, 'Era tidak sah.');
    const { valid, errors, value } = validateNarrative(req.body);
    if (!valid) return fail(res, 422, 'Sila betulkan maklumat naratif.', { errors });
    if (!(await first(db, `SELECT eraID FROM HistoricalEra WHERE eraID = ?`, [eraID]))) return fail(res, 404, 'Era tidak dijumpai.');

    const [result] = await db.query(
      `INSERT INTO Narrative (narrativeTitle, eraID, summary) VALUES (?, ?, ?)`,
      [value.narrativeTitle, eraID, value.summary]);

    await saveChanges(req.teacher, eraID, 'Tambah naratif', `Naratif baharu: "${clip(value.narrativeTitle, 100)}"`);
    return res.status(201).json({ success: true, message: 'Naratif berjaya ditambah.', narrativeID: result.insertId });
  } catch (err) {
    console.error('addNarrative error:', err);
    return failServer(res, err, 'Naratif gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** ContentManager.editNarrative() */
export const editNarrative = async (req, res) => {
  try {
    const narrativeID = toID(req.params.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');
    const existing = await getNarrative(narrativeID);
    if (!existing) return fail(res, 404, 'Naratif tidak dijumpai.');

    const { valid, errors, value } = validateNarrative(req.body);
    if (!valid) return fail(res, 422, 'Sila betulkan maklumat naratif.', { errors });

    await db.query(`UPDATE Narrative SET narrativeTitle = ?, summary = ? WHERE narrativeID = ?`,
      [value.narrativeTitle, value.summary, narrativeID]);
    await saveChanges(req.teacher, existing.eraID, 'Kemas kini naratif',
      `"${clip(existing.narrativeTitle, 60)}" \u2192 "${clip(value.narrativeTitle, 60)}"`);
    return res.status(200).json({ success: true, message: 'Naratif berjaya dikemas kini.' });
  } catch (err) {
    console.error('editNarrative error:', err);
    return failServer(res, err, 'Naratif gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** ContentManager.removeNarrative()  - an era always keeps at least one narrative. */
export const removeNarrative = async (req, res) => {
  try {
    const narrativeID = toID(req.params.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');
    const existing = await getNarrative(narrativeID);
    if (!existing) return fail(res, 404, 'Naratif tidak dijumpai.');

    const siblings = Number((await first(db, `SELECT COUNT(*) AS c FROM Narrative WHERE eraID = ?`, [existing.eraID])).c);
    if (siblings <= 1) {
      return fail(res, 409, 'Era mesti mempunyai sekurang-kurangnya satu naratif. Tambah naratif lain dahulu sebelum memadam yang ini.');
    }

    const scenes = Number((await first(db, `SELECT COUNT(*) AS c FROM Scene WHERE narrativeID = ?`, [narrativeID])).c);
    await db.query(`DELETE FROM Narrative WHERE narrativeID = ?`, [narrativeID]);   // scenes, dialogue, quests cascade
    await saveChanges(req.teacher, existing.eraID, 'Padam naratif',
      `Naratif dipadam: "${clip(existing.narrativeTitle, 80)}" (${scenes} babak)`);
    return res.status(200).json({ success: true, message: 'Naratif berjaya dipadam.' });
  } catch (err) {
    console.error('removeNarrative error:', err);
    return failServer(res, err, 'Naratif gagal dipadam. Tiada perubahan dibuat.');
  }
};

/* ------------------------------------------------------------------------ */
/* SCENES                                                                   */
/* ------------------------------------------------------------------------ */

/** ContentManager.addScene()  - appended as the last scene. */
export const addScene = async (req, res) => {
  try {
    const narrativeID = toID(req.body.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');
    const narrative = await getNarrative(narrativeID);
    if (!narrative) return fail(res, 404, 'Naratif tidak dijumpai.');

    const { valid, errors, value } = validateScene(req.body);
    if (!valid) return fail(res, 422, 'Sila betulkan maklumat babak.', { errors });

    const created = await withTransaction(async (conn) => {
      const max = await first(conn, `SELECT COALESCE(MAX(sceneOrder), 0) AS m FROM Scene WHERE narrativeID = ?`, [narrativeID]);
      const sceneID = newSceneID();
      const order = Number(max.m) + 1;
      await conn.query(
        `INSERT INTO Scene (sceneID, sceneStoryline, sceneOrder, narrativeID, asset) VALUES (?, ?, ?, ?, ?)`,
        [sceneID, value.sceneStoryline, order, narrativeID, value.asset]);
      await setSupport(conn, 'scene', sceneID, { hint: value.hint });
      return { sceneID, order };
    });

    await saveChanges(req.teacher, narrative.eraID, 'Tambah babak',
      `"${clip(narrative.narrativeTitle, 60)}": babak ${created.order} ditambah`);
    return res.status(201).json({ success: true, message: 'Babak berjaya ditambah.', ...created });
  } catch (err) {
    console.error('addScene error:', err);
    return failServer(res, err, 'Babak gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** ContentManager.editScene()  - description, background, hint. */
export const editScene = async (req, res) => {
  try {
    const sceneID = req.params.sceneID;
    if (!SCENE_ID.test(sceneID)) return fail(res, 400, 'Babak tidak sah.');
    const existing = await getScene(sceneID);
    if (!existing) return fail(res, 404, 'Babak tidak dijumpai.');

    const { valid, errors, value } = validateScene(req.body);
    if (!valid) return fail(res, 422, 'Sila betulkan maklumat babak.', { errors });

    await withTransaction(async (conn) => {
      await conn.query(`UPDATE Scene SET sceneStoryline = ?, asset = ? WHERE sceneID = ?`,
        [value.sceneStoryline, value.asset, sceneID]);
      await setSupport(conn, 'scene', sceneID, { hint: value.hint });
    });

    await saveChanges(req.teacher, existing.eraID, 'Kemas kini babak',
      `"${clip(existing.narrativeTitle, 60)}": babak ${existing.sceneOrder} dikemas kini`);
    return res.status(200).json({ success: true, message: 'Babak berjaya dikemas kini.' });
  } catch (err) {
    console.error('editScene error:', err);
    return failServer(res, err, 'Babak gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** ContentManager.removeScene()  - the remaining scenes are renumbered 1, 2, 3... */
export const removeScene = async (req, res) => {
  try {
    const sceneID = req.params.sceneID;
    if (!SCENE_ID.test(sceneID)) return fail(res, 400, 'Babak tidak sah.');
    const existing = await getScene(sceneID);
    if (!existing) return fail(res, 404, 'Babak tidak dijumpai.');

    const hasQuest = Number((await first(db, `SELECT COUNT(*) AS c FROM Quest WHERE sceneID = ?`, [sceneID])).c) > 0;
    if (hasQuest && (await questSceneCount(existing.narrativeID)) - 1 < MIN_QUEST_SCENES) return fail(res, 409, QUEST_MIN_MSG);

    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM Scene WHERE sceneID = ?`, [sceneID]);      // dialogue + quests cascade
      const [rest] = await conn.query(
        `SELECT sceneID FROM Scene WHERE narrativeID = ? ORDER BY sceneOrder ASC, sceneID ASC`, [existing.narrativeID]);
      for (let i = 0; i < rest.length; i++) {
        await conn.query(`UPDATE Scene SET sceneOrder = ? WHERE sceneID = ?`, [i + 1, rest[i].sceneID]);
      }
    });

    await saveChanges(req.teacher, existing.eraID, 'Padam babak',
      `"${clip(existing.narrativeTitle, 60)}": babak ${existing.sceneOrder} dipadam`);
    return res.status(200).json({ success: true, message: 'Babak berjaya dipadam.' });
  } catch (err) {
    console.error('removeScene error:', err);
    return failServer(res, err, 'Babak gagal dipadam. Tiada perubahan dibuat.');
  }
};

/** ContentManager.reorderScenes()  - body: { sceneIDs: [ ...all scenes of the narrative, in the new order ] } */
export const reorderScenes = async (req, res) => {
  try {
    const narrativeID = toID(req.params.narrativeID);
    if (!narrativeID) return fail(res, 400, 'Naratif tidak sah.');
    const narrative = await getNarrative(narrativeID);
    if (!narrative) return fail(res, 404, 'Naratif tidak dijumpai.');

    const wanted = Array.isArray(req.body.sceneIDs) ? req.body.sceneIDs.map(String) : null;
    const [current] = await db.query(`SELECT sceneID FROM Scene WHERE narrativeID = ?`, [narrativeID]);
    const known = new Set(current.map((r) => r.sceneID));

    if (!wanted || wanted.length !== known.size || new Set(wanted).size !== wanted.length || !wanted.every((id) => known.has(id))) {
      return fail(res, 400, 'Susunan babak tidak sepadan dengan data terkini. Sila muat semula halaman.');
    }

    await withTransaction(async (conn) => {
      for (let i = 0; i < wanted.length; i++) {
        await conn.query(`UPDATE Scene SET sceneOrder = ? WHERE sceneID = ?`, [i + 1, wanted[i]]);
      }
    });

    await saveChanges(req.teacher, narrative.eraID, 'Susun semula babak', `"${clip(narrative.narrativeTitle, 60)}": susunan babak diubah`);
    return res.status(200).json({ success: true, message: 'Susunan babak disimpan.' });
  } catch (err) {
    console.error('reorderScenes error:', err);
    return failServer(res, err, 'Susunan babak gagal disimpan. Tiada perubahan dibuat.');
  }
};

/* ------------------------------------------------------------------------ */
/* DIALOGUE  (A2)                                                           */
/* ------------------------------------------------------------------------ */

/**
 * ContentManager.saveDialogue()
 * body: { lines: [ { npcID: number | null (= the player speaks), text } ] }  in speaking order.
 * Replaces ALL lines of the scene in one transaction.
 */
export const saveDialogue = async (req, res) => {
  try {
    const sceneID = req.params.sceneID;
    if (!SCENE_ID.test(sceneID)) return fail(res, 400, 'Babak tidak sah.');
    const scene = await getScene(sceneID);
    if (!scene) return fail(res, 404, 'Babak tidak dijumpai.');

    if (!Array.isArray(req.body.lines)) return fail(res, 400, 'Senarai dialog tidak sah.');
    if (req.body.lines.length > MAX_LINES) {
      return fail(res, 422, `Maksimum ${MAX_LINES} baris dialog bagi satu babak.`, { errors: {} });
    }

    const errors = {};
    const lines = req.body.lines.map((l, i) => {
      const text = str(l && l.text);
      const rawNpc = l ? l.npcID : null;
      const npcID = rawNpc === null || rawNpc === undefined || rawNpc === '' || Number(rawNpc) === 0 ? null : toID(rawNpc);
      if (!text) errors[i] = 'Dialog wajib diisi.';
      else if (text.length > 255) errors[i] = 'Dialog terlalu panjang (maksimum 255 aksara).';
      else if (MARKUP.test(text)) errors[i] = 'Aksara < dan > tidak dibenarkan.';
      if (rawNpc !== null && rawNpc !== undefined && rawNpc !== '' && Number(rawNpc) !== 0 && npcID === null) errors[i] = 'Penutur tidak sah.';
      return { npcID, text };
    });

    const npcIDs = [...new Set(lines.map((l) => l.npcID).filter((n) => n !== null))];
    if (npcIDs.length) {
      const [found] = await db.query(`SELECT npcID FROM NPC WHERE npcID IN (?)`, [npcIDs]);
      const ok = new Set(found.map((r) => Number(r.npcID)));
      lines.forEach((l, i) => { if (l.npcID !== null && !ok.has(l.npcID) && !errors[i]) errors[i] = 'Penutur (NPC) tidak dijumpai.'; });
    }

    if (Object.keys(errors).length) {
      return fail(res, 422, 'Sila betulkan baris dialog yang bertanda merah.', { errors });
    }

    await withTransaction(async (conn) => {
      await conn.query(`DELETE FROM DialogueLine WHERE sceneID = ?`, [sceneID]);
      for (let i = 0; i < lines.length; i++) {
        await conn.query(
          `INSERT INTO DialogueLine (npcID, narrativeID, sceneID, dialogueLine, sequenceOrder) VALUES (?, ?, ?, ?, ?)`,
          [lines[i].npcID, scene.narrativeID, sceneID, lines[i].text, i + 1]);
      }
    });

    await saveChanges(req.teacher, scene.eraID, 'Kemas kini dialog',
      `"${clip(scene.narrativeTitle, 60)}": babak ${scene.sceneOrder} kini ${lines.length} baris dialog`);
    return res.status(200).json({ success: true, message: 'Dialog berjaya disimpan.', count: lines.length });
  } catch (err) {
    console.error('saveDialogue error:', err);
    return failServer(res, err, 'Dialog gagal disimpan. Tiada perubahan dibuat.');
  }
};

/* ------------------------------------------------------------------------ */
/* QUESTS  (A3)                                                             */
/* ------------------------------------------------------------------------ */

/** Quest rules + the one thing the shared file cannot check: the background image must exist. */
const checkQuest = (body) => {
  const result = Rules.validate({ ...body, form: body.form });
  if (result.valid && Number(result.value.questType) === 2 && result.value.content.bgImage) {
    const file = result.value.content.bgImage.split('/').pop();
    if (!assetExists('background', file)) {
      result.valid = false;
      result.contentErrors.push('Gambar latar misi tidak dijumpai. Sila pilih semula.');
    }
  }
  return result;
};

const questPayload = (res, { errors, contentErrors }) =>
  fail(res, 422, 'Sila betulkan maklumat misi.', { errors, contentErrors });

/** ContentManager.addQuest() */
export const addQuest = async (req, res) => {
  try {
    const sceneID = str(req.body.sceneID);
    if (!SCENE_ID.test(sceneID)) return fail(res, 400, 'Babak tidak sah.');
    const scene = await getScene(sceneID);
    if (!scene) return fail(res, 404, 'Babak tidak dijumpai.');

    const result = checkQuest(req.body);
    if (!result.valid) return questPayload(res, result);

    const existing = Number((await first(db, `SELECT COUNT(*) AS c FROM Quest WHERE sceneID = ?`, [sceneID])).c);
    if (existing >= MAX_QUESTS_PER_SCENE) {
      return fail(res, 409, `Satu babak boleh mempunyai maksimum ${MAX_QUESTS_PER_SCENE} misi.`);
    }

    const v = result.value;
    const questID = await withTransaction(async (conn) => {
      const [ins] = await conn.query(
        `INSERT INTO Quest (sceneID, questName, instruction, questType, description, questContent) VALUES (?, ?, ?, ?, ?, ?)`,
        [sceneID, v.questName, v.instruction, String(v.questType), v.description || null, JSON.stringify(v.content)]);
      await setSupport(conn, 'quest', ins.insertId, v);
      return ins.insertId;
    });

    await saveChanges(req.teacher, scene.eraID, 'Tambah misi',
      `"${clip(scene.narrativeTitle, 50)}" babak ${scene.sceneOrder}: "${clip(v.questName, 60)}" (${Rules.TYPES[v.questType].label})`);
    return res.status(201).json({ success: true, message: 'Misi berjaya ditambah.', questID });
  } catch (err) {
    console.error('addQuest error:', err);
    return failServer(res, err, 'Misi gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** ContentManager.editQuest() */
export const editQuest = async (req, res) => {
  try {
    const questID = toID(req.params.questID);
    if (!questID) return fail(res, 400, 'Misi tidak sah.');
    const existing = await getQuest(questID);
    if (!existing) return fail(res, 404, 'Misi tidak dijumpai.');

    const result = checkQuest(req.body);
    if (!result.valid) return questPayload(res, result);

    const v = result.value;
    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE Quest SET questName = ?, instruction = ?, questType = ?, description = ?, questContent = ? WHERE questID = ?`,
        [v.questName, v.instruction, String(v.questType), v.description || null, JSON.stringify(v.content), questID]);
      await setSupport(conn, 'quest', questID, v);
    });

    await saveChanges(req.teacher, existing.eraID, 'Kemas kini misi',
      `"${clip(existing.narrativeTitle, 50)}" babak ${existing.sceneOrder}: "${clip(v.questName, 60)}"`);
    return res.status(200).json({ success: true, message: 'Misi berjaya dikemas kini.' });
  } catch (err) {
    console.error('editQuest error:', err);
    return failServer(res, err, 'Misi gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** ContentManager.removeQuest() */
export const removeQuest = async (req, res) => {
  try {
    const questID = toID(req.params.questID);
    if (!questID) return fail(res, 400, 'Misi tidak sah.');
    const existing = await getQuest(questID);
    if (!existing) return fail(res, 404, 'Misi tidak dijumpai.');

    // the last quest of a scene makes that scene a plain story scene: keep enough quest scenes
    const siblings = Number((await first(db, `SELECT COUNT(*) AS c FROM Quest WHERE sceneID = ?`, [existing.sceneID])).c);
    if (siblings <= 1 && (await questSceneCount(existing.narrativeID)) - 1 < MIN_QUEST_SCENES) return fail(res, 409, QUEST_MIN_MSG);

    await db.query(`DELETE FROM Quest WHERE questID = ?`, [questID]);   // completions + support cascade
    await saveChanges(req.teacher, existing.eraID, 'Padam misi',
      `"${clip(existing.narrativeTitle, 50)}" babak ${existing.sceneOrder}: "${clip(existing.questName, 60)}" dipadam`);
    return res.status(200).json({ success: true, message: 'Misi berjaya dipadam.' });
  } catch (err) {
    console.error('removeQuest error:', err);
    return failServer(res, err, 'Misi gagal dipadam. Tiada perubahan dibuat.');
  }
};