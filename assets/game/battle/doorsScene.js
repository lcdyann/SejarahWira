/**
 * assets/game/battle/doorsScene.js  -  DoorsScene: choose Training or Siege
 * MODULE: battle  (Doors + Wira Training Grounds (formative) + The Great Siege (summative))
 * USE CASE: UC-05, UC-06   CLASS DIAGRAM: Assessment, FormativeAssessment, Question, AssessmentAttempt
 */
import { esc } from '../core/core.js';
import { GameScene } from '../core/scene.js';

/* ========================================================================== */
/* DoorsScene  (Gelanggang Latihan / Kepungan Agung)                          */
/*   the two big buttons show the picture of the page they open:              */
/*   see .door-training and .door-siege in assets/game/battle/battle.css     */
/* ========================================================================== */
export class DoorsScene extends GameScene {
  /** params: { eraID, first, trained, message } */
  async enter({ eraID, first = true, trained = false, message = '' } = {}) {
    this.root.classList.add('doors');
    this.eraID = eraID;
    this.trained = trained;

    const era = this.game.eraById(eraID);
    const title = message || (era ? era.eraName : '');

    this.root.innerHTML = `
      <div class="doors-backdrop"></div>
      <div class="doors-title">${esc(title)}</div>

      <div class="doors-row">
        <button class="door-button door-training" data-go="training">
          <b class="door-title">Gelanggang Latihan</b>
          <small class="door-subtitle">Tiada darah tumpah. Markah tidak disimpan.</small>
        </button>

        <button class="door-button door-siege" data-go="siege">
          <b class="door-title">Kepungan Agung</b>
          <small class="door-subtitle">Perang sebenar. Markah direkodkan.</small>
        </button>
      </div>

      <button class="btn-px small doors-back-button">Kembali ke peta (Esc)</button>`;

    this.root.querySelectorAll('.door-button').forEach((door) => {
      door.addEventListener('click', () => this.pick(door.dataset.go));
    });
    this.root.querySelector('.doors-back-button').addEventListener('click', () => this.pick('map'));

    this.keys({
      onKeyDown: (key) => {
        if (key === '1') { this.pick('training'); return true; }
        if (key === '2') { this.pick('siege'); return true; }
        if (key === 'Escape') { this.pick('map'); return true; }
        return false;
      }
    });

    if (first) await this.entity.speak('cabaran', {}, { eraID });
  }

  async pick(go) {
    if (this._picked) return;
    this._picked = true;

    if (go === 'training') {
      await this.entity.speak('latihanBuka', {}, { eraID: this.eraID });
      return this.game.go('TrainingScene', { eraID: this.eraID });
    }

    if (go === 'siege') {
      await this.entity.speak(this.trained ? 'kepungBersedia' : 'kepungSegera', {}, { eraID: this.eraID });
      return this.game.go('SiegeScene', { eraID: this.eraID, trained: this.trained });
    }

    return this.game.go('MapScene', { focusEra: this.eraID });
  }
}
