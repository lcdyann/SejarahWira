import db from '../config/db.js';
import { EraProgressionModel } from '../models/ProgressModels.js';

/**
 * ============================================================================
 * eraController.js  (Application tier - BCE)
 * Era map + the unlocking part of the learning cycle.
 * Handlers are named after the class diagram:
 *
 *   HistoricalEra    loadEra()              GET  /api/era/list
 *   HistoricalEra    loadEraDetail()        GET  /api/era/detail
 *   EraProgression   checkCompletion()      GET  /api/era/check-completion
 *                      checks narrative + Siege AND writes eraStatus = 'completed'
 *   EraProgression   verifyConditions()     POST /api/era/verify-conditions
 *                      -> checkCompletion() -> (status is 'completed')
 *                      -> unlockNextEra() -> updateProgress()
 *   Badge            displayBadge()         GET  /api/era/badge-detail
 *
 * verifyConditions() is also called automatically by
 *   - assessmentController.saveScore()        (the Great Siege was just passed)
 *   - storyController.evaluateBadgeUnlock()   (narrative just finished)
 * so the map never needs to trigger it manually; the endpoint is there for a
 * manual re-check (e.g. from a teacher tool or after the contentManager changes data).
 * ============================================================================
 */

/** Era status rule shared by loadEra / loadEraDetail: the very first era starts unlocked. */
const STATUS_SQL = `COALESCE(ep.eraStatus,
       IF(e.eraID = (SELECT MIN(eraID) FROM HistoricalEra), 'unlocked', 'locked'))`;

/**
 * HistoricalEra.loadEra()               GET /api/era/list?studentID=
 * Every era with the student's status. narrativeDone = the student already owns
 * the era badge, i.e. the assessments of that era are open even if the era is not
 * 'completed' yet (so the map can send the student straight to the Training
 * Grounds / Great Siege without replaying the whole story).
 */
const fetchEras = async (studentID) => {
  const [rows] = await db.query(
    `SELECT e.eraID, e.eraName, e.description,
            ${STATUS_SQL} AS eraStatus,
            EXISTS(SELECT 1 FROM StudentBadge sb
                   INNER JOIN Badge b ON sb.badgeID = b.badgeID
                   WHERE sb.studentID = ? AND b.eraID = e.eraID) AS narrativeDone
     FROM HistoricalEra e
     LEFT JOIN EraProgression ep ON e.eraID = ep.eraID AND ep.studentID = ?
     ORDER BY e.eraID ASC`,
    [studentID, studentID]
  );
  return rows.map((r) => ({ ...r, narrativeDone: Boolean(r.narrativeDone) }));
};

export const loadEra = async (req, res) => {
  try {
    const { studentID = 'S1001' } = req.query;

    let eras = await fetchEras(studentID);

    // Self-heal: an era whose narrative badge is owned (or that is already 'completed')
    // is re-verified, so a Siege that was passed earlier gets its era marked 'completed'
    // and the next era unlocked. verifyConditions() is idempotent, so this is cheap.
    let changed = false;
    for (const era of eras) {
      if (era.eraStatus === 'locked') continue;
      if (!era.narrativeDone && era.eraStatus !== 'completed') continue;

      const result = await EraProgressionModel.verifyConditions(studentID, era.eraID);
      if (result.justCompleted || result.nextEra) changed = true;
    }
    if (changed) eras = await fetchEras(studentID);

    return res.status(200).json({ success: true, eras });
  } catch (err) {
    console.error('loadEra error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * HistoricalEra.loadEraDetail()         GET /api/era/detail?eraID=&studentID=
 */
export const loadEraDetail = async (req, res) => {
  try {
    const { eraID = 1, studentID = 'S1001' } = req.query;

    const [[era]] = await db.query(
      `SELECT e.eraID, e.eraName, e.description,
              ${STATUS_SQL} AS eraStatus,
              EXISTS(SELECT 1 FROM StudentBadge sb
                     INNER JOIN Badge b ON sb.badgeID = b.badgeID
                     WHERE sb.studentID = ? AND b.eraID = e.eraID) AS narrativeDone
       FROM HistoricalEra e
       LEFT JOIN EraProgression ep ON e.eraID = ep.eraID AND ep.studentID = ?
       WHERE e.eraID = ?`,
      [studentID, studentID, eraID]
    );

    if (!era) {
      return res.status(404).json({ success: false, message: 'Era tidak dijumpai.' });
    }

    return res.status(200).json({ success: true, era: { ...era, narrativeDone: Boolean(era.narrativeDone) } });
  } catch (err) {
    console.error('loadEraDetail error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * EraProgression.checkCompletion()      GET /api/era/check-completion?studentID=&eraID=
 * Checks which of the two conditions (narrative badge, Siege passed) are met and, when
 * both are, marks the era 'completed'. It does NOT unlock the next era; that is
 * verifyConditions()'s job once the era status is 'completed'.
 */
export const checkCompletion = async (req, res) => {
  try {
    const { studentID = 'S1001', eraID } = req.query;
    if (!eraID) {
      return res.status(400).json({ success: false, message: 'eraID diperlukan.' });
    }

    // checkCompletion() returns the status AFTER its write as `eraStatus`
    const check = await EraProgressionModel.checkCompletion(studentID, eraID);

    return res.status(200).json({ success: true, ...check });
  } catch (err) {
    console.error('checkCompletion error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * EraProgression.verifyConditions()     POST /api/era/verify-conditions
 * body: studentID, eraID
 * Both conditions met => era 'completed', next era 'unlocked', progress refreshed.
 */
export const verifyConditions = async (req, res) => {
  try {
    const { studentID = 'S1001', eraID } = req.body;
    if (!eraID) {
      return res.status(400).json({ success: false, message: 'eraID diperlukan.' });
    }

    const result = await EraProgressionModel.verifyConditions(studentID, eraID);

    if (!result.canComplete) {
      return res.status(200).json({ success: true, completed: false, ...result, message: result.reason });
    }

    const message = result.nextEra
      ? `Tahniah! Era ${eraID} selesai dan ${result.nextEra.nextEraName} telah dibuka!`
      : `Tahniah! Era ${eraID} selesai. Anda telah menamatkan semua era!`;

    return res.status(200).json({ success: true, completed: true, ...result, message });
  } catch (err) {
    console.error('verifyConditions error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * Badge.displayBadge()                  GET /api/era/badge-detail?eraID=
 */
export const displayBadge = async (req, res) => {
  try {
    const { eraID = 1 } = req.query;

    const [rows] = await db.query(
      `SELECT badgeID, eraID, badgeName, asset FROM Badge WHERE eraID = ? ORDER BY badgeID ASC LIMIT 1`,
      [eraID]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lencana tidak dijumpai.' });
    }

    return res.status(200).json({ success: true, badge: rows[0] });
  } catch (err) {
    console.error('displayBadge error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};