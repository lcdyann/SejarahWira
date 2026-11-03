/**
 * assets/game/core/soundConfig.js  -  Sound file names + volumes
 * MODULE: core  (Base layer: stage, helpers, templates loader, API, domain model, sound)
 * USE CASE: all   CLASS DIAGRAM: User, Student, Teacher, Avatar, ... (domain.js mirrors the class diagram)
 */
/**
 * ============================================================================
 * soundConfig.js  -  SENARAI BUNYI (anda hanya ubah fail ini untuk tukar bunyi)
 *
 * Letakkan fail bunyi dalam folder assets/sounds/ (lihat BACA_SAYA.txt di sana).
 * Jika fail tiada, permainan tetap berjalan tanpa bunyi itu.
 * ============================================================================
 */

/** folder bunyi, dilihat dari student/game.html */
export const SOUND_FOLDER = '../assets/sounds/';

/** kuat bunyi, 0 (senyap) hingga 1 (paling kuat) */
export const VOLUME = { music: 1, sfx: 0.8 };   // music = pengali untuk SEMUA muzik (kuat setiap lagu ada di MUSIC)

/** masa silih-ganti muzik (milisaat): lagu lama senyap perlahan, lagu baharu naik perlahan serentak */
export const CROSSFADE_MS = 1500;

/** KESAN BUNYI: nama dalam kod  ->  nama fail dalam assets/sounds/ */
export const SFX = {
  // bercakap
  bercakap:   'sfx/speaking.mp3',    // dialog dibuka: watak bercakap (diulang sehingga teks habis ditaip)

  // kuest sahaja (Latihan dan Kepungan guna bunyi perang sendiri)
  betul:      'sfx/correct.mp3',     // jawapan atau tindakan betul
  salah:      'sfx/wrong.mp3',       // jawapan atau tindakan salah
  menang:     'sfx/win.mp3',         // keputusan pentaksiran: menang atau lulus
  kalah:      'sfx/lose.mp3',        // keputusan pentaksiran: kalah atau gagal

  // benang cerita terputus (babak Akibat bila murid tersilap dalam misi)
  benangPutus: 'sfx/lose.mp3',       // guna lose.mp3 (dipotong 3.5 saat); letak fail baharu di sini jika mahu bunyi lain

  // pertarungan
  serang:     'sfx/punch.mp3',       // pukulan atau tendangan dihayun
  kena:       'sfx/pukul.mp3',       // musuh kena pukul (jawapan betul, Latihan)
  kenaPemain: 'sfx/dipukul.mp3',     // murid kena pukul (jawapan salah, Latihan)
  tangkis:    'sfx/tang.mp3',        // menangkis (jawapan salah, Kepungan)
  meriam:     'sfx/meriam.mp3',      // meriam ditembak (Kepungan)
  letupan:    'sfx/letupan.mp3',     // bola meriam meletup di kubu (Kepungan)

  // peralihan
  tarikJiwa:  'sfx/tarik_jiwa.mp3',  // antara babak (jiwa ditarik)
  pindahMasa: 'sfx/pindah_masa.mp3'  // antara era (mesin masa)
};

/**
 * MUZIK LATAR: nama muzik  ->  { file: nama fail, vol: kuat bunyi 0-1 }
 *
 * PENTING: dua nama yang menunjuk ke FAIL YANG SAMA dianggap satu lagu yang bersambung.
 * Contohnya peta -> misi (kedua-duanya Selendang Mak Inang): lagu TIDAK dimulakan semula,
 * hanya bunyinya direndahkan perlahan-lahan (dialog cerita jadi jelas dibaca).
 * Lagu juga berulang tanpa jeda: hujung lagu bertindih lembut dengan permulaan.
 */
const TARI    = 'muzik/TARI TUALANG TIGA - INSTRUMENTAL.mp3';
const SELENDANG = 'muzik/Instrumental Melayu Asli - Selendang Mak Inang.mp3';
const AYAM    = 'muzik/AYAM DIDIK - INSTRUMENTAL.mp3';
const SILAT   = 'muzik/Serunai - Gendang Silat (Studio Quality).mp3';

export const MUSIC = {
  hub:      { file: TARI,      vol: 0.45 },  // meja belajar, avatar, profil, kemajuan
  prolog:   { file: TARI,      vol: 0.45 },  // prolog (bersambung terus dari hub, tiada potongan)
  peta:     { file: SELENDANG, vol: 0.45 },  // peta dunia
  misi:     { file: SELENDANG, vol: 0.22 },  // cerita dan dialog (perlahan, 20-30%)
  latihan:  { file: AYAM,      vol: 0.50 },  // Gelanggang Latihan Wira
  kepungan: { file: SILAT,     vol: 0.55 },  // Kepungan Besar
  trofi:    { file: AYAM,      vol: 0.55 }   // Bilik Trofi, Epilog, Kredit
};

/**
 * MUZIK MANA UNTUK BABAK MANA.
 * Babak yang tiada di sini meneruskan muzik sebelumnya.
 * Dua babak yang menggunakan nama muzik yang sama tidak memulakan lagu semula.
 */
export const SCENE_MUSIC = {
  HubScene:      'hub',
  AvatarScene:   'hub',
  ProfileScene:  'hub',
  ProgressScene: 'hub',
  PrologueScene: 'prolog',
  MapScene:      'peta',
  MissionScene:  'misi',
  DoorsScene:    'hub',
  TrainingScene: 'latihan',
  SiegeScene:    'kepungan',
  TrophyScene:   'trofi',
  EpilogueScene: 'trofi',
  CreditsScene:  'trofi'
};
