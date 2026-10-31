import db from '../config/db.js';

/**
 * ============================================================================
 * teacherProgressController.js        UC-09 View Learning Progress (TEACHER version)
 * Mounted behind requireTeacher:  app.use('/api/teacher-progress', teacherProgressRoutes)
 *
 *   GET /api/teacher-progress/overview?classID=     A2 class overview (aggregated, all students)
 *   GET /api/teacher-progress/student/:studentID    A2 step 3-4 one student's progress detail
 *
 * READ ONLY (post-condition 2). Only students of the logged-in teacher's classes are visible.
 * Figures are computed live from EraProgression, QuestCompletion, AssessmentAttempt,
 * StudentBadge and StudentArtifact, so they are never stale like a cached summary could be.
 * ============================================================================
 */

const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => Number(v) || 0;

/** Pure: one DB row -> student summary. */
export function summariseStudent(r, totals) {
  const erasCompleted = num(r.erasCompleted);
  const questsCompleted = num(r.questsCompleted);
  const badges = num(r.badges);
  const artifacts = num(r.artifacts);
  const attempts = num(r.attempts);
  return {
    studentID: r.studentID, studentName: r.studentName, classID: r.classID, className: r.className,
    erasCompleted, totalEras: totals.eras,
    completionRate: totals.eras ? round1((erasCompleted / totals.eras) * 100) : 0,
    questsCompleted, totalQuests: totals.quests,
    bestScore: num(r.bestScore), attempts,
    badges, totalBadges: totals.badges,
    artifacts, totalArtifacts: totals.artifacts,
    started: erasCompleted + questsCompleted + badges + artifacts + attempts > 0
  };
}

/** Pure: class-level aggregate (step 4 of A2). */
export function summariseClass(students) {
  const started = students.filter((s) => s.started);
  const mean = (list) => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : 0);
  return {
    studentCount: students.length,
    startedCount: started.length,
    averageCompletion: mean(students.map((s) => s.completionRate)),
    averageBestScore: mean(started.filter((s) => s.attempts > 0).map((s) => s.bestScore)),
    erasCompletedTotal: students.reduce((a, s) => a + s.erasCompleted, 0),
    questsCompletedTotal: students.reduce((a, s) => a + s.questsCompleted, 0),
    badgesTotal: students.reduce((a, s) => a + s.badges, 0),
    artifactsTotal: students.reduce((a, s) => a + s.artifacts, 0)
  };
}

const COUNT = async (sql, params = []) => {
  const [[row]] = await db.query(sql, params);
  return num(row.n);
};

async function loadTotals() {
  return {
    eras: await COUNT('SELECT COUNT(*) AS n FROM HistoricalEra'),
    quests: await COUNT('SELECT COUNT(*) AS n FROM Quest'),
    badges: await COUNT('SELECT COUNT(*) AS n FROM Badge'),
    artifacts: await COUNT('SELECT COUNT(*) AS n FROM Artifact')
  };
}

/** GET /api/teacher-progress/overview?classID= */
export const getClassOverview = async (req, res) => {
  const classID = req.query.classID && req.query.classID !== 'all' ? String(req.query.classID) : null;
  let rows; let classes; let totals;
  try {
    const params = [req.teacher.scopeIDs];          // admin also sees the public students
    let sql = `
      SELECT s.studentID, s.studentName, c.classID, c.className,
        (SELECT COUNT(*) FROM EraProgression ep WHERE ep.studentID = s.studentID AND ep.eraStatus = 'completed') AS erasCompleted,
        (SELECT COUNT(*) FROM QuestCompletion qc WHERE qc.studentID = s.studentID) AS questsCompleted,
        (SELECT COALESCE(MAX(a.Score), 0) FROM AssessmentAttempt a WHERE a.studentID = s.studentID) AS bestScore,
        (SELECT COUNT(*) FROM AssessmentAttempt a WHERE a.studentID = s.studentID) AS attempts,
        (SELECT COUNT(*) FROM StudentBadge sb WHERE sb.studentID = s.studentID) AS badges,
        (SELECT COUNT(*) FROM StudentArtifact sa WHERE sa.studentID = s.studentID) AS artifacts
      FROM Student s JOIN Class c ON c.classID = s.classID
      WHERE c.teacherID IN (?)`;
    if (classID) { sql += ' AND c.classID = ?'; params.push(classID); }
    [rows] = await db.query(`${sql} ORDER BY c.className, s.studentName`, params);
    [classes] = await db.query('SELECT classID, className FROM Class WHERE teacherID IN (?) ORDER BY className', [req.teacher.scopeIDs]);
    totals = await loadTotals();
  } catch (err) {                                   // E1 / A3
    console.error('getClassOverview data error:', err);
    return res.status(500).json({ success: false, message: 'Data kemajuan pembelajaran tidak dapat diambil. Sila cuba lagi.' });
  }

  const warnings = [];
  let students = [];
  let summary = null;
  try {                                             // E2
    students = rows.map((r) => summariseStudent(r, totals));
    summary = summariseClass(students);
  } catch (err) {
    console.error('getClassOverview aggregation error:', err);
    warnings.push('Ringkasan kelas tidak dapat disusun.');
  }

  return res.json({
    success: true, classes, totals, students, summary,
    hasData: students.some((s) => s.started),       // A1
    partial: warnings.length > 0, warnings
  });
};

/** GET /api/teacher-progress/student/:studentID */
export const getStudentProgress = async (req, res) => {
  const studentID = String(req.params.studentID);
  let stu; let eraRows; let attempts; let badgeRows; let artifactRows; let totals;
  try {
    [[stu]] = await db.query(
      `SELECT s.studentID, s.studentName, c.classID, c.className,
        (SELECT COUNT(*) FROM EraProgression ep WHERE ep.studentID = s.studentID AND ep.eraStatus = 'completed') AS erasCompleted,
        (SELECT COUNT(*) FROM QuestCompletion qc WHERE qc.studentID = s.studentID) AS questsCompleted,
        (SELECT COALESCE(MAX(a.Score), 0) FROM AssessmentAttempt a WHERE a.studentID = s.studentID) AS bestScore,
        (SELECT COUNT(*) FROM AssessmentAttempt a WHERE a.studentID = s.studentID) AS attempts,
        (SELECT COUNT(*) FROM StudentBadge sb WHERE sb.studentID = s.studentID) AS badges,
        (SELECT COUNT(*) FROM StudentArtifact sa WHERE sa.studentID = s.studentID) AS artifacts
       FROM Student s JOIN Class c ON c.classID = s.classID
       WHERE s.studentID = ? AND c.teacherID IN (?) LIMIT 1`,
      [studentID, req.teacher.scopeIDs]);
    if (!stu) return res.status(404).json({ success: false, message: 'Pelajar tidak dijumpai dalam kelas anda.' });

    [eraRows] = await db.query(
      `SELECT e.eraID, e.eraName, COALESCE(ep.eraStatus, 'locked') AS status,
        (SELECT COUNT(*) FROM Quest q JOIN Scene sc ON sc.sceneID = q.sceneID
           JOIN Narrative n ON n.narrativeID = sc.narrativeID WHERE n.eraID = e.eraID) AS totalQuests,
        (SELECT COUNT(*) FROM QuestCompletion qc JOIN Quest q ON q.questID = qc.questID
           JOIN Scene sc ON sc.sceneID = q.sceneID JOIN Narrative n ON n.narrativeID = sc.narrativeID
          WHERE qc.studentID = ? AND n.eraID = e.eraID) AS doneQuests
       FROM HistoricalEra e LEFT JOIN EraProgression ep ON ep.eraID = e.eraID AND ep.studentID = ?
       ORDER BY e.eraID`, [studentID, studentID]);

    [attempts] = await db.query(
      `SELECT a.attemptID, a.Score, a.attemptDate, a.is_completed, asm.assessmentType, asm.requiredScore, e.eraName
         FROM AssessmentAttempt a JOIN Assessment asm ON asm.assessmentID = a.assessmentID
         JOIN HistoricalEra e ON e.eraID = asm.eraID
        WHERE a.studentID = ? ORDER BY a.attemptDate DESC`, [studentID]);

    [badgeRows] = await db.query(
      `SELECT b.badgeID, b.badgeName, e.eraName, sb.earnedAt
         FROM Badge b JOIN HistoricalEra e ON e.eraID = b.eraID
         LEFT JOIN StudentBadge sb ON sb.badgeID = b.badgeID AND sb.studentID = ?
        ORDER BY b.eraID, b.badgeID`, [studentID]);

    [artifactRows] = await db.query(
      `SELECT a.artifactID, a.artifactName, sa.unlockedAt
         FROM Artifact a LEFT JOIN StudentArtifact sa ON sa.artifactID = a.artifactID AND sa.studentID = ?
        ORDER BY a.artifactID`, [studentID]);
    totals = await loadTotals();
  } catch (err) {
    console.error('getStudentProgress data error:', err);
    return res.status(500).json({ success: false, message: 'Kemajuan pelajar tidak dapat diambil. Sila cuba lagi.' });
  }

  const warnings = [];
  const out = { summary: null, eras: [], assessments: [], badges: [], artifacts: [] };
  const section = (name, label, fn) => { try { out[name] = fn(); } catch (err) { console.error(`student progress ${name}:`, err); warnings.push(`${label} tidak dapat disusun.`); } };

  section('summary', 'Ringkasan', () => summariseStudent(stu, totals));
  section('eras', 'Butiran era', () => eraRows.map((r) => ({
    eraID: num(r.eraID), eraName: r.eraName, status: r.status,
    totalQuests: num(r.totalQuests), doneQuests: num(r.doneQuests)
  })));
  section('assessments', 'Prestasi pentaksiran', () => attempts.map((a) => ({
    attemptID: a.attemptID, eraName: a.eraName, type: a.assessmentType, score: num(a.Score),
    required: num(a.requiredScore), passed: Boolean(a.is_completed), date: new Date(a.attemptDate).toISOString()
  })));
  section('badges', 'Lencana', () => badgeRows.map((b) => ({
    badgeID: b.badgeID, badgeName: b.badgeName, eraName: b.eraName, earned: Boolean(b.earnedAt),
    earnedAt: b.earnedAt ? new Date(b.earnedAt).toISOString() : null
  })));
  section('artifacts', 'Artifak', () => artifactRows.map((a) => ({
    artifactID: a.artifactID, artifactName: a.artifactName, earned: Boolean(a.unlockedAt),
    unlockedAt: a.unlockedAt ? new Date(a.unlockedAt).toISOString() : null
  })));

  return res.json({
    success: true, student: { studentID: stu.studentID, studentName: stu.studentName, className: stu.className },
    ...out, hasData: out.summary ? out.summary.started : false, partial: warnings.length > 0, warnings
  });
};