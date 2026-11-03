/**
 * assets/game/quests/decodeClue.js  -  DecodeClueQuest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc } from '../core/core.js';
import { ChoiceQuest } from './choice.js';

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

    // teks panjang: kecilkan huruf supaya kertas muat tanpa skrol (guru boleh menulis petunjuk yang panjang)
    const panjang = String(this.promptText || '').length;
    const kertas = this.field.querySelector('.clue-paper');
    kertas.classList.toggle('muat-sederhana', panjang > 130 && panjang <= 220);
    kertas.classList.toggle('muat-kecil', panjang > 220);
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
