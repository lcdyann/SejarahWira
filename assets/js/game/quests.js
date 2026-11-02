/**
 * ============================================================================
 * quests.js  -  the five quest mechanics, all full screen
 *
 *   QuestMechanic                 (abstract base: lifecycle, mistakes, assists)
 *     TimelineQuest   type 1      Susun Garis Masa  (chain of cause and effect, dates hidden)
 *     HotspotQuest    type 2      Cari Bukti        (search the picture)
 *     ChoiceQuest     (base)      options as an RPG menu next to a visual
 *       HelpCharacterQuest type 3 Bantu NPC
 *       DecodeClueQuest    type 5 Nyahkod Clue
 *     MatchingQuest   type 4      Padanan
 *
 * Contract used by MissionScene:
 *     const m = QuestMechanic.create(quest, { background });
 *     const result = await m.play(container);   // { ok: true } or { ok: false }
 *     m.applyAssist(level)                       // 2 = a clearer clue (never the answer)
 *     m.destroy()
 *
 * A wrong action never saves anything. Mistake limits: Timeline 3, Choice 1,
 * Hotspot 3, Matching 3 (the "ink drops").
 * ============================================================================
 */
import { el, esc, shuffle, sleep, tpl } from './core.js';
import { sound } from './sound.js';

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

  /** Factory: pick the mechanic from Quest.questType. */
  static create(quest, opts = {}) {
    switch (Number(quest.questType)) {
      case 1: return new TimelineQuest(quest, opts);
      case 2: return new HotspotQuest(quest, opts);
      case 3: return new HelpCharacterQuest(quest, opts);
      case 4: return new MatchingQuest(quest, opts);
      case 5: return new DecodeClueQuest(quest, opts);
      default: throw new Error(`Jenis misi ${quest.questType} tidak disokong.`);
    }
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
    return new Promise((resolve) => { this.#resolve = resolve; });
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
    this.root.classList.add('done');
    await sleep(700);
    this.#resolve({ ok: true });
  }

  /** @param {string} [consequence] what happens in the story for THIS mistake (falls back to the quest's "akibat") */
  async fail(consequence = '') {
    if (this.#settled) return;
    this.#settled = true;
    this.root.classList.add('ruined');
    await sleep(900);
    this.#resolve({ ok: false, aftermath: consequence || this.content.aftermath || '' });
  }

  destroy() { this.root.remove(); }
}

/* ========================================================================== */
/* 1. Susun Garis Masa  ->  "Rantaian Sebab dan Akibat"                       */
/*   The dates are HIDDEN. The student must know WHAT happens next, one link  */
/*   at a time. A right card locks in, its date is stamped on, and the        */
/*   teacher's "why" line explains the link. A wrong card breaks the chain    */
/*   (a drop of water). "Intai tarikh" shows the YEARS ON THE SLOTS (never on  */
/*   the cards), so the student must read each card to match it to a year.    */
/* ========================================================================== */
export class TimelineQuest extends QuestMechanic {
  constructor(quest, opts) {
    super(quest, { ...opts, maxMistakes: 3 });
    const items = (quest.content && quest.content.timelineItems) || [];
    this.correct = [...items].sort((a, b) => Number(a.id) - Number(b.id));
    let order = shuffle(items);
    for (let t = 0; t < 6 && order.every((it, i) => it.id === this.correct[i].id); t++) order = shuffle(items);
    this.tray = order;
    this.slots = new Array(items.length).fill(null);   // locked cards, in order
    this.selected = null;
    this.peeked = false;
    this.link = '';
    this.justLocked = null;
  }

  /** index of the next open link of the chain */
  get next() { return this.slots.findIndex((s) => s === null); }

  build() {
    this.root.classList.add('q-timeline');
    this.field.innerHTML = `
      <div class="tl-board px parchment">
        <div class="tl-rope"></div>
        <div class="tl-slots"></div>
      </div>
      <div class="tl-tray"></div>
      <div class="tl-link px" aria-live="polite">
        <button type="button" class="tl-link-toggle" title="Sembunyikan / tunjuk petunjuk">▼ Sembunyi</button>
        <span class="tl-link-text"></span>
      </div>`;
    this.peekBtn = el('button', 'btn-px small tl-peek', '\u{1F50D} Tunjuk tarikh pada petak (\u22121 titisan)');
    this.peekBtn.type = 'button';
    const top = this.root.querySelector('.quest-top');
    top.insertBefore(this.peekBtn, this.inkEl);
    this.slotsEl = this.field.querySelector('.tl-slots');
    this.trayEl = this.field.querySelector('.tl-tray');
    this.linkEl = this.field.querySelector('.tl-link');
    this.linkText = this.field.querySelector('.tl-link-text');      // teks petunjuk sahaja (butang kekal)
    this.linkToggle = this.field.querySelector('.tl-link-toggle');
    // butang sembunyi / tunjuk: kotak petunjuk menutup kad jika terlalu banyak, jadi murid boleh sembunyikannya
    this.linkToggle.addEventListener('click', () => {
      const closed = this.linkEl.classList.toggle('closed');
      this.linkEl.classList.remove('has-new');
      this.linkToggle.textContent = closed ? '\u{1F4AC} Petunjuk' : '\u25BC Sembunyi';
    });
    this.peekBtn.addEventListener('click', () => this.peek());
    this.paint();
  }

  card(item, where, locked) {
    const showDate = locked;                         // kad tidak pernah menunjukkan tarikh sebelum dikunci (elak menyusun nombor sahaja)
    const c = el('div', `seal-card${this.selected === item.id ? ' sel' : ''}${this.clueId === item.id ? ' clue' : ''}${locked ? ' locked' : ''}`);
    c.draggable = !locked;
    c.dataset.id = item.id;
    const year = showDate ? esc(item.year || '') : '?';
    c.innerHTML = `<span class="wax"></span><div class="sc-year${showDate ? '' : ' hidden-date'}${this.justLocked === item.id ? ' stamp-in' : ''}">${year}</div><div class="sc-text">${esc(item.text)}</div>`;
    if (!locked) {
      c.addEventListener('click', (e) => { e.stopPropagation(); this.onCard(item); });
      c.addEventListener('dragstart', (e) => { this.selected = item.id; try { e.dataTransfer.setData('text/plain', String(item.id)); } catch { /* ignore */ } });
    }
    return c;
  }

  onCard(item) {
    if (this.isSettled) return;
    this.selected = this.selected === item.id ? null : item.id;
    this.paint();
  }

  /** the student tries the selected card as the next link of the chain */
  place(slotIdx) {
    if (this.isSettled || this.selected === null || slotIdx !== this.next) return;
    const item = this.tray.find((t) => t.id === this.selected);
    if (!item) return;
    const slot = this.slotsEl.children[slotIdx];
    if (Number(item.id) === Number(this.correct[slotIdx].id)) {
      this.tray = this.tray.filter((t) => t.id !== item.id);
      this.slots[slotIdx] = item;
      this.markRight();
      this.selected = null;
      this.justLocked = item.id;
      this.link = String(item.why || '').trim();
      this.paint();
      if (this.next === -1) {
        this.root.classList.add('chain-done');
        sleep(1400).then(() => this.succeed());           // time to read the last link
      }
      return;
    }
    // wrong: the chain breaks here
    const prev = slotIdx > 0 ? this.slots[slotIdx - 1] : null;
    this.link = prev
      ? `Pautan putus. Apa yang berlaku selepas: ${prev.text}?`
      : 'Pautan putus. Peristiwa manakah yang bermula dahulu?';
    this.selected = null;
    if (slot) { slot.classList.add('bad'); setTimeout(() => slot.classList.remove('bad'), 500); }
    this.justLocked = null;
    const ruined = this.registerMistake();
    this.paint();
    if (ruined) this.fail();
  }

  /** costs one drop of water; the remaining chance is never spent by peeking */
  peek() {
    if (this.isSettled || this.peeked || this.mistakes + 1 >= this.maxMistakes) return;
    this.registerMistake(true);                       // intai: kos titisan sahaja, bukan bunyi salah
    this.peeked = true;
    this.paint();
  }

  paint() {
    const n = this.next;
    this.slotsEl.innerHTML = '';
    this.slots.forEach((it, i) => {
      const s = el('div', `tl-slot${it ? ' filled' : ''}${i === n ? ' next' : ''}`);
      s.dataset.slot = i;
      s.innerHTML = `<span class="tl-no">${i + 1}</span>`;
      // Selepas "Intai tarikh": tahun dipaparkan pada PETAK kosong, bukan pada kad
      const year = this.correct[i] && String(this.correct[i].year || '').trim();
      if (!it && this.peeked && year) s.innerHTML += `<span class="tl-slot-year">${esc(year)}</span>`;
      if (it) s.appendChild(this.card(it, 'slot', true));
      s.addEventListener('click', () => this.place(i));
      s.addEventListener('dragover', (e) => e.preventDefault());
      s.addEventListener('drop', (e) => { e.preventDefault(); this.place(i); });
      this.slotsEl.appendChild(s);
    });
    this.trayEl.innerHTML = '';
    this.tray.forEach((it) => this.trayEl.appendChild(this.card(it, 'tray', false)));
    const before = this.linkText.textContent;
    this.linkEl.classList.toggle('empty', !this.link);
    if (this.link) {
      const broken = this.link.startsWith('Pautan putus');
      this.linkEl.classList.toggle('broken', broken);
      this.linkText.textContent = broken ? this.link : `\u21B3 ${this.link}`;
    } else {
      this.linkEl.classList.remove('broken');
      this.linkText.textContent = n === 0 ? 'Mana satu bermula dahulu? Pilih kad, kemudian letakkannya pada petak yang bersinar.' : '';
      this.linkEl.classList.toggle('empty', !this.linkText.textContent);
    }
    // petunjuk baharu semasa kotak disembunyikan: butang berdenyut supaya murid tahu
    if (this.linkText.textContent && this.linkText.textContent !== before && this.linkEl.classList.contains('closed')) {
      this.linkEl.classList.add('has-new');
    }
    this.peekBtn.disabled = this.peeked || this.isSettled || this.mistakes + 1 >= this.maxMistakes;
    this.peekBtn.classList.toggle('hidden', this.peeked);
  }

  applyAssist(level) {
    super.applyAssist(level);
    if (level >= 2 && this.correct.length) {          // a clearer clue: slot years shown free + a star on the NEXT event
      this.peeked = true;
      const n = this.next;
      if (n >= 0) this.clueId = this.correct[n].id;
      if (this.slotsEl) this.paint();
    }
  }
}

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
    // Susun atur: <template id="tpl-hotspot"> dalam assets/html/templates.html
    const box = tpl('hotspot');
    this.field.appendChild(box);
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
    this.side.classList.add('all-found');                 // cahaya (lihat .hs-side.all-found dalam game.css)
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

/* ========================================================================== */
/* 3. Bantu NPC  (dahulu "Bantu Tokoh")                                       */
/*   Seorang NPC (watak LAIN, bukan peranan kita) sedang menghadapi masalah.  */
/*   Masalahnya ditunjuk dalam gelembung fikiran. Pemain MEMBERI satu BENDA   */
/*   (surat, peta, kaset lagu, telegram...) daripada kad bantuan.            */
/*   Beza dengan Giliran Anda: di sana peranan kita BERCAKAP; di sini kita    */
/*   menghulurkan benda kepada NPC.                                           */
/*                                                                            */
/*   questContent:                                                            */
/*     { npcName, prompt, options:[{ text, item, isCorrect, consequence }] }   */
/*   item (pilihan): kaset | surat | peta | telegram | dokumen | gambar | buku */
/* ========================================================================== */
export class HelpCharacterQuest extends ChoiceQuest {
  get promptText() { return (this.content && this.content.prompt) || ''; }
  get npcName() { return (this.content && this.content.npcName) || 'Watak itu'; }

  build() {
    this.root.classList.add('q-choice', 'q-help');

    // ---- susunan paparan (HTML dahulu, logik di bawah) ----
    this.field.innerHTML = `
      <div class="cq-visual help-visual">
        <div class="help-bubble px">
          <div class="help-bubble-title">${esc(this.npcName)} sedang berfikir...</div>
          <div class="help-bubble-text">${esc(this.promptText)}</div>
        </div>
        <div class="help-bubble-tail"></div>
        <div class="help-give">Beri benda yang betul kepada ${esc(this.npcName)}</div>
      </div>
      <div class="cq-menu help-menu px">
        <div class="cq-menu-title">KAD BANTUAN</div>
        <div class="cq-list"></div>
      </div>`;

    if (this.background) this.field.querySelector('.help-visual').style.backgroundImage = `url('${this.background}')`;
    this.listEl = this.field.querySelector('.cq-list');

    // ---- setiap pilihan ialah satu kad benda ----
    this.options.forEach((o, i) => {
      const jenis = o.item || 'dokumen';
      const kad = el('button', `help-card item-${jenis}`,
        `<span class="key">${i + 1}</span>
         <span class="help-icon">${this._ikon(jenis)}</span>
         <span class="opt-text">${esc(o.text)}</span>`);
      kad.addEventListener('click', () => this.choose(i));
      this.listEl.appendChild(kad);
    });

    this.unbind = this._keys();       // kekunci 1, 2, 3... masih berfungsi
  }

  /** ikon benda: kaset dilukis dengan CSS, yang lain guna emoji */
  _ikon(jenis) {
    if (jenis === 'kaset') return '<span class="kaset"><i></i><i></i></span>';
    const emoji = { surat: '✉️', peta: '🗺️', telegram: '📜', dokumen: '📄', gambar: '🖼️', buku: '📖' };
    return emoji[jenis] || '📄';
  }

  /** kad "dihulurkan" kepada NPC, kemudian betul/salah dinilai seperti biasa */
  choose(i) {
    if (this.isSettled || this.struck.has(i)) return;
    this.listEl.children[i].classList.add('diberi');
    super.choose(i);
  }
}

/* ========================================================================== */
/* 5. Nyahkod Petunjuk                                                        */
/*   Kertas lama ditulis dalam KOD (simbol). Pemain melihat teks "dinyahkod"  */
/*   perkataan demi perkataan. Selepas itu pemain TEMPEL satu nota lekat pada */
/*   ruang "Petunjuk ini menunjuk kepada: ?" sebagai jawapan.                */
/*   Logik betul/salah masih daripada ChoiceQuest (hanya paparan yang lain).  */
/* ========================================================================== */
export class DecodeClueQuest extends ChoiceQuest {
  get promptText() { return (this.content && this.content.clueText) || ''; }

  build() {
    this.root.classList.add('q-choice', 'q-decode');

    // ---- susunan paparan (HTML dahulu, logik di bawah) ----
    this.field.innerHTML = `
      <div class="cq-visual decode-visual">
        <div class="clue-paper parchment px">
          <div class="clue-stamp">PETUNJUK</div>
          <div class="clue-text" title="Klik untuk nyahkod segera"></div>
          <div class="clue-point">
            <span class="clue-point-label">Petunjuk ini menunjuk kepada:</span>
            <span class="clue-slot">?</span>
          </div>
        </div>
        <div class="clue-hint">Klik kertas untuk nyahkod segera</div>
      </div>
      <div class="cq-menu cork px">
        <div class="cq-menu-title">TEMPEL JAWAPAN</div>
        <div class="cq-list"></div>
      </div>`;

    this.textEl = this.field.querySelector('.clue-text');
    this.slotEl = this.field.querySelector('.clue-slot');
    this.listEl = this.field.querySelector('.cq-list');

    // ---- setiap pilihan ialah satu nota lekat (warna berselang-seli) ----
    this.options.forEach((o, i) => {
      const nota = el('button', `note-opt note-${i % 5}`, `<span class="key">${i + 1}</span><span class="opt-text">${esc(o.text)}</span>`);
      nota.addEventListener('click', () => this.choose(i));
      this.listEl.appendChild(nota);
    });

    this.unbind = this._keys();       // kekunci 1, 2, 3... masih berfungsi
    this._muatFont();
    this._mulaNyahkod();
  }

  /** font tulisan tangan (dimuat sekali sahaja; jika gagal, font cursive sistem digunakan) */
  _muatFont() {
    if (document.getElementById('font-tulisan-tangan')) return;
    const pautan = document.createElement('link');
    pautan.id = 'font-tulisan-tangan';
    pautan.rel = 'stylesheet';
    pautan.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap';
    document.head.appendChild(pautan);
  }

  /** teks bermula sebagai simbol, lalu dinyahkod satu perkataan setiap detik kecil */
  _mulaNyahkod() {
    const SIMBOL = '◆◇✶✷※§¤ᚠᚢᚦᚱᚲᛉ';
    const kod = (panjang) => Array.from({ length: panjang }, () => SIMBOL[Math.floor(Math.random() * SIMBOL.length)]).join('');

    this.kata = this.promptText.split(/\s+/).filter(Boolean);
    this.textEl.innerHTML = this.kata.map(() => '<span class="w kod"></span>').join(' ');
    this.spans = [...this.textEl.querySelectorAll('.w')];
    this.spans.forEach((s, i) => { s.textContent = kod(this.kata[i].length); });
    this.dibuka = 0;                                  // bilangan perkataan yang sudah dinyahkod

    // pengguna yang tidak suka gerakan: terus tunjuk teks penuh
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this._lengkapSegera(); return; }

    this.textEl.addEventListener('click', () => this._lengkapSegera());
    const jeda = Math.max(25, Math.min(90, 2600 / Math.max(1, this.kata.length)));
    this.pemasa = setInterval(() => {
      // perkataan yang belum dinyahkod terus bertukar simbol (nampak seperti sedang diproses)
      for (let j = this.dibuka + 1; j < this.spans.length; j++) this.spans[j].textContent = kod(this.kata[j].length);
      if (this.dibuka > 0) this.spans[this.dibuka - 1].classList.remove('kini');
      if (this.dibuka >= this.spans.length) { clearInterval(this.pemasa); return; }
      const s = this.spans[this.dibuka];
      s.textContent = this.kata[this.dibuka];
      s.classList.remove('kod');
      s.classList.add('terbuka', 'kini');
      this.dibuka += 1;
    }, jeda);
  }

  /** tunjuk semua teks serta-merta */
  _lengkapSegera() {
    if (this.pemasa) clearInterval(this.pemasa);
    this.spans.forEach((s, i) => { s.textContent = this.kata[i]; s.classList.remove('kod', 'kini'); });
    this.dibuka = this.spans.length;
  }

  /** pilihan yang dipilih "ditempel" pada ruang petunjuk, kemudian betul/salah dinilai seperti biasa */
  choose(i) {
    if (this.isSettled || this.struck.has(i)) return;
    this._lengkapSegera();
    this.slotEl.textContent = this.options[i].text;
    this.slotEl.className = `clue-slot filled note-${i % 5}`;
    super.choose(i);
  }

  destroy() {
    if (this.pemasa) clearInterval(this.pemasa);
    super.destroy();
  }
}

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