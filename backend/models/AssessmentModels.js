import db from '../config/db.js';

/**
 * ============================================================================
 * AssessmentModels.js  (Entity layer - BCE)
 * Method names follow the class diagram:
 *   QuestionBank        retrieveRandomQuestions()
 *   Assessment          unlockAssessment()  (+ lookup helpers)
 *   AssessmentAttempt   saveScore(), evaluateArtifactUnlock()
 *   StudentArtifact     unlockArtifact()
 *   Artifact            findEraArtifact()  (feeds displayArtifact / displayMoralLesson)
 *   StudentBadge        unlockBadge()
 * ============================================================================
 */

/**
 * QuestionBankModel
 * Handles fetching question sets linked via QuestionBank (bankID)
 */
export class QuestionBankModel {
  /** Assessment.retrieveRandomQuestions() */
  /** teacherID: soalan tetap + soalan tambahan guru itu sahaja (null = soalan tetap sahaja). */
  static async retrieveRandomQuestions(eraID, limit = 10, teacherID = null) {
    try {
      let query = `
        SELECT 
          q.questionID, 
          q.questionText, 
          q.option_a AS optionA, 
          q.option_b AS optionB, 
          q.option_c AS optionC, 
          q.option_d AS optionD, 
          q.correctAnswer, 
          q.hint, 
          q.explanation
        FROM Question q
        INNER JOIN QuestionBank qb ON q.bankID = qb.bankID
      `;
      const queryParams = [teacherID];
      query += ` WHERE (q.ownerTeacherID IS NULL OR q.ownerTeacherID = ?)`;

      if (eraID && eraID !== 'all') {
        query += ` AND qb.eraID = ?`;
        queryParams.push(parseInt(eraID, 10));
      }

      query += ` ORDER BY RAND() LIMIT ?`;
      queryParams.push(parseInt(limit, 10));

      const [rows] = await db.query(query, queryParams);
      return rows;
    } catch (error) {
      console.error('Error in retrieveRandomQuestions:', error);
      throw error;
    }
  }
}

/**
 * Class diagram:
 *   Assessment { -assessmentID -assessmentType -requiredScore   unlockAssessment() startAssessment()
 *                retrieveRandomQuestions() provideHint() provideExplanation() }
 *   FormativeAssessment  -> Assessment   { calculateBattleScore() }
 *   SummativeAssessment  -> Assessment
 *   AssessmentAttempt    -> Assessment   { saveScore() evaluateArtifactUnlock() calculateBattleScore() }  (further below)
 * Attributes are private and read through getters; the database row stays behind them.
 */
export class AssessmentModel {
  #row;

  constructor(row = {}) { this.#row = row instanceof AssessmentModel ? { ...row.#row } : { ...row }; }

  get assessmentID() { return this.#row.assessmentID; }
  get assessmentType() { return this.#row.assessmentType; }
  get requiredScore() { return this.#row.requiredScore; }
  get eraID() { return this.#row.eraID; }
  get summativeConfig() { return this.#row.summativeConfig; }

  /**
   * Score that earns the era artifact (Summative only), set by the teacher on the analytics page.
   * Stored in summativeConfig.artifactScore. When the teacher has not set it, the default is 80
   * (never lower than the pass mark). NOTE: the column requiredScore is the PASS mark of the siege (default 40),
   * it is NOT the artifact mark.
   */
  get artifactScore() { return AssessmentModel.artifactScoreOf(this.#row.summativeConfig, this.#row.requiredScore); }

  static DEFAULT_ARTIFACT_SCORE = 80;

  static artifactScoreOf(summativeConfig, passScore) {
    let cfg = summativeConfig;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
    const n = cfg && Number(cfg.artifactScore);
    return Number.isFinite(n) && cfg.artifactScore !== null && cfg.artifactScore !== '' ? n : Math.max(AssessmentModel.DEFAULT_ARTIFACT_SCORE, Number(passScore));
  }

  toJSON() {
    return { assessmentID: this.assessmentID, assessmentType: this.assessmentType, requiredScore: this.requiredScore, artifactScore: this.artifactScore, eraID: this.eraID };
  }

  /** a row becomes the right subclass for its type */
  static fromRow(row) {
    if (!row) return null;
    if (row.assessmentType === 'Formative') return new FormativeAssessment(row);
    if (row.assessmentType === 'Summative') return new SummativeAssessment(row);
    return new AssessmentModel(row);
  }

  /** Assessment.unlockAssessment() for this assessment's era */
  unlockAssessment(narrativeComplete) { return AssessmentModel.unlockAssessment(this.eraID, narrativeComplete); }

  /** Assessment.retrieveRandomQuestions() */
  retrieveRandomQuestions(limit = 10, teacherID = null) { return QuestionBankModel.retrieveRandomQuestions(this.eraID, limit, teacherID); }

  /** Assessment.startAssessment(): the question set for one sitting */
  async startAssessment(limit = 10) {
    return { assessmentID: this.assessmentID, requiredScore: this.requiredScore, artifactScore: this.artifactScore, questions: await this.retrieveRandomQuestions(limit) };
  }

  /** Assessment.provideHint(): the hint stored with a question, or null */
  provideHint(question) { return (question && question.hint) || null; }

  /** Assessment.provideExplanation(): the explanation stored with a question, or null */
  provideExplanation(question) { return (question && question.explanation) || null; }

  static async getByEraAndType(eraID, assessmentType) {
    try {
      const [rows] = await db.query(
        `SELECT * FROM Assessment WHERE eraID = ? AND assessmentType = ? LIMIT 1`,
        [parseInt(eraID, 10), assessmentType]
      );
      return AssessmentModel.fromRow(rows[0]);
    } catch (error) {
      console.error('Error in getByEraAndType:', error);
      throw error;
    }
  }

  /**
   * Assessment.unlockAssessment()
   * The narrative of an era is finished, so the era's two assessments become playable:
   * the Formative (Wira Training Grounds) and the Summative (The Great Siege).
   * Returns what was unlocked (ids and types) so the game can offer the two doors.
   * Nothing is stored: "unlocked" is derived from the finished narrative, so the database stays as it is.
   */
  static async unlockAssessment(eraID, narrativeComplete) {
    if (!narrativeComplete) return { unlocked: false, assessments: [] };
    const [rows] = await db.query(
      `SELECT assessmentID, assessmentType, requiredScore FROM Assessment WHERE eraID = ? ORDER BY assessmentType`,
      [parseInt(eraID, 10)]
    );
    return { unlocked: rows.length > 0, assessments: rows };
  }

  static async getByID(assessmentID) {
    try {
      const [rows] = await db.query(
        `SELECT * FROM Assessment WHERE assessmentID = ? LIMIT 1`,
        [assessmentID]
      );
      return AssessmentModel.fromRow(rows[0]);
    } catch (error) {
      console.error('Error in getByID:', error);
      throw error;
    }
  }
}

/** points for a battle: the share of correct answers, 0-100 */
const battleScore = (correct, total) => (total > 0 ? Math.round((Math.max(0, correct) / total) * 100) : 0);

/** FormativeAssessment (Wira Training Grounds) */
export class FormativeAssessment extends AssessmentModel {
  calculateBattleScore(correct, total) { return battleScore(correct, total); }
}

/** SummativeAssessment (The Great Siege) */
export class SummativeAssessment extends AssessmentModel {}

/**
 * StudentArtifactModel
 * StudentArtifact.unlockArtifact() + Artifact lookup
 */
export class StudentArtifactModel {
  /** StudentArtifact.unlockArtifact() - returns true only when newly unlocked */
  static async unlockArtifact(studentID, artifactID) {
    try {
      const [result] = await db.query(
        `INSERT IGNORE INTO StudentArtifact (studentID, artifactID, unlockedAt) 
         VALUES (?, ?, NOW())`,
        [studentID, artifactID]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error in unlockArtifact:', error);
      throw error;
    }
  }

  /**
   * Finds the artifact rewarded by an era's Summative assessment.
   * The Artifact table has no eraID column, so the link is read from
   * Assessment.summativeConfig -> {"artifactID": n}.
   * If the config has no artifactID it falls back to artifactID = eraID
   * (one artifact per era, same numbering). Change ONLY this method if you
   * link artifacts to eras differently (e.g. add Artifact.eraID).
   */
  static async findEraArtifact(eraID, summativeConfig) {
    try {
      let cfg = summativeConfig;
      if (typeof cfg === 'string') {
        try { cfg = JSON.parse(cfg); } catch { cfg = null; }
      }
      const artifactID = cfg && cfg.artifactID ? cfg.artifactID : parseInt(eraID, 10);

      const [rows] = await db.query(
        `SELECT artifactID, artifactName, moralLesson, asset
         FROM Artifact WHERE artifactID = ? LIMIT 1`,
        [artifactID]
      );
      return rows[0] || null;
    } catch (error) {
      console.error('Error in findEraArtifact:', error);
      throw error;
    }
  }
}

/**
 * AssessmentAttemptModel
 * AssessmentAttempt.saveScore() + AssessmentAttempt.evaluateArtifactUnlock()
 */
export class AssessmentAttemptModel extends AssessmentModel {
  #studentID;
  #score;

  /** one attempt of a student on an assessment (the assessment row comes from AssessmentModel.getByID) */
  constructor(assessment, studentID, score = 0) {
    super(assessment);
    this.#studentID = studentID;
    this.#score = score;
  }

  get studentID() { return this.#studentID; }
  get score() { return this.#score; }

  /** AssessmentAttempt.calculateBattleScore() */
  calculateBattleScore(correct, total) { return battleScore(correct, total); }

  /** AssessmentAttempt.saveScore() for this attempt */
  saveScore(isCompleted = true) { return AssessmentAttemptModel.saveScore(this.#studentID, this.assessmentID, this.#score, isCompleted); }

  /** AssessmentAttempt.evaluateArtifactUnlock() for this attempt */
  evaluateArtifactUnlock() {
    return AssessmentAttemptModel.evaluateArtifactUnlock(this.#studentID, this, this.#score);
  }

  /** AssessmentAttempt.saveScore() */
  static async saveScore(studentID, assessmentID, score, isCompleted = true) {
    try {
      const [result] = await db.query(
        `INSERT INTO AssessmentAttempt (studentID, assessmentID, Score, is_completed) VALUES (?, ?, ?, ?)`,
        [studentID, assessmentID, score, isCompleted ? 1 : 0]
      );
      return result.insertId;
    } catch (error) {
      console.error('Error in saveScore:', error);
      throw error;
    }
  }

  /**
   * AssessmentAttempt.evaluateArtifactUnlock()
   * Condition: score >= the artifact score (summativeConfig.artifactScore, set by the teacher;
   * falls back to requiredScore). Passing the siege and earning the artifact are separate marks.
   * When met, the era artifact is written to StudentArtifact (never duplicated)
   * and returned with its moralLesson for the popup. Returns null when not earned.
   */
  static async evaluateArtifactUnlock(studentID, assessment, score) {
    if (score < AssessmentModel.artifactScoreOf(assessment.summativeConfig, assessment.requiredScore)) return null;

    const artifact = await StudentArtifactModel.findEraArtifact(assessment.eraID, assessment.summativeConfig);
    if (!artifact) return null;

    const isNew = await StudentArtifactModel.unlockArtifact(studentID, artifact.artifactID);
    return { ...artifact, isNew };
  }
}

/**
 * StudentBadgeModel
 * StudentBadge.unlockBadge()
 */
export class StudentBadgeModel {
  static async unlockBadge(studentID, badgeID) {
    try {
      const [result] = await db.query(
        `INSERT IGNORE INTO StudentBadge (studentID, badgeID, earnedAt) 
         VALUES (?, ?, NOW())`,
        [studentID, badgeID]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error in unlockBadge:', error);
      throw error;
    }
  }
}