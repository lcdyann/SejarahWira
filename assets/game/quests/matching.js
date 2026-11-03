/**
 * assets/game/quests/matching.js  -  MatchingQuest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc, shuffle, sleep } from '../core/core.js';
import { QuestMechanic } from './base.js';

/* ========================================================================== */
/* 4. Padanan                                                                 */
/* ========================================================================== */
export class MatchingQuest extends QuestMechanic {
  constructor(quest, opts) {
    super(quest, { ...opts, maxMistakes: 3 });
    this.cards = shuffle(((quest.content && quest.content.pairs) || []).map((p, i) => ({ id: i, text: p.text, pair: String(p.pair), matched: false })));
    this.picked = [];
  }

  build() {
    this.root.classList.add('q-matching');
    // Arahan di atas meja: mana-mana dua kad boleh dipadankan, bukan hanya yang berdekatan
    this.field.innerHTML = `<div class="mt-table px">
      <p class="mt-help">Pilih <b>mana-mana dua kad</b> yang berpasangan. Kad boleh dipadankan dengan kad lain di mana-mana kedudukan (atas, bawah, kiri atau kanan), bukan hanya yang bersebelahan.</p>
      <div class="mt-grid"></div>
    </div>`;
    this.grid = this.field.querySelector('.mt-grid');
    this.cards.forEach((c) => {
      const d = el('button', 'mt-card px parchment', `<span class="mt-text">${esc(c.text)}</span>`);
      d.dataset.id = c.id;
      d.addEventListener('click', () => this.pick(c, d));
      c.el = d;
      this.grid.appendChild(d);
    });
  }

  async pick(card, node) {
    if (this.isSettled || card.matched || this.picked.includes(card) || this.picked.length >= 2) return;
    this.picked.push(card);
    node.classList.add('sel');
    if (this.picked.length < 2) return;
    const [a, b] = this.picked;
    if (a.pair === b.pair) {
      a.matched = b.matched = true;
      this.markRight();
      a.el.classList.add('ok'); b.el.classList.add('ok');
      this.picked = [];
      if (this.cards.every((c) => c.matched)) this.succeed();
    } else {
      a.el.classList.add('bad'); b.el.classList.add('bad');
      const ruined = this.registerMistake();
      await sleep(650);
      a.el.classList.remove('bad', 'sel'); b.el.classList.remove('bad', 'sel');
      this.picked = [];
      if (ruined) this.fail();
    }
  }

  applyAssist(level) {
    super.applyAssist(level);
    if (level >= 2) {                                 // lights up ONE card of an unmatched pair
      const c = this.cards.find((x) => !x.matched);
      if (c && c.el) c.el.classList.add('glow');
    }
  }
}
