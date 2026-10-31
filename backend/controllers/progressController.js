import db from '../config/db.js';

/**
 * ============================================================================
 * progressController.js  (Application tier - BCE)
 * UC-09: View Learning Progress
 *
 *   Student / Teacher   viewLearningProgress()   GET /api/progress/view
 *
 * READ-ONLY (post-condition: "no student data is modified").
 * Aggregates live from the source tables, so numbers are always current:
 *   EraProgression + HistoricalEra  -> completed eras
 *   QuestCompletion                 -> quests completed
 *   AssessmentAttempt + Assessment  -> assessment performance
 *   StudentBadge + Badge            -> earned badges
 *   StudentArtifact + Artifact      -> earned artifacts
 *
 * Failure handling (UC-09 exceptions)
 *   E1 / A3  the base query fails            -> HTTP 500 + message (client goes back)
 *   E2       one section fails to aggregate  -> HTTP 200, partial:true, errors:[...]
 *   A1       no progress records yet         -> hasProgress:false (client shows message)
 *
 * Teacher access: pass teacherID; the student must belong to one of that
 * teacher's classes (Class.teacherID), otherwise 403.
 * NOTE: IDs come from the request like the rest of the project. Real protection
 * needs your login/session middleware to supply the user (see answer notes).
 * ============================================================================
 */

const resolveAsset = (raw, folder, fallback) => {
  if (!raw) return fallback;
  return raw.startsWith('../') || raw.startsWith('http') ? raw : `../assets/gameAsset/${folder}/${raw}`;
};

const ERA_STATUS_SQL = `COALESCE(ep.eraStatus,
       IF(e.eraID = (SELECT MIN(eraID) FROM HistoricalEra), 'unlocked', 'locked'))`;

/* ---------------------------- section aggregators ------------------------ */

const loadStudent = async (studentID) => {
  const [rows] = await db.query(
    `SELECT s.studentID, s.studentName, s.classID, c.className, c.batchYear,
            a.avatarName, a.asset AS avatarAsset
     FROM Student s
     LEFT JOIN Class c ON s.classID = c.classID
     LEFT JOIN Avatar a ON s.avatarID = a.avatarID
     WHERE s.studentID = ? LIMIT 1`,
    [studentID]
  );
  return rows[0] || null;
};

/** Completed historical eras + per-era activity breakdown. */
const aggregateEras = async (studentID) => {
  const [rows] = await db.query(
    `SELECT e.eraID, e.eraName,
            ${ERA_STATUS_SQL} AS eraStatus,
            EXISTS(SELECT 1 FROM StudentBadge sb
                   INNER JOIN Badge b ON sb.badgeID = b.badgeID
                   WHERE sb.studentID = ? AND b.eraID = e.eraID) AS narrativeDone,
            (SELECT COUNT(*) FROM QuestCompletion qc
               INNER JOIN Quest q ON qc.questID = q.questID
               INNER JOIN Scene sc ON q.sceneID = sc.sceneID
               INNER JOIN Narrative n ON sc.narrativeID = n.narrativeID
             WHERE qc.studentID = ? AND n.eraID = e.eraID) AS questsCompleted,
            (SELECT COUNT(*) FROM AssessmentAttempt a
               INNER JOIN Assessment x ON a.assessmentID = x.assessmentID
             WHERE a.studentID = ? AND x.eraID = e.eraID) AS attempts,
            (SELECT MAX(a.Score) FROM AssessmentAttempt a
               INNER JOIN Assessment x ON a.assessmentID = x.assessmentID
             WHERE a.studentID = ? AND x.eraID = e.eraID) AS bestScore,
            (SELECT MAX(a.is_completed) FROM AssessmentAttempt a
               INNER JOIN Assessment x ON a.assessmentID = x.assessmentID
             WHERE a.studentID = ? AND x.eraID = e.eraID AND x.assessmentType = 'Summative') AS summativePassed
     FROM HistoricalEra e
     LEFT JOIN EraProgression ep ON e.eraID = ep.eraID AND ep.studentID = ?
     ORDER BY e.eraID ASC`,
    [studentID, studentID, studentID, studentID, studentID, studentID]
  );

  return rows.map((r) => ({
    eraID: r.eraID,
    eraName: r.eraName,
    eraStatus: r.eraStatus,
    narrativeDone: Boolean(r.narrativeDone),
    questsCompleted: Number(r.questsCompleted) || 0,
    attempts: Number(r.attempts) || 0,
    bestScore: r.bestScore === null ? null : Number(r.bestScore),
    summativePassed: Boolean(r.summativePassed)
  }));
};

/** Assessment performance: every saved attempt (newest first). */
const aggregateAssessments = async (studentID) => {
  const [rows] = await db.query(
    `SELECT a.attemptID, a.Score AS score, a.is_completed AS passed, a.attemptDate,
            x.assessmentType, x.requiredScore, x.eraID, e.eraName
     FROM AssessmentAttempt a
     INNER JOIN Assessment x ON a.assessmentID = x.assessmentID
     INNER JOIN HistoricalEra e ON x.eraID = e.eraID
     WHERE a.studentID = ?
     ORDER BY a.attemptDate DESC, a.attemptID DESC
     LIMIT 100`,
    [studentID]
  );
  return rows.map((r) => ({ ...r, score: Number(r.score), passed: Boolean(r.passed) }));
};

/** Every badge of the game, marked earned / not earned. */
const aggregateBadges = async (studentID) => {
  const [rows] = await db.query(
    `SELECT b.badgeID, b.badgeName, b.asset, b.eraID, e.eraName, sb.earnedAt
     FROM Badge b
     INNER JOIN HistoricalEra e ON b.eraID = e.eraID
     LEFT JOIN StudentBadge sb ON sb.badgeID = b.badgeID AND sb.studentID = ?
     ORDER BY b.eraID ASC, b.badgeID ASC`,
    [studentID]
  );
  return rows.map((r) => ({
    badgeID: r.badgeID,
    badgeName: r.badgeName,
    eraID: r.eraID,
    eraName: r.eraName,
    asset: resolveAsset(r.asset, 'badge', '../assets/gameAsset/badge/era_historian.png'),
    earned: r.earnedAt !== null,
    earnedAt: r.earnedAt
  }));
};

/** Every artifact, marked earned / not earned. The moral lesson is only sent when earned. */
const aggregateArtifacts = async (studentID) => {
  const [rows] = await db.query(
    `SELECT a.artifactID, a.artifactName, a.moralLesson, a.asset, sa.unlockedAt
     FROM Artifact a
     LEFT JOIN StudentArtifact sa ON sa.artifactID = a.artifactID AND sa.studentID = ?
     ORDER BY a.artifactID ASC`,
    [studentID]
  );
  return rows.map((r) => {
    const earned = r.unlockedAt !== null;
    return {
      artifactID: r.artifactID,
      artifactName: earned ? r.artifactName : '???',
      moralLesson: earned ? r.moralLesson : null,
      asset: resolveAsset(r.asset, 'artifact', '../assets/gameAsset/artifact/artifact_default.png'),
      earned,
      unlockedAt: r.unlockedAt
    };
  });
};

/* ------------------------------ handler ---------------------------------- */

/**
 * Student.viewLearningProgress() / Teacher.viewLearningProgress()
 * GET /api/progress/view?studentID=&teacherID=(optional, teacher only)
 */
export const viewLearningProgress = async (req, res) => {
  const { studentID, teacherID } = req.query;

  if (!studentID) {
    return res.status(400).json({ success: false, message: 'studentID diperlukan.' });
  }

  // ---- Step 3: retrieve (E1 / A3 when this fails) ----
  let student;
  try {
    student = await loadStudent(studentID);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Pelajar tidak dijumpai.' });
    }

    if (teacherID) {
      const [[owned]] = await db.query(
        `SELECT 1 AS ok FROM Student s
         INNER JOIN Class c ON s.classID = c.classID
         WHERE s.studentID = ? AND c.teacherID = ? LIMIT 1`,
        [studentID, teacherID]
      );
      if (!owned) {
        return res.status(403).json({ success: false, message: 'Pelajar ini bukan dalam kelas anda.' });
      }
    }
  } catch (err) {
    console.error('viewLearningProgress retrieval error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mendapatkan data kemajuan pembelajaran.' });
  }

  // ---- Step 4: aggregate. One failing section must not hide the rest (E2) ----
  const errors = [];
  const section = async (name, fn) => {
    try {
      return await fn(studentID);
    } catch (err) {
      console.error(`viewLearningProgress section "${name}" failed:`, err);
      errors.push(name);
      return null;
    }
  };

  const eras = await section('eras', aggregateEras);
  const assessments = await section('assessments', aggregateAssessments);
  const badges = await section('badges', aggregateBadges);
  const artifacts = await section('artifacts', aggregateArtifacts);

  if (errors.length === 4) {
    return res.status(500).json({ success: false, message: 'Gagal menghimpunkan data kemajuan pembelajaran.' });
  }

  // ---- Step 5: overall summary ----
  const eraList = eras || [];
  const attemptList = assessments || [];
  const badgeList = badges || [];
  const artifactList = artifacts || [];

  const totalEras = eraList.length;
  const completedEras = eraList.filter((e) => e.eraStatus === 'completed').length;
  const questsCompleted = eraList.reduce((sum, e) => sum + e.questsCompleted, 0);

  const summary = {
    completionRate: totalEras > 0 ? parseFloat(((completedEras / totalEras) * 100).toFixed(2)) : 0,
    completedEras,
    totalEras,
    questsCompleted,
    bestScore: attemptList.length ? Math.max(...attemptList.map((a) => a.score)) : 0,
    totalAttempts: attemptList.length,
    badgesEarned: badgeList.filter((b) => b.earned).length,
    totalBadges: badgeList.length,
    artifactsUnlocked: artifactList.filter((a) => a.earned).length,
    totalArtifacts: artifactList.length
  };

  // A1: "has the student completed at least one learning activity?"
  const hasProgress =
    summary.questsCompleted > 0 ||
    summary.totalAttempts > 0 ||
    summary.badgesEarned > 0 ||
    summary.artifactsUnlocked > 0 ||
    eraList.some((e) => e.eraStatus === 'in progress' || e.eraStatus === 'completed');

  return res.status(200).json({
    success: true,
    partial: errors.length > 0,
    errors,
    hasProgress,
    student: {
      studentID: student.studentID,
      studentName: student.studentName,
      classID: student.classID,
      className: student.className,
      batchYear: student.batchYear,
      avatarName: student.avatarName,
      avatarAsset: resolveAsset(student.avatarAsset, 'avatar', '../assets/gameAsset/avatar/avatar_melayu_lelaki.png')
    },
    summary,
    eras: eras || [],
    assessments: assessments || [],
    badges: badges || [],
    artifacts: artifacts || []
  });
};