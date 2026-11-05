import {
  QuestionBankModel,
  AssessmentModel,
  AssessmentAttemptModel
} from '../models/AssessmentModels.js';
import { teacherOfStudent } from '../utils/studentTeacher.js';
import { updateProgress } from './storyController.js';
import { EraProgressionModel } from '../models/ProgressModels.js';
import { createTicket, getTicket, answerTicket, closeTicket } from '../utils/siegeTickets.js';

/**
 * ============================================================================
 * assessmentController.js  (Application tier - BCE)
 * Handlers are named after the class diagram:
 *
 *   Assessment          retrieveRandomQuestions()   GET  /api/assessment/formative
 *   Assessment          startAssessment()           GET  /api/assessment/summative
 *   AssessmentAttempt   saveScore()                 POST /api/assessment/summative/submit
 *                         -> evaluateArtifactUnlock() (model) -> StudentArtifact.unlockArtifact()
 *                         -> LearningProgression.updateProgress()
 * ============================================================================
 */

/**
 * Assessment.retrieveRandomQuestions()     GET /api/assessment/formative
 * UC-05: Wira Training Grounds. Random questions, nothing is saved.
 */
export const retrieveRandomQuestions = async (req, res) => {
  try {
    const { eraID, limit = 10 } = req.query;

    const questions = await QuestionBankModel.retrieveRandomQuestions(eraID, limit, await teacherOfStudent(req.student.studentID));

    if (!questions || questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Soalan pentaksiran formatif tidak dijumpai bagi era ini.'
      });
    }

    return res.status(200).json({
      success: true,
      assessmentType: 'Formative',
      totalQuestions: questions.length,
      questions
    });
  } catch (err) {
    console.error('retrieveRandomQuestions error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * Assessment.startAssessment()             GET /api/assessment/summative
 * UC-06: The Great Siege. Returns the official Assessment record (id + requiredScore)
 * together with the random questions.
 */
export const startAssessment = async (req, res) => {
  try {
    const { eraID, limit = 10 } = req.query;

    if (!eraID || eraID === 'all') {
      return res.status(400).json({
        success: false,
        message: 'eraID yang sah diperlukan untuk Pentaksiran Sumatif.'
      });
    }

    const assessment = await AssessmentModel.getByEraAndType(eraID, 'Summative');
    const questions = await QuestionBankModel.retrieveRandomQuestions(eraID, limit, await teacherOfStudent(req.student.studentID));

    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Tiada Pentaksiran Sumatif (The Great Siege) untuk era ini.' });
    }

    // Kunci jawapan kekal di pelayan (dalam tiket); pelayar tidak menerimanya.
    const ticket = createTicket({
      studentID: req.student.studentID,
      assessmentID: assessment.assessmentID,
      eraID: String(eraID),
      questions
    });
    const safeQuestions = questions.map(({ correctAnswer, explanation, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      assessmentType: 'Summative',
      ticket,
      assessmentID: assessment.assessmentID,
      requiredScore: assessment.requiredScore,
      artifactScore: assessment.artifactScore,
      totalQuestions: safeQuestions.length,
      questions: safeQuestions
    });
  } catch (err) {
    console.error('startAssessment error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * POST /api/assessment/summative/answer     body: ticket, questionID, answer (A-D)
 * Pelayan menyemak jawapan dan memulangkan keputusan + jawapan betul + penerangan.
 */
export const checkAnswer = async (req, res) => {
  try {
    const { ticket, questionID, answer } = req.body;
    const t = getTicket(ticket, req.student.studentID);
    if (!t) return res.status(400).json({ success: false, message: 'Sesi Kepungan tamat atau tidak sah. Sila mulakan semula.' });
    if (!/^[A-Da-d]$/.test(String(answer || ''))) return res.status(400).json({ success: false, message: 'Jawapan mesti A, B, C atau D.' });
    const verdict = answerTicket(t, questionID, answer);
    if (!verdict) return res.status(400).json({ success: false, message: 'Soalan tidak ada dalam sesi ini.' });
    return res.status(200).json({ success: true, ...verdict });
  } catch (err) {
    console.error('checkAnswer error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};

/**
 * AssessmentAttempt.saveScore()            POST /api/assessment/summative/submit
 * body: ticket   (markah dikira OLEH PELAYAN daripada jawapan yang dihantar)
 *
 * 1. Saves the attempt in AssessmentAttempt (every attempt, pass or fail).
 * 2. evaluateArtifactUnlock: score >= Assessment.requiredScore -> StudentArtifact.
 * 3. Refreshes LearningProgression (bestScore, artifactsUnlocked, ...).
 *
 * 4. A pass triggers EraProgression.verifyConditions(): narrative badge + Siege passed
 *    => era 'completed' => next era 'unlocked' (the response carries `era` for the UI).
 */
export const saveScore = async (req, res) => {
  try {
    const { studentID } = req.body;
    const t = getTicket(req.body.ticket, req.student.studentID);
    if (!t) {
      return res.status(400).json({
        success: false,
        message: 'Sesi Kepungan tamat, sudah dihantar atau tidak sah. Sila mulakan semula.'
      });
    }
    const assessmentID = t.assessmentID;
    const { score } = closeTicket(req.body.ticket, t);      // tiket sekali guna

    const assessment = await AssessmentModel.getByID(assessmentID);
    if (!assessment || assessment.assessmentType !== 'Summative') {
      return res.status(404).json({
        success: false,
        message: 'Rekod pentaksiran sumatif tidak dijumpai.'
      });
    }

    // The pass mark always comes from the database, never from the client
    const requiredScore = assessment.requiredScore;
    const isCompleted = score >= requiredScore;

    const attempt = new AssessmentAttemptModel(assessment, studentID, score);   // AssessmentAttempt extends Assessment
    const attemptID = await attempt.saveScore(isCompleted);

    const artifact = await attempt.evaluateArtifactUnlock();

    let progression = await updateProgress(studentID);

    // The Great Siege was passed -> check the era (completed?) and unlock the next one.
    // A failed attempt cannot change the era, so it is skipped.
    let era = null;
    if (isCompleted) {
      const result = await EraProgressionModel.verifyConditions(studentID, assessment.eraID);
      era = {
        eraID: assessment.eraID,
        eraStatus: result.eraStatus,
        completed: result.canComplete,
        justCompleted: Boolean(result.justCompleted),
        nextEra: result.nextEra || null,
        reason: result.reason || null
      };
      progression = await updateProgress(studentID); // refresh after the era status changed
    }

    return res.status(201).json({
      success: true,
      message: isCompleted
        ? 'Tahniah! Pentaksiran sumatif lulus.'
        : 'Keputusan pentaksiran sumatif berjaya disimpan.',
      attemptID,
      score,
      requiredScore,
      artifactScore: assessment.artifactScore,
      isCompleted,
      artifact,
      era,
      progression
    });
  } catch (err) {
    console.error('saveScore error:', err);
    return res.status(500).json({ success: false, message: 'Ralat pelayan. Sila cuba lagi.' });
  }
};