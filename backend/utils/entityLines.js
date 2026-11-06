/**
 * ============================================================================
 * entityLines.js  -  Pendekar Bayang's voice (shared data + pure functions)
 *
 *   assets/game/npc/entityLines.js    (game + content manager)
 *   backend/utils/entityLines.js     (validation in the controller)
 * Keep the two files IDENTICAL. No DOM and no Node modules in here.
 *
 * Storage (database frozen, nothing new):
 *   one DialogueLine row, speaker = NPC "Pendekar Bayang", no scene, no narrative
 *   sequenceOrder = era * 10000 + category * 100 + line
 *   era 0 = all eras
 * ============================================================================
 */

export const ENTITY_NAME = 'Pendekar Bayang';
export const MAX_LINE = 255;
export const MAX_ERA = 99;

/** Poses (pendekar_bayang_<pose>.png) */
export const POSES = ['smirk', 'laughing', 'angry', 'surprised', 'impressed', 'whispering'];

/** The markers a teacher may write inside a line. */
export const MARKERS = {
  nama: 'Nama pelajar',
  peranan: 'Nama watak yang dimainkan pelajar',
  era: 'Nama era',
  taklimat: 'Taklimat misi',
  petunjuk: 'Bisikan (petunjuk)',
  penerangan: 'Penerangan / pembetulan',
  maklumbalas: 'Pujian (maklum balas)',
  skor: 'Skor Kepungan Agung'
};

/**
 * code, key (used in code), label (Malay, shown to teachers), when, pose, defaults[]
 * `content` = the marker that carries dynamic content for this category (if any).
 */
export const CATEGORIES = [
  { code: 1,  key: 'prolog',          label: 'Prolog',                  when: 'Kali pertama sahaja, mengikut turutan',        pose: 'angry', ordered: true,  defaults: ['Wahai anak Adam yang lalai dan leka! Asyik benar menghadap kotak sakti itu, ya? Kau kata Sejarah tak penting? Hehehe...', 'Nah, rasakan hembusan tinta purba! Jiwa kau kini hamba tarik masuk ke dalam helai-helai buku ini.', 'Selesaikan takdir yang tertulis, dan pintu pulang akan terbuka. Jika tidak, jiwa kau menjadi dakwat kering di sini... Hahaha! Gurau sahaja. Mungkin.'] },
  { code: 2,  key: 'hub',             label: 'Hub',                     when: 'Kata-kata di meja belajar',                    pose: 'smirk',      defaults: ['Buku itu memanggil namamu, {nama}. Tuan hamba mengelamun ke? Asyik benar termenung!', 'Amboi, termenung jauh nampaknya. Sedang merindukan mi segera di dunia nyata kah?', 'Tiada jalan pulang selain melalui halaman-halaman itu. Ayuh, usah lalai, wahai budak leka!', 'Wah, bermimpi di siang hari nampaknya! Bangunlah, sejarah tidak pernah tidur!'] },
  { code: 3,  key: 'taklimat',        label: 'Taklimat misi',           when: 'Sebelum objektif misi',                        pose: 'smirk',      content: 'taklimat',   defaults: ['Titah dijunjung! Dengar baik-baik. {taklimat}', 'Inilah yang menanti tuan hamba, {nama}. {taklimat}', 'Jangan terburu-buru, wahai wira. {taklimat}'] },
  { code: 4,  key: 'bisikan',         label: 'Bisikan',                 when: 'Di sekitar petunjuk',                          pose: 'whispering', content: 'petunjuk',   defaults: ['Matamu itu diletak di lutut kah, {nama}? {petunjuk}', 'Hamba bukan membantu ya, cuma bosan melihat kau berpusing bagai kucing hilang anak. {petunjuk}', 'Dekatkan telinga kau, {nama}. Dengarkan bisikan angin malam. {petunjuk}'] },
  { code: 5,  key: 'pembetulan',      label: 'Pembetulan',              when: 'Selepas tindakan salah, di sekitar penerangan', pose: 'whispering', content: 'penerangan', defaults: ['Alahai, kisah ini tidak berjalan begitu, {nama}. Baru diacah keris sudah pucat lesi! {penerangan}', 'Amboi, tersasar nampaknya! Cuba fikir semula, tuan hamba. {penerangan}', 'Itu bukan yang tercatat dalam sejarah, wahai budak leka. {penerangan}'] },
  { code: 6,  key: 'pujian',          label: 'Pujian',                  when: 'Selepas berjaya, di sekitar maklum balas',     pose: 'impressed',  content: 'maklumbalas', defaults: ['Cis, tidak sangka pula hamba! {maklumbalas}', 'Jangan gembira dahulu. Tuah ayam nampaknya menyebelahi kau hari ini. {maklumbalas}', 'Amboi, tersenyum simpul nampaknya! {maklumbalas}'] },
  { code: 7,  key: 'ceritaRuntuh',    label: 'Cerita runtuh',           when: 'Apabila cerita musnah',                        pose: 'surprised',  defaults: ['Alahai... terkulai layu sebelum sempat bertarung! Lembek benar tulang belulang generasi baru ini! Bangun, dakwat buku ini belum kering, ayuh {nama}, kita putar semula masa!', 'Itu bukan yang berlaku dalam kisah ini, budak leka! Baru diacah keris sudah pucat lesi bagai ditindih jembalang. Bangun, cuba lagi!'] },
  { code: 8,  key: 'pindahJiwa',      label: 'Pindah jiwa',             when: 'Antara babak, dan dari hub ke buku',           pose: 'smirk',      defaults: ['Pegang kuat, {nama}. Jiwa tuan hamba bergerak!', 'Halaman seterusnya menanti... Pengembaraan hebat bermula!'] },
  { code: 9,  key: 'mesinMasa',       label: 'Mesin masa',              when: 'Antara era',                                   pose: 'surprised',  defaults: ['Zaman baharu menanti. Jangan sesat dalam masa, wahai pengembara!'] },
  { code: 10, key: 'cabaran',         label: 'Cabaran',                 when: 'Selepas lencana, sebelum dua pintu',           pose: 'laughing',   defaults: ['AHAHAHA! Tuan hamba berjaya habiskan cerita, tetapi adakah tuan hamba benar-benar faham?'] },
  { code: 11, key: 'latihanBuka',     label: 'Latihan, buka',           when: 'Masuk Gelanggang Latihan',                     pose: 'smirk',      defaults: ['Wira yang bijak ialah wira yang bersedia. Ayuh, asah keris pusaka!', 'Ilmu ialah senjata yang paling berharga. Bertindak segera!'] },
  { code: 12, key: 'latihanMenang',   label: 'Latihan, menang',         when: 'Latihan dimenangi',                            pose: 'impressed',  defaults: ['Bagus! Musuh melata tunduk menyembah bumi. Tetapi ini baru latihan.'] },
  { code: 13, key: 'latihanKalah',    label: 'Latihan, kalah',          when: 'Latihan tewas',                                pose: 'smirk',      defaults: ['Alahai, tewas di gelanggang! Baru diacah keris sudah pucat lesi. Lebih baik tersilap di sini daripada di medan sebenar!'] },
  { code: 14, key: 'kepungSegera',    label: 'Kepungan, tanpa latihan', when: 'Kepungan dipilih dahulu',                      pose: 'surprised',  defaults: ['Berani sungguh, tanpa latihan pula! Mari kita lihat usaha tuan hamba.'] },
  { code: 15, key: 'kepungBersedia',  label: 'Kepungan, selepas latihan', when: 'Kepungan selepas latihan',                   pose: 'smirk',      defaults: ['Tuan hamba sudah bersedia? Kali ini bukan latihan. Asah keris pusaka!'] },
  { code: 16, key: 'kepungLulus',     label: 'Kepungan, lulus',         when: 'Kepungan lulus',                               pose: 'impressed',  defaults: ['Kubu itu tewas! Skor tuan hamba {skor}. Berpesta poralah kita, musuh sudah lari lintang-pukang!'] },
  { code: 17, key: 'kepungGagal',     label: 'Kepungan, gagal',         when: 'Kepungan gagal',                               pose: 'angry',      defaults: ['Aduhai... tewas di medan lagang, terkulai layu bagai ditindih jembalang! Bangun, berlatih dahulu atau bangkit semula?'] },
  { code: 18, key: 'trofi',           label: 'Trofi',                   when: 'Membuka bilik trofi',                          pose: 'smirk',      defaults: ['Ahhh... mengenang kembali detik itu, ya? Asyik benar tuan hamba termenung!', 'Bilik ini menyimpan sebahagian daripada kisah yang telah terjadi.'] },
  { code: 19, key: 'epilog',          label: 'Epilog',                  when: 'Selepas semua bab, mengikut turutan',          pose: 'impressed',  ordered: true, defaults: ['Kau telah menamatkan seluruh kitab, {nama}.', 'Woahh... hebatnya sejarah orang dahulu, bukan?', 'Orang dahulu berjuang supaya kau boleh duduk belajar di meja itu.', 'Pulanglah. Dan jangan lagi kata Sejarah tidak penting.'] },
  { code: 20, key: 'peta',            label: 'Peta',                    when: 'Kata-kata di peta dan nod terkunci',           pose: 'smirk',      defaults: ['Era itu masih terkunci. Selesaikan {era} dahulu, wahai pengembara.', 'Jalan itu belum terbuka, {nama}. Bersabarlah.'] }
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const CATEGORY_BY_CODE = Object.fromEntries(CATEGORIES.map((c) => [c.code, c]));

/** The two role lines of a narrative (DialogueLine rows with narrativeID, no scene). */
export const ROLE_LINES = {
  1: { label: 'Tugas bersejarah (kata lencana)', fallback: 'Inilah tugasku, {nama}: membuat keputusan yang menjadikan sejarah itu berlaku. Kerana kau meminjamkan jiwa, aku dapat melaksanakannya.' },
  2: { label: 'Pembuka pengajaran', fallback: 'Daripada peristiwa itu, kita belajar satu perkara penting.' },
  3: { label: 'Pengenalan peranan (Pendekar Bayang)', fallback: 'Jiwamu kutarik ke dalam jasad {peranan}. Lihat melalui matanya, dan bercakaplah dengan suaranya.' }
};

/* -------------------------------------------------------------------------- */
/* sequenceOrder encoding                                                     */
/* -------------------------------------------------------------------------- */
export const encodeOrder = (era, category, line) => Number(era) * 10000 + Number(category) * 100 + Number(line);

export const decodeOrder = (n) => {
  const v = Number(n);
  return { era: Math.floor(v / 10000), category: Math.floor((v % 10000) / 100), line: v % 100 };
};

/** true when n could be an entity line code (era 0..99, category 1..20, line 1..99). */
export const isEntityOrder = (n) => {
  if (!Number.isInteger(n) || n < 101) return false;
  const d = decodeOrder(n);
  return d.era <= MAX_ERA && !!CATEGORY_BY_CODE[d.category] && d.line >= 1;
};

/* -------------------------------------------------------------------------- */
/* Validation (server uses it; the editor can use it too)                     */
/* -------------------------------------------------------------------------- */
export const validateLineText = (raw) => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: false, message: 'Ayat tidak boleh kosong.' };
  if (text.length > MAX_LINE) return { ok: false, message: `Ayat terlalu panjang (maksimum ${MAX_LINE} aksara).` };
  if (/[<>]/.test(text)) return { ok: false, message: 'Ayat tidak boleh mengandungi < atau >.' };
  const unknown = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((k) => !(k in MARKERS));
  if (unknown.length) return { ok: false, message: `Penanda tidak dikenali: {${unknown[0]}}.` };
  return { ok: true, text };
};

/* -------------------------------------------------------------------------- */
/* Filling markers                                                            */
/* -------------------------------------------------------------------------- */
/**
 * fillMarkers(template, values, contentKey)
 * Replaces {marker}s. If the category expects dynamic content (contentKey) and the
 * template has no such marker, the content is added on a new line so a hint can never be hidden.
 * Markers without a value are removed.
 */
export const fillMarkers = (template, values = {}, contentKey = null) => {
  let text = String(template || '');
  let hadContent = false;
  if (contentKey) hadContent = text.includes(`{${contentKey}}`);
  text = text.replace(/\{([a-z]+)\}/g, (_, k) => (values[k] !== undefined && values[k] !== null ? String(values[k]) : ''));
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\s{2,}$/g, '').trim();
  if (contentKey && !hadContent && values[contentKey]) text += `\n${values[contentKey]}`;
  return text;
};

/**
 * Pick a line for a moment: this era's lines, then all-era (0) lines, then defaults.
 * overrides = [{ era, category, line, text }]  (as the API returns them)
 * `lastUsed` (a text) is avoided when there is a choice.
 */
export const pickLine = (overrides, category, eraID, lastUsed = null) => {
  const code = typeof category === 'string' ? CATEGORY_BY_KEY[category].code : category;
  const cat = CATEGORY_BY_CODE[code];
  const mine = (overrides || []).filter((l) => l.category === code);
  let pool = mine.filter((l) => l.era === Number(eraID)).sort((a, b) => a.line - b.line).map((l) => l.text);
  if (!pool.length) pool = mine.filter((l) => l.era === 0).sort((a, b) => a.line - b.line).map((l) => l.text);
  if (!pool.length) pool = [...cat.defaults];
  if (cat.ordered) return pool;                       // prologue / epilogue: all lines, in order
  const choices = pool.length > 1 ? pool.filter((t) => t !== lastUsed) : pool;
  return [choices[Math.floor(Math.random() * choices.length)]];
};
