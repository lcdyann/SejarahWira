/**
 * assets/game/hub/creditsConfig.js  -  Credits text
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
/**
 * ============================================================================
 * creditsConfig.js  -  the ending: coming home, and the credits
 *
 * After the last era the student is pulled out of the book and lands back in the REAL room
 * (normal_hub). They say the lines in HOME_LINES, then the credits roll.
 * Shown after all the era stories is finished
 * ============================================================================
 */

/** what the student says when they are back in the real room (one box each) */
export const HOME_LINES = [
  'Eh... aku dah balik? Ini bilik aku, dan buku ini masih terbuka pada halaman yang sama.',
  'Rasa macam mimpi... tetapi aku ingat semuanya. Tunku, Tun Ghazali, para atlet, semuanya.',
  'Tadi aku kata Sejarah tak penting. Sebenarnya orang dahulu berjuang supaya aku boleh duduk belajar di meja ini.',
  'Esok ada ujian Sejarah, bukan? Tak apa. Kali ini aku sudah bersedia, dan aku akan belajar bersungguh-sungguh.'
];

/**
 * The truth about Pendekar Bayang. He comes out of the book in the real room and says it himself.
 * Each beat = one box: pose of Pendekar Bayang (whispering, impressed, smirk, laughing, surprised, angry) + text.
 * {nama} becomes the student's name.
 */
export const EPILOGUE_TWIST = [
  { pose: 'whispering', text: 'Jangan takut, {nama}. Pandanglah aku sekali lagi.' },
  { pose: 'impressed',  text: 'Aku bukan musuhmu. Aku Pendekar Bayang, penjaga kisah yang hampir dilupakan.' },
  { pose: 'whispering', text: 'Bangsa yang melupakan sejarahnya akan kehilangan arah. Itulah sebabnya aku menarik kau masuk ke dalam buku.' },
  { pose: 'smirk',      text: 'Tunku, Donald Stephens, Tun Ghazali, para atlet, petani dan peniaga, semuanya melangkah supaya kau boleh duduk di meja ini dengan aman.' },
  { pose: 'impressed',  text: 'Kini kau sudah tahu. Simpanlah kisah mereka, dan ceritakan kepada orang lain.' },
  { pose: 'whispering', text: 'Sehingga bertemu lagi, wira kecilku.' }
];

/** words that float out of the book while he speaks (add or remove as you like) */
export const EPILOGUE_WORDS = ['Merdeka', '1957', '1963', 'Malaysia', 'Perpaduan', 'Rukun Negara', 'Warisan', 'Sukan', 'ASEAN', 'Tunku', 'Sabah', 'Sarawak'];

/** the poses Pendekar Bayang has in the book world, one after another, while the epilog lines are said */
export const EPILOGUE_POSES = ['smirk', 'laughing', 'surprised', 'impressed', 'impressed', 'whispering'];

export const CREDITS = {
  gameTitle: 'SejarahWira',
  tagline: 'Belajar Sejarah Malaysia dengan bermain',

  sections: [
    { heading: 'Dicipta oleh', lines: ['Diyana Nadra binti Abd Ghaffar', 'Pelajar Tahun Akhir, Kejuruteraan Perisian, Universiti Malaysia Sabah(UMS)'] },
    { heading: 'Seni dan reka bentuk', lines: ['Diyana Nadra binti Abd Ghaffar'] },
    { heading: 'Pengaturcaraan', lines: ['Diyana Nadra binti Abd Ghaffar'] },
    { heading: 'Kandungan sejarah', lines: ['Olahan dari Buku Teks dan Nota Pintar Sejarah'] },
    { heading: 'Terima kasih khas', lines: [
      'Penyelia saya Dr. Norazlina Khamis', 
      'Ibu bapa saya Azilah binti Asli dan Abd Ghaffar bin Mohd Amin',
      'Adik beradik saya Iwana Qistina dan Zara Arissa',
      'Rakan-rakan seperjuangan saya Asha, Eva, Eiqa dan yang lain',
      'Tidak dilupakan guru dan pelajar SK Kepayan yang menguji dan bermain sistem ini'
    ] }
  ],

  /** the last words (big, in the middle) */
  thanks: [
    'Terima kasih kerana bermain dan belajar.',
    'Sejarah ialah cerita kita. Jangan biarkan ia dilupakan.'
  ]
};

/** how fast the credits roll (pixels per second on the 960 x 540 stage) */
export const CREDITS_SPEED = 46;
