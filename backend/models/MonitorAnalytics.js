/**
 * ============================================================================
 * models/MonitorAnalytics.js   (Entity layer - BCE)          UC-11 Monitor Student Performance
 * Class diagram:
 *   MonitorAnalytics { monitorID, classID, eraID, weakEra, classAverage
 *                      calculateEraAverage(), calculateClassAverage(), generateAnalytics() }
 *
 * Pure calculations: attempt rows in, numbers out. No database access, nothing is written.
 *
 *   calculateEraAverage(bests)        per era: average, highest, lowest, pass rate, weak topic (weakEra)
 *   calculateClassAverage(students)   classAverage, highest / lowest, pass rate, score distribution
 *   generateAnalytics(rows, {eraID})  all of it; each section is computed on its own so one failure gives
 *                                     a PARTIAL report (E2) instead of nothing
 *
 * Rules
 *  - A student's score for an era = the BEST attempt in that era.
 *  - A student's overall score    = average of those era scores (era filter applied first).
 *  - Weak topic = an era whose class average is below that era's requiredScore
 *    ("kritikal" when the average is also below 50).
 * ============================================================================
 */
export const WEAK_CRITICAL = 50;

const round1 = (n) => Math.round(n * 10) / 10;
export const avg = (list) => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null);

export class MonitorAnalyticsModel {
  /* Class diagram attributes (private): monitorID, classID, eraID, weakEra, classAverage.
     One instance = one report for a class (and optionally one era). The calculations stay static
     (pure functions); the instance methods fill the attributes from them. */
  #monitorID; #classID; #eraID; #weakEra = null; #classAverage = null;

  constructor(monitorID = null, classID = null, eraID = null) {
    this.#monitorID = monitorID; this.#classID = classID; this.#eraID = eraID;
  }
  get monitorID() { return this.#monitorID; }
  get classID() { return this.#classID; }
  get eraID() { return this.#eraID; }
  get weakEra() { return this.#weakEra; }
  get classAverage() { return this.#classAverage; }

  /** MonitorAnalytics.generateAnalytics() for this report; fills classAverage and weakEra */
  generate(rows) {
    const report = MonitorAnalyticsModel.generateAnalytics(rows, { eraID: this.#eraID });
    const cls = report && report.classStats;
    this.#classAverage = cls ? (cls.average ?? cls.classAverage ?? null) : null;
    const weak = report && report.weakTopics;
    this.#weakEra = Array.isArray(weak) && weak.length ? (weak[0].eraName ?? weak[0].eraID ?? null) : null;
    return report;
  }

  /** best attempt per student + era */
  static bestPerStudentEra(rows) {
    const best = new Map();
    rows.forEach((r) => {
      const key = `${r.studentID}|${r.eraID}`;
      const cur = best.get(key) || {
        studentID: r.studentID, studentName: r.studentName, classID: r.classID, className: r.className,
        eraID: Number(r.eraID), eraName: r.eraName, required: Number(r.requiredScore),
        best: -1, attempts: 0, last: null
      };
      cur.attempts += 1;
      cur.best = Math.max(cur.best, Number(r.Score));
      const when = new Date(r.attemptDate).getTime();
      if (!cur.last || when > cur.last) cur.last = when;
      best.set(key, cur);
    });
    return [...best.values()];
  }

  /** one overall score per student */
  static studentScores(bests) {
    const byStudent = new Map();
    bests.forEach((b) => {
      if (!byStudent.has(b.studentID)) {
        byStudent.set(b.studentID, { studentID: b.studentID, studentName: b.studentName, className: b.className, scores: [], attempts: 0, last: null });
      }
      const s = byStudent.get(b.studentID);
      s.scores.push(b.best);
      s.attempts += b.attempts;
      s.last = Math.max(s.last || 0, b.last || 0);
    });
    return [...byStudent.values()]
      .map((s) => ({
        studentID: s.studentID, studentName: s.studentName, className: s.className,
        score: avg(s.scores), erasTaken: s.scores.length, attempts: s.attempts,
        lastAttempt: s.last ? new Date(s.last).toISOString() : null
      }))
      .sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName));
  }

  /** MonitorAnalytics.calculateClassAverage() */
  static calculateClassAverage(students, bests) {
    const sc = students.map((s) => s.score);
    if (!sc.length) return { classStats: null, distribution: [] };
    const hi = Math.max(...sc);
    const lo = Math.min(...sc);
    const classStats = {
      studentCount: sc.length,
      average: avg(sc),                                   // classAverage
      highest: { score: hi, students: students.filter((s) => s.score === hi).map((s) => s.studentName) },
      lowest: { score: lo, students: students.filter((s) => s.score === lo).map((s) => s.studentName) },
      passRate: round1((bests.filter((b) => b.best >= b.required).length / bests.length) * 100)
    };
    const buckets = [[0, 19], [20, 39], [40, 59], [60, 79], [80, 100]];
    const distribution = buckets.map(([from, to]) => ({
      label: `${from}-${to}`, from, to,
      count: sc.filter((x) => x >= from && x <= to).length
    }));
    return { classStats, distribution };
  }

  /** MonitorAnalytics.calculateEraAverage() */
  static calculateEraAverage(bests) {
    const byEra = new Map();
    bests.forEach((b) => {
      if (!byEra.has(b.eraID)) byEra.set(b.eraID, { eraID: b.eraID, eraName: b.eraName, required: b.required, scores: [] });
      byEra.get(b.eraID).scores.push(b.best);
    });
    const eras = [...byEra.values()].map((e) => {
      const average = avg(e.scores);
      return {
        eraID: e.eraID, eraName: e.eraName, required: e.required, students: e.scores.length,
        average, highest: Math.max(...e.scores), lowest: Math.min(...e.scores),
        passRate: round1((e.scores.filter((x) => x >= e.required).length / e.scores.length) * 100),
        weak: average < e.required,
        level: average < WEAK_CRITICAL ? 'kritikal' : average < e.required ? 'lemah' : 'kukuh'
      };
    }).sort((a, b) => a.eraID - b.eraID);
    const weakTopics = eras.filter((e) => e.weak).sort((a, b) => a.average - b.average);   // weakEra
    return { eras, weakTopics };
  }

  /** MonitorAnalytics.generateAnalytics() */
  static generateAnalytics(rows, { eraID = null } = {}) {
    const warnings = [];
    const scoped = eraID ? rows.filter((r) => String(r.eraID) === String(eraID)) : rows;
    const bests = MonitorAnalyticsModel.bestPerStudentEra(scoped);
    const out = { students: [], classStats: null, eras: [], weakTopics: [], distribution: [], warnings };

    try {
      out.students = MonitorAnalyticsModel.studentScores(bests);
    } catch (err) {
      console.error('analytics students error:', err);
      warnings.push('Skor pelajar tidak dapat dikira.');
    }
    try {
      Object.assign(out, MonitorAnalyticsModel.calculateClassAverage(out.students, bests));
    } catch (err) {
      console.error('analytics classStats error:', err);
      warnings.push('Statistik kelas tidak dapat dikira.');
    }
    try {
      Object.assign(out, MonitorAnalyticsModel.calculateEraAverage(bests));
    } catch (err) {
      console.error('analytics eras error:', err);
      warnings.push('Analisis topik lemah tidak dapat dikira.');
    }
    return out;
  }
}
