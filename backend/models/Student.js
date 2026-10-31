import { User } from './User.js';
import { ClassModel } from './Class.js';
import db from '../config/db.js';

/**
 * Class diagram: Student -> User { -studentID -classID -studentName   customizeAvatar() learnHistoricalEra()
 * takeAssessment() viewBadges() viewArtifacts() viewLearningProgress() }
 * Those gameplay methods run in the browser (assets/js/game/domain.js) and in the story / assessment /
 * avatar / progress controllers; the class-related ones live here.
 */
export class Student extends User {
  #studentID;
  #studentName;
  #classID;
  #avatarID;
  #className;

  constructor(userID, username, role, password, studentID, studentName, classID, avatarID, className) {
    super(userID, username, role, password);
    this.#studentID = studentID;
    this.#studentName = studentName;
    this.#classID = classID;
    this.#avatarID = avatarID;
    this.#className = className;
  }

  get studentID() { return this.#studentID; }
  get studentName() { return this.#studentName; }
  get classID() { return this.#classID; }
  get avatarID() { return this.#avatarID; }
  get className() { return this.#className; }

  toJSON() {
    return {
      ...super.toJSON(),
      studentID: this.#studentID, studentName: this.#studentName,
      classID: this.#classID, avatarID: this.#avatarID, className: ClassModel.isPublicID(this.#classID) ? null : this.#className
    };
  }

  /** Student joins a class by its code (Class.joinClass). Returns the class or null when the code is wrong. */
  async joinClass(joinCode) {
    const cls = await ClassModel.findByJoinCode(joinCode);      // a code, not a class name: names can repeat
    if (!cls) return null;
    if (!(await ClassModel.joinClass(this.#studentID, cls.classID))) return null;
    this.#classID = cls.classID;
    this.#className = cls.className;
    return cls;
  }

  /** Student leaves the class (Class.leaveClass); the system keeps them in the holding class */
  async leaveClass() {
    const ok = await ClassModel.leaveClass(this.#studentID);
    if (ok) {
      const cls = await ClassModel.find(ClassModel.holdingClassID);
      this.#classID = cls.classID;
      this.#className = cls.className;
    }
    return ok;
  }

  static async getProfile(userInstance) {
    const [rows] = await db.query(
      `SELECT s.studentID, s.studentName, s.classID, s.avatarID, c.className
       FROM Student s
       LEFT JOIN Class c ON s.classID = c.classID
       WHERE s.userID = ?`,
      [userInstance.userID]
    );
    const data = rows[0] || {};
    return new Student(userInstance.userID, userInstance.username, userInstance.role, undefined,
      data.studentID, data.studentName, data.classID, data.avatarID, data.className);
  }

  /** load a student by studentID (used by the join / leave endpoints) */
  static async findByID(studentID) {
    const [rows] = await db.query(
      `SELECT u.userID, u.username, u.role, s.studentID, s.studentName, s.classID, s.avatarID, c.className
       FROM Student s JOIN User u ON u.userID = s.userID LEFT JOIN Class c ON c.classID = s.classID
       WHERE s.studentID = ? LIMIT 1`, [studentID]);
    const d = rows[0];
    return d ? new Student(d.userID, d.username, d.role, undefined, d.studentID, d.studentName, d.classID, d.avatarID, d.className) : null;
  }
}
