import db from '../config/db.js';
import { MonitorAnalyticsModel, avg } from '../models/MonitorAnalytics.js';
import { AssessmentModel } from '../models/AssessmentModels.js';
import { canEditContent } from '../middleware/requireAdmin.js';

/**
 * ============================================================================
 * analyticsController.js            UC-11 Monitor Student Performance (teacher)
 * Mounted behind requireTeacher:  app.use('/api/analytics', analyticsRoutes)
 *
 *   GET /api/analytics/summary?eraID=&classID=     steps 2-7  (+ A2 era filter)
 *   GET /api/analytics/student/:studentID          step 8-9 / A3 student detail
 *
 * READ ONLY. Nothing here writes to the database (post-condition 2).
 * Source: AssessmentAttempt rows of Summative assessments (The Great Siege) of the
 * students who belong to the logged-in teacher's classes.
 *
 * Rules
 *  - A student's score for an era = the BEST attempt in that era.
 *  - A student's overall score    = average of those era scores (era filter applied first).
 *  - Weak topic = an era whose class average is below that era's requiredScore.
 *    ("kritikal" when the average is also below 50.)
 * ============================================================================
 */

/** attempt rows -> analytics (the calculations live in models/MonitorAnalytics.js, as in the class diagram) */
export const computeAnalytics = (rows, options) => MonitorAnalyticsModel.generateAnalytics(rows, options);

/** Pure: one student's detail (A3). `allRows` = every attempt in the teacher's scope,
 *  so the class average per era can be shown next to the student's own score. */
export function computeStudentDetail(allRows, studentID) {
  const mine = allRows.filter((r) => r.studentID === studentID);
  if (!mine.length) return null;

  const history = mine
    .map((r) => ({
      attemptID: r.attemptID, eraID: Number(r.eraID), eraName: r.eraName, score: Number(r.Score),
      required: Number(r.requiredScore), passed: Number(r.Score) >= Number(r.requiredScore),
      attemptDate: new Date(r.attemptDate).toISOString()
    }))
    .sort((a, b) => new Date(a.attemptDate) - new Date(b.attemptDate));

  const classBest = computeAnalytics(allRows).eras;
  const eraMap = new Map();
  history.forEach((x) => {
    const e = eraMap.get(x.eraID) || { eraID: x.eraID, eraName: x.eraName, required: x.required, attempts: 0, best: -1, scores: [] };
    e.attempts += 1; e.best = Math.max(e.best, x.score); e.scores.push(x.score);
    eraMap.set(x.eraID, e);
  });
  const eras = [...eraMap.values()].map((e) => {
    const cls = classBest.find((c) => c.eraID === e.eraID);
    return {
      eraID: e.eraID, eraName: e.eraName, required: e.required, attempts: e.attempts,
      best: e.best, average: avg(e.scores), classAverage: cls ? cls.average : null,
      weak: e.best < e.required
    };
  }).sort((a, b) => a.eraID - b.eraID);

  return {
    studentID, studentName: mine[0].studentName, className: mine[0].className,
    overall: avg(eras.map((e) => e.best)), attempts: history.length,
    history, eras, weakCategories: eras.filter((e) => e.weak).map((e) => e.eraName)
  };
}

const SCOPE_SQL = `
  SELECT a.attemptID, a.studentID, s.studentName, s.classID, c.className,
         asm.eraID, e.eraName, asm.requiredScore, a.Score, a.attemptDate
    FROM AssessmentAttempt a
    JOIN Assessment asm ON asm.assessmentID = a.assessmentID AND asm.assessmentType = 'Summative'
    JOIN Student s ON s.studentID = a.studentID
    JOIN Class c ON c.classID = s.classID
    JOIN HistoricalEra e ON e.eraID = asm.eraID
   WHERE c.teacherID IN (?)`;

async function loadScope(teacherIDs, classID) {
  const params = [teacherIDs];             // a list: [own]  (admin: [own, public system teacher])
  let sql = SCOPE_SQL;
  if (classID) { sql += ' AND c.classID = ?'; params.push(classID); }
  const [rows] = await db.query(sql + ' ORDER BY a.attemptDate ASC', params);
  return rows;
}

/** GET /api/analytics/summary?eraID=&classID= */
export const getSummary = async (req, res) => {
  const eraID = req.query.eraID && req.query.eraID !== 'all' ? String(req.query.eraID) : null;
  const classID = req.query.classID && req.query.classID !== 'all' ? String(req.query.classID) : null;
  if (eraID && !/^\d+$/.test(eraID)) return res.status(400).json({ success: false, message: 'eraID tidak sah.' });

  let rows; let classes; let eras;
  try {
    rows = await loadScope(req.teacher.scopeIDs, classID);                       // E1 if this throws
    [classes] = await db.query('SELECT classID, className FROM Class WHERE teacherID IN (?) ORDER BY className', [req.teacher.scopeIDs]);
    [eras] = await db.query('SELECT eraID, eraName FROM HistoricalEra ORDER BY eraID');
  } catch (err) {
    console.error('getSummary data error:', err);
    return res.status(500).json({ success: false, message: 'Data prestasi tidak dapat diambil. Sila cuba lagi.' });
  }

  const hasAny = rows.length > 0;
  const analytics = hasAny ? computeAnalytics(rows, { eraID }) : null;
  const empty = !hasAny || (analytics && analytics.students.length === 0 && analytics.warnings.length === 0);

  return res.json({
    success: true,
    filters: { eraID, classID },
    classes, eras,
    hasData: hasAny,                  // false -> "No performance data available" (A1)
    emptyForFilter: hasAny && empty,  // data exists, but not for this era
    partial: Boolean(analytics && analytics.warnings.length),
    warnings: analytics ? analytics.warnings : [],
    analytics
  });
};

/** GET /api/analytics/student/:studentID */
export const getStudentDetail = async (req, res) => {
  try {
    const rows = await loadScope(req.teacher.scopeIDs, null);
    const detail = computeStudentDetail(rows, String(req.params.studentID));
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Tiada data sumatif bagi pelajar ini.' });
    }
    return res.json({ success: true, student: detail });
  } catch (err) {
    console.error('getStudentDetail error:', err);
    return res.status(500).json({ success: false, message: 'Butiran pelajar tidak dapat diambil.' });
  }
};

/**
 * ---------------------------------------------------------------------------
 * Great Siege marks  (ONE pair for every era; the teacher sets them on the Analytics page)
 *   GET /api/analytics/thresholds   { passScore, artifactScore }
 *   PUT /api/analytics/thresholds   { passScore, artifactScore }  -> written to every Summative row
 *
 *  - passScore     -> Assessment(Summative).requiredScore (passes the siege, unlocks the next era). Default 40.
 *  - artifactScore -> Assessment(Summative).summativeConfig.artifactScore (earns the artifact). Default 80.
 *                     Never lower than passScore.
 *  - The Formative (Wira Training Grounds) has NO pass mark: whoever drops to 0 HP loses.
 * Applies to the NEXT attempt; saved attempts are never rewritten.
 * ---------------------------------------------------------------------------
 */
export const DEFAULT_PASS = 40;
export const DEFAULT_ARTIFACT = 80;

export const getThresholds = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT requiredScore, summativeConfig FROM Assessment WHERE assessmentType = 'Summative' ORDER BY eraID LIMIT 1`
    );
    const passScore = rows.length ? Number(rows[0].requiredScore) : DEFAULT_PASS;
    const artifactScore = rows.length ? AssessmentModel.artifactScoreOf(rows[0].summativeConfig, rows[0].requiredScore) : DEFAULT_ARTIFACT;
    return res.status(200).json({ success: true, passScore, artifactScore, canEdit: canEditContent(req.teacher) });
  } catch (err) {
    console.error('getThresholds error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

const wholeMark = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100;

export const updateThreshold = async (req, res) => {
  try {
    if (!canEditContent(req.teacher)) {
      return res.status(403).json({ success: false, message: 'Hanya admin boleh mengubah skor ini.' });
    }
    const { passScore, artifactScore } = req.body || {};
    if (!wholeMark(passScore) || !wholeMark(artifactScore)) {
      return res.status(400).json({ success: false, message: 'Skor mesti nombor bulat antara 0 dan 100.' });
    }
    const pass = Number(passScore);
    const artifact = Number(artifactScore);
    if (artifact < pass) {
      return res.status(400).json({ success: false, message: 'Skor artifak tidak boleh lebih rendah daripada skor lulus.' });
    }
    // JSON_SET keeps the other summativeConfig keys (timeLimitMinutes ...)
    const [result] = await db.query(
      `UPDATE Assessment
          SET requiredScore = ?,
              summativeConfig = JSON_SET(COALESCE(summativeConfig, JSON_OBJECT()), '$.artifactScore', ?)
        WHERE assessmentType = 'Summative'`,
      [pass, artifact]
    );
    console.log(`[thresholds] teacher ${req.teacher?.teacherID ?? '?'}: pass ${pass}, artifact ${artifact} (${result.affectedRows} eras)`);
    return res.status(200).json({ success: true, passScore: pass, artifactScore: artifact });
  } catch (err) {
    console.error('updateThreshold error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};
