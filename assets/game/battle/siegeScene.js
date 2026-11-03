/**
 * assets/game/battle/siegeScene.js  -  SiegeScene (summative)
 * MODULE: battle  (Doors + Wira Training Grounds (formative) + The Great Siege (summative))
 * USE CASE: UC-05, UC-06   CLASS DIAGRAM: Assessment, FormativeAssessment, Question, AssessmentAttempt
 */
import { BattleScene } from './battleScene.js';
import { ShelfComponent } from '../collection/shelf.js';
import { sleep, tpl } from '../core/core.js';
import { SummativeAssessment, resolveAsset } from '../core/domain.js';
import { SceneGone } from '../core/scene.js';
import { sound } from '../core/sound.js';

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
