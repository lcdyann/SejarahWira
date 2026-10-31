import db from '../config/db.js';
import { AssessmentModel } from '../models/AssessmentModels.js';

/**
 * ============================================================================
 * rewardController.js  (Application tier - BCE)
 * Reward Collection page (reward_collection.html). READ-ONLY.
 *
 *   Student   viewBadges()      GET /api/reward/badges?studentID=
 *   Student   viewArtifacts()   GET /api/reward/artifacts?studentID=
 *
 * Data comes only from the real tables:
 *   Badge + StudentBadge         (earnedAt)
 *   Artifact + StudentArtifact   (unlockedAt)
 * Nothing is invented: an item the student has not earned is returned locked,
 * without its name or moral lesson.
 *
 * How an artifact is linked to an era (Artifact has no eraID) is the same rule as
 * AssessmentModels.findEraArtifact(): Assessment.summativeConfig -> {"artifactID": n},
 * otherwise artifactID = eraID. It is used ONLY to tell the student how to unlock it.
 * ============================================================================
 */

const resolveAsset = (raw, folder, fallback) => {
  if (!raw) return fallback;
  return raw.startsWith('../') || raw.startsWith('http') ? raw : `../assets/gameAsset/${folder}/${raw}`;
};

/** artifactID -> { eraID, eraName, passScore, artifactScore } from the Summative assessments. */
const mapArtifactsToEras = async () => {
  const [rows] = await db.query(
    `SELECT a.eraID, a.requiredScore, a.summativeConfig, e.eraName
     FROM Assessment a
     INNER JOIN HistoricalEra e ON a.eraID = e.eraID
     WHERE a.assessmentType = 'Summative'`
  );

  const map = new Map();
  rows.forEach((r) => {
    let cfg = r.summativeConfig;
    if (typeof cfg === 'string') {
      try { cfg = JSON.parse(cfg); } catch { cfg = null; }
    }
    const artifactID = cfg && cfg.artifactID ? Number(cfg.artifactID) : Number(r.eraID);
    if (!map.has(artifactID)) {
      // passScore     = markah LULUS Kepungan Agung (lajur Assessment.requiredScore, lalai 40)
      // artifactScore = markah untuk MENDAPAT artifak (summativeConfig.artifactScore, lalai 80)
      map.set(artifactID, { eraID: r.eraID, eraName: r.eraName, passScore: Number(r.requiredScore), artifactScore: AssessmentModel.artifactScoreOf(cfg, r.requiredScore) });
    }
  });
  return map;
};

/**
 * Student.viewBadges()
 * Every badge of the game; isUnlocked + acquiredAt for the ones the student earned.
 */
export const viewBadges = async (req, res) => {
  try {
    const { studentID } = req.query;
    if (!studentID) {
      return res.status(400).json({ success: false, message: 'studentID diperlukan.' });
    }

    const [rows] = await db.query(
      `SELECT b.badgeID, b.badgeName, b.asset, b.eraID, e.eraName, sb.earnedAt
       FROM Badge b
       INNER JOIN HistoricalEra e ON b.eraID = e.eraID
       LEFT JOIN StudentBadge sb ON sb.badgeID = b.badgeID AND sb.studentID = ?
       ORDER BY b.eraID ASC, b.badgeID ASC`,
      [studentID]
    );

    const badges = rows.map((r) => {
      const isUnlocked = r.earnedAt !== null;
      return {
        badgeID: r.badgeID,
        name: isUnlocked ? r.badgeName : '???',
        eraID: r.eraID,
        eraName: r.eraName,
        asset: isUnlocked ? resolveAsset(r.asset, 'badge', '../assets/gameAsset/badge/era_historian.png') : null,
        isUnlocked,
        acquiredAt: r.earnedAt
      };
    });

    return res.status(200).json({ success: true, badges });
  } catch (err) {
    console.error('viewBadges error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memuatkan koleksi lencana.' });
  }
};

/**
 * Student.viewArtifacts()
 * Every artifact; isUnlocked + acquiredAt + moralLesson only for the ones the student
 * unlocked. Locked ones carry the era and pass mark needed to unlock them.
 */
export const viewArtifacts = async (req, res) => {
  try {
    const { studentID } = req.query;
    if (!studentID) {
      return res.status(400).json({ success: false, message: 'studentID diperlukan.' });
    }

    const [rows] = await db.query(
      `SELECT a.artifactID, a.artifactName, a.moralLesson, a.asset, sa.unlockedAt
       FROM Artifact a
       LEFT JOIN StudentArtifact sa ON sa.artifactID = a.artifactID AND sa.studentID = ?
       ORDER BY a.artifactID ASC`,
      [studentID]
    );

    let eraMap = new Map();
    try {
      eraMap = await mapArtifactsToEras();
    } catch (mapErr) {
      console.error('viewArtifacts: era mapping skipped:', mapErr.message);
    }

    const artifacts = rows.map((r) => {
      const isUnlocked = r.unlockedAt !== null;
      const era = eraMap.get(Number(r.artifactID)) || null;
      return {
        artifactID: r.artifactID,
        name: isUnlocked ? r.artifactName : '???',
        moralLesson: isUnlocked ? r.moralLesson : null,
        asset: isUnlocked ? resolveAsset(r.asset, 'artifact', '../assets/gameAsset/artifact/artifact_default.png') : null,
        isUnlocked,
        acquiredAt: r.unlockedAt,
        eraID: era ? era.eraID : null,
        eraName: era ? era.eraName : null,
        passScore: era ? era.passScore : null,
        artifactScore: era ? era.artifactScore : null
      };
    });

    return res.status(200).json({ success: true, artifacts });
  } catch (err) {
    console.error('viewArtifacts error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memuatkan koleksi artifak.' });
  }
};