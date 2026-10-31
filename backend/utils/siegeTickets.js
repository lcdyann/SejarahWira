import crypto from 'node:crypto';

/**
 * siegeTickets.js
 * "Tiket" bagi satu percubaan The Great Siege.
 *
 * Kenapa: markah TIDAK boleh datang dari pelayar. Pelayan simpan kunci jawapan
 * dalam tiket, pelajar hantar jawapan satu demi satu, dan markah akhir dikira
 * oleh pelayan sahaja.
 *
 * Tiket disimpan dalam memori (hilang bila pelayan dimulakan semula - pelajar
 * hanya perlu mula Kepungan semula). Satu proses sahaja; jika kelak guna
 * beberapa proses, pindahkan ke pangkalan data/Redis.
 */
const HAYAT_MS = 15 * 60 * 1000;      // Kepungan 5 minit + ruang lebih
const MAKS_TIKET = 5000;              // had memori
const tiket = new Map();

function bersihkan() {
  const kini = Date.now();
  for (const [id, t] of tiket) if (t.tamat < kini) tiket.delete(id);
  // jika masih terlalu banyak, buang yang paling lama
  while (tiket.size > MAKS_TIKET) tiket.delete(tiket.keys().next().value);
}

/** Cipta tiket baharu. Tiket lama pelajar yang sama (era sama) dibatalkan. */
export function createTicket({ studentID, assessmentID, eraID, questions }) {
  bersihkan();
  for (const [id, t] of tiket) {
    if (t.studentID === studentID && t.eraID === eraID) tiket.delete(id);
  }
  const id = crypto.randomBytes(18).toString('base64url');
  tiket.set(id, {
    studentID, assessmentID, eraID,
    tamat: Date.now() + HAYAT_MS,
    // questionID -> kunci pelayan
    soalan: new Map(questions.map((q) => [String(q.questionID), {
      betul: String(q.correctAnswer).toUpperCase(),
      penerangan: q.explanation || '',
      jawapan: null,               // jawapan pertama sahaja diambil kira
      tepat: false
    }]))
  });
  return id;
}

/** Ambil tiket yang sah milik pelajar ini, atau null. */
export function getTicket(id, studentID) {
  const t = tiket.get(String(id || ''));
  if (!t || t.studentID !== studentID || t.tamat < Date.now()) return null;
  return t;
}

/** Rekod jawapan. Jawapan kedua bagi soalan yang sama tidak mengubah apa-apa. */
export function answerTicket(t, questionID, pilihan) {
  const s = t.soalan.get(String(questionID));
  if (!s) return null;
  if (s.jawapan === null) {
    s.jawapan = String(pilihan).toUpperCase();
    s.tepat = s.jawapan === s.betul;
  }
  return { correct: s.tepat, correctAnswer: s.betul, explanation: s.penerangan };
}

/** Kira markah (0-100) dan tutup tiket (sekali guna). */
export function closeTicket(id, t) {
  const jumlah = t.soalan.size || 1;
  let betul = 0;
  for (const s of t.soalan.values()) if (s.tepat) betul += 1;
  tiket.delete(id);
  return { correct: betul, total: t.soalan.size, score: Math.round((betul / jumlah) * 100) };
}
