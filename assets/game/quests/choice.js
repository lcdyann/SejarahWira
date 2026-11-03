/**
 * assets/game/quests/choice.js  -  ChoiceQuest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc, shuffle } from '../core/core.js';
import { QuestMechanic } from './base.js';

/* ========================================================================== */
/* 3 + 5. Choice quests (RPG menu)                                            */
/* ========================================================================== */
export class ChoiceQuest extends QuestMechanic {
  constructor(quest, opts) {
    super(quest, { ...opts, maxMistakes: 1 });
    this.options = shuffle((quest.content && quest.content.options) || []);
    this.struck = new Set();
  }

  /** subclasses: the text shown in the visual */
  get promptText() { return ''; }
  /** subclasses: draw the visual area */
  buildVisual(visual) { visual.innerHTML = `<div class="cq-prompt px parchment">${esc(this.promptText)}</div>`; }

  build() {
    this.root.classList.add('q-choice');
    this.field.innerHTML = '<div class="cq-visual"></div><div class="cq-menu px"><div class="cq-menu-title">PILIH TINDAKAN</div><div class="cq-list"></div></div>';
    this.buildVisual(this.field.querySelector('.cq-visual'));
    this.listEl = this.field.querySelector('.cq-list');
    this.options.forEach((o, i) => {
      const b = el('button', 'btn-px menu-opt', `<span class="key">${i + 1}</span><span class="opt-text">${esc(o.text)}</span>`);
      b.addEventListener('click', () => this.choose(i));
      this.listEl.appendChild(b);
    });
    this.unbind = this._keys();
  }

  _keys() {
    const fn = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= this.options.length && !this.isSettled && !document.querySelector('.dlg:not(.hidden)')) this.choose(n - 1);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }

  choose(i) {
    if (this.isSettled || this.struck.has(i)) return;
    const o = this.options[i];
    const btn = this.listEl.children[i];
    if (o.isCorrect) { btn.classList.add('right'); this.markRight(); this.succeed(); }
    else { btn.classList.add('wrong'); this.registerMistake(); this.fail(o.consequence); }
  }

  applyAssist(level) {
    super.applyAssist(level);
    if (level >= 2 && this.listEl) {                  // strikes out ONE wrong option
      const idx = this.options.findIndex((o, i) => !o.isCorrect && !this.struck.has(i));
      if (idx >= 0) { this.struck.add(idx); this.listEl.children[idx].classList.add('struck'); this.listEl.children[idx].disabled = true; }
    }
  }

  destroy() { if (this.unbind) this.unbind(); super.destroy(); }
}
