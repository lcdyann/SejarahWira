/**
 * ============================================================================
 * battleScenes.js  -  BattleScene (abstract) -> TrainingScene, SiegeScene
 *
 *   TrainingScene  Wira Training Grounds (UC-05) FormativeAssessment
 *                  silat arena, HP bars with the yellow damage trail. NOTHING is saved.
 *   SiegeScene     The Great Siege (UC-06) SummativeAssessment
 *                  cannon vs fortress, score top right, saved with saveScore();
 *                  an artifact reveal (+ the role's moral lesson) when the pass mark is reached.
 *
 * Pendekar Bayang is the announcer: explanations come as pembetulan / pujian, the hint as bisikan.
 * ============================================================================
 */
import { sound } from './sound.js';
import { el, esc, sleep, tpl } from './core.js';
import { GameScene, SceneGone } from './scenes.js';
import { entityPortrait } from './entity.js';
import { FormativeAssessment, SummativeAssessment, resolveAsset } from './domain.js';
import { ShelfComponent } from './shelf.js';

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
const randomOpponent = (playerID) => {
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

/* ========================================================================== */
/* Wira Training Grounds                                                      */
/* ========================================================================== */
export class TrainingScene extends BattleScene {
  async loadAssessment() {
    const data = await this.api.formative(this.eraID, 10);               // Assessment.retrieveRandomQuestions()
    this.assessment = new FormativeAssessment(this.eraID);
    this.assessment.startAssessment(data.questions);                     // Assessment.startAssessment()
    this.playerHP = 100; this.enemyHP = 100;
    this.shown = { player: 100, enemy: 100 };
    this.correct = 0;
    this.playerID = this.student.silatID;
    this.enemyID = randomOpponent(this.playerID);          // a different opponent every fight
  }

  build() {
    this.root.classList.add('battle-training');

    this.root.innerHTML = `
      <div class="training-backdrop"></div>

      <div class="training-hud px">
        <div class="fighter-bar is-player">
          <span class="fighter-name">${esc(this.student.studentName)}</span>
          <div class="hp-bar"><i class="hp-bar-trail"></i><i class="hp-bar-fill"></i></div>
          <small class="fighter-hp-text">100 / 100 HP</small>
        </div>

        <div class="training-vs">VS</div>

        <div class="fighter-bar is-enemy">
          <span class="fighter-name">Bayang Sejarah</span>
          <div class="hp-bar"><i class="hp-bar-trail"></i><i class="hp-bar-fill"></i></div>
          <small class="fighter-hp-text">100 / 100 HP</small>
        </div>
      </div>

      <div class="training-arena">
        <div class="fighter-slot is-player"></div>
        <div class="fighter-slot is-enemy"></div>
      </div>

      <div class="damage-flash"></div>`;

    this.playerFigure = this.fighter(this.playerID, 'idle', false);
    this.enemyFigure = this.fighter(this.enemyID, 'idle', true);

    this.root.querySelector('.fighter-slot.is-player').appendChild(this.playerFigure);
    this.root.querySelector('.fighter-slot.is-enemy').appendChild(this.enemyFigure);

    this.buildPanel();
  }

  /** update a health bar; the yellow trail drains a moment later */
  setHP(side, hp) {
    const bar = this.root.querySelector(`.fighter-bar.is-${side}`);
    const fill = bar.querySelector('.hp-bar-fill');
    const trail = bar.querySelector('.hp-bar-trail');

    fill.style.width = `${hp}%`;
    bar.querySelector('.fighter-hp-text').textContent = `${hp} / 100 HP`;

    if (hp < this.shown[side]) {
      clearTimeout(this[`_trailTimer_${side}`]);
      this[`_trailTimer_${side}`] = setTimeout(() => { trail.style.width = `${hp}%`; }, 600);
    } else {
      trail.style.width = `${hp}%`;
    }

    this.shown[side] = hp;
  }

  /** the fight animation after each answer */
  async react(ok) {
    const useKick = Math.random() < 0.5;
    const attack = useKick ? 'kick' : 'punch';
    const defend = useKick ? 'evade' : 'block';

    const arena = this.root.querySelector('.training-arena');
    const player = this.playerFigure;
    const enemy = this.enemyFigure;

    if (ok) {
      // right answer: the student attacks, the enemy is hit
      this.correct += 1;
      this.enemyHP = Math.max(0, this.enemyHP - 20);

      this.setPose(player, this.playerID, attack);
      player.classList.add('is-lunging-right');
      sound.sfx('serang');
      await sleep(200);

      this.setPose(enemy, this.enemyID, defend);
      enemy.classList.add('is-hit');
      sound.sfx('kena');
      arena.classList.add('is-shaking');
      this.setHP('enemy', this.enemyHP);
    } else {
      // wrong answer: the enemy attacks, the student is hit
      this.setPose(enemy, this.enemyID, attack);
      enemy.classList.add('is-lunging-left');
      sound.sfx('serang');

      this.assessment.takeDamage(20);                                     // FormativeAssessment
      this.playerHP = this.assessment.playerHealth;
      await sleep(200);

      this.setPose(player, this.playerID, defend);
      player.classList.add('is-hit');
      sound.sfx('kenaPemain');
      arena.classList.add('is-shaking');

      const flash = this.root.querySelector('.damage-flash');
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 250);

      this.setHP('player', this.playerHP);
    }

    await sleep(750);

    // back to the standing pose
    this.setPose(player, this.playerID, 'idle');
    this.setPose(enemy, this.enemyID, 'idle');
    player.className = 'fighter-sprite';
    enemy.className = 'fighter-sprite is-flipped';
    arena.classList.remove('is-shaking');
  }

  async afterAnswer(ok, q) {
    if (this.playerHP <= 0 || this.enemyHP <= 0) { this.assessment.nextQuestion(); return this.finish(); }
    return super.afterAnswer(ok, q);
  }

  async finish() {
    if (this._finished) return;
    this._finished = true;
    const win = this.playerHP > this.enemyHP;
    // Latihan = permainan HP: menang/kalah ditentukan oleh siapa kehabisan nyawa dahulu (tiada peratusan atau bilangan soalan)
    try {
      await this.gate(this.entity.speak(win ? 'latihanMenang' : 'latihanKalah', {}, { eraID: this.eraID }));
      let choice = null;
      await this.gate(this.banner(win, win ? 'Kemenangan di Gelanggang!' : 'Tewas di Gelanggang',
        win ? 'Nyawa lawan habis dahulu. Latihan tidak disimpan.' : 'Nyawa kamu habis dahulu. Latihan tidak disimpan.', [
          { label: '\u21BB Cuba lagi', onClick: () => { choice = 'retry'; } },
          { label: 'Kepungan Agung', primary: win, onClick: () => { choice = 'siege'; } },
          { label: 'Kembali', onClick: () => { choice = 'back'; } }
        ]));
      if (choice === 'retry') return this.game.go('TrainingScene', { eraID: this.eraID, trained: true });
      if (choice === 'siege') {
        await this.gate(this.entity.speak('kepungBersedia', {}, { eraID: this.eraID }));
        return this.game.go('SiegeScene', { eraID: this.eraID, trained: true });
      }
      return this.game.go('DoorsScene', { eraID: this.eraID, first: false, trained: true });
    } catch (err) { if (err instanceof SceneGone) return null; throw err; }
  }
}

/* ========================================================================== */
/* The Great Siege                                                            */
/* ========================================================================== */
const FORTRESS = [
  { max: 0.20, img: 'fortress_state1.jpg' }, { max: 0.45, img: 'fortress_state2.jpg' },
  { max: 0.70, img: 'fortress_state3.jpg' }, { max: 0.95, img: 'fortress_state4.jpg' }, { max: 1.0, img: 'fortress_state5.jpg' }
];

/** bilangan bisikan dibenarkan dalam satu Kepungan (sumatif) */
const MAKS_BISIKAN = 3;

export class SiegeScene extends BattleScene {
  async loadAssessment() {
    const data = await this.api.summative(this.eraID, 10);                // Assessment.startAssessment()
    this.assessmentID = data.assessmentID;
    this.ticket = data.ticket;                                           // tiket sesi; markah dikira pelayan
    this.requiredScore = data.requiredScore ?? 40;
    this.artifactScore = data.artifactScore ?? 80;
    this.assessment = new SummativeAssessment(this.eraID, 300);
    this.assessment.startAssessment(data.questions);
    this.assessment.requiredScore = this.requiredScore;
    this.finished = false;
  }

  build() {
    this.root.classList.add('battle-siege');
    this.hintsLeft = MAKS_BISIKAN;                 // ini ujian: bisikan terhad
    this.hintsOpened = new Set();                  // soalan yang bisikannya sudah dibuka

    this.root.innerHTML = `
      <div class="siege-backdrop"></div>
      <img class="siege-impact hidden" src="../assets/gameAsset/siege/cannon_impact.png" alt="">

      <div class="siege-hud px">
        <div class="siege-hud-item">
          <small>MASA</small>
          <b class="siege-timer">05:00</b>
        </div>
        <div class="siege-hud-item is-wide">
          <small>KUBU MUSUH <span class="siege-fort-percent">100%</span></small>
          <div class="hp-bar"><i class="hp-bar-fill"></i></div>
        </div>
        <div class="siege-hud-item">
          <small>SKOR</small>
          <b class="siege-score">0</b>
        </div>
      </div>

      <div class="siege-student"></div>

      <div class="siege-cannon">
        <img class="cannon-ball hidden" src="../assets/gameAsset/siege/cannon_ball.png" alt="">
        <img class="cannon-barrel" src="../assets/gameAsset/siege/cannon_idle.png" alt="">
      </div>`;

    // a missing picture is hidden instead of showing a broken icon
    this.root.querySelectorAll('.siege-impact, .cannon-ball, .cannon-barrel').forEach((img) => {
      img.onerror = () => { img.style.visibility = 'hidden'; };
    });

    // left: the student's avatar
    this.playerID = this.student.silatID;
    this.studentFigure = this.fighter(this.playerID, 'idle', false);
    this.root.querySelector('.siege-student').appendChild(this.studentFigure);

    // right: the question panel
    this.buildPanel();
    this.paintHintButton();

    // Jam bermula SELEPAS taklimat (lihat begin()), supaya murid tidak kehilangan masa mendengar
    this.own(() => this.assessment.stopTimer());
    this.updateFortress(0);
  }

  /* ---------- Bisikan: hanya MAKS_BISIKAN kali bagi seluruh Kepungan ---------- */

  /** tulis baki pada butang sebagai hati: ♥ penuh = ada lagi, ♥ pudar = sudah guna */
  paintHintButton() {
    const btn = this.panel && this.panel.querySelector('[data-action="hint"]');
    if (!btn) return;
    let hati = '';
    for (let i = 0; i < MAKS_BISIKAN; i += 1) {
      hati += `<span class="heart${i < this.hintsLeft ? '' : ' spent'}">\u2665</span>`;
    }
    btn.innerHTML = `<i class="hud-ico bulb">&#128161;</i><span>Petunjuk</span><span class="hearts">${hati}</span>`;   // ikon mentol yang sama; hati = baki
    btn.title = `Petunjuk (H): baki ${this.hintsLeft} daripada ${MAKS_BISIKAN}`;
    btn.classList.toggle('is-empty', this.hintsLeft <= 0);       // tidak dimatikan: menekannya membuat Pendekar Bayang menerangkan
  }

  /** Sebelum perang: Pendekar Bayang memberitahu tentang bisikan, barulah jam dan soalan bermula */
  async begin() {
    this._briefing = true;
    this.locked = true;
    await this.showArtifactHint();                     // halaman teaser: artifak bayang + markah (satu perkara pada satu masa)
    await this.gate(this.entity.speak('taklimat', {
      taklimat: `Ini ujian sebenar. Aku hanya boleh berbisik ${MAKS_BISIKAN} kali sepanjang kepungan ini, jadi gunakan dengan bijak. Hati di butang Bisikan menunjukkan baki. Jam bermula sebaik sahaja kita mulakan!`
    }, { eraID: this.eraID }));
    this._briefing = false;
    this.assessment.startTimer((t) => this.tick(t), () => this.finish());
    return super.begin();
  }

  /**
   * Sebelum perang: tunjuk artifak era ini sebagai bayang gelap + markah untuk membukanya (motivasi).
   * Susun atur: <template id="tpl-artifak">. Gagal dimuatkan = dilangkau tanpa ralat.
   */
  async showArtifactHint() {
    try {
      const res = await this.api.artifacts(this.student.studentID);
      const a = (res.artifacts || []).find((x) => Number(x.eraID) === this.eraID);
      const asset = a && (a.previewAsset || a.asset);
      if (!asset || a.isUnlocked) return null;         // sudah memiliki artifak era ini: tiada teaser lagi
      const card = tpl('artifak', { need: `Capai ${this.artifactScore}% ke atas untuk membukanya` });
      card.refs.sprite.src = asset;
      this.root.appendChild(card);
      requestAnimationFrame(() => card.classList.add('in'));
      // tunggu Enter / klik, barulah halaman ditutup dan taklimat bermula
      await this.gate(new Promise((resolve) => {
        const tutup = () => { off(); resolve(); };
        const off = this.input.push({ onKeyDown: (k) => { if (k === 'Enter' || k === ' ') { tutup(); return true; } return false; } });
        card.refs.go.addEventListener('click', tutup);
      }));
      card.classList.remove('in');
      await sleep(400);
      card.remove();
    } catch (err) {
      if (err instanceof SceneGone) throw err;      // keluar dari babak: hentikan, bukan abaikan
    }
  }

  showQuestion() {
    super.showQuestion();
    this.paintHintButton();
  }

  async hint() {
    if (this._hinting || this._briefing || !this.question) return;
    const id = this.question.questionID;
    let habisSekarang = false;
    if (!this.hintsOpened.has(id)) {                       // bisikan baharu: ambil satu daripada baki
      if (this.hintsLeft <= 0) {                           // sudah habis: Pendekar Bayang memberitahu
        await this.gate(this.dialog.say({ name: 'Pendekar Bayang', text: 'Bisikanku sudah habis. Ini ujian, percayalah pada ilmumu!', side: 'left' })).catch(() => {});
        return;
      }
      this.hintsLeft -= 1;
      this.hintsOpened.add(id);
      habisSekarang = this.hintsLeft === 0;
      this.paintHintButton();
    }
    await super.hint();                                    // membuka semula soalan yang sama tidak menolak baki
    if (habisSekarang) {                                   // itu bisikan terakhir
      await this.gate(this.dialog.say({ name: 'Pendekar Bayang', text: 'Itu bisikanku yang terakhir. Selebihnya, bergantung pada ilmumu!', side: 'left' })).catch(() => {});
    }
  }

  /** the countdown clock, mm:ss */
  tick(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');

    const clock = this.root.querySelector('.siege-timer');
    if (clock) clock.textContent = `${minutes}:${rest}`;
  }

  /** the fortress picture, its health bar and the score follow the damage done */
  updateFortress(ratio) {
    const total = this.assessment.questions.length || 1;
    const damage = Math.min(1, ratio);

    const state = FORTRESS.find((f) => damage <= f.max) || FORTRESS[FORTRESS.length - 1];
    this.root.querySelector('.siege-backdrop').style.backgroundImage = `url('../assets/gameAsset/siege/${state.img}')`;

    const left = Math.max(0, Math.round((1 - damage) * 100));
    this.root.querySelector('.hp-bar-fill').style.width = `${left}%`;
    this.root.querySelector('.siege-fort-percent').textContent = `${left}%`;
    this.root.querySelector('.siege-score').textContent = `${this.assessment.score}/${total}`;
  }

  /** the cannon fires after each answer */
  async react(ok, q) {
    this.assessment.recordAnswer(q.questionID, this.lastKey, ok);        // SummativeAssessment

    const barrel = this.root.querySelector('.cannon-barrel');
    const ball = this.root.querySelector('.cannon-ball');
    const impact = this.root.querySelector('.siege-impact');
    const total = this.assessment.questions.length;

    // fire: the barrel kicks back, the ball flies up toward the fortress, the student reacts
    this.setPose(this.studentFigure, this.playerID, ok ? 'punch' : 'block');
    barrel.classList.add('is-recoiling');
    sound.sfx('meriam');
    ball.classList.remove('hidden');
    ball.classList.add('is-flying');
    await sleep(520);

    ball.classList.add('hidden');
    ball.classList.remove('is-flying');
    barrel.classList.remove('is-recoiling');

    if (ok) {
      // hit: explosion on the fortress and the stage shakes
      impact.classList.remove('hidden');
      impact.classList.add('is-popping');
      sound.sfx('letupan');
      this.root.classList.add('is-shaking');

      this.updateFortress(this.assessment.score / total);
      await sleep(420);

      impact.classList.add('hidden');
      impact.classList.remove('is-popping');
      this.root.classList.remove('is-shaking');
    } else {
      sound.sfx('tangkis');
      this.updateFortress(this.assessment.score / total);
      await sleep(250);
    }

    this.setPose(this.studentFigure, this.playerID, 'idle');
  }

  /** Pelayan menyemak jawapan; kunci jawapan tidak pernah ada di pelayar sebelum menjawab. */
  async answer(key) {
    if (this.locked || this._asking || !this.question) return;
    this._asking = true;
    try {
      const verdict = await this.gate(this.api.siegeAnswer({ ticket: this.ticket, questionID: this.question.questionID, answer: key }));
      this.question.correctAnswer = String(verdict.correctAnswer).toUpperCase();
      this.question.explanation = verdict.explanation || this.question.explanation;
    } catch (err) {
      this._asking = false;
      if (err instanceof SceneGone) return;
      await this.gate(this.dialog.say({ name: 'Sistem', text: `Jawapan tidak dapat disemak: ${err.message}. Cuba pilih semula.`, side: 'left' })).catch(() => {});
      return;
    }
    this._asking = false;
    this.lastKey = key;
    return super.answer(key);
  }

  async afterAnswer(ok, q) {
    if (this.finished) return null;
    return super.afterAnswer(ok, q);
  }

  async finish() {
    if (this.finished) return;
    this.finished = true;
    this.assessment.stopTimer();
    this.dialog.hide();
    this.locked = true;
    let percent = this.assessment.calculateBattleScore();                 // paparan sementara; markah rasmi dari pelayan
    let saved = null; let saveIssue = '';
    try {
      saved = await this.gate(this.api.saveScore({ studentID: this.student.studentID, ticket: this.ticket }));   // saveScore()
    } catch (err) {
      if (err instanceof SceneGone) return;
      saveIssue = err.message;
    }
    if (saved && Number.isFinite(saved.score)) percent = saved.score;      // markah dikira pelayan
    const passed = saved ? saved.isCompleted : percent >= this.requiredScore;
    try {
      await this.gate(this.entity.speak(passed ? 'kepungLulus' : 'kepungGagal', { skor: `${percent}%` }, { eraID: this.eraID }));
      const marks = this.artifactScore > this.requiredScore ? `lulus ${this.requiredScore}%, artifak ${this.artifactScore}%` : `perlu ${this.requiredScore}%`;
      const sub = `Skor ${percent}% (${marks}).${saveIssue ? ` Skor tidak dapat disimpan: ${saveIssue}` : ''}`;
      if (!passed) {
        let choice = 'doors';
        await this.gate(this.banner(false, 'Kubu Masih Teguh', sub, [
          { label: '\u21BB Cuba lagi', primary: true, onClick: () => { choice = 'retry'; } },
          { label: 'Latihan dahulu', onClick: () => { choice = 'train'; } },
          { label: 'Peta', onClick: () => { choice = 'map'; } }
        ]));
        if (choice === 'retry') return this.game.go('SiegeScene', { eraID: this.eraID, trained: this.trained });
        if (choice === 'train') return this.game.go('TrainingScene', { eraID: this.eraID });
        return this.game.go('MapScene', { focusEra: this.eraID });
      }
      await this.gate(this.banner(true, 'Kubu Tewas!', sub, [{ label: 'Teruskan', primary: true }]));
      await this.afterVictory(saved);
    } catch (err) { if (!(err instanceof SceneGone)) throw err; }
  }

  async afterVictory(saved) {
    const art = saved && saved.artifact;
    if (art) {
      const item = {
        name: art.artifactName, moralLesson: art.moralLesson, isUnlocked: true,
        asset: resolveAsset(art.asset, 'artifact', '../assets/gameAsset/artifact/artifact_default.png')
      };
      await this.gate(new ShelfComponent(this.game).reveal(this.root, { kind: 'artifact', item, title: art.isNew ? 'ARTIFAK DIBUKA' : 'ARTIFAK ANDA' }));
      // the role the student played gives the moral lesson (the avatar when there is no role)
      await this.gate(this.game.roleSpeak(this.game.runStore.role(this.student.studentID, this.eraID), 2, art.moralLesson || ''));
    }
    const eras = await this.game.refreshEras();
    if (this.game.progression.allCompleted) return this.game.go('EpilogueScene');
    const next = this.game.progression.nextEra(this.eraID);
    if (next && next.status !== 'locked') return this.game.timeTravel(this.eraID, next.eraID);
    return this.game.go('MapScene', { focusEra: this.eraID, eras });
  }
}
