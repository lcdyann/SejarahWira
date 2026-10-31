import db from '../config/db.js';
import { checkPassword, isHashed, hashPassword } from '../utils/passwordUtil.js';

/**
 * Class diagram: User { -userID -username -role -password   +login() +logout() }
 * Attributes are private (#) and read through getters. The password has NO getter and is never
 * part of toJSON(), so it cannot leak into a response by accident.
 */
export class User {
  #userID;
  #username;
  #role;
  #password;

  constructor(userID, username, role, password) {
    this.#userID = userID;
    this.#username = username;
    this.#role = role;
    this.#password = password;
  }

  get userID() { return this.#userID; }
  get username() { return this.#username; }
  get role() { return this.#role; }

  /** what is safe to send to the browser (subclasses add their own fields) */
  toJSON() {
    return { userID: this.#userID, username: this.#username, role: this.#role };
  }

  static async findByUsernameAndRole(username, role) {
    const [rows] = await db.query(
      'SELECT userID, username, role, password FROM User WHERE username = ? AND role = ?',
      [username, role]
    );
    if (rows.length === 0) return null;
    const u = rows[0];
    return new User(u.userID, u.username, u.role, u.password);
  }

  /** User.login(): true when the password is right (an old plain-text one is upgraded to a salted hash) */
  async login(plainPassword) {
    const ok = await checkPassword(plainPassword, this.#password);
    if (ok && !isHashed(this.#password)) {
      try {
        const hash = await hashPassword(plainPassword, 'scrypt');
        await db.query('UPDATE User SET password = ? WHERE userID = ?', [hash, this.#userID]);
        this.#password = hash;
      } catch (err) {
        console.error('Password upgrade skipped:', err.message);      // login still works
      }
    }
    return ok;
  }

  /** kept so older callers still work */
  verifyPassword(plainPassword) { return this.login(plainPassword); }

  /** User.logout(): tokens are stateless, so the server only confirms; the browser forgets its token */
  logout() { return true; }
}
