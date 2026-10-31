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
  'Eh... aku dah balik? Ini bilik aku.',
  'Buku itu tertutup sendiri. Rasa macam mimpi... tapi aku ingat semuanya.',
  'Orang dahulu berjuang supaya aku boleh duduk belajar di meja ini. Mulai sekarang, aku akan belajar Sejarah bersungguh-sungguh.'
];

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
