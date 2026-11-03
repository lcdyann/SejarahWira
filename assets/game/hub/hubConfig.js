/**
 * assets/game/hub/hubConfig.js  -  Hub layout: objects, positions, themes
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
/**
 * ============================================================================
 * hubConfig.js  -  where everything sits in the hub (the study room)
 *
 * HOW TO REDO THE SIZES AND POSITIONS
 *   1. Run the server and open   student/game.html?hubedit=1
 *   2. Drag a thing to move it. Scroll the mouse wheel over it to make it bigger or smaller.
 *   3. Press "Salin", then paste the numbers over the ones below.
 *
 * THE NUMBERS
 *   All in PERCENT of the 960 x 540 stage.
 *     x, y = distance of the top-left corner from the left / top edge
 *     w    = width of an item          (the height follows the picture)
 *     h    = height of the student or of Pendekar Bayang (the width follows)
 *
 * Pictures live in  assets/gameAsset/hub/ .  A missing picture falls back to an icon.
 * ============================================================================
 */

/** the room picture */
export const HUB_BG = '../assets/gameAsset/hub/hub.jpg';

/** the same room in daylight (shown when the student switches to day mode) */
export const HUB_BG_DAY = '../assets/gameAsset/hub/day_hub.jpg';

/**
 * The day / night switch. It sits where the moon is in the night picture.
 *   night mode shows  moon.png  (press it to turn the room to day)
 *   day mode shows    sun.png   (press it to turn the room back to night)
 * x, y, w are percent of the stage like the other items. Move and resize it with  student/game.html?hubedit=1
 */
export const HUB_THEME = {
  x: 54.3,
  y: 13,
  w: 8,
  moon: '../assets/gameAsset/hub/moon.png',
  sun: '../assets/gameAsset/hub/sun.png'
};


/** the clickable items */
export const HUB_OBJECTS = [
  {
    id: 'door',
    label: 'Pintu (tetapan)',
    icon: '\u{1F6AA}',
    img: '../assets/gameAsset/hub/pintu.png',
    x: -7,
    y: 12,
    w: 40
  },
  {
    id: 'mirror',
    label: 'Cermin (avatar)',
    icon: '\u{1FA9E}',
    img: ['../assets/gameAsset/hub/cermin.png', '../assets/gameAsset/hub/mirror.png'],      // first one that exists is used
    x: 80,
    y: 10,
    w: 14
  },
  {
    id: 'notebook',
    label: 'Diari (kemajuan)',
    icon: '\u{1F4D3}',
    img: '../assets/gameAsset/hub/diari.png',
    x: 17,
    y: 66,
    w: 14
  },
  {
    id: 'book',
    label: 'Buku Sejarah',
    icon: '\u{1F4D6}',
    img: '../assets/gameAsset/hub/buku.png',
    x: 41,
    y: 60,
    w: 17
  },
  {
    // replay the opening story (the prologue) any time
    id: 'replay',
    label: 'Ulang Prolog',
    icon: '\u23EA',
    img: '../assets/gameAsset/hub/replay.png',      // optional picture; the icon shows until you add one
    x: 33,
    y: 70,
    w: 7
  },
  {
    // the trophy room is the glass-dome pedestal from the collection
    id: 'trophy',
    label: 'Bilik Trofi',
    icon: '\u{1F3C6}',
    img: '../assets/gameAsset/collection/artifact_place_unlocked.png',
    x: 72,
    y: 55,
    w: 11
  }
];


/** the student's own avatar standing in the room */
export const HUB_STUDENT = {
  x: 1,
  y: 60,
  h: 36
};

/** Pendekar Bayang (the shadow who talks to the student) */
export const HUB_PENDEKAR = {
  x: 60,
  y: 36,
  h: 26
};

/** his speech bubble (top-left corner) */
export const HUB_BUBBLE = {
  x: 30,
  y: 30
};
