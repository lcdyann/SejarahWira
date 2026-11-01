/**
 * ============================================================================
 * SejarahWira - Story Controller (storyController.js)
 * ============================================================================
 * Tier        : Application Tier (Controller - BCE Pattern)
 * Use case    : Learn Historical Era (narrative part only)
 * Routes      : backend/routes/storyRoutes.js
 * Frontend    : assets/js/storyEngine.js (story_scene.html), quest_game.html
 *
 * Every exported handler is named after the method in the class diagram:
 *
 *   HistoricalEra        loadRandomNarrative()*, evaluateUnlockAssessment()
 *   Narrative            loadNarrative(), evaluateBadgeUnlock()
 *   Scene                loadScene()*
 *   Quest                assignQuest() ("hanger / on-switch"), loadQuest()
 *   QuestCompletion      verifyCompletion(), resetReplay()
 *   LearningSupport      provideHint()
 *   EraProgression       updateStatus()*
 *   LearningProgression  updateProgress()*
 *   StudentBadge         unlockBadge()*     (inside evaluateBadgeUnlock)
 *   Badge                displayBadge()*    (badge payload sent to the popup)
 *
 *   (* = internal helper, not an HTTP route)
 *
 * NOT handled here (belongs to the Era / Assessment controller, built later):
 *   - EraProgression 'completed' status (after narrative + summative)
 *   - unlockNextEra(), checkCompletion()
 *   - AssessmentAttempt.evaluateArtifactUnlock()
 * ============================================================================
 */

import db from '../config/db.js';
import { EraProgressionModel } from '../models/ProgressModels.js';
import { AssessmentModel } from '../models/AssessmentModels.js';


/* ------------------------------------------------------------------------ */
/* SMALL UTILITIES                                                          */
/* ------------------------------------------------------------------------ */

/** Prefix a bare filename with its asset folder; leave full paths/URLs alone. */
const resolveAsset = (raw, folder, fallback) => {
  if (!raw) return fallback;
  return raw.startsWith('../') || raw.startsWith('http') ? raw : `../assets/gameAsset/${folder}/${raw}`;
};

/** "1,2,3" -> [1,2,3] (invalid values dropped). */
const parseIDList = (value) =>
  String(value || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ------------------------------------------------------------------------ */
/* INTERNAL HELPERS (class-diagram methods that are not HTTP routes)        */
/* ------------------------------------------------------------------------ */

/**
 * LearningProgression.updateProgress()
 * Recalculates the student's aggregate stats and upserts LearningProgression.
 * bestScore = highest AssessmentAttempt.Score of the student (written by saveScore).
 */
export const updateProgress = async (studentID) => {
  const [[{ completedEras }]] = await db.query(
    `SELECT COUNT(DISTINCT eraID) AS completedEras
     FROM EraProgression WHERE studentID = ? AND eraStatus = 'completed'`,
    [studentID]
  );
  const [[{ totalEras }]] = await db.query(`SELECT COUNT(*) AS totalEras FROM HistoricalEra`);
  const [[{ badgesEarned }]] = await db.query(
    `SELECT COUNT(*) AS badgesEarned FROM StudentBadge WHERE studentID = ?`,
    [studentID]
  );
  const [[{ artifactsUnlocked }]] = await db.query(
    `SELECT COUNT(*) AS artifactsUnlocked FROM StudentArtifact WHERE studentID = ?`,
    [studentID]
  );

  const [[{ bestScore }]] = await db.query(
    `SELECT COALESCE(MAX(Score), 0) AS bestScore FROM AssessmentAttempt WHERE studentID = ?`,
    [studentID]
  );

  const completionRate = totalEras > 0 ? parseFloat(((completedEras / totalEras) * 100).toFixed(2)) : 0;

  await db.query(
    `INSERT INTO LearningProgression
       (studentID, completionRate, erasCompleted, bestScore, badgesEarned, artifactsUnlocked)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       completionRate    = VALUES(completionRate),
       erasCompleted     = VALUES(erasCompleted),
       bestScore         = VALUES(bestScore),
       badgesEarned      = VALUES(badgesEarned),
       artifactsUnlocked = VALUES(artifactsUnlocked)`,
    [studentID, completionRate, completedEras, bestScore, badgesEarned, artifactsUnlocked]
  );

  return { completedEras, totalEras, completionRate, bestScore, badgesEarned, artifactsUnlocked };
};

/**
 * EraProgression.updateStatus()
 * Upserts the era status. A 'completed' era is never downgraded by a replay;
 * only an explicit newStatus === 'completed' (from the Era controller) can set it.
 */
export const updateStatus = async (studentID, eraID, newStatus) => {
  await db.query(
    `INSERT INTO EraProgression (studentID, eraID, eraStatus, unlockCondition)
     VALUES (?, ?, ?, 'COMPLETE_ERA')
     ON DUPLICATE KEY UPDATE
       eraStatus = IF(? = 'completed', VALUES(eraStatus),
                      IF(eraStatus = 'completed', eraStatus, VALUES(eraStatus)))`,
    [studentID, eraID, newStatus, newStatus]
  );
};

/**
 * HistoricalEra.loadRandomNarrative()
 * Picks one narrative of the era at random. On replay the previously played
 * narrative is excluded so the student always gets a different one
 * (falls back to any narrative if the era only has one).
 */
const loadRandomNarrative = async (eraID, excludeNarrativeID) => {
  if (excludeNarrativeID) {
    const [rows] = await db.query(
      `SELECT narrativeID, narrativeTitle, eraID, summary
       FROM Narrative WHERE eraID = ? AND narrativeID <> ?
       ORDER BY RAND() LIMIT 1`,
      [eraID, excludeNarrativeID]
    );
    if (rows.length > 0) return rows[0];
  }
  const [rows] = await db.query(
    `SELECT narrativeID, narrativeTitle, eraID, summary
     FROM Narrative WHERE eraID = ? ORDER BY RAND() LIMIT 1`,
    [eraID]
  );
  return rows[0] || null;
};

/**
 * Scene.loadScene()
 * Builds one scene: background, and every dialogue line with its own speaker.
 * A dialogue line with npcID = NULL is spoken by the player.
 */
const loadScene = async (scene) => {
  const [dialogues] = await db.query(
    `SELECT d.dialogueID, d.dialogueLine, d.sequenceOrder, d.npcID,
            n.name AS npcName, n.biography, n.contribution, n.asset AS npcAsset
     FROM DialogueLine d
     LEFT JOIN NPC n ON d.npcID = n.npcID
     WHERE d.sceneID = ?
     ORDER BY d.sequenceOrder ASC`,
    [scene.sceneID]
  );

  return {
    sceneID: scene.sceneID,
    sceneStoryline: scene.sceneStoryline,
    sceneOrder: scene.sceneOrder,
    asset: resolveAsset(scene.asset, 'background', '../assets/gameAsset/background/village.jpg'),
    dialogues: dialogues.map((d) => ({
      dialogueID: d.dialogueID,
      dialogueLine: d.dialogueLine,
      sequenceOrder: d.sequenceOrder,
      speaker: d.npcID
        ? {
            npcID: d.npcID,
            name: d.npcName || 'Tokoh Sejarah',
            biography: d.biography || 'Tiada maklumat biografi.',
            contribution: d.contribution || 'Tiada maklumat sumbangan.',
            asset: resolveAsset(d.npcAsset, 'npc', '../assets/gameAsset/npc/tunku_abdul_rahman.png')
          }
        : {
            npcID: 0,
            name: 'Pemain',
            biography: 'Watak utama dalam perjalanan sejarah ini.',
            contribution: 'Penjelajah Sejarah',
            asset: '../assets/gameAsset/avatar/avatar_melayu_lelaki.png'
          }
    }))
  };
};

/**
 * Shared check used by verifyCompletion / evaluateBadgeUnlock /
 * evaluateUnlockAssessment: are ALL assigned quests of this narrative done?
 * Also guards against client-sent quest IDs that do not belong to the narrative.
 */
const checkNarrativeQuests = async (studentID, eraID, narrativeID, questIDs) => {
  if (!questIDs.length) return { valid: false, completed: 0, total: 0, isComplete: false };

  const [[{ owned }]] = await db.query(
    `SELECT COUNT(*) AS owned
     FROM Quest q
     INNER JOIN Scene s ON q.sceneID = s.sceneID
     INNER JOIN Narrative n ON s.narrativeID = n.narrativeID
     WHERE q.questID IN (?) AND n.narrativeID = ? AND n.eraID = ?`,
    [questIDs, narrativeID, eraID]
  );
  const valid = owned === questIDs.length;

  const [[{ completed }]] = await db.query(
    `SELECT COUNT(*) AS completed FROM QuestCompletion
     WHERE studentID = ? AND questID IN (?)`,
    [studentID, questIDs]
  );

  return { valid, completed, total: questIDs.length, isComplete: valid && completed === questIDs.length };
};

/* ------------------------------------------------------------------------ */
/* ROUTE HANDLERS                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Narrative.loadNarrative()            GET /api/story/load-narrative
 * query: eraID, studentID, narrativeID? (session lock), excludeNarrativeID? (replay)
 * Loads the narrative (locked one, or a random one) with all its scenes in order,
 * and marks the era as 'in progress' (never downgrades 'completed').
 */
export const loadNarrative = async (req, res) => {
  try {
    const { eraID = 1, studentID = 'S1001', narrativeID, excludeNarrativeID } = req.query;

    let narrative = null;
    if (narrativeID) {
      const [rows] = await db.query(
        `SELECT narrativeID, narrativeTitle, eraID, summary
         FROM Narrative WHERE narrativeID = ? AND eraID = ? LIMIT 1`,
        [narrativeID, eraID]
      );
      narrative = rows[0] || null;
    }
    if (!narrative) narrative = await loadRandomNarrative(eraID, excludeNarrativeID);

    if (!narrative) {
      return res.status(404).json({ success: false, message: 'Narrative tidak dijumpai.' });
    }

    const [scenes] = await db.query(
      `SELECT sceneID, sceneStoryline, sceneOrder, narrativeID, asset
       FROM Scene WHERE narrativeID = ? ORDER BY sceneOrder ASC`,
      [narrative.narrativeID]
    );
    const fullScenes = await Promise.all(scenes.map(loadScene));

    await updateStatus(studentID, eraID, 'in progress');

    // The role the student plays: dialogue rows of the narrative with NO scene
    // (line 1 = badge line, line 2 = opener of the moral lesson). Empty = the avatar speaks.
    const [roleRows] = await db.query(
      `SELECT d.sequenceOrder, d.dialogueLine, n.npcID, n.name, n.biography, n.contribution, n.asset
       FROM DialogueLine d LEFT JOIN NPC n ON d.npcID = n.npcID
       WHERE d.narrativeID = ? AND d.sceneID IS NULL ORDER BY d.sequenceOrder ASC`,
      [narrative.narrativeID]
    );
    const role = roleRows.length && roleRows[0].npcID
      ? {
          npcID: roleRows[0].npcID,
          name: roleRows[0].name,
          biography: roleRows[0].biography || '',
          contribution: roleRows[0].contribution || '',
          asset: resolveAsset(roleRows[0].asset, 'npc', '../assets/gameAsset/npc/tunku_abdul_rahman.png'),
          lines: roleRows.reduce((acc, r) => ({ ...acc, [r.sequenceOrder]: r.dialogueLine }), {})
        }
      : null;

    return res.status(200).json({
      success: true,
      scenario: {
        narrativeID: narrative.narrativeID,
        narrativeTitle: narrative.narrativeTitle,
        summary: narrative.summary,
        role,
        scenes: fullScenes
      }
    });
  } catch (err) {
    console.error('loadNarrative error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * Quest.assignQuest()  -- the "hanger / on-switch"        GET /api/story/assign-quest
 * query: narrativeID, studentID, questIDs? (comma list = resume the locked selection)
 *
 * A scene can have 0..n quests. This switches ON one quest for every scene that has quests (random when a
 * scene has several). The quest IS the scene's gameplay; scenes without a quest are plain story. With questIDs given it only re-reads the locked
 * selection and its completion state (page refresh / return from quest_game).
 */
export const assignQuest = async (req, res) => {
  try {
    const { narrativeID, studentID = 'S1001' } = req.query;
    if (!narrativeID) {
      return res.status(400).json({ success: false, message: 'narrativeID diperlukan.' });
    }

    const [pool] = await db.query(
      `SELECT q.questID, q.sceneID, q.questName, q.questType, q.description, s.sceneOrder
       FROM Quest q
       INNER JOIN Scene s ON q.sceneID = s.sceneID
       WHERE s.narrativeID = ?
       ORDER BY s.sceneOrder ASC, q.questID ASC`,
      [narrativeID]
    );

    const lockedIDs = parseIDList(req.query.questIDs);
    let chosen;

    if (lockedIDs.length > 0) {
      chosen = pool.filter((q) => lockedIDs.includes(q.questID));
    } else {
      // every scene that has quests plays ONE of them (picked at random), kept in story order;
      // scenes without a quest are plain story scenes
      const byScene = new Map();
      pool.forEach((q) => {
        if (!byScene.has(q.sceneID)) byScene.set(q.sceneID, []);
        byScene.get(q.sceneID).push(q);
      });
      chosen = [...byScene.values()]
        .map((list) => shuffle(list)[0])
        .sort((a, b) => a.sceneOrder - b.sceneOrder);
    }

    let doneSet = new Set();
    if (chosen.length > 0) {
      const [done] = await db.query(
        `SELECT questID FROM QuestCompletion WHERE studentID = ? AND questID IN (?)`,
        [studentID, chosen.map((q) => q.questID)]
      );
      doneSet = new Set(done.map((r) => r.questID));
    }

    return res.status(200).json({
      success: true,
      quests: chosen.map((q) => ({ ...q, isCompleted: doneSet.has(q.questID) }))
    });
  } catch (err) {
    console.error('assignQuest error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * Quest.loadQuest()                    GET /api/story/load-quest
 * query: questID
 * Quest data + mini-game JSON + its hint / explanation / feedback.
 */
export const loadQuest = async (req, res) => {
  try {
    const { questID } = req.query;

    const [rows] = await db.query(
      `SELECT q.questID, q.sceneID, q.questName, q.questType, q.description,
              q.instruction, q.questContent,
              ls.hint, ls.explanation, ls.feedback
       FROM Quest q
       LEFT JOIN LearningSupport ls ON ls.questID = q.questID
       WHERE q.questID = ? LIMIT 1`,
      [questID]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Misi tidak dijumpai.' });
    }

    const quest = rows[0];
    if (typeof quest.questContent === 'string') {
      try { quest.questContent = JSON.parse(quest.questContent); } catch { quest.questContent = null; }
    }

    return res.status(200).json({ success: true, quest });
  } catch (err) {
    console.error('loadQuest error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * QuestCompletion.verifyCompletion()   POST /api/story/verify-completion
 * body: studentID, questID, eraID?, narrativeID?, questIDs? (assigned list)
 * Records the finished quest in QuestCompletion (the green orb + the data that
 * badge / assessment unlock and EraProgression.checkCompletion read), refreshes
 * LearningProgression, and (when the assigned list is sent) returns x/n progress.
 */
export const verifyCompletion = async (req, res) => {
  try {
    const { studentID = 'S1001', questID, eraID, narrativeID } = req.body;
    if (!questID) {
      return res.status(400).json({ success: false, message: 'questID diperlukan.' });
    }

    await db.query(
      `INSERT INTO QuestCompletion (studentID, questID, completedAt)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE completedAt = NOW()`,
      [studentID, questID]
    );

    await updateProgress(studentID);

    let progress = null;
    const questIDs = Array.isArray(req.body.questIDs) ? req.body.questIDs.map(Number) : [];
    if (eraID && narrativeID && questIDs.length) {
      progress = await checkNarrativeQuests(studentID, eraID, narrativeID, questIDs);
    }

    return res.status(200).json({ success: true, message: 'Misi berjaya diselesaikan!', progress });
  } catch (err) {
    console.error('verifyCompletion error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * Narrative.evaluateBadgeUnlock()      POST /api/story/evaluate-badge-unlock
 * body: studentID, eraID, narrativeID, questIDs (all assigned quests)
 * The story reached its last scene. If every assigned quest is complete, the era
 * badge is awarded (StudentBadge.unlockBadge) and returned for the popup
 * (Badge.displayBadge). Safe to call repeatedly: a badge is never duplicated.
 * Does NOT mark the era 'completed' - that happens after the summative assessment.
 */
export const evaluateBadgeUnlock = async (req, res) => {
  try {
    const { studentID = 'S1001', eraID, narrativeID } = req.body;
    const questIDs = Array.isArray(req.body.questIDs) ? req.body.questIDs.map(Number) : [];

    if (!eraID || !narrativeID) {
      return res.status(400).json({ success: false, message: 'eraID dan narrativeID diperlukan.' });
    }

    const check = await checkNarrativeQuests(studentID, eraID, narrativeID, questIDs);
    if (!check.isComplete) {
      return res.status(200).json({ success: true, isNarrativeComplete: false, progress: check, badge: null });
    }

    // Badge.displayBadge payload (falls back to a generated title if no Badge row exists)
    const [rows] = await db.query(
      `SELECT h.eraName, b.badgeID, b.badgeName, b.asset
       FROM HistoricalEra h
       LEFT JOIN Badge b ON b.eraID = h.eraID
       WHERE h.eraID = ?
       ORDER BY b.badgeID ASC LIMIT 1`,
      [eraID]
    );
    const row = rows[0] || { eraName: `Era ${eraID}`, badgeID: null, badgeName: null, asset: null };

    // StudentBadge.unlockBadge()
    let isNew = false;
    if (row.badgeID) {
      const [result] = await db.query(
        `INSERT IGNORE INTO StudentBadge (studentID, badgeID) VALUES (?, ?)`,
        [studentID, row.badgeID]
      );
      isNew = result.affectedRows === 1;
    }

    // Badge owned = narrative condition met. If the Great Siege was already passed
    // (e.g. a replay), this completes the era and unlocks the next one. Otherwise it
    // is a harmless no-op until the Siege is passed (assessmentController.saveScore).
    try {
      await EraProgressionModel.verifyConditions(studentID, eraID);
    } catch (e) {
      console.error('evaluateBadgeUnlock verifyConditions error:', e);
    }

    const progression = await updateProgress(studentID);

    return res.status(200).json({
      success: true,
      isNarrativeComplete: true,
      progress: check,
      progression,
      badge: {
        eraName: row.eraName,
        badgeTitle: row.badgeName || `Lencana Sejarawan ${row.eraName}`,
        badgeSubtitle: `(Historian Badge - ${row.eraName})`,
        badgeAsset: resolveAsset(row.asset, 'badge', `../assets/gameAsset/badge/badge_era_${eraID}.png`),
        isNew
      }
    });
  } catch (err) {
    console.error('evaluateBadgeUnlock error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * HistoricalEra.evaluateUnlockAssessment()   GET /api/story/evaluate-unlock-assessment
 * query: studentID, eraID, narrativeID, questIDs (comma list)
 * Narrative finished => Formative (Wira Training Grounds) and Summative (Great Siege)
 * assessments of this era become playable.
 */
export const evaluateUnlockAssessment = async (req, res) => {
  try {
    const { studentID = 'S1001', eraID, narrativeID } = req.query;
    const questIDs = parseIDList(req.query.questIDs);

    if (!eraID || !narrativeID) {
      return res.status(400).json({ success: false, message: 'eraID dan narrativeID diperlukan.' });
    }

    const check = await checkNarrativeQuests(studentID, eraID, narrativeID, questIDs);
    const unlock = await AssessmentModel.unlockAssessment(eraID, check.isComplete);        // Assessment.unlockAssessment()

    return res.status(200).json({
      success: true,
      isEligible: check.isComplete,
      assessments: unlock.assessments,
      completedQuests: check.completed,
      totalQuests: check.total,
      reason: check.isComplete
        ? 'Akses dibenarkan.'
        : `Sila selesaikan semua misi penceritaan (${check.completed}/${check.total}) dahulu.`
    });
  } catch (err) {
    console.error('evaluateUnlockAssessment error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * LearningSupport.provideHint()        GET /api/story/provide-hint
 * query: sceneID
 * Contextual hint (plus explanation / feedback if present) for the current scene.
 */
export const provideHint = async (req, res) => {
  const fallback = { hint: 'Selesaikan perbualan dialog untuk membuka tugasan scene.' };
  try {
    const { sceneID } = req.query;
    const [rows] = await db.query(
      `SELECT supportID, sceneID, hint, explanation, feedback
       FROM LearningSupport
       WHERE sceneID = ? AND hint IS NOT NULL LIMIT 1`,
      [sceneID]
    );
    return res.status(200).json({ success: true, support: rows[0] || fallback });
  } catch (err) {
    console.error('provideHint error:', err);
    return res.status(200).json({ success: true, support: fallback });
  }
};

/**
 * QuestCompletion.resetReplay()        POST /api/story/reset-replay
 * body: studentID, eraID
 * Starts every play-through clean: wipes this student's QuestCompletion rows for
 * the era. Badges, EraProgression and LearningProgression are NOT touched, so the
 * student keeps the 'completed' era status and earned badge on replay.
 */
export const resetReplay = async (req, res) => {
  try {
    const { studentID = 'S1001', eraID = 1 } = req.body;

    await db.query(
      `DELETE qc FROM QuestCompletion qc
       INNER JOIN Quest q ON qc.questID = q.questID
       INNER JOIN Scene s ON q.sceneID = s.sceneID
       INNER JOIN Narrative n ON s.narrativeID = n.narrativeID
       WHERE qc.studentID = ? AND n.eraID = ?`,
      [studentID, eraID]
    );

    return res.status(200).json({ success: true, message: 'Kemajuan misi telah dilesapkan.' });
  } catch (err) {
    console.error('resetReplay error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};