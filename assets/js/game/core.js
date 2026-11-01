/**
 * ============================================================================
 * core.js  -  the game engine's building blocks (M0)
 *   Stage          fixed 960x540 stage scaled to the window (fullscreen friendly)
 *   Input          keyboard stack: the top handler gets the keys
 *   DialogueBox    pixel dialogue box with typewriter, portrait and choices
 *   Transition     fade, soul-pull (between scenes), time machine (between eras)
 *   helpers        el(), sleep(), shuffle(), esc()
 * Plain JavaScript, no libraries.
 * ============================================================================
 */
import { sound } from './sound.js';

export const W = 960;
export const H = 540;

export const el = (tag, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/* ========================================================================== */
/* TEMPLAT HTML                                                               */
/* Susun atur kotak-kotak permainan dibaca daripada assets/html/templates.html */
/* (sekali sahaja semasa fail ini dimuatkan).                                  */
/* ========================================================================== */
const TEMPLATE_URL = new URL('../../html/templates.html', import.meta.url);
const templateDoc = await fetch(TEMPLATE_URL)
  .then((r) => {
    if (!r.ok) throw new Error(`Templat tidak ditemui (${r.status}): ${TEMPLATE_URL.pathname}`);
    return r.text();
  })
  .then((text) => new DOMParser().parseFromString(text, 'text/html'));

/**
 * tpl('dialogue', { title: '...' })
 *   - menyalin <template id="tpl-dialogue"> dan memulangkan elemen utamanya
 *   - [data-text="kunci"]  diisi dengan teks (textContent, selamat)
 *   - [data-ref="nama"]    boleh dicapai melalui  elemen.refs.nama
 */
export function tpl(name, text = {}) {
  const t = templateDoc.getElementById(`tpl-${name}`);
  if (!t) throw new Error(`Templat tiada: tpl-${name}`);
  const root = document.importNode(t.content, true).firstElementChild;
  root.refs = {};
  root.querySelectorAll('[data-ref]').forEach((n) => { root.refs[n.dataset.ref] = n; });
  root.querySelectorAll('[data-text]').forEach((n) => { n.textContent = text[n.dataset.text] ?? ''; });
  return root;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Escape text before it is put into innerHTML (teacher text is shown to students). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ========================================================================== */
/* Stage                                                                      */
/* ========================================================================== */
export class Stage {
  constructor(root) {
    this.root = root;
    this.root.classList.add('game-root');
    this.frame = el('div', 'stage');
    this.sceneLayer = el('div', 'layer layer-scene');
    this.dialogLayer = el('div', 'layer layer-dialog');
    this.modalLayer = el('div', 'layer layer-modal');
    this.transitLayer = el('div', 'layer layer-transit');
    this.frame.append(this.sceneLayer, this.dialogLayer, this.modalLayer, this.transitLayer);
    this.root.appendChild(this.frame);
    this.scale = 1;
    this._onResize = () => this.fit();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('fullscreenchange', this._onResize);
    this.fit();
  }

  fit() {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.scale = Math.min(w / W, h / H);
    this.frame.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
  }

  /** Convert a mouse event to stage coordinates (960x540). */
  toStage(ev) {
    const r = this.frame.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / this.scale, y: (ev.clientY - r.top) / this.scale };
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.root.requestFullscreen();
    } catch { /* fullscreen refused: ignore */ }
  }

  get isFullscreen() { return !!document.fullscreenElement; }
}

/* ========================================================================== */
/* Input                                                                      */
/* ========================================================================== */
export class Input {
  constructor() {
    this.stack = [];          // [{ id, onKeyDown, onKeyUp }]
    this.global = {};         // keys that always work (e.g. f = fullscreen)
    this.down = new Set();
    this._seq = 0;
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.down.clear());
  }

  _norm(e) {
    const k = e.key;
    return k.length === 1 ? k.toLowerCase() : k;
  }

  _key(e, isDown) {
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const k = this._norm(e);
    if (isDown) this.down.add(k); else this.down.delete(k);
    if (isDown && !e.repeat && this.global[k]) { this.global[k](e); return; }
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    const fn = isDown ? top.onKeyDown : top.onKeyUp;
    if (fn) {
      const used = fn(k, e);
      if (used !== false && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Escape', 'Tab'].includes(k)) e.preventDefault();
    }
  }

  /** push a handler; returns a function that removes it. */
  push(handlers) {
    const entry = { id: ++this._seq, ...handlers };
    this.stack.push(entry);
    return () => { this.stack = this.stack.filter((h) => h.id !== entry.id); };
  }

  isDown(...keys) { return keys.some((k) => this.down.has(k)); }
}

/* ========================================================================== */
/* DialogueBox                                                                */
/* ========================================================================== */
/**
 * Cut a long text into pages for the dialogue box. Pages end at a sentence end when they can;
 * a sentence longer than one page is cut at a space. A short text stays one page.
 */
export const DIALOG_PAGE_CHARS = 150;
export function paginateText(text, max = DIALOG_PAGE_CHARS) {
  const full = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (full.length <= max) return [String(text ?? '')];
  const sentences = full.match(/[^.!?\u2026]+[.!?\u2026]+["')\]]*\s*|[^.!?\u2026]+$/g) || [full];
  const pages = [];
  let cur = '';
  const flush = () => { if (cur) pages.push(cur); cur = ''; };
  sentences.forEach((raw) => {
    const sentence = raw.trim();
    if (!sentence) return;
    if (sentence.length > max) {                         // one very long sentence: cut at spaces
      flush();
      let part = '';
      sentence.split(' ').forEach((word) => {
        if ((`${part} ${word}`).trim().length > max) { pages.push(part); part = word; } else part = `${part} ${word}`.trim();
      });
      cur = part;
      return;
    }
    if ((`${cur} ${sentence}`).trim().length <= max) cur = `${cur} ${sentence}`.trim();
    else { flush(); cur = sentence; }
  });
  flush();
  return pages.length ? pages : [full];
}

export class DialogueBox {
  /**
   * @param {Stage} stage
   * @param {Input} input
   */
  constructor(stage, input) {
    this.stage = stage;
    this.input = input;
    this.speed = 22;                 // ms per character
    // Susun atur kotak dialog: lihat <template id="tpl-dialogue"> dalam assets/html/templates.html
    this.root = tpl('dialogue');
    ({ portrait: this.portrait, mePortrait: this.mePortrait, panel: this.panel,
       name: this.name, text: this.text, more: this.more, choices: this.choices } = this.root.refs);
    stage.dialogLayer.appendChild(this.root);
    this._current = null;
  }

  /**
   * Show one line. Resolves when the player advances (Enter / Space / click).
   * A long text is cut into pages (at sentence ends where possible) and the pages follow each
   * other, so a long moral lesson never overflows the box. Resolves after the last page.
   * @param {{name?:string, text:string, portrait?:HTMLElement|null, side?:'left'|'right', tone?:string}} line
   */
  async say(line) {
    const pages = paginateText(line.text);
    for (let i = 0; i < pages.length; i += 1) {
      await this._sayPage({ ...line, text: pages[i] }, pages.length > 1 ? `${i + 1}/${pages.length}` : '');
    }
  }

  _sayPage({ name = '', text, portrait = null, side = 'left', tone = '' }, pageNote = '') {
    return new Promise((resolve) => {
      this.root.classList.remove('hidden');
      this.root.dataset.side = side;
      this.root.dataset.tone = tone;
      delete this.root.dataset.turn;
      this.mePortrait.innerHTML = '';
      this.choices.innerHTML = '';
      this.name.textContent = name;
      this.name.style.display = name ? '' : 'none';
      this.portrait.innerHTML = '';
      this.portrait.style.display = portrait ? '' : 'none';
      if (portrait) this.portrait.appendChild(portrait);
      this.text.textContent = '';
      this.more.style.visibility = 'hidden';
      this.more.textContent = pageNote ? `${pageNote} \u25BC` : '\u25BC';

      const full = String(text ?? '');
      let i = 0;
      let typing = true;
      let timer = null;
      const finishTyping = () => {
        clearInterval(timer);
        typing = false;
        sound.talkStop();                                  // teks sudah habis ditaip: bunyi bercakap berhenti
        this.text.textContent = full;
        this.more.style.visibility = 'visible';
      };
      if (full) sound.talkStart();                         // dialog dibuka: bunyi bercakap bermula
      timer = setInterval(() => {
        i += 1;
        this.text.textContent = full.slice(0, i);
        if (i >= full.length) finishTyping();
      }, this.speed);
      if (!full) finishTyping();

      const advance = () => {
        if (typing) { finishTyping(); return; }
        cleanup();
        resolve();
      };
      const onClick = () => advance();
      this.panel.addEventListener('click', onClick);
      const pop = this.input.push({
        onKeyDown: (k) => {
          if (k === 'Enter' || k === ' ') { advance(); return true; }
          // a scene may ask for Escape while a line is showing (the prologue uses it to skip)
          if (k === 'Escape' && this.onEscape) return this.onEscape();
          return false;
        }
      });
      const cleanup = () => {
        clearInterval(timer);
        sound.talkStop();
        this.panel.removeEventListener('click', onClick);
        pop();
        this._current = null;
      };
      this._current = { skip: () => { cleanup(); resolve(); } };
    });
  }

  /** Show a line then a list of choices (keys 1-5 or click). Resolves with the chosen index. */
  ask({ name = '', text, portrait = null, side = 'left', options, mePortrait = null }) {
    return new Promise((resolve) => {
      this.root.classList.remove('hidden');
      this.root.dataset.side = side;
      this.root.dataset.tone = '';
      this.mePortrait.innerHTML = '';
      if (mePortrait) { this.root.dataset.turn = '1'; this.mePortrait.appendChild(mePortrait); } else delete this.root.dataset.turn;
      this.name.textContent = name;
      this.name.style.display = name ? '' : 'none';
      this.portrait.innerHTML = '';
      this.portrait.style.display = portrait ? '' : 'none';
      if (portrait) this.portrait.appendChild(portrait);
      this.text.textContent = text;
      this.more.style.visibility = 'hidden';
      this.choices.innerHTML = '';
      sound.talkStop();                                    // menunggu pilihan murid: TIADA bunyi bercakap
      const choose = (idx) => { pop(); this.choices.innerHTML = ''; resolve(idx); };   // bunyi bercakap bermula hanya bila jawapan dipilih dan say() menaip teksnya
      options.forEach((label, idx) => {
        const b = el('button', 'btn-px small', `<span class="key">${idx + 1}</span> ${esc(label)}`);
        b.addEventListener('click', () => choose(idx));
        this.choices.appendChild(b);
      });
      const pop = this.input.push({
        onKeyDown: (k) => {
          const n = Number(k);
          if (n >= 1 && n <= options.length) { choose(n - 1); return true; }
          return false;
        }
      });
    });
  }

  hide() {
    sound.talkStop();
    if (this._current) this._current.skip();
    this.root.classList.add('hidden');
    delete this.root.dataset.turn;
    this.mePortrait.innerHTML = '';
    this.choices.innerHTML = '';
  }
}

/** assets/gameAsset/transition/ : time_machine.png, open_hand.png, fist.png */
const TRANSITION_DIR = '../assets/gameAsset/transition';

const TransitionArt = {
  /** a picture; an emoji takes its place while the file is missing */
  make(src, fallback) {
    const img = new Image();
    img.className = 'tr-art';
    img.alt = '';
    img.draggable = false;
    img.onerror = () => {
      const emoji = el('span', 'tr-art tr-art-emoji', fallback);
      img.replaceWith(emoji);
    };
    img.src = src;
    return img;
  }
};

/* ========================================================================== */
/* Transition                                                                 */
/* ========================================================================== */
export class Transition {
  constructor(stage) {
    this.stage = stage;
    this.layer = stage.transitLayer;
  }

  async fadeOut(ms = 400) {
    const f = el('div', 'fade');
    f.style.transitionDuration = `${ms}ms`;
    this.layer.appendChild(f);
    void f.offsetWidth;
    f.classList.add('on');
    await sleep(ms);
    this._fade = f;
  }

  async fadeIn(ms = 400) {
    const f = this._fade || el('div', 'fade on');
    if (!f.parentNode) this.layer.appendChild(f);
    f.style.transitionDuration = `${ms}ms`;
    void f.offsetWidth;
    f.classList.remove('on');
    await sleep(ms);
    f.remove();
    this._fade = null;
  }

  /**
   * Soul-pull (between scenes of one narrative, hub -> book, and the prologue).
   * The open hand grows, closes into a fist, and the fist is pulled in (smaller and smaller) with a
   * glow flash: the student is sucked away.
   * `middle` runs while the screen is covered (swap the scene there).
   * Pictures: assets/gameAsset/transition/open_hand.png and fist.png
   */
  async soulPull({ line = '', ms = 2600, middle = null, speaker = null } = {}) {
    sound.sfx('tarikJiwa');
    const wrap = el('div', 'soulpull');
    wrap.innerHTML = '<div class="sp-vortex"></div><div class="sp-vortex v2"></div><div class="sp-glow"></div>';

    for (let i = 0; i < 18; i++) {
      const mote = el('i', 'sp-mote');
      mote.style.setProperty('--a', `${(360 / 18) * i}deg`);
      mote.style.setProperty('--d', `${(i % 5) * 0.12}s`);
      wrap.appendChild(mote);
    }

    // the hand (a drawn picture, or an emoji while the picture is missing)
    const hand = el('div', 'sp-hand');
    hand.style.setProperty('--grow-time', `${Math.round(ms * 0.4)}ms`);
    const openPicture = TransitionArt.make(`${TRANSITION_DIR}/open_hand.png`, '\u{270B}');
    const fistPicture = TransitionArt.make(`${TRANSITION_DIR}/fist.png`, '\u{270A}');
    fistPicture.classList.add('hidden');
    hand.append(openPicture, fistPicture);
    wrap.appendChild(hand);

    const caption = el('div', 'sp-line');
    wrap.appendChild(caption);
    if (line) caption.textContent = line;

    this.layer.appendChild(wrap);
    void wrap.offsetWidth;
    wrap.classList.add('on');

    // 1. the open hand gets bigger
    await sleep(ms * 0.34);

    // 2. it closes into a fist
    openPicture.classList.add('hidden');
    fistPicture.classList.remove('hidden');
    hand.classList.add('is-fist');
    await sleep(Math.max(360, ms * 0.12));

    // 3. the fist is pulled in, smaller and smaller: the student is sucked away
    const pull = ms * 0.26;
    hand.style.animation = 'none';
    hand.animate(
      [{ transform: 'scale(2.2) rotate(0deg)', opacity: 1 }, { transform: 'scale(0.04) rotate(200deg)', opacity: 0.9 }],
      { duration: pull, easing: 'cubic-bezier(.6,.05,.9,.4)', fill: 'forwards' });
    await sleep(pull);

    // 4. a glow flash fills the screen; the scene changes while it is bright
    const burst = ms * 0.1;
    hand.remove();
    const glow = wrap.querySelector('.sp-glow');
    if (glow) {
      glow.style.animation = 'none';
      glow.animate([{ transform: 'scale(0.3)', opacity: 0.6 }, { transform: 'scale(14)', opacity: 1 }], { duration: burst, easing: 'ease-in', fill: 'forwards' });
    }
    await sleep(burst);
    if (middle) await middle();
    await sleep(ms * 0.18);

    wrap.classList.remove('on');
    await sleep(350);
    wrap.remove();
  }

  /**
   * Book grab (the prologue, and "Ulang Prolog"): the student is pulled INTO the book.
   *   1. an open hand reaches out of the book and grows towards the screen
   *   2. it closes into a fist (squeeze)
   *   3. the fist is pulled back into the book, shrinking; the things in `suck` shrink into
   *      the book with it
   *   4. a glow flash fills the screen; `middle` runs while it is white (swap the scene)
   * @param book  the book element (the hand starts and ends there)
   * @param suck  elements that get pulled in with the fist (the student)
   * @param handWidth  px, see prologueConfig.js
   * Pictures: assets/gameAsset/transition/open_hand.png and fist.png
   */
  async bookGrab({ book, suck = [], ms = 3600, middle = null, handWidth = 230 } = {}) {
    sound.sfx('tarikJiwa');
    const box = this.layer.getBoundingClientRect();
    const spot = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const from = book ? spot(book) : { x: box.left + box.width / 2, y: box.top + box.height * 0.7 };
    const ox = ((from.x - box.left) / box.width) * 100;
    const oy = ((from.y - box.top) / box.height) * 100;
    const k = box.width / (this.layer.offsetWidth || box.width);          // stage zoom

    const wrap = el('div', 'bookgrab');
    wrap.style.setProperty('--ox', `${ox}%`);
    wrap.style.setProperty('--oy', `${oy}%`);
    const flash = el('div', 'bg-flash');
    const hand = el('div', 'bg-hand');
    hand.style.width = `${handWidth}px`;
    const openPicture = TransitionArt.make(`${TRANSITION_DIR}/open_hand.png`, '\u{270B}');
    const fistPicture = TransitionArt.make(`${TRANSITION_DIR}/fist.png`, '\u{270A}');
    fistPicture.classList.add('hidden');
    hand.append(openPicture, fistPicture);
    wrap.append(hand, flash);
    this.layer.appendChild(wrap);

    const home = { left: `${ox}%`, top: `${oy}%` };
    const centre = { left: '50%', top: '46%' };
    const at = (pos, scale, extra = '') => ({ ...pos, transform: `translate(-50%, -50%) scale(${scale}) ${extra}` });
    const run = (node, frames, duration, easing = 'ease-in-out') => node.animate(frames, { duration, easing, fill: 'forwards' });

    // 1. the hand reaches out of the book
    run(hand, [{ ...at(home, 0.1), opacity: 0 }, { ...at(home, 0.35), opacity: 1, offset: 0.25 }, { ...at(centre, 2.1), opacity: 1 }], ms * 0.38, 'ease-in');
    await sleep(ms * 0.38);

    // 2. it closes into a fist
    openPicture.classList.add('hidden');
    fistPicture.classList.remove('hidden');
    run(hand, [at(centre, 2.1), at(centre, 1.75, 'rotate(-4deg)'), at(centre, 2.2, 'rotate(3deg)'), at(centre, 2.1)], ms * 0.1, 'ease-out');
    await sleep(ms * 0.12);

    // 3. the fist is pulled back into the book, smaller and smaller (the student too)
    const pull = ms * 0.28;
    run(hand, [at(centre, 2.1), { ...at(home, 0.05, 'rotate(200deg)'), opacity: 0.9 }], pull, 'cubic-bezier(.6,.05,.9,.4)');
    suck.filter(Boolean).forEach((node) => {
      const p = spot(node);
      const dx = (from.x - p.x) / k;
      const dy = (from.y - p.y) / k;
      run(node, [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0 }], pull, 'cubic-bezier(.6,.05,.9,.4)');
    });
    await sleep(pull);

    // 4. the glow flash: it grows out of the book until the whole screen is light
    const burst = ms * 0.12;
    run(flash, [{ transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(14)', opacity: 1 }], burst, 'ease-in');
    await sleep(burst);
    hand.remove();
    if (middle) await middle();                                           // the scene changes here, hidden by the light
    await sleep(ms * 0.05);
    run(flash, [{ opacity: 1 }, { opacity: 0 }], ms * 0.15, 'ease-out');
    await sleep(ms * 0.15);
    wrap.remove();
  }

  /**
   * Time machine (between eras).
   * The pocket watch pulses in the middle, then it is sucked into the spiral
   * (it spins and shrinks to nothing). `middle` runs while the screen is covered.
   * Picture: assets/gameAsset/transition/time_machine.png
   */
  async timeMachine({ from = '', to = '', line = '', ms = 4200, middle = null } = {}) {
    sound.sfx('pindahMasa');
    const wrap = el('div', 'timemachine');
    wrap.innerHTML = `
      <div class="tm-spiral"></div>
      <div class="tm-tunnel">${'<i></i>'.repeat(9)}</div>
      <div class="tm-clock"><span class="tm-from">${esc(from)}</span><b>\u2192</b><span class="tm-to">${esc(to)}</span></div>
      <div class="tm-line">${esc(line)}</div>`;

    const watch = el('div', 'tm-watch');
    watch.style.setProperty('--suck-time', `${Math.round(ms * 0.4)}ms`);
    watch.appendChild(TransitionArt.make(`${TRANSITION_DIR}/time_machine.png`, '\u{23F1}'));
    wrap.appendChild(watch);

    this.layer.appendChild(wrap);
    void wrap.offsetWidth;
    wrap.classList.add('on');

    // 1. the watch pulses
    await sleep(ms * 0.5);

    // 2. it is sucked into the spiral
    watch.classList.add('is-sucked');
    if (middle) await middle();
    await sleep(ms * 0.5);

    wrap.classList.remove('on');
    await sleep(400);
    wrap.remove();
  }
}
