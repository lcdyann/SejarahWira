/**
 * assets/game/core/core.js  -  Stage size, DOM helpers, templates loader (tpl), Stage, Input
 * MODULE: core  (Base layer: stage, helpers, templates loader, API, domain model, sound)
 * USE CASE: all   CLASS DIAGRAM: User, Student, Teacher, Avatar, ... (domain.js mirrors the class diagram)
 */

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
/* Game boxes (HTML) are read from each module html file (list below) */
/* (once, when this file loads).                                  */
/* ========================================================================== */
/* Every module keeps its own boxes in <module>/<module>.html. List them here. */
const TEMPLATE_FILES = [
  'dialogue/dialogue.html',
  'transition/transition.html',
  'hub/hub.html',
  'tour/tour.html',
  'story/story.html',
  'quests/quests.html',
  'support/support.html',
  'rest/rest.html',
  'battle/battle.html'
];
const templateDocs = await Promise.all(TEMPLATE_FILES.map(async (file) => {
  const url = new URL('../' + file, import.meta.url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Templat tidak ditemui (${r.status}): ${url.pathname}`);
  return new DOMParser().parseFromString(await r.text(), 'text/html');
}));

/**
 * tpl('dialogue', { title: '...' })
 *   - menyalin <template id="tpl-dialogue"> dan memulangkan elemen utamanya
 *   - [data-text="kunci"]  diisi dengan teks (textContent, selamat)
 *   - [data-ref="nama"]    boleh dicapai melalui  elemen.refs.nama
 */
export function tpl(name, text = {}) {
  const t = templateDocs.map((d) => d.getElementById(`tpl-${name}`)).find(Boolean);
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

/**
 * Label status era dalam Bahasa Melayu (nilai asal pangkalan data ialah Inggeris:
 * locked, unlocked, in progress, completed). Dipakai oleh peta, Diari dan halaman kemajuan.
 */
const STATUS_ERA_BM = { locked: 'Terkunci', unlocked: 'Dibuka', 'in progress': 'Sedang berjalan', completed: 'Selesai' };
export function labelStatus(status) {
  const key = String(status ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return STATUS_ERA_BM[key] || 'Belum diketahui';
}
