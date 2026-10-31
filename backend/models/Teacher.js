import { User } from './User.js';
import db from '../config/db.js';

/**
 * Class diagram: Teacher -> User { -teacherID -teacherName   manageLearningContent() monitorStudentPerformance()
 * viewLearningProgress() }
 * manageLearningContent  -> ContentManager (contentController / contentStoryController)
 * monitorStudentPerformance -> MonitorAnalyticsModel
 * viewLearningProgress   -> teacherProgressController
 */
export class Teacher extends User {
  #teacherID;
  #teacherName;

  constructor(userID, username, role, password, teacherID, teacherName) {
    super(userID, username, role, password);
    this.#teacherID = teacherID;
    this.#teacherName = teacherName;
  }

  get teacherID() { return this.#teacherID; }
  get teacherName() { return this.#teacherName; }

  toJSON() {
    return { ...super.toJSON(), teacherID: this.#teacherID, teacherName: this.#teacherName };
  }

  static async getProfile(userInstance) {
    const [rows] = await db.query('SELECT teacherID, teacherName FROM Teacher WHERE userID = ?', [userInstance.userID]);
    const data = rows[0] || {};
    return new Teacher(userInstance.userID, userInstance.username, userInstance.role, undefined,
      data.teacherID, data.teacherName);
  }
}
