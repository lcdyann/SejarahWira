/**
 * assets/game/transition/halaman.js  -  Book flip transition between scenes
 * MODULE: transition  (Screen transitions: soul pull, time machine, book flip)
 * USE CASE: UC-03   CLASS DIAGRAM: -
 */
/**
 * ============================================================================
 * halaman.js  -  Peralihan antara babak: buku diselak
 *
 * Urutan penuh (dalam story/missionScene.js -> play()):
 *   1. tangan menarik jiwa murid      (transition.soulPull, core.js)
 *   2. selakBuku() di bawah           : buku terbuka memenuhi skrin, halaman diselak 3 kali
 *   3. SEMASA buku kelihatan, babak ditukar (middle), lalu buku dan kesan tarikan memudar
 * Pendekar Bayang berkata: "Kisah ini belum selesai..."
 * Susun atur: transition/transition.html -> tpl-halaman.   Gambar & gerakan: transition/transition.css -> .sb-*
 * ============================================================================
 */
import { sleep, tpl } from '../core/core.js';

/** Ayat Pendekar Bayang semasa menukar babak (ubah di sini jika mahu ayat lain) */
export const AYAT_PERALIHAN = 'Kisah ini belum selesai...';

/**
 * @param host   lapisan tempat buku diletakkan (transition.layer supaya berada DI ATAS kesan tarikan jiwa)
 * @param o      { ms, middle }  ms = jumlah masa buku kelihatan; middle = tukar babak
 */
export async function selakBuku(host, { ms = 2200, middle = null } = {}) {
  const wrap = tpl('halaman', { speaker: 'Pendekar Bayang', line: AYAT_PERALIHAN });
  wrap.style.setProperty('--ms', `${ms}ms`);        // CSS mengira masa selakan daripada nilai ini
  host.appendChild(wrap);
  void wrap.offsetWidth;                            // paksa pelayar melukis dahulu supaya kesan memudar berjalan
  wrap.classList.add('on');

  await sleep(ms * 0.6);                            // halaman sudah beberapa kali diselak
  if (middle) await middle();                       // tukar babak di belakang tabir
  await sleep(ms * 0.4);

  wrap.classList.remove('on');                      // memudar keluar
  await sleep(500);
  wrap.remove();
}
