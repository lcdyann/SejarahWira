import { failServer } from '../utils/dbError.js';
import { ContentManager } from '../models/ContentManager.js';
import { canEditContent } from '../middleware/requireAdmin.js';
import db from '../config/db.js';

/**
 * ============================================================================
 * contentController.js  (Application tier - BCE)            UC-10 Manage Learning Content
 * Every route is behind requireTeacher (see contentRoutes.js); req.teacher comes from the
 * signed login token.
 *
 * Content is ONE shared set for all classes (the same curriculum). Because any teacher can
 * edit it, every change is written to the ContentManager table so other teachers can see
 * who added or edited what.
 *
 *   Teacher        manageLearningContent()   GET    /api/content/eras
 *   Teacher        viewEraContent()          GET    /api/content/overview?eraID=
 *   QuestionBank   listQuestions()           GET    /api/content/questions?eraID=
 *   QuestionBank   addQuestion()             POST   /api/content/questions
 *   QuestionBank   editQuestion()            PUT    /api/content/questions/:questionID
 *   QuestionBank   removeQuestion()          DELETE /api/content/questions/:questionID
 *   ContentManager saveChanges()             (internal) one log row per change
 *   ContentManager viewChanges()             GET    /api/content/changes?eraID=&limit=
 *
 * Text safety: teacher text is shown to students, and some student pages insert it as HTML,
 * so "<" and ">" are rejected on the server (validateQuestion).
 * ============================================================================
 */

const MAX_TEXT = 2000;
const MAX_OPTION = 255;
const MAX_HINT = 255;
const MARKUP = /[<>]/;
const OPTION_KEYS = ['A', 'B', 'C', 'D'];

const toEraID = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}\u2026` : text);

/* ------------------------------------------------------------------------ */
/* VALIDATION  (UC-10 step 10 / E1)                                         */
/* ------------------------------------------------------------------------ */

export const validateQuestion = (body = {}) => {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const value = {
    questionText: str(body.questionText),
    optionA: str(body.optionA),
    optionB: str(body.optionB),
    optionC: str(body.optionC),
    optionD: str(body.optionD),
    correctAnswer: str(body.correctAnswer).toUpperCase(),
    hint: str(body.hint),
    explanation: str(body.explanation)
  };
  const errors = {};

  const required = (field, label, max) => {
    if (!value[field]) errors[field] = `${label} wajib diisi.`;
    else if (value[field].length > max) errors[field] = `${label} terlalu panjang (maksimum ${max} aksara).`;
  };
  required('questionText', 'Soalan', MAX_TEXT);
  OPTION_KEYS.forEach((k) => required(`option${k}`, `Pilihan ${k}`, MAX_OPTION));

  if (!OPTION_KEYS.includes(value.correctAnswer)) {
    errors.correctAnswer = 'Sila pilih jawapan yang betul (A, B, C atau D).';
  }

  if (value.hint.length > MAX_HINT) errors.hint = `Petunjuk terlalu panjang (maksimum ${MAX_HINT} aksara).`;
  if (value.explanation.length > MAX_TEXT) errors.explanation = `Penerangan terlalu panjang (maksimum ${MAX_TEXT} aksara).`;

  // two options must not be the same
  const seen = new Map();
  OPTION_KEYS.forEach((k) => {
    const v = value[`option${k}`].toLowerCase();
    if (!v) return;
    if (seen.has(v)) {
      if (!errors[`option${k}`]) errors[`option${k}`] = `Pilihan ${k} sama dengan Pilihan ${seen.get(v)}.`;
    } else {
      seen.set(v, k);
    }
  });

  // no markup characters in anything the students will read
  ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'hint', 'explanation'].forEach((field) => {
    if (!errors[field] && MARKUP.test(value[field])) {
      errors[field] = 'Aksara < dan > tidak dibenarkan.';
    }
  });

  return { valid: Object.keys(errors).length === 0, errors, value };
};

/* ------------------------------------------------------------------------ */
/* HELPERS                                                                  */
/* ------------------------------------------------------------------------ */

/** ContentManager.saveChanges() - one row per change so other teachers can follow what happened. */
export const saveChanges = (teacher, eraID, changesName, changesDescription) =>
  new ContentManager(teacher.teacherID).saveChanges(eraID, changesName, changesDescription);

const eraExists = async (eraID) => {
  const [rows] = await db.query(`SELECT eraID FROM HistoricalEra WHERE eraID = ? LIMIT 1`, [eraID]);
  return rows.length > 0;
};

/** One question bank per era; created the first time a question is added. */
const getOrCreateBank = async (eraID) => {
  const [rows] = await db.query(`SELECT bankID FROM QuestionBank WHERE eraID = ? ORDER BY bankID ASC LIMIT 1`, [eraID]);
  if (rows.length > 0) return rows[0].bankID;
  const [result] = await db.query(`INSERT INTO QuestionBank (eraID) VALUES (?)`, [eraID]);
  return result.insertId;
};

/** A question together with the era of its bank (null when it does not exist). */
const findQuestion = async (questionID) => {
  const [rows] = await db.query(
    `SELECT q.questionID, q.bankID, q.questionText, qb.eraID
     FROM Question q INNER JOIN QuestionBank qb ON q.bankID = qb.bankID
     WHERE q.questionID = ? LIMIT 1`,
    [questionID]
  );
  return rows[0] || null;
};

/* ------------------------------------------------------------------------ */
/* READINESS: is an era complete enough for students to play AND finish it? */
/* ------------------------------------------------------------------------ */

/* ---- semakan cerita <-> misi (amaran, bukan ralat) ---------------------------------------
   Peraturan penulisan: jawapan misi mesti boleh ditemui dalam cerita babak itu, dan setiap misi
   patut ada petunjuk yang membantu. Semakan ini hanya memberi AMARAN kepada guru.            */
const normal = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\s]/g, ' ').replace(/\s+/g, ' ').trim();
const katakunci = (t) => normal(t).split(' ').filter((w) => w.length >= 4);

/** adakah jawapan (frasa penuh, atau sekurang-kurangnya 70% perkataan penting) ada dalam teks cerita? */
const jawapanDalamCerita = (jawapan, ceritaNormal) => {
  const frasa = normal(jawapan);
  if (!frasa) return true;
  if (ceritaNormal.includes(frasa)) return true;
  const kata = katakunci(jawapan);
  if (!kata.length) return true;                        // jawapan terlalu pendek untuk disemak
  return kata.filter((k) => ceritaNormal.includes(k)).length / kata.length >= 0.7;
};

const parseJsonSafe = (v) => {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
};

const buildEraSummaries = async () => {
  const [eras] = await db.query(`SELECT eraID, eraName, description FROM HistoricalEra ORDER BY eraID ASC`);

  const [narratives] = await db.query(
    `SELECT n.narrativeID, n.eraID, n.narrativeTitle,
            (SELECT COUNT(*) FROM Scene s WHERE s.narrativeID = n.narrativeID) AS sceneCount,
            (SELECT COUNT(*) FROM Scene s
              WHERE s.narrativeID = n.narrativeID
                AND EXISTS (SELECT 1 FROM DialogueLine d WHERE d.sceneID = s.sceneID)) AS scenesWithDialogue,
            (SELECT COUNT(*) FROM DialogueLine r WHERE r.narrativeID = n.narrativeID AND r.sceneID IS NULL AND r.npcID IS NOT NULL) AS roleLines,
            (SELECT COUNT(DISTINCT q.sceneID) FROM Quest q
               INNER JOIN Scene s ON q.sceneID = s.sceneID
              WHERE s.narrativeID = n.narrativeID) AS scenesWithQuest
     FROM Narrative n ORDER BY n.narrativeID ASC`
  );

  const [questionCounts] = await db.query(
    `SELECT qb.eraID, COUNT(q.questionID) AS total
     FROM QuestionBank qb LEFT JOIN Question q ON q.bankID = qb.bankID
     GROUP BY qb.eraID`
  );
  const [badgeCounts] = await db.query(`SELECT eraID, COUNT(*) AS total FROM Badge GROUP BY eraID`);
  const [summatives] = await db.query(
    `SELECT eraID, requiredScore, summativeConfig FROM Assessment WHERE assessmentType = 'Summative'`
  );
  const [artifacts] = await db.query(`SELECT artifactID FROM Artifact`);

  // bahan semakan cerita <-> misi
  const [sceneRows] = await db.query(
    `SELECT s.sceneID, s.narrativeID, s.sceneStoryline FROM Scene s ORDER BY s.narrativeID, s.sceneOrder ASC, s.sceneID ASC`);
  const [lineRows] = await db.query(`SELECT sceneID, dialogueLine FROM DialogueLine WHERE sceneID IS NOT NULL`);
  const [questRows] = await db.query(`SELECT questID, sceneID, questType, questContent FROM Quest`);
  const [hintRows] = await db.query(`SELECT DISTINCT questID FROM LearningSupport WHERE questID IS NOT NULL AND hint IS NOT NULL AND hint <> ''`);
  const hintedQuests = new Set(hintRows.map((r) => Number(r.questID)));

  const artifactIDs = new Set(artifacts.map((a) => Number(a.artifactID)));
  const questionByEra = new Map(questionCounts.map((r) => [Number(r.eraID), Number(r.total)]));
  const badgeByEra = new Map(badgeCounts.map((r) => [Number(r.eraID), Number(r.total)]));
  const summativeByEra = new Map(summatives.map((r) => [Number(r.eraID), r]));

  return eras.map((era) => {
    const eraID = Number(era.eraID);
    const eraNarratives = narratives
      .filter((n) => Number(n.eraID) === eraID)
      .map((n) => ({
        narrativeID: n.narrativeID,
        narrativeTitle: n.narrativeTitle,
        sceneCount: Number(n.sceneCount),
        scenesWithDialogue: Number(n.scenesWithDialogue),
        hasRole: Number(n.roleLines) > 0,
        scenesWithQuest: Number(n.scenesWithQuest)
      }));
    const questionCount = questionByEra.get(eraID) || 0;
    const summative = summativeByEra.get(eraID) || null;

    const issues = [];
    const ralat = (text) => issues.push({ level: 'ralat', text });
    const amaran = (text) => issues.push({ level: 'amaran', text });

    if (eraNarratives.length === 0) {
      ralat('Tiada naratif untuk era ini.');
    } else if (eraNarratives.length === 1) {
      amaran('Hanya ada 1 naratif. Disyorkan sekurang-kurangnya 2 supaya ulang main memberi cerita berbeza.');
    }
    eraNarratives.forEach((n) => {
      const name = `Naratif "${n.narrativeTitle}"`;
      if (n.sceneCount === 0) {
        ralat(`${name} belum mempunyai babak.`);
        return;
      }
      if (n.scenesWithQuest === 0) {
        ralat(`${name} tiada misi. Pelajar tidak akan dapat menamatkan era ini.`);
      } else if (n.scenesWithQuest < 3) {
        amaran(`${name} hanya ada ${n.scenesWithQuest} babak bermisi (disyorkan 3).`);
      }
      if (!n.hasRole) {
        amaran(`${name} belum ada peranan pelajar. Pilih watak yang dimainkan pelajar (kad KAU KINI IALAH dalam kotak Naratif). Tanpa peranan, pelajar tidak tahu siapa dirinya dalam cerita.`);
      }
      if (n.scenesWithDialogue < n.sceneCount) {
        amaran(`${name}: ${n.sceneCount - n.scenesWithDialogue} babak belum mempunyai dialog.`);
      }

      // jawapan misi (Bantu Tokoh / Nyahkod) mesti ada dalam cerita babak; setiap misi patut ada petunjuk
      const babakTiadaJawapan = [];
      const babakTiadaPetunjuk = [];
      sceneRows.filter((r) => Number(r.narrativeID) === Number(n.narrativeID)).forEach((sc, idx) => {
        const cerita = normal([sc.sceneStoryline, ...lineRows.filter((l) => Number(l.sceneID) === Number(sc.sceneID)).map((l) => l.dialogueLine)].join(' '));
        questRows.filter((q) => Number(q.sceneID) === Number(sc.sceneID)).forEach((q) => {
          if ([3, 5].includes(Number(q.questType))) {
            const c = parseJsonSafe(q.questContent);
            const betul = c && Array.isArray(c.options) ? c.options.filter((o) => o && o.isCorrect) : [];
            if (betul.some((o) => !jawapanDalamCerita(o.text, cerita))) babakTiadaJawapan.push(idx + 1);
          }
          if (!hintedQuests.has(Number(q.questID))) babakTiadaPetunjuk.push(idx + 1);
        });
      });
      const senarai = (a) => [...new Set(a)].join(', ');
      if (babakTiadaJawapan.length) {
        amaran(`${name}: jawapan misi tidak ditemui dalam cerita pada babak ${senarai(babakTiadaJawapan)}. Murid sepatutnya boleh menemui jawapan dengan membaca cerita babak itu.`);
      }
      if (babakTiadaPetunjuk.length) {
        amaran(`${name}: misi pada babak ${senarai(babakTiadaPetunjuk)} belum ada petunjuk (butang Petunjuk murid akan kosong).`);
      }
    });

    if (questionCount === 0) ralat('Bank soalan kosong.');
    else if (questionCount < 10) amaran(`Bank soalan hanya ada ${questionCount} soalan (penilaian menggunakan 10).`);

    if (!badgeByEra.get(eraID)) ralat('Tiada lencana untuk era ini. Pelajar tidak dapat menamatkan era.');

    if (!summative) {
      ralat('Tiada Pentaksiran Sumatif (The Great Siege) untuk era ini.');
    } else {
      let cfg = summative.summativeConfig;
      if (typeof cfg === 'string') {
        try { cfg = JSON.parse(cfg); } catch { cfg = null; }
      }
      const artifactID = cfg && cfg.artifactID ? Number(cfg.artifactID) : eraID;
      if (!artifactIDs.has(artifactID)) amaran('Tiada artifak dipautkan untuk ganjaran era ini.');
    }

    const status = issues.some((i) => i.level === 'ralat')
      ? 'tidak_lengkap'
      : issues.length > 0 ? 'amaran' : 'sedia';

    return {
      eraID,
      eraName: era.eraName,
      description: era.description,
      narrativeCount: eraNarratives.length,
      questionCount,
      requiredScore: summative ? Number(summative.requiredScore) : null,
      narratives: eraNarratives,
      issues,
      status
    };
  });
};

/* ------------------------------------------------------------------------ */
/* HANDLERS                                                                 */
/* ------------------------------------------------------------------------ */

/** Teacher.manageLearningContent()  - step 2: list of historical eras, with readiness. */
export const manageLearningContent = async (req, res) => {
  try {
    const eras = await buildEraSummaries();
    return res.status(200).json({ success: true, eras, canEdit: canEditContent(req.teacher) });
  } catch (err) {
    console.error('manageLearningContent error:', err);
    return failServer(res, err, 'Senarai era tidak dapat dimuatkan.');
  }
};

/** Teacher.viewEraContent() - steps 3-4: the selected era with its content summary. */
export const viewEraContent = async (req, res) => {
  try {
    const eraID = toEraID(req.query.eraID);
    if (!eraID) return res.status(400).json({ success: false, message: 'Era tidak sah.' });

    const era = (await buildEraSummaries()).find((e) => e.eraID === eraID);
    if (!era) return res.status(404).json({ success: false, message: 'Era tidak dijumpai.' });

    return res.status(200).json({ success: true, era, canEdit: canEditContent(req.teacher) });
  } catch (err) {
    console.error('viewEraContent error:', err);
    return failServer(res, err, 'Kandungan era tidak dapat dimuatkan.');
  }
};

/** QuestionBank: all questions of an era. */
export const listQuestions = async (req, res) => {
  try {
    const eraID = toEraID(req.query.eraID);
    if (!eraID) return res.status(400).json({ success: false, message: 'Era tidak sah.' });
    if (!(await eraExists(eraID))) return res.status(404).json({ success: false, message: 'Era tidak dijumpai.' });

    const [rows] = await db.query(
      `SELECT q.questionID, q.questionText,
              q.option_a AS optionA, q.option_b AS optionB, q.option_c AS optionC, q.option_d AS optionD,
              q.correctAnswer, q.hint, q.explanation
       FROM Question q INNER JOIN QuestionBank qb ON q.bankID = qb.bankID
       WHERE qb.eraID = ?
       ORDER BY q.questionID ASC`,
      [eraID]
    );

    return res.status(200).json({ success: true, eraID, questions: rows });
  } catch (err) {
    console.error('listQuestions error:', err);
    return failServer(res, err, 'Senarai soalan tidak dapat dimuatkan.');
  }
};

/** QuestionBank.addQuestion() - steps 9-12. */
export const addQuestion = async (req, res) => {
  try {
    const eraID = toEraID(req.body.eraID);
    if (!eraID) return res.status(400).json({ success: false, message: 'Era tidak sah.' });

    const { valid, errors, value } = validateQuestion(req.body);
    if (!valid) {
      return res.status(422).json({ success: false, message: 'Sila betulkan maklumat soalan.', errors });
    }
    if (!(await eraExists(eraID))) return res.status(404).json({ success: false, message: 'Era tidak dijumpai.' });

    const bankID = await getOrCreateBank(eraID);
    const [result] = await db.query(
      `INSERT INTO Question
         (bankID, questionText, option_a, option_b, option_c, option_d, correctAnswer, hint, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bankID, value.questionText, value.optionA, value.optionB, value.optionC, value.optionD,
       value.correctAnswer, value.hint || null, value.explanation || null]
    );

    await saveChanges(req.teacher, eraID, 'Tambah soalan', `Soalan baharu: "${clip(value.questionText, 120)}"`);

    return res.status(201).json({
      success: true,
      message: 'Soalan berjaya ditambah.',
      question: { questionID: result.insertId, ...value }
    });
  } catch (err) {
    console.error('addQuestion error:', err);
    return failServer(res, err, 'Soalan gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** QuestionBank.editQuestion() */
export const editQuestion = async (req, res) => {
  try {
    const questionID = toEraID(req.params.questionID);
    if (!questionID) return res.status(400).json({ success: false, message: 'Soalan tidak sah.' });

    const existing = await findQuestion(questionID);
    if (!existing) return res.status(404).json({ success: false, message: 'Soalan tidak dijumpai.' });

    const { valid, errors, value } = validateQuestion(req.body);
    if (!valid) {
      return res.status(422).json({ success: false, message: 'Sila betulkan maklumat soalan.', errors });
    }

    await db.query(
      `UPDATE Question
       SET questionText = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
           correctAnswer = ?, hint = ?, explanation = ?
       WHERE questionID = ?`,
      [value.questionText, value.optionA, value.optionB, value.optionC, value.optionD,
       value.correctAnswer, value.hint || null, value.explanation || null, questionID]
    );

    await saveChanges(
      req.teacher, existing.eraID, 'Kemas kini soalan',
      `Sebelum: "${clip(existing.questionText, 80)}" \u2192 Selepas: "${clip(value.questionText, 80)}"`
    );

    return res.status(200).json({
      success: true,
      message: 'Soalan berjaya dikemas kini.',
      question: { questionID, ...value }
    });
  } catch (err) {
    console.error('editQuestion error:', err);
    return failServer(res, err, 'Soalan gagal disimpan. Tiada perubahan dibuat.');
  }
};

/** QuestionBank.removeQuestion() */
export const removeQuestion = async (req, res) => {
  try {
    const questionID = toEraID(req.params.questionID);
    if (!questionID) return res.status(400).json({ success: false, message: 'Soalan tidak sah.' });

    const existing = await findQuestion(questionID);
    if (!existing) return res.status(404).json({ success: false, message: 'Soalan tidak dijumpai.' });

    await db.query(`DELETE FROM Question WHERE questionID = ?`, [questionID]);
    await saveChanges(req.teacher, existing.eraID, 'Padam soalan', `Soalan dipadam: "${clip(existing.questionText, 120)}"`);

    return res.status(200).json({ success: true, message: 'Soalan berjaya dipadam.' });
  } catch (err) {
    console.error('removeQuestion error:', err);
    return failServer(res, err, 'Soalan gagal dipadam. Tiada perubahan dibuat.');
  }
};

/** ContentManager.viewChanges() - the shared change log (optionally for one era). */
export const viewChanges = async (req, res) => {
  try {
    const eraID = req.query.eraID ? toEraID(req.query.eraID) : null;
    if (req.query.eraID && !eraID) return res.status(400).json({ success: false, message: 'Era tidak sah.' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const where = eraID ? 'WHERE c.eraID = ?' : '';
    const params = eraID ? [eraID, limit] : [limit];

    const [rows] = await db.query(
      `SELECT c.changesID, c.changesName, c.changesDescription, c.updated_at, c.eraID,
              t.teacherName
       FROM ContentManager c
       LEFT JOIN Teacher t ON c.teacherID = t.teacherID
       ${where}
       ORDER BY c.changesID DESC
       LIMIT ?`,
      params
    );

    return res.status(200).json({ success: true, changes: rows });
  } catch (err) {
    console.error('viewChanges error:', err);
    return failServer(res, err, 'Rekod perubahan tidak dapat dimuatkan.');
  }
};