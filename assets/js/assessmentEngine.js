/**
 * ============================================================================
 * SejarahWira - Assessment OOP Engine Hierarchy (AssessmentEngine.js)
 * ============================================================================
 * Diagram Classes Mapped:
 *   - Assessment (Base Class)
 *   - FormativeAssessment (Subclass - Wira Training Grounds)
 *   - SummativeAssessment (Subclass - The Great Siege)
 *   - Question (Domain Class)
 *   - AssessmentAttempt (Execution Class)
 *
 * Diagram methods: Question.displayQuestion/validateAnswer,
 * Assessment.startAssessment/provideHint/provideExplanation,
 * FormativeAssessment & SummativeAssessment.calculateBattleScore
 * ============================================================================
 */

/**
 * 1. DOMAIN CLASS: Question
 * Encapsulates single multiple-choice question attributes and validation methods.
 */
export class Question {
  constructor(data) {
    this.questionID = data.questionID;
    this.questionText = data.questionText;
    this.optionA = data.optionA;
    this.optionB = data.optionB;
    this.optionC = data.optionC;
    this.optionD = data.optionD;
    this.correctAnswer = String(data.correctAnswer).toUpperCase();
    this.hint = data.hint || 'Tiada petunjuk disediakan.';
    this.explanation = data.explanation || 'Tiada penerangan lanjutan.';
  }

  /**
   * Question.displayQuestion()
   * Returns the question text and its four options ready to be rendered.
   * @returns {{questionText: string, options: Array<{key: string, text: string}>}}
   */
  displayQuestion() {
    return {
      questionText: this.questionText,
      options: [
        { key: 'A', text: this.optionA },
        { key: 'B', text: this.optionB },
        { key: 'C', text: this.optionC },
        { key: 'D', text: this.optionD }
      ]
    };
  }

  /**
   * Encapsulated method to validate student choice.
   * @param {string} selectedOption - 'A', 'B', 'C', or 'D'
   * @returns {boolean}
   */
  validateAnswer(selectedOption) {
    return String(selectedOption).toUpperCase() === this.correctAnswer;
  }
}

/**
 * 2. PARENT BASE CLASS: Assessment
 * Contains core assessment properties, question lists, and shared methods.
 */
export class Assessment {
  constructor(assessmentID, eraID, assessmentType = 'Formative', requiredScore = 80) {
    this.assessmentID = assessmentID;
    this.eraID = eraID;
    this.assessmentType = assessmentType;
    this.requiredScore = requiredScore;
    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.isCompleted = false;
  }

  /**
   * Assessment.startAssessment()
   * Starts the attempt: builds Question objects and resets pointer and score.
   * @param {Array<Object>} rawQuestions 
   */
  startAssessment(rawQuestions) {
    this.questions = rawQuestions.map(q => new Question(q));
    this.currentIndex = 0;
    this.score = 0;
  }

  /**
   * Retrieves active question instance.
   * @returns {Question|null}
   */
  getCurrentQuestion() {
    if (this.currentIndex < this.questions.length) {
      return this.questions[this.currentIndex];
    }
    return null;
  }

  /**
   * Provides contextual learning hint for active question.
   * @returns {string}
   */
  provideHint() {
    const q = this.getCurrentQuestion();
    return q ? q.hint : 'Sila pilih soalan terlebih dahulu.';
  }

  /**
   * Provides explanation after question answering.
   * @returns {string}
   */
  provideExplanation() {
    const q = this.getCurrentQuestion();
    return q ? q.explanation : '';
  }

  /**
   * Advances pointer to next question.
   */
  nextQuestion() {
    this.currentIndex++;
  }
}

/**
 * 3. CHILD SUBCLASS: FormativeAssessment (Wira Training Grounds)
 * Inherits from Assessment. Encapsulates Health Bar logic (100 HP) and instant retries.
 */
export class FormativeAssessment extends Assessment {
  constructor(eraID) {
    super(`F-ERA-${eraID}`, eraID, 'Formative', 0);
    this.playerHealth = 100; // HP bar
    this.maxHealth = 100;
  }

  /**
   * Encapsulated method to calculate battle score percentage.
   * Formula: Score = (Correct Answers / Total Questions) * 100
   */
  calculateBattleScore(correctCount) {
    if (this.questions.length === 0) return 0;
    this.score = Math.round((correctCount / this.questions.length) * 100);
    return this.score;
  }

  /**
   * Deducts player HP on wrong answer choice.
   * @param {number} damage - Default 20 HP
   */
  takeDamage(damage = 20) {
    this.playerHealth = Math.max(0, this.playerHealth - damage);
    return this.playerHealth;
  }

  /**
   * Restores player HP on correct answer.
   * @param {number} amount - Default 10 HP
   */
  heal(amount = 10) {
    this.playerHealth = Math.min(this.maxHealth, this.playerHealth + amount);
    return this.playerHealth;
  }
}

/**
 * 4. CHILD SUBCLASS: SummativeAssessment (The Great Siege)
 * Inherits from Assessment. Encapsulates 5-minute countdown timer and artifact evaluations.
 */
export class SummativeAssessment extends Assessment {
  constructor(eraID, timeLimitSeconds = 300) {
    super(`S-ERA-${eraID}`, eraID, 'Summative', 80); // Requires 80% to pass
    this.timeRemaining = timeLimitSeconds; // 300 seconds (5 minutes)
    this.timerInterval = null;
    this.answersLog = [];
  }

  /**
   * Starts countdown timer loop.
   * @param {Function} onTick - Callback every second receiving remaining seconds
   * @param {Function} onTimeUp - Callback triggered when timer reaches 0
   */
  startTimer(onTick, onTimeUp) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      if (typeof onTick === 'function') onTick(this.timeRemaining);

      if (this.timeRemaining <= 0) {
        this.stopTimer();
        if (typeof onTimeUp === 'function') onTimeUp();
      }
    }, 1000);
  }

  /**
   * Stops active timer loop.
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Logs student answer choice.
   */
  recordAnswer(questionID, selectedOption, isCorrect) {
    this.answersLog.push({ questionID, selectedOption, isCorrect });
    if (isCorrect) this.score += 1;
  }

  /**
   * Calculates final score percentage.
   */
  calculateBattleScore() {
    if (this.questions.length === 0) return 0;
    const finalPercentage = Math.round((this.score / this.questions.length) * 100);
    this.isCompleted = finalPercentage >= this.requiredScore;
    return finalPercentage;
  }
}