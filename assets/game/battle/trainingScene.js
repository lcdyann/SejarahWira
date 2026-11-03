/**
 * assets/game/battle/trainingScene.js  -  TrainingScene (formative)
 * MODULE: battle  (Doors + Wira Training Grounds (formative) + The Great Siege (summative))
 * USE CASE: UC-05, UC-06   CLASS DIAGRAM: Assessment, FormativeAssessment, Question, AssessmentAttempt
 */
import { BattleScene, randomOpponent } from './battleScene.js';
import { esc, sleep } from '../core/core.js';
import { FormativeAssessment } from '../core/domain.js';
import { SceneGone } from '../core/scene.js';
import { sound } from '../core/sound.js';

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
