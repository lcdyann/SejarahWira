/**
 * assets/game/quests/base.js  -  QuestMechanic: base class of every quest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc, sleep } from '../core/core.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';      // suara pembaca (hidup/mati di Pintu)

/** Kotak arahan pada skrin misi yang dibacakan: Cara bermain (cari bukti), arahan padanan, soalan pilihan, kata-kata watak. */
const SPOKEN_SELECTORS = '.hs-note, .mt-help, .cq-prompt, .help-bubble-text';

export class QuestMechanic {
  #quest;
  #maxMistakes;
  #mistakes = 0;
  #settled = false;
  #resolve = null;

  constructor(quest, { maxMistakes = 1, background = null } = {}) {
    this.#quest = quest;
    this.#maxMistakes = maxMistakes;
    this.background = background;
    this.root = el('div', 'quest-screen');
    this.assistLevel = 0;
  }

  get quest() { return this.#quest; }
  get content() { return this.#quest.content || {}; }
  get mistakes() { return this.#mistakes; }
  get maxMistakes() { return this.#maxMistakes; }
  get isSettled() { return this.#settled; }

  /**
   * Registry of the mechanics: questType -> class. Filled in quests/index.js
   * (so this base file never has to import its own subclasses).
   */
  static jenis = {};

  /** Factory: pick the mechanic from Quest.questType. */
  static create(quest, opts = {}) {
    const Kelas = QuestMechanic.jenis[Number(quest.questType)];
    if (!Kelas) throw new Error(`Jenis misi ${quest.questType} tidak disokong.`);
    return new Kelas(quest, opts);
  }

  /** subclasses draw their playing field into this.field */
  build() { throw new Error('build() mesti dilaksanakan oleh subkelas'); }

  /** a clearer clue; subclasses override (level 2). Never the answer. */
  applyAssist(level) { this.assistLevel = level; }

  play(container) {
    container.appendChild(this.root);
    this.root.innerHTML = '';
    const top = el('div', 'quest-top px');
    top.innerHTML = `<div class="quest-title">${esc(this.#quest.questName)}</div>
      <div class="quest-ink" aria-label="Kesilapan"></div>`;
    this.inkEl = top.querySelector('.quest-ink');
    this.field = el('div', 'quest-field');
    this.root.append(top, this.field);
    this.renderInk();
    this.build();
    this.readInstructions();
    return new Promise((resolve) => { this.#resolve = resolve; });
  }

  /** Bacakan arahan yang tertera pada skrin misi (jika suara pembaca hidup). Teks petunjuk / jawapan tidak dibacakan. */
  readInstructions() {
    const text = [...this.root.querySelectorAll(SPOKEN_SELECTORS)]
      .map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    if (text) speech.speak(text);
  }

  renderInk() {
    if (!this.inkEl) return;
    if (this.#maxMistakes <= 1) {
      this.inkEl.innerHTML = '<span class="seal-warn" title="Sekali silap, cerita runtuh">☠ Sekali silap, cerita runtuh</span>';
      return;
    }
    let html = '';
    for (let i = 0; i < this.#maxMistakes; i++) html += `<i class="drop${i < this.#mistakes ? ' spent' : ''}"></i>`;
    this.inkEl.innerHTML = html;
  }

  /** bunyi tindakan betul (dipanggil oleh setiap mekanik) */
  markRight() { sound.sfx('betul'); }

  /**
   * @param {boolean} [silent] true = tiada bunyi salah (cth. "Intai tarikh" yang bukan kesilapan)
   * @returns {boolean} true when this mistake ruins the story
   */
  registerMistake(silent = false) {
    if (!silent) sound.sfx('salah');
    this.#mistakes += 1;
    this.renderInk();
    this.root.classList.add('shake');
    setTimeout(() => this.root.classList.remove('shake'), 400);
    return this.#mistakes >= this.#maxMistakes;
  }

  async succeed() {
    if (this.#settled) return;
    this.#settled = true;
    speech.stop();
    this.root.classList.add('done');
    await sleep(700);
    this.#resolve({ ok: true });
  }

  /** @param {string} [consequence] what happens in the story for THIS mistake (falls back to the quest's "akibat") */
  async fail(consequence = '') {
    if (this.#settled) return;
    this.#settled = true;
    speech.stop();
    this.root.classList.add('ruined');
    await sleep(900);
    this.#resolve({ ok: false, aftermath: consequence || this.content.aftermath || '' });
  }

  destroy() { speech.stop(); this.root.remove(); }
}
