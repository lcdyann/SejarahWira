import db from '../config/db.js';

/**
 * Class diagram: ContentManager { -changesID -userID -changesDescription
 *                                 addNarrative() editNarrative() removeNarrative() saveChanges() }
 * One instance = one change made by one teacher. The narrative methods do the database work;
 * the controllers validate the request and answer the browser.
 */
const clip = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));

export class ContentManager {
  #changesID = null;
  #userID;
  #changesDescription = '';

  /** userID = the teacher making the change (teacherID in this database) */
  constructor(userID) { this.#userID = userID; }

  get changesID() { return this.#changesID; }
  get userID() { return this.#userID; }
  get changesDescription() { return this.#changesDescription; }

  /** ContentManager.saveChanges(): one log row so other teachers can follow what happened */
  async saveChanges(eraID, changesName, changesDescription) {
    this.#changesDescription = changesDescription;
    try {
      const [r] = await db.query(
        `INSERT INTO ContentManager (changesName, teacherID, eraID, changesDescription) VALUES (?, ?, ?, ?)`,
        [clip(changesName, 255), this.#userID, eraID, changesDescription]);
      this.#changesID = r && r.insertId ? r.insertId : null;
      return true;
    } catch (err) {
      // the content change itself already succeeded; losing the log line must not undo it
      console.error('saveChanges (change log) failed:', err);
      return false;
    }
  }

  /** ContentManager.addNarrative() -> new narrativeID */
  async addNarrative(eraID, { narrativeTitle, summary }) {
    const [r] = await db.query(`INSERT INTO Narrative (narrativeTitle, eraID, summary) VALUES (?, ?, ?)`, [narrativeTitle, eraID, summary]);
    await this.saveChanges(eraID, 'Tambah naratif', `Naratif baharu: "${clip(narrativeTitle, 100)}"`);
    return r.insertId;
  }

  /** ContentManager.editNarrative(); `existing` is the row before the change */
  async editNarrative(existing, { narrativeTitle, summary }) {
    await db.query(`UPDATE Narrative SET narrativeTitle = ?, summary = ? WHERE narrativeID = ?`, [narrativeTitle, summary, existing.narrativeID]);
    await this.saveChanges(existing.eraID, 'Kemas kini naratif', `"${clip(existing.narrativeTitle, 60)}" → "${clip(narrativeTitle, 60)}"`);
  }

  /** ContentManager.removeNarrative(); scenes, dialogue and quests go with it (cascade) */
  async removeNarrative(existing) {
    const [[c]] = await db.query(`SELECT COUNT(*) AS c FROM Scene WHERE narrativeID = ?`, [existing.narrativeID]);
    await db.query(`DELETE FROM Narrative WHERE narrativeID = ?`, [existing.narrativeID]);
    await this.saveChanges(existing.eraID, 'Padam naratif', `Naratif dipadam: "${clip(existing.narrativeTitle, 80)}" (${Number(c.c)} babak)`);
  }
}
