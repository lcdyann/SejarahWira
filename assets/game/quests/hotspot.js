/**
 * assets/game/quests/hotspot.js  -  HotspotQuest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc, tpl } from '../core/core.js';
import { QuestMechanic } from './base.js';

/* ========================================================================== */
/* 2. Cari Bukti                                                              */
/* ========================================================================== */
export class HotspotQuest extends QuestMechanic {
  constructor(quest, opts) {
    super(quest, { ...opts, maxMistakes: 3 });
    this.spots = ((quest.content && quest.content.hotspots) || []).map((h) => ({
      name: h.name, x: parseFloat(h.left), y: parseFloat(h.top), found: false
    }));
  }

  build() {
    this.root.classList.add('q-hotspot');
    const bg = (this.content && this.content.bgImage) || this.background || '';
    // Susun atur: <template id="tpl-hotspot"> dalam assets/game/quests/quests.html
    const box = tpl('hotspot');
    this.field.appendChild(box);
    // kotak arahan duduk dalam bar atas (antara tajuk dan titisan) supaya gambar tidak ditindih
    this.root.querySelector('.quest-top').insertBefore(box.refs.note, this.inkEl);
    this.scene = box.refs.scene;
    this.scene.style.backgroundImage = `url('${bg}')`;
    this.side = box.refs.side;
    this.slotsEl = box.refs.slots;
    this.countEl = box.refs.count;
    this.scene.addEventListener('click', (e) => this.onClick(e));
    // butang buka / tutup panel bukti (panel ditutup = seluruh gambar kelihatan)
    box.refs.toggle.addEventListener('click', () => {
      const closed = this.side.classList.toggle('closed');
      box.refs.toggle.textContent = closed ? '◀' : '▶';
    });
    this.paintTray();
  }

  /** @param {object} [baru] bukti yang baru dijumpai (slotnya bercahaya sebentar) */
  paintTray(baru = null) {
    this.slotsEl.innerHTML = this.spots
      .map((s) => `<li class="hs-slot${s.found ? ' found' : ''}${s === baru ? ' just-found' : ''}">${s.found ? esc(s.name) : '???'}</li>`).join('');
    this.countEl.textContent = `${this.spots.filter((s) => s.found).length}/${this.spots.length}`;
  }

  onClick(e) {
    if (this.isSettled || this.celebrating) return;     // semasa senarai bukti bercahaya, klik tidak dikira
    if (e.target.closest('.hs-found')) return;        // klik pada penanda bukti yang sudah dijumpai tidak dikira
    const r = this.scene.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    // distances in stage pixels (the scene is 960x540)
    const dist = (s) => Math.hypot(((px - s.x) / 100) * 960, ((py - s.y) / 100) * 540);
    const open = this.spots.filter((s) => !s.found);
    const near = open.find((s) => dist(s) <= 38);
    this.ripple(px, py, !!near);
    if (near) {
      near.found = true;
      this.markRight();
      const mark = el('div', 'hs-found');
      mark.style.left = `${near.x}%`;
      mark.style.top = `${near.y}%`;
      const no = this.spots.indexOf(near) + 1;           // nombor padan dengan senarai di panel kanan
      mark.innerHTML = `<b>${no}</b><span>${esc(near.name)}</span>`;
      this.scene.appendChild(mark);
      this.paintTray(near);
      if (this.spots.every((s) => s.found)) this.celebrate();
    } else if (!open.some((s) => dist(s) <= 80)) {      // a click close to evidence is forgiven
      if (this.registerMistake()) this.fail();
    }
  }

  /**
   * Semua bukti dijumpai: buka panel bukti dan biarkan senarai bercahaya ±4.5 saat
   * supaya pelajar sempat membaca setiap bukti, barulah quest diselesaikan (dialog seterusnya).
   */
  async celebrate() {
    this.celebrating = true;
    this.side.classList.remove('closed');                 // pastikan senarai kelihatan
    this.side.classList.add('all-found');                 // cahaya (lihat .hs-side.all-found dalam quests/quests.css)
    await new Promise((resolve) => setTimeout(resolve, 4500));
    this.side.classList.remove('all-found');
    this.succeed();
  }

  ripple(px, py, good) {
    const r = el('div', `hs-ripple${good ? ' good' : ''}`);
    r.style.left = `${px}%`; r.style.top = `${py}%`;
    this.scene.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  applyAssist(level) {
    super.applyAssist(level);
    if (level >= 2) {                                 // a wide glow around one hidden item
      const s = this.spots.find((x) => !x.found);
      if (s && this.scene) {
        const g = el('div', 'hs-radar');
        g.style.left = `${s.x + (Math.random() * 4 - 2)}%`;
        g.style.top = `${s.y + (Math.random() * 6 - 3)}%`;
        this.scene.appendChild(g);
      }
    }
  }
}
