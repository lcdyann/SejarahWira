/**
 * assets/game/hub/epilogueScene.js  -  EpilogueScene: after all eras
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
import { sleep } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { HOME_LINES } from './creditsConfig.js';
import { applyHubPicture, placeStudent, probeImage } from './hubHelpers.js';
import { PROLOGUE_BG, PROLOGUE_BOOK } from './prologueConfig.js';
import { entityPortrait, spriteEl } from '../npc/entity.js';

/* ========================================================================== */
/* EpilogueScene                                                              */
/* ========================================================================== */
export class EpilogueScene extends GameScene {
  /**
   * 1. Pendekar Bayang closes the story (book world)
   * 2. the fist pulls the student out of the book: they land in the REAL room (normal_hub)
   * 3. the student says what they learned
   * 4. the credits roll (CreditsScene), then the desk
   * What the student says and the credits are written in creditsConfig.js.
   */
  async enter() {
    this.root.classList.add('epilogue');
    this.root.innerHTML = '<div class="epi-bg"></div>';
    await this.entity.load(0);
    await sleep(600);
    for (const text of this.entity.lines('epilog', {}, 0)) {
      await this.dialog.say({ name: this.entity.name, text, portrait: entityPortrait('impressed') });
    }
    this.dialog.hide();

    // the student is sucked out of the book; the real room appears while the screen is bright
    await this.game.transition.soulPull({
      ms: 3600, line: '',
      middle: async () => { await this.realRoom(); }
    });

    for (const text of HOME_LINES) {
      await this.dialog.say({
        name: this.student.studentName, text,
        portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'), side: 'right'
      });
    }
    this.dialog.hide();

    await this.game.transition.fadeOut(900);
    await this.game.go('CreditsScene');
    await this.game.transition.fadeIn(900);
  }

  /** the real-world room (normal_hub): the student at home, the book closed on the desk */
  async realRoom() {
    this.root.classList.remove('epilogue');
    this.root.classList.add('hub-room', 'prologue');
    await applyHubPicture(this.root, PROLOGUE_BG);
    this.root.innerHTML = `
      <div class="hub-window"><i class="moon"></i></div>
      <div class="hub-lamp"></div>
      <div class="hub-desk"></div>
      <div class="prologue-book"><span class="prologue-book-icon">\u{1F4D6}</span></div>`;
    const student = spriteEl(this.student.avatar.assetPath, this.student.studentName, 'hub-student');
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
  }
}
