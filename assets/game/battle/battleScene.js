/**
 * assets/game/battle/battleScene.js  -  BattleScene: shared by Training + Siege
 * MODULE: battle  (Doors + Wira Training Grounds (formative) + The Great Siege (summative))
 * USE CASE: UC-05, UC-06   CLASS DIAGRAM: Assessment, FormativeAssessment, Question, AssessmentAttempt
 */
import { el, esc } from '../core/core.js';
import { GameScene, SceneGone } from '../core/scene.js';
import { sound } from '../core/sound.js';

const BATTLE_UI = '../assets/gameAsset/battleUI';


const SILAT = '../assets/gameAsset/silat';


/** a plain drawn figure, used while a silat pose picture is missing */
const silhouette = (colour) => {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='120' height='150'>
      <circle cx='60' cy='28' r='20' fill='${colour}'/>
      <rect x='34' y='50' width='52' height='60' rx='10' fill='${colour}'/>
      <rect x='38' y='108' width='18' height='38' fill='${colour}'/>
      <rect x='64' y='108' width='18' height='38' fill='${colour}'/>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};


/** every silat character that can be an opponent in the Gelanggang (folders in assets/gameAsset/silat/) */
const OPPONENTS = [
  'M_BLACK', 'M_EMERALD', 'M_BLUE',
  'F_HAIR_BLACK', 'F_HAIR_EMERALD', 'F_HAIR_BLUE',
  'F_HIJABI_BLACK', 'F_HIJABI_EMERALD', 'F_HIJABI_BLUE',
  'M_EVIL', 'F_EVIL'
];


/** a random opponent, never the same character as the student */
export const randomOpponent = (playerID) => {
  const others = OPPONENTS.filter((id) => id !== playerID);
  return others[Math.floor(Math.random() * others.length)];
};


/** assets/gameAsset/silat/<CODE>/<pose>.png   pose = idle, punch, kick, block, evade */
const silatSrc = (id, pose) => `${SILAT}/${id}/${pose}.png`;


/* ========================================================================== */
export class BattleScene extends GameScene {
  async enter({ eraID, trained = false }) {
    this.eraID = Number(eraID);
    this.trained = trained;
    this.era = this.game.eraById(this.eraID);
    this.index = 0;
    this.locked = false;
    this.root.classList.add('battle');
    await this.entity.load(this.eraID);
    try {
      await this.loadAssessment();
    } catch (err) {
      await this.game.openModal({ title: 'Pentaksiran tidak dapat dimuatkan', body: `<p>${esc(err.message)}</p>`, buttons: [{ label: 'Kembali', primary: true }] });
      this.game.go('DoorsScene', { eraID: this.eraID, first: false, trained });
      return;
    }
    this.build();
    this.keys({
      onKeyDown: (k) => {
        if (k === 'h') { this.hint(); return true; }
        if (k === 'Escape') { this.leave(); return true; }
        const n = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : Number(k) - 1;
        if (n >= 0 && n < 4) { this.answer('ABCD'[n]); return true; }
        return false;
      }
    });
    this.runFlow(() => this.begin());
  }

  /** subclasses */
  async loadAssessment() { throw new Error('loadAssessment()'); }
  build() { throw new Error('build()'); }
  async begin() { return this.nextQuestion(); }

  get question() { return this.assessment.getCurrentQuestion(); }

  /** the question panel (same markup in Training and Siege; the CSS decides where it sits) */
  buildPanel() {
    const panel = el('div', 'question-panel px');

    panel.innerHTML = `
      <div class="question-panel-head">
        <span class="question-tools">
          <button class="hud-btn hud-hint" data-action="hint" title="Petunjuk (H)"><i class="hud-ico bulb">&#128161;</i><span>Petunjuk</span></button>   <!-- butang yang sama seperti dalam permainan cerita -->
          <button class="hud-btn hud-leave" data-action="leave" title="Keluar (Esc)"><i class="hud-ico fas fa-right-from-bracket"></i><span>Keluar</span></button>
        </span>
      </div>
      <div class="question-text"></div>
      <div class="answer-list"></div>`;

    panel.querySelector('[data-action="hint"]').addEventListener('click', () => this.hint());
    panel.querySelector('[data-action="leave"]').addEventListener('click', () => this.leave());

    this.panel = panel;
    this.root.appendChild(panel);
    this.watchCovered(['[data-action="hint"]', '[data-action="leave"]']);   // kelabu bila tertutup tetingkap / dialog
  }

  /** a silat fighter picture; a drawn figure takes over if the pose picture is missing */
  fighter(silatID, pose, flipped) {
    const img = new Image();
    img.className = `fighter-sprite${flipped ? ' is-flipped' : ''}`;
    img.alt = '';
    img.src = silatSrc(silatID, pose);

    img.onerror = () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      img.src = silhouette(flipped ? '#5b2a86' : '#c98a2b');
    };
    return img;
  }

  /** change a fighter's pose (does nothing while the drawn figure is used) */
  setPose(img, silatID, pose) {
    if (!img.dataset.fallback) img.src = silatSrc(silatID, pose);
  }

  showQuestion() {
    const q = this.question;
    const data = q.displayQuestion();                                // Question.displayQuestion()

    this.panel.querySelector('.question-text').textContent = data.questionText;

    const list = this.panel.querySelector('.answer-list');
    list.innerHTML = '';

    data.options.forEach((option) => {
      const button = el('button', 'btn-px menu-opt', `<span class="key">${option.key}</span><span class="opt-text">${esc(option.text)}</span>`);
      button.dataset.key = option.key;
      button.addEventListener('click', () => this.answer(option.key));
      list.appendChild(button);
    });

    this.locked = false;
  }

  async nextQuestion() {
    if (this.shouldEnd()) return this.finish();
    this.showQuestion();
    return null;
  }

  shouldEnd() { return !this.question; }

  markOptions(chosen, correctKey) {
    this.panel.querySelectorAll('.answer-list button').forEach((button) => {
      button.disabled = true;
      if (button.dataset.key === correctKey) button.classList.add('right');
      else if (button.dataset.key === chosen) button.classList.add('wrong');
    });
  }

  async answer(key) {
    if (this.locked || !this.question) return;
    this.locked = true;
    const q = this.question;
    const ok = q.validateAnswer(key);                                // Question.validateAnswer()
    this.markOptions(key, q.correctAnswer);
    await this.react(ok, q);
    if (!this.alive) return;
    await this.afterAnswer(ok, q);
  }

  async afterAnswer(ok, q) {
    try {
      await this.gate(this.entity.speak(ok ? 'pujian' : 'pembetulan',
        ok ? { maklumbalas: q.explanation } : { penerangan: q.explanation }, { eraID: this.eraID }));
      this.assessment.nextQuestion();
      await this.nextQuestion();
    } catch (err) { if (!(err instanceof SceneGone)) throw err; }
  }

  async react() { /* subclasses animate */ }
  async finish() { /* subclasses */ }

  async hint() {
    if (this._hinting || !this.question) return;
    this._hinting = true;
    try { await this.entity.speak('bisikan', { petunjuk: this.assessment.provideHint() }, { eraID: this.eraID }); }
    finally { this._hinting = false; }
  }

  async leave() {
    if (this._leaving) return;
    this._leaving = true;
    let out = false;
    await this.game.openModal({
      title: 'Keluar?',
      body: '<p>Pentaksiran ini akan ditamatkan. Skor tidak disimpan.</p>',
      buttons: [{ label: 'Terus bertarung', primary: true }, { label: 'Keluar', danger: true, icon: 'fas fa-right-from-bracket', onClick: () => { out = true; } }]
    });
    this._leaving = false;
    if (out) {
      if (this.assessment.stopTimer) this.assessment.stopTimer();
      this.game.go('DoorsScene', { eraID: this.eraID, first: false, trained: this.trained, message: '' });
    }
  }

  banner(win, title, sub, buttons, extraHtml = '') {
    sound.sfx(win ? 'menang' : 'kalah');                             // keputusan pentaksiran
    return this.game.openModal({
      title,
      body: `<div class="result-banner"><img src="${BATTLE_UI}/${win ? 'victory' : 'defeat'}.png" alt="" onerror="this.style.display='none'"><p>${esc(sub)}</p>${extraHtml}</div>`,
      buttons
    });
  }
}
