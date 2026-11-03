/**
 * ============================================================================
 * support.js  -  Modul Bantuan Pembelajaran Adaptif
 *
 * KEGUNAAN (use case): membantu murid memahami PERMAINAN itu sendiri,
 * bukan menjawab soalan bagi pihak murid.
 *
 *  UC-A  Murid tidak faham apa yang berlaku dalam dialog
 *        -> butang "Bantuan (B)" -> tab "Apa berlaku?" (ringkasan babak + baris terakhir)
 *  UC-B  Murid tidak tahu cara bermain sesuatu misi
 *        -> tab "Apa perlu buat?" (arahan) dan tab "Tunjuk cara" (demo bergerak)
 *  UC-C  Kali PERTAMA murid bertemu satu jenis misi
 *        -> demo bergerak keluar sendiri sekali sahaja (firstTime)
 *  UC-D  Murid kelihatan tersangkut (diam lama / banyak silap)
 *        -> butang Bantuan bersinar (nudge); murid memilih sendiri untuk membuka
 *
 * Bantuan TIDAK memberi jawapan. Petunjuk jawapan kekal pada butang "Petunjuk (H)".
 * Segala susun atur ada dalam assets/html/templates.html (tpl-bantuan, tpl-tutor-1..5).
 * ============================================================================
 */
import { tpl } from './core.js';

/** Teks bantuan bagi setiap jenis misi (arahan ringkas + cara menggunakan) */
export const MEKANIK = {
  1: { nama: 'Susun Garis Masa', buat: 'Susun peristiwa mengikut turutan masa.', cara: 'Klik satu kad, kemudian klik petak nombor yang betul. Kad yang salah memutuskan rantai.' },
  2: { nama: 'Cari Bukti',       buat: 'Cari semua bukti yang tersembunyi dalam gambar.', cara: 'Klik tempat yang kau rasa ada bukti. Panel di kanan boleh ditutup dengan butang segi tiga.' },
  3: { nama: 'Bantu Watak',      buat: 'Pilih tindakan yang betul untuk membantu watak itu.', cara: 'Klik satu pilihan sahaja. Pada misi ini sekali silap, cerita runtuh.' },
  4: { nama: 'Padanan',          buat: 'Padankan setiap kad dengan pasangannya.', cara: 'Klik satu kad, kemudian klik pasangannya. Mana-mana dua kad boleh dipadankan, tidak kira kedudukan.' },
  5: { nama: 'Nyahkod Petunjuk', buat: 'Lengkapkan petunjuk dengan perkataan yang betul.', cara: 'Baca petunjuk, kemudian klik perkataan yang melengkapkannya.' }
};

export class SupportModule {
  /** @param game  objek Game (untuk openModal)   @param studentID  kunci simpanan "sudah tengok tutorial" */
  constructor(game, studentID) {
    this.game = game;
    this.studentID = studentID;
    this.opened = 0;          // berapa kali murid membuka bantuan (untuk menyesuaikan tab pertama)
  }

  /* ------------------------------------------------ ingatan "sudah tengok" */
  #key(type) { return `sw_tutor_${this.studentID}_${type}`; }
  #seen(type) { try { return localStorage.getItem(this.#key(type)) === '1'; } catch { return false; } }
  #markSeen(type) { try { localStorage.setItem(this.#key(type), '1'); } catch { /* abaikan */ } }

  /** Elemen demo bergerak untuk satu jenis misi */
  demo(type) { return tpl(`tutor-${Number(type)}`); }

  /**
   * UC-C: tutorial kali pertama. Hanya keluar SEKALI bagi setiap jenis misi.
   * Dipulangkan selepas murid menekan "Faham, mari mula!".
   */
  async firstTime(type) {
    if (!MEKANIK[type] || this.#seen(type)) return;
    this.#markSeen(type);
    await this.game.openModal({
      title: `Misi baharu: ${MEKANIK[type].nama}`,
      body: this.demo(type),
      buttons: [{ label: 'Faham, mari mula!', primary: true }]
    });
  }

  /**
   * UC-A / UC-B: panel Bantuan (SATU skrin, tanpa tab dan tanpa skrol).
   * Kiri: apa berlaku + apa perlu dibuat. Kanan: demo bergerak.
   * @param ctx { mode:'story'|'quest', storyline, lastLine, questType, questText }
   */
  async open(ctx) {
    this.opened += 1;
    const info = MEKANIK[ctx.questType] || null;
    const isQuest = ctx.mode === 'quest' && info;
    const panel = tpl('bantuan', {
      story: ctx.storyline || 'Ikuti perbualan dan perhatikan siapa bercakap kepada siapa.',
      last: ctx.lastLine ? `Baru dikatakan  \u00BB  ${ctx.lastLine}` : '',
      doTitle: isQuest ? `Misi: ${info.nama}` : 'Apa perlu dibuat?',
      doText: isQuest ? `${ctx.questText || info.buat} ${info.cara}` : 'Teruskan cerita. Bila kotak biru muncul, itu Giliran Anda: pilih jawapan.'
    });
    // teks panjang (guru menambah kandungan): kecilkan sedikit huruf, tidak dipotong
    const panjang = (ctx.storyline || '').length + (ctx.questText || '').length > 380;
    panel.classList.toggle('long', panjang);
    // demo: mekanik misi, atau cara bercerita bila tiada misi
    panel.refs.demo.appendChild(tpl(isQuest ? `tutor-${Number(ctx.questType)}` : 'tutor-0'));
    // ADAPTIF: bila murid membuka bantuan berkali-kali pada misi yang sama, demo diserlahkan
    if (isQuest && this.opened >= 2) panel.refs.demo.classList.add('hot');

    await this.game.openModal({ title: 'Bantuan', body: panel, buttons: [{ label: 'Faham, teruskan', primary: true }] });
  }
}
