/**
 * assets/game/hub/epilogueScene.js  -  EpilogueScene: after all eras
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
import { el, sleep } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { EPILOGUE_POSES, EPILOGUE_TWIST, EPILOGUE_WORDS, HOME_LINES } from './creditsConfig.js';
import { applyHubPicture, placeStudent, probeImage } from './hubHelpers.js';
import { PROLOGUE_BG, PROLOGUE_BOOK } from './prologueConfig.js';
import { entityPortrait, spriteEl } from '../npc/entity.js';

/* ========================================================================== */
/* EpilogueScene                                                              */
/* ========================================================================== */
export class EpilogueScene extends GameScene {
  /**
   * Cerita penutup, cermin kepada Prolog (PrologueScene):
   *   Prolog : bilik sebenar -> tangan keluar dari buku -> murid DITARIK MASUK ke dalam buku
   *   Epilog : dunia buku    -> murid DITARIK KELUAR dari buku -> bilik sebenar
   *
   * 1. Dunia buku: Pendekar Bayang kelihatan seperti penjahat, lalu kebenaran terbongkar (kategori 'epilog')
   * 2. Murid ditarik keluar; di bilik sebenar, tangan membawa murid keluar dari buku (bookRelease)
   * 3. Pendekar Bayang naik dari buku dan berterus-terang (EPILOGUE_TWIST); perkataan terbang keluar dari buku
   * 4. Dia masuk semula ke dalam buku, murid berkata apa yang dipelajari (HOME_LINES), lalu kredit
   * Ayat-ayatnya ditulis dalam creditsConfig.js (dan entityLines.js untuk bahagian 1).
   *
   * params: { replay: true bila dimainkan semula untuk menonton; selepas itu kembali ke meja, tiada kredit }
   */
  async enter({ replay = false } = {}) {
    this.replay = replay;
    this.root.classList.add('epilogue');
    this.root.innerHTML = '<div class="epi-bg"></div><div class="epi-pendekar"></div>';
    await this.entity.load(0);
    await sleep(600);

    /* ---- 1. dunia buku ---- */
    const holder = this.root.querySelector('.epi-pendekar');
    holder.appendChild(entityPortrait(EPILOGUE_POSES[0], 'rise'));
    await sleep(1200);

    const lines = this.entity.lines('epilog', {}, 0);
    for (let i = 0; i < lines.length; i += 1) {
      // pose berubah mengikut kemajuan ayat: senyum sinis, ketawa, terkejut, kagum, berbisik
      const pose = EPILOGUE_POSES[Math.min(EPILOGUE_POSES.length - 1, Math.floor((i * EPILOGUE_POSES.length) / lines.length))];
      holder.replaceChildren(entityPortrait(pose));
      if (pose === 'laughing') {                                  // bahagian "kau sangka aku mahu menghukum kau": dunia bergegar
        this.root.classList.add('quake');
        setTimeout(() => this.root.classList.remove('quake'), 1200);
      }
      await this.dialog.say({
        name: this.entity.name, text: lines[i], portrait: entityPortrait(pose),
        tone: pose === 'laughing' ? 'loud' : pose === 'whispering' ? 'whisper' : ''
      });
    }
    this.dialog.hide();

    /* ---- 2. ditarik keluar dari buku ---- */
    // tangan menggenggam murid dan menariknya keluar; bilik sebenar muncul ketika skrin terang
    let room = null;
    await this.game.transition.soulPull({
      ms: 3600, line: '',
      middle: async () => { room = await this.realRoom(); }
    });
    // di bilik sebenar: tangan keluar dari buku dan MELEPASKAN murid di tempatnya
    await this.game.transition.bookRelease({ book: room.book, release: [room.student], ms: 3800 });
    await sleep(500);

    /* ---- 3. plot twist: Pendekar Bayang berterus-terang ---- */
    await this.twist(room);

    /* ---- 4. pulang ---- */
    for (const text of HOME_LINES) {
      await this.dialog.say({
        name: this.student.studentName, text,
        portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'), side: 'right'
      });
    }
    this.dialog.hide();

    await this.game.transition.fadeOut(900);
    await this.game.go(this.replay ? 'HubScene' : 'CreditsScene');
    await this.game.transition.fadeIn(900);
  }

  /** Pendekar Bayang naik dari buku, berkata benar, dan masuk semula; buku tertutup dan malap. */
  async twist({ book }) {
    const holder = this.root.querySelector('.prologue-pendekar');
    book.classList.add('glow');
    this.floatWords(book);
    await sleep(600);
    holder.appendChild(entityPortrait(EPILOGUE_TWIST[0].pose, 'rise'));
    await sleep(1200);

    for (const beat of EPILOGUE_TWIST) {
      holder.replaceChildren(entityPortrait(beat.pose));
      this.floatWords(book);                                      // setiap ayat: perkataan terbang keluar dari buku
      await this.dialog.say({
        name: this.entity.name,
        text: beat.text.replace('{nama}', this.student.studentName),
        portrait: entityPortrait(beat.pose),
        tone: beat.pose === 'whispering' ? 'whisper' : ''
      });
    }
    this.dialog.hide();

    holder.classList.add('sink');                                 // dia masuk semula ke dalam buku
    await sleep(1400);
    book.classList.remove('glow');                                // buku tenang semula
    holder.remove();
    await sleep(600);
  }

  /** Beberapa perkataan (EPILOGUE_WORDS) terbang keluar dari buku dan hilang. */
  floatWords(book) {
    let layer = this.root.querySelector('.epi-motes');
    if (!layer) { layer = el('div', 'epi-motes'); this.root.appendChild(layer); }
    const pool = [...EPILOGUE_WORDS].sort(() => Math.random() - 0.5).slice(0, 6);
    pool.forEach((word, i) => {
      const mote = el('i', 'epi-mote', word);
      mote.style.left = `${PROLOGUE_BOOK.x + PROLOGUE_BOOK.w / 2 - 2 + (Math.random() * 6 - 3)}%`;
      mote.style.top = `${PROLOGUE_BOOK.y + 4}%`;
      mote.style.setProperty('--dx', `${Math.round(Math.random() * 220 - 110)}px`);
      mote.style.animationDelay = `${i * 0.22}s`;
      layer.appendChild(mote);
      setTimeout(() => mote.remove(), 4200);
    });
  }

  /**
   * the real-world room (normal_hub): the book on the desk, the student still hidden
   * (bookRelease brings the student out of the book). Returns { book, student }.
   */
  async realRoom() {
    this.root.classList.remove('epilogue', 'quake');
    this.root.classList.add('hub-room', 'prologue');
    await applyHubPicture(this.root, PROLOGUE_BG);
    this.root.innerHTML = `
      <div class="hub-window"><i class="moon"></i></div>
      <div class="hub-lamp"></div>
      <div class="hub-desk"></div>
      <div class="prologue-book"><span class="prologue-book-icon">\u{1F4D6}</span></div>
      <div class="prologue-pendekar"></div>`;
    const student = spriteEl(this.student.avatar.assetPath, this.student.studentName, 'hub-student');
    student.style.opacity = '0';                                  // belum keluar dari buku
    this.root.appendChild(student);
    placeStudent(student);
    const book = this.root.querySelector('.prologue-book');
    Object.assign(book.style, { left: `${PROLOGUE_BOOK.x}%`, top: `${PROLOGUE_BOOK.y}%`, width: `${PROLOGUE_BOOK.w}%` });
    if (await probeImage(PROLOGUE_BOOK.img)) {
      const picture = new Image();
      picture.src = PROLOGUE_BOOK.img;
      picture.alt = '';
      picture.draggable = false;
      book.replaceChildren(picture);
    }
    return { book, student };
  }
}
