/**
 * ============================================================================
 * utils/passwordPolicy.js  -  peraturan kata laluan (pelayan). Peraturan SAMA dengan
 * assets/js/passwordRules.js yang menunjukkan amaran langsung di halaman.
 *
 * Peraturan wajib (ditolak jika dilanggar):
 *   1. 8 hingga 72 aksara (had 72 bait kerana format hash)
 *   2. sekurang-kurangnya satu huruf dan satu nombor
 *   3. bukan kata laluan biasa (contoh: password123, 12345678, qwerty123)
 *   4. tidak mengandungi nama pengguna / bahagian e-mel sebelum @ (jika 3 aksara atau lebih)
 *   5. tidak berulang (aaaaaaaa) dan bukan urutan mudah (12345678, abcdefgh)
 * Tambahan (hanya cadangan, tidak menolak): huruf besar + kecil, simbol, panjang 12+.
 * Log masuk TIDAK menyemak peraturan ini supaya akaun lama masih boleh masuk.
 * ============================================================================
 */

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'kata laluan', 'katalaluan', 'katalaluan1', 'katalaluan123',
  '12345678', '123456789', '1234567890', '11111111', '00000000', '12341234', '123123123', '87654321', '1q2w3e4r', '1qaz2wsx',
  'qwerty123', 'qwertyui', 'qwertyuiop', 'abc12345', 'abcd1234', 'abcdefgh', 'iloveyou', 'welcome1', 'admin123', 'admin1234',
  'sejarah123', 'sejarahwira', 'sejarahwira1', 'malaysia1', 'malaysia123', 'sekolah123', 'cikgu1234', 'murid1234', 'pelajar123',
  'letmein1', 'monkey123', 'dragon123', 'football1', 'baseball1'
]);

const SEQUENCES = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** Susunan pertama ialah mesej yang dipaparkan. */
export const RULES = {
  length: 'Panjang 8 hingga 72 aksara.',
  letter: 'Ada sekurang-kurangnya satu huruf.',
  digit: 'Ada sekurang-kurangnya satu nombor.',
  common: 'Bukan kata laluan biasa yang mudah diteka.',
  username: 'Tidak mengandungi nama pengguna atau e-mel anda.',
  pattern: 'Bukan aksara berulang atau urutan mudah (contoh: aaaaaaaa, 12345678).'
};

const isSequence = (s) => {
  const t = s.toLowerCase();
  return SEQUENCES.some((seq) => t.length >= 6 && seq.includes(t));
};

/**
 * @param {string} password
 * @param {{username?:string,name?:string}} [who]  nama pengguna / nama untuk semakan "tidak mengandungi"
 * @returns {{ok:boolean, failed:string[], problems:string[], score:number, label:string, tips:string[]}}
 */
export function checkPasswordRules(password, who = {}) {
  const pw = String(password ?? '');
  const lower = pw.toLowerCase();
  const failed = [];

  if (pw.length < 8 || Buffer.byteLength(pw) > 72) failed.push('length');
  if (!/\p{L}/u.test(pw)) failed.push('letter');
  if (!/\d/.test(pw)) failed.push('digit');
  if (COMMON.has(lower)) failed.push('common');

  const names = [who.username, String(who.username || '').split('@')[0]]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter((s) => s.length >= 3);
  if (names.some((n) => lower.includes(n))) failed.push('username');

  if (/^(.)\1+$/.test(pw) || /(.)\1{4,}/.test(pw) || isSequence(pw)) failed.push('pattern');

  // kekuatan (0-4) untuk meter: hanya bermakna jika semua peraturan wajib dipenuhi
  let score = 0;
  if (!failed.length) {
    score = 1;
    if (pw.length >= 10) score += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score += 1;
  }
  const label = failed.length ? 'Lemah' : ['', 'Sederhana', 'Baik', 'Kuat', 'Sangat kuat'][score];

  const tips = [];
  if (!failed.length) {
    if (!(/[a-z]/.test(pw) && /[A-Z]/.test(pw))) tips.push('Campurkan huruf besar dan kecil.');
    if (!/[^A-Za-z0-9]/.test(pw)) tips.push('Tambah satu simbol (contoh: ! @ #).');
    if (pw.length < 12) tips.push('Gunakan 12 aksara atau lebih.');
  }
  return { ok: failed.length === 0, failed, problems: failed.map((k) => RULES[k]), score, label, tips };
}

/** Satu ayat mesej untuk ruangan ralat pelayan. */
export function passwordMessage(password, who) {
  const r = checkPasswordRules(password, who);
  if (r.ok) return '';
  return `Kata laluan belum memenuhi syarat: ${r.problems.join(' ')}`;
}
