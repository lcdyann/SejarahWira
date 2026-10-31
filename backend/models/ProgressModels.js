import db from '../config/db.js';

/**
 * ============================================================================
 * ProgressModels.js  (Entity layer - BCE)
 * Shared by storyController, assessmentController and eraController.
 *
 *   EraProgression       updateStatus(), checkCompletion(), verifyConditions(),
 *                        unlockNextEra()
 *   LearningProgression  updateProgress()
 *
 * THE LEARNING CYCLE
 *   1. Era is 'unlocked'                      (first era by default / unlockNextEra)
 *   2. Story starts            -> 'in progress'   (storyController.loadNarrative)
 *   3. Story finished          -> era Badge written to StudentBadge
 *                                 (storyController.evaluateBadgeUnlock)
 *                                 = narrative condition met, assessments open
 *   4. Great Siege passed      -> AssessmentAttempt.is_completed = 1
 *                                 (assessmentController.saveScore)
 *                                 = summative condition met
 *   5. checkCompletion()       -> BOTH met => era status becomes 'completed'
 *   6. verifyConditions()      -> era status is 'completed' => next era 'unlocked'
 *                                 (unlockCondition of the next era = previous era completed)
 *   Replays never downgrade 'completed'.
 *
 * Responsibilities:
 *   checkCompletion()   CHECKS the activities AND WRITES eraStatus = 'completed'.
 *   verifyConditions()  CONFIRMS eraStatus = 'completed' (via checkCompletion) and
 *                       only then unlocks the next era + refreshes LearningProgression.
 * ============================================================================
 */

export class LearningProgressionModel {
  /**
   * Completion rate = completed eras / all eras (%), from EraProgression.
   */
  static async calculateCompletionRate(studentID) {
    const [[{ completedEras }]] = await db.query(
      `SELECT COUNT(DISTINCT eraID) AS completedEras
       FROM EraProgression WHERE studentID = ? AND eraStatus = 'completed'`,
      [studentID]
    );
    const [[{ totalEras }]] = await db.query(`SELECT COUNT(*) AS totalEras FROM HistoricalEra`);

    const completionRate = totalEras > 0
      ? parseFloat(((completedEras / totalEras) * 100).toFixed(2))
      : 0;

    return { completedEras, totalEras, completionRate };
  }

  /**
   * LearningProgression.updateProgress()
   * Recalculates the student's aggregate stats and upserts LearningProgression.
   * bestScore = highest AssessmentAttempt.Score of the student.
   */
  static async updateProgress(studentID) {
    const { completedEras, totalEras, completionRate } = await this.calculateCompletionRate(studentID);
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
  }
}

export class EraProgressionModel {
  /** Current status of one era for a student, or null when no row exists yet. */
  static async getStatus(studentID, eraID) {
    const [rows] = await db.query(
      `SELECT eraStatus FROM EraProgression WHERE studentID = ? AND eraID = ?`,
      [studentID, eraID]
    );
    return rows[0] ? rows[0].eraStatus : null;
  }

  /**
   * EraProgression.updateStatus()
   * Upserts the era status. A 'completed' era is never downgraded by anything
   * except an explicit 'completed'.
   */
  static async updateStatus(studentID, eraID, newStatus) {
    await db.query(
      `INSERT INTO EraProgression (studentID, eraID, eraStatus, unlockCondition)
       VALUES (?, ?, ?, 'COMPLETE_ERA')
       ON DUPLICATE KEY UPDATE
         eraStatus = IF(? = 'completed', VALUES(eraStatus),
                        IF(eraStatus = 'completed', eraStatus, VALUES(eraStatus)))`,
      [studentID, eraID, newStatus, newStatus]
    );
  }

  /**
   * EraProgression.checkCompletion()
   * Checks the two required activities of an era AND records the result:
   *   1. narrativeDone    - the student owns the era Badge (awarded when the whole
   *                         narrative + all its assigned quests were finished; survives replays)
   *   2. summativePassed  - a Summative AssessmentAttempt with is_completed = 1
   * Both met  => eraStatus is written as 'completed' (never for a still-locked era).
   * Idempotent: an already 'completed' era just stays 'completed'.
   *
   * Returns the check result plus { eraStatus, justCompleted }.
   */
  static async checkCompletion(studentID, eraID) {
    const [[{ badgesDefined }]] = await db.query(
      `SELECT COUNT(*) AS badgesDefined FROM Badge WHERE eraID = ?`,
      [eraID]
    );
    const [[{ badgesOwned }]] = await db.query(
      `SELECT COUNT(*) AS badgesOwned
       FROM StudentBadge sb INNER JOIN Badge b ON sb.badgeID = b.badgeID
       WHERE sb.studentID = ? AND b.eraID = ?`,
      [studentID, eraID]
    );
    const [[passed]] = await db.query(
      `SELECT a.attemptID
       FROM AssessmentAttempt a
       INNER JOIN Assessment s ON a.assessmentID = s.assessmentID
       WHERE a.studentID = ? AND s.eraID = ? AND s.assessmentType = 'Summative' AND a.is_completed = 1
       LIMIT 1`,
      [studentID, eraID]
    );

    const narrativeDone = badgesOwned > 0;
    const summativePassed = Boolean(passed);
    const isComplete = narrativeDone && summativePassed;

    let reason = null;
    if (!narrativeDone) {
      reason = badgesDefined === 0
        ? 'Lencana era ini belum ditetapkan oleh pengurus kandungan.'
        : 'Modul penceritaan era ini belum diselesaikan.';
    } else if (!summativePassed) {
      reason = 'Pentaksiran Sumatif (The Great Siege) belum lulus.';
    }

    // ---- the WRITE: both activities done => era becomes 'completed' ----
    let eraStatus = await this.getStatus(studentID, eraID);
    let justCompleted = false;
    // A locked era cannot be completed (the first era has no row yet => null => allowed)
    if (isComplete && eraStatus !== 'locked') {
      if (eraStatus !== 'completed') {
        await this.updateStatus(studentID, eraID, 'completed');
        justCompleted = true;
      }
      eraStatus = 'completed';
    }

    // progress of THIS era's required activities (narrative + summative), and the overall rate
    const activitiesDone = Number(narrativeDone) + Number(summativePassed);
    const eraCompletionRate = (activitiesDone / 2) * 100;
    const overall = await LearningProgressionModel.calculateCompletionRate(studentID);

    return {
      narrativeDone,
      summativePassed,
      activitiesDone,
      activitiesRequired: 2,
      eraCompletionRate,           // 0 / 50 / 100 for this era
      completionRate: overall.completionRate,   // % of ALL eras completed
      completedEras: overall.completedEras,
      totalEras: overall.totalEras,
      isComplete,
      eraStatus,
      justCompleted,
      reason
    };
  }

  /**
   * EraProgression.unlockNextEra()
   * Unlocks the next era in order (smallest eraID greater than this one).
   * unlockCondition of the next era = the previous era must be 'completed'.
   * Returns { nextEraID, nextEraName }, or null when this was the last era.
   */
  static async unlockNextEra(studentID, eraID) {
    const [[row]] = await db.query(
      `SELECT eraID AS nextEraID, eraName AS nextEraName
       FROM HistoricalEra WHERE eraID > ? ORDER BY eraID ASC LIMIT 1`,
      [eraID]
    );
    if (!row) return null;

    await db.query(
      `INSERT INTO EraProgression (studentID, eraID, eraStatus, unlockCondition)
       VALUES (?, ?, 'unlocked', ?)
       ON DUPLICATE KEY UPDATE eraStatus = IF(eraStatus = 'locked', 'unlocked', eraStatus)`,
      [studentID, row.nextEraID, `COMPLETE_ERA_${eraID}`]
    );

    return { nextEraID: row.nextEraID, nextEraName: row.nextEraName };
  }

  /**
   * EraProgression.verifyConditions()
   * Runs checkCompletion() (which writes 'completed' when both activities are done),
   * then confirms the era status really IS 'completed'. Only then:
   *   unlockNextEra() -> LearningProgression.updateProgress()
   * Idempotent and self-healing: calling it for an era that is already 'completed'
   * but whose next era is still locked (old data) simply unlocks the next era.
   */
  static async verifyConditions(studentID, eraID) {
    const check = await this.checkCompletion(studentID, eraID);

    // Gate: the unlock condition is "this era's eraStatus is 'completed'"
    if (check.eraStatus !== 'completed') {
      const reason = check.eraStatus === 'locked'
        ? 'Era ini masih terkunci. Selesaikan era sebelumnya dahulu.'
        : check.reason;
      return { canComplete: false, alreadyCompleted: false, nextEra: null, ...check, reason };
    }

    const nextEra = await this.unlockNextEra(studentID, eraID);
    await LearningProgressionModel.updateProgress(studentID);

    return {
      canComplete: true,
      alreadyCompleted: !check.justCompleted,
      nextEra,
      ...check,
      reason: null
    };
  }
}