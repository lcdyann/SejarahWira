/**
 * assets/game/hub/prologueScene.js  -  PrologueScene: the soul is taken
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
import { sleep } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { HUB_BG } from './hubConfig.js';
import { applyHubPicture, placeStudent, probeImage } from './hubHelpers.js';
import { PROLOGUE_BG, PROLOGUE_BOOK, PROLOGUE_HAND_WIDTH } from './prologueConfig.js';
import { entityPortrait, spriteEl } from '../npc/entity.js';

/* ========================================================================== */
/* PrologueScene                                                              */
/* ========================================================================== */
export class PrologueScene extends GameScene {
  /** params: { full: boolean, eraID, replay: true when played again from the hub } */
  async enter({ full = true, eraID = 1, replay = false } = {}) {
    // the prologue is in the real world: normal_hub (hub.jpg while that picture is missing)
    await applyHubPicture(this.root, full ? PROLOGUE_BG : [HUB_BG]);

    this.root.classList.add('hub-room', 'prologue');
    this.eraID = eraID;

    if (!full) {
      await this.short();
      return;
    }

    this.root.innerHTML = `
      <div class="hub-window"><i class="moon"></i></div>
      <div class="hub-lamp"></div>
      <div class="hub-desk"></div>
      <div class="prologue-book"><span class="prologue-book-icon">\u{1F4D6}</span></div>
      <div class="prologue-pendekar"></div>
      <div class="prologue-skip ${replay ? '' : 'hidden'} px">Esc: langkau</div>`;

    const student = spriteEl(this.student.avatar.assetPath, this.student.studentName, 'hub-student');
    this.root.appendChild(student);
    placeStudent(student);

    // the book: buku.png where prologueConfig.js says (the emoji stays while the picture is missing)
    const book = this.root.querySelector('.prologue-book');
    Object.assign(book.style, { left: `${PROLOGUE_BOOK.x}%`, top: `${PROLOGUE_BOOK.y}%`, width: `${PROLOGUE_BOOK.w}%` });
    if (await probeImage(PROLOGUE_BOOK.img)) {
      const picture = new Image();
      picture.src = PROLOGUE_BOOK.img;
      picture.alt = '';
      picture.draggable = false;
      book.replaceChildren(picture);
    }

    // Esc skips the story (the button appears after 5 seconds)
    let skipped = false;
    const skipHint = this.root.querySelector('.prologue-skip');
    const showSkip = setTimeout(() => skipHint.classList.remove('hidden'), 5000);
    this.own(() => clearTimeout(showSkip));

    const trySkip = () => {
      if (skipHint.classList.contains('hidden')) return false;
      skipped = true;
      this.dialog.hide();
      return true;
    };
    this.keys({ onKeyDown: (key) => (key === 'Escape' ? trySkip() : false) });

    // while a line is on screen the dialogue box has the keys, so it passes Escape on to us
    this.dialog.onEscape = trySkip;
    this.own(() => { this.dialog.onEscape = null; });

    await this.entity.load(0);

    const studentSays = (text) => this.dialog.say({
      name: this.student.studentName,
      text,
      portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'),
      side: 'right'
    });

    await sleep(900);
    if (!skipped) await studentSays('Ugh... kenapa perlu belajar Sejarah? Tak penting pun!');

    if (!skipped) {
      this.root.querySelector('.prologue-book').classList.add('glow');
      this.root.classList.add('quake');
      await sleep(1600);
      this.root.classList.remove('quake');

      const holder = this.root.querySelector('.prologue-pendekar');
      holder.appendChild(entityPortrait('whispering', 'rise'));
      await sleep(1200);
    }

    if (!skipped) {
      for (const text of this.entity.lines('prolog', {}, 0)) {
        if (skipped) break;
        await this.dialog.say({
          name: this.entity.name,
          text,
          portrait: entityPortrait('whispering'),
          tone: 'whisper'
        });
      }
    }

    this.dialog.hide();

    // a hand reaches out of the book, grabs the student and pulls them in (glow flash)
    // replay: they land in the study room again; the first time: they land in the first era
    await this.game.transition.bookGrab({
      book,
      suck: [student],
      handWidth: PROLOGUE_HAND_WIDTH,
      ms: skipped ? 2200 : 3800,
      middle: async () => {
        if (replay) await this.game.go('HubScene');
        else await this.game.beginEra(this.eraID);
      }
    });
  }

  /** Every later entry: 3 seconds + one line, no story. */
  async short() {
    this.root.innerHTML = '<div class="scene-dim"></div>';
    await this.entity.load(0);

    const line = this.entity.remark('pindahJiwa');

    await this.game.transition.soulPull({
      line,
      ms: 3000,
      middle: async () => { await this.game.afterPull(); }
    });
  }
}
