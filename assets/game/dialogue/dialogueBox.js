/**
 * assets/game/dialogue/dialogueBox.js  -  Dialogue box
 * MODULE: dialogue  (Dialogue box (typewriter text, choices, portraits))
 * USE CASE: UC-03   CLASS DIAGRAM: DialogueLine
 */
import { el, esc, tpl } from '../core/core.js';
import { sound } from '../core/sound.js';
import { speech } from '../core/speech.js';      // suara pembaca (hidup/mati di Pintu, hab)

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


/* Petua kali pertama: "Guru anda tinggalkan nota!" muncul sehingga murid menekan buku sekali (diingat dalam pelayar; tanpanya permainan tetap berfungsi). */
const NOTE_HINT_KEY = 'sw_note_hint_seen';
const noteHintSeen = () => { try { return localStorage.getItem(NOTE_HINT_KEY) === '1'; } catch { return false; } };
const markNoteHintSeen = () => { try { localStorage.setItem(NOTE_HINT_KEY, '1'); } catch { /* tidak mengapa */ } };

export class DialogueBox {
  /**
   * @param {Stage} stage
   * @param {Input} input
   */
  constructor(stage, input) {
    this.stage = stage;
    this.input = input;
    this.speed = 22;                 // ms per character
    // Susun atur kotak dialog: lihat <template id="tpl-dialogue"> dalam assets/game/dialogue/dialogue.html
    this.root = tpl('dialogue');
    ({ portrait: this.portrait, mePortrait: this.mePortrait, panel: this.panel,
       name: this.name, text: this.text, more: this.more, choices: this.choices,
       noteBtn: this.noteBtn, noteIco: this.noteIco, noteCard: this.noteCard, noteHint: this.noteHint } = this.root.refs);
    // klik ikon buku: buka / tutup nota guru (tidak memajukan dialog)
    this.noteBtn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleNote(); });
    this.noteCard.addEventListener('click', (e) => e.stopPropagation());
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

  /** Tunjuk / sembunyi ikon buku nota guru (note kosong = tiada ikon). */
  _setNote(note = '') {
    this._note = String(note || '');
    this.noteCard.textContent = this._note;
    this.noteCard.classList.add('hidden');
    this.noteIco.src = '../assets/gameAsset/hub/buku.png';
    this.noteBtn.classList.toggle('hidden', !this._note);
    // bercahaya sehingga murid membukanya; petua "tekan buku ini" hanya sehingga murid pernah membuka nota sekali
    this.noteBtn.classList.toggle('is-new', Boolean(this._note));
    this.noteHint.classList.toggle('hidden', !(this._note && !noteHintSeen()));
  }

  _toggleNote() {
    const open = this.noteCard.classList.toggle('hidden') === false;
    this.noteBtn.classList.remove('is-new');             // sudah dibuka: cahaya berhenti
    this.noteHint.classList.add('hidden');
    markNoteHintSeen();
    this.noteIco.src = open ? '../assets/gameAsset/hub/diari.png' : '../assets/gameAsset/hub/buku.png';
  }

  _sayPage({ name = '', text, portrait = null, side = 'left', tone = '', note = '' }, pageNote = '') {
    return new Promise((resolve) => {
      this._setNote(note);
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
      // bunyi bercakap (gumam) hanya jika suara pembaca TIDAK bercakap, supaya tidak bertindih
      if (full && !speech.willSpeak) sound.talkStart();
      speech.speak(full);                                  // suara pembaca (senyap jika dimatikan di Pintu)
      timer = setInterval(() => {
        if (this._frozen) return;                          // Jeda: taipan berhenti di huruf semasa
        i += 1;
        this.text.textContent = full.slice(0, i);
        if (i >= full.length) finishTyping();
      }, this.speed);
      if (!full) finishTyping();

      const advance = () => {
        if (this._frozen) return;                          // Jeda: dialog tidak boleh dimajukan
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
        speech.stop();                                     // dialog dimajukan / ditutup: suara berhenti
        this.panel.removeEventListener('click', onClick);
        pop();
        this._current = null;
      };
      this._current = { skip: () => { cleanup(); resolve(); }, isTyping: () => typing };
    });
  }

  /** Show a line then a list of choices (keys 1-5 or click). Resolves with the chosen index. */
  ask({ name = '', text, portrait = null, side = 'left', options, mePortrait = null }) {
    return new Promise((resolve) => {
      this.root.classList.remove('hidden');
      this.root.dataset.side = side;
      this.root.dataset.tone = '';
      this._setNote('');
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
      speech.speak(text);                                  // soalan / pilihan dibacakan sekali
      const choose = (idx) => { speech.stop(); pop(); this.choices.innerHTML = ''; resolve(idx); };   // bunyi bercakap bermula hanya bila jawapan dipilih dan say() menaip teksnya
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

  /**
   * JEDA: bekukan dialog tepat di tempat ia berhenti. Taipan berhenti, bunyi bercakap berhenti,
   * klik tidak memajukan. thaw() menyambung dari huruf yang sama.
   */
  freeze(sembunyi = false) {
    this._frozen = true;
    sound.talkStop();
    speech.stop();                                         // Jeda: suara berhenti (tidak disambung)
    // sembunyi: seluruh kotak (termasuk anak panah \u25BC) dilenyapkan; tanda _kitaSorok mengingatkan kotak ini
    // hanya dimunculkan semula jika KITA yang menyorokkannya (bukan jika dialog memang sudah ditutup)
    this._kitaSorok = sembunyi && !this.root.classList.contains('hidden');
    if (this._kitaSorok) this.root.classList.add('hidden');
  }

  /** Sambung selepas Jeda (bunyi bercakap bermula semula jika teks masih ditaip). */
  thaw() {
    this._frozen = false;
    if (this._kitaSorok) { this.root.classList.remove('hidden'); this._kitaSorok = false; }
    if (this._current && this._current.isTyping && this._current.isTyping() && !speech.willSpeak) sound.talkStart();
  }

  hide() {
    this._frozen = false;
    this._kitaSorok = false;
    sound.talkStop();
    speech.stop();
    if (this._current) this._current.skip();
    this._setNote('');
    this.root.classList.add('hidden');
    delete this.root.dataset.turn;
    this.mePortrait.innerHTML = '';
    this.choices.innerHTML = '';
  }
}
