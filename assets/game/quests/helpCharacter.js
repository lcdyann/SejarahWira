/**
 * assets/game/quests/helpCharacter.js  -  HelpCharacterQuest
 * MODULE: quests  (The 5 quest mechanics (timeline, hotspot, choice, help character, decode, matching))
 * USE CASE: UC-03   CLASS DIAGRAM: Quest
 */
import { el, esc } from '../core/core.js';
import { ChoiceQuest } from './choice.js';

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
