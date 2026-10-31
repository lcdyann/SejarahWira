import crypto from 'node:crypto';
import db from '../config/db.js';
import { deriveCode, sameCode } from '../utils/authToken.js';

/**
 * ============================================================================
 * models/Class.js   (Entity layer - BCE)
 * Class diagram:   Class { classID, className, batchYear   joinClass(), leaveClass() }
 *
 * PUBLIC CLASS
 *   Students who sign up without a teacher belong to the class "PUBLIC/0000". The database
 *   needs every class to have a teacher, so a hidden system teacher (nobody can log in as
 *   it) owns it. Rows only, no schema change. Created automatically when the server starts.
 *
 *   joinClass(studentID, classID)   put a student in a class (a new public student, or a teacher
 *                                   adding / moving a student)
 *   leaveClass(studentID)           take a student out of their class; they go back to PUBLIC/0000
 *                                   (Student.classID cannot be empty)
 * ============================================================================
 */
export const PUBLIC_CLASS_ID = 'PUBLIC-0000';
export const PUBLIC_CLASS_NAME = 'PUBLIC/0000';
export const SYSTEM_TEACHER_ID = 'T-PUBLIC';
export const SYSTEM_USERNAME = '__public__';

/**
 * Class diagram: Class { -classID -className -batchYear   +joinClass() +leaveClass() }
 * An instance holds one class (private attributes, getters). joinClass / leaveClass work on a student
 * and are also available as statics for code that only has IDs.
 */
export class ClassModel {
  #classID;
  #className;
  #batchYear;

  constructor(classID, className, batchYear) {
    this.#classID = classID;
    this.#className = className;
    this.#batchYear = batchYear;
  }

  get classID() { return this.#classID; }
  get className() { return this.#className; }
  get batchYear() { return this.#batchYear; }
  get isPublic() { return this.#classID === PUBLIC_CLASS_ID; }
  toJSON() { return { classID: this.#classID, className: this.#className, batchYear: this.#batchYear }; }

  static get holdingClassID() { return PUBLIC_CLASS_ID; }

  /** find a class by its ID or by its name (case does not matter); null when there is none */
  static async find(code, conn = db) {
    const key = String(code ?? '').trim();
    if (!key || key.length > 100) return null;
    const [rows] = await conn.query(
      'SELECT classID, className, batchYear FROM Class WHERE classID = ? OR LOWER(className) = LOWER(?) LIMIT 1', [key, key]);
    const r = rows[0];
    return r ? new ClassModel(r.classID, r.className, r.batchYear) : null;
  }

  /** class.joinClass(studentID) */
  joinClass(studentID, conn = db) { return ClassModel.joinClass(studentID, this.#classID, conn); }
  /** class.leaveClass(studentID) */
  leaveClass(studentID, conn = db) { return ClassModel.leaveClass(studentID, conn); }

  /**
   * Join code of a class, e.g. "K7Q2-M9XD". Worked out from the class ID and the server secret, so
   * two classes with the same name (even under different teachers) always have different codes.
   * The teacher sees it in the class manager and gives it to the student.
   */
  static joinCodeOf(classID) { return deriveCode('class', classID, 8); }

  /** find a class from its join code; null when no class has it. The public class has no code. */
  static async findByJoinCode(code, conn = db) {
    if (typeof code !== 'string' || code.length > 30) return null;
    const [rows] = await conn.query('SELECT classID, className, batchYear FROM Class WHERE classID <> ?', [PUBLIC_CLASS_ID]);
    const r = rows.find((c) => sameCode(code, ClassModel.joinCodeOf(c.classID)));
    return r ? new ClassModel(r.classID, r.className, r.batchYear) : null;
  }

  /** create the hidden system teacher and the PUBLIC/0000 class when they are missing (safe to run every start) */
  static async ensurePublicClass() {
    const [[t]] = await db.query('SELECT teacherID FROM Teacher WHERE teacherID = ? LIMIT 1', [SYSTEM_TEACHER_ID]);
    if (!t) {
      // a long random password nobody knows: this account can never log in (login also refuses it by name)
      const secret = crypto.randomBytes(32).toString('hex');
      const [[u]] = await db.query('SELECT userID FROM User WHERE username = ? LIMIT 1', [SYSTEM_USERNAME]);
      let userID = u && u.userID;
      if (!userID) {
        const [ins] = await db.query('INSERT INTO User (username, role, password) VALUES (?, ?, ?)', [SYSTEM_USERNAME, 'Teacher', secret]);
        userID = ins.insertId;
      }
      await db.query('INSERT INTO Teacher (teacherID, teacherName, userID) VALUES (?, ?, ?)', [SYSTEM_TEACHER_ID, 'Pasukan SejarahWira', userID]);
    }
    await db.query(
      'INSERT IGNORE INTO Class (classID, className, batchYear, teacherID) VALUES (?, ?, 0, ?)',
      [PUBLIC_CLASS_ID, PUBLIC_CLASS_NAME, SYSTEM_TEACHER_ID]);
  }

  /** Class.joinClass() */
  static async joinClass(studentID, classID = PUBLIC_CLASS_ID, conn = db) {
    const [[cls]] = await conn.query('SELECT classID FROM Class WHERE classID = ? LIMIT 1', [classID]);
    if (!cls) return false;
    const [r] = await conn.query('UPDATE Student SET classID = ? WHERE studentID = ?', [classID, studentID]);
    return r.affectedRows > 0;
  }

  /** Class.leaveClass(): back to the public class */
  static async leaveClass(studentID, conn = db) {
    return ClassModel.joinClass(studentID, PUBLIC_CLASS_ID, conn);
  }

  static isPublicID(classID) { return classID === PUBLIC_CLASS_ID; }
}
