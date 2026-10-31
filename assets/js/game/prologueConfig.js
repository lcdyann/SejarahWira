/**
 * ============================================================================
 * prologueConfig.js  -  the opening story (and "Ulang Prolog" in the hub)
 *
 * The prologue happens in the REAL WORLD room. The student wakes the book, a hand
 * reaches out of it, grabs the student, and pulls them into the book. After that the
 * student is in the book world (the normal hub.jpg room).
 *
 * Pictures live in assets/gameAsset/hub/ . A missing picture falls back (see below).
 * Numbers are PERCENT of the 960 x 540 stage, like hubConfig.js.
 * ============================================================================
 */

/** the real-world room; the first one that exists is used (hub.jpg is the fallback) */
export const PROLOGUE_BG = [
  '../assets/gameAsset/hub/normal_hub.jpg',
  '../assets/gameAsset/hub/normal_hub.png',
  '../assets/gameAsset/hub/hub.jpg'
];

/** the book on the desk (buku.png; the emoji shows while the picture is missing) */
export const PROLOGUE_BOOK = {
  img: '../assets/gameAsset/hub/buku.png',
  x: 41,
  y: 60,
  w: 17
};

/** size of the hand that comes out of the book (px on the 960 x 540 stage) */
export const PROLOGUE_HAND_WIDTH = 230;
