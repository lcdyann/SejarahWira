/**
 * assets/game/hub/prologueConfig.js  -  Prologue layout
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
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

/**
 * The opening scene, in the student's own voice. The student is tired, frustrated, and does not
 * see why History matters (like many real students). Each item = one box; `pause` = ms to wait AFTER it.
 * The LAST line is the one that wakes the book. Change, add or remove lines freely.
 */
export const PROLOGUE_CAPTION = 'Malam sebelum ujian Sejarah...';

export const PROLOGUE_STUDENT_LINES = [
  { text: 'Haih... esok ada ujian Sejarah. Aku belum hafal satu bab pun.', pause: 700 },
  { text: 'Tahun, nama, tarikh... semuanya nampak sama. Kenapa aku kena hafal benda yang berlaku berpuluh-puluh tahun dahulu?', pause: 800 },
  { text: 'Cikgu kata Sejarah itu penting. Penting untuk siapa? Bukan ada kena-mengena dengan hidup aku pun.', pause: 700 },
  { text: 'Bosannya... Mata pun dah berat. Baik main telefon sahaja.', pause: 1100 },
  { text: 'Ugh... kenapa perlu belajar Sejarah? Tak penting pun!', pause: 400 }
];
