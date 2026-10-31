/**
 * ============================================================================
 * creditsScene.js  -  CreditsScene: the end. Who made the game, and thank you for playing.
 * The words come from creditsConfig.js. Enter / Space / Esc skips to the thank-you;
 * Enter again goes back to the desk (the hub).
 * ============================================================================
 */
import { el, esc, sleep } from './core.js';
import { GameScene } from './scenes.js';
import { CREDITS, CREDITS_SPEED } from './creditsConfig.js';

export class CreditsScene extends GameScene {
  async enter() {
    this.root.classList.add('credits');
    const sections = CREDITS.sections.map((s) => `
      <section class="cr-block">
        <h3 class="cr-heading">${esc(s.heading)}</h3>
        ${(s.lines || []).map((line) => `<p class="cr-line">${esc(line)}</p>`).join('')}
      </section>`).join('');

    this.root.innerHTML = `
      <div class="cr-bg"></div>
      <div class="cr-window"><div class="cr-roll">
        <h1 class="cr-title">${esc(CREDITS.gameTitle)}</h1>
        <p class="cr-tagline">${esc(CREDITS.tagline)}</p>
        ${sections}
      </div></div>
      <div class="cr-thanks hidden">
        ${CREDITS.thanks.map((t) => `<p>${esc(t)}</p>`).join('')}
        <button class="btn-px gold cr-back" type="button">Kembali ke meja (Enter)</button>
      </div>
      <div class="cr-skip px">Enter: langkau</div>`;

    this.finished = false;
    const roll = this.root.querySelector('.cr-roll');
    const thanks = this.root.querySelector('.cr-thanks');
    const skipHint = this.root.querySelector('.cr-skip');
    this.root.querySelector('.cr-back').addEventListener('click', () => this.leave());

    const showThanks = () => {
      if (this.finished) return;
      this.finished = true;
      if (this.anim) this.anim.cancel();
      roll.parentNode.classList.add('hidden');
      skipHint.classList.add('hidden');
      thanks.classList.remove('hidden');
    };

    this.keys({
      onKeyDown: (k) => {
        if (k === 'Enter' || k === ' ' || k === 'Escape') {
          if (this.finished) { if (k === 'Enter') this.leave(); } else showThanks();
          return true;
        }
        return false;
      }
    });

    await sleep(500);
    if (!this._alive) return;
    // the roll starts below the stage and moves up until it has left the top
    const height = roll.offsetHeight;
    const distance = 540 + height;
    this.anim = roll.animate(
      [{ transform: 'translateY(540px)' }, { transform: `translateY(${-height}px)` }],
      { duration: (distance / CREDITS_SPEED) * 1000, easing: 'linear', fill: 'forwards' });
    this.anim.onfinish = () => showThanks();
    this.own(() => { if (this.anim) this.anim.cancel(); });
  }

  async leave() {
    if (this._leaving) return;
    this._leaving = true;
    await this.game.go('HubScene', { afterEpilogue: true });
  }
}
