/**
 * assets/game/transition/transition.js  -  Full screen transitions
 * MODULE: transition  (Screen transitions: soul pull, time machine, book flip)
 * USE CASE: UC-03   CLASS DIAGRAM: -
 */
import { el, esc, sleep } from '../core/core.js';
import { sound } from '../core/sound.js';

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
