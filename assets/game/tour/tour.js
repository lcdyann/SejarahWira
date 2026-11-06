/**
 * assets/game/tour/tour.js  -  Tour: panduan kali pertama pada skrin sebenar
 * MODULE: tour  (panduan hab dan peta; markup dalam tour.html, rupa dalam tour.css)
 * USE CASE: UC-01, UC-03 (permulaan)
 */
/**
 * ============================================================================
 * tour.js  -  panduan "cara bermain" yang berlaku DI ATAS hab dan peta sebenar
 *
 * BILA IA KELUAR (kali pertama sahaja, TIDAK keluar ketika log masuk):
 *   log masuk -> pilih avatar -> prolog -> HAB (panduan hab) -> klik Buku Sejarah
 *   -> PETA (panduan peta) -> murid berjalan ke era pertama dan menekan Mulakan misi
 *
 * Murid melihat butang sebenar bercahaya dan Pendekar Bayang menerangkannya satu demi satu.
 * Tiada skrin tiruan. Selepas selesai (atau dilangkau), ia ditanda dalam pelayar
 * (localStorage, tidak menyentuh pangkalan data) dan tidak keluar lagi.
 *
 * UJI SEMULA: tambah  ?tour=1  pada alamat permainan, panduan keluar setiap kali masuk hab / peta.
 * ============================================================================
 */
import { el, tpl } from '../core/core.js';
console.info('[tour] tour.js dimuatkan (versi cincin tepat pada benda)');
import { entityPortrait } from '../npc/entity.js';

/* ========================================================================== */
/* AYAT PENDEKAR BAYANG  -  tukar ayat di sini sahaja                         */
/* ========================================================================== */
export const TOUR_UCAPAN = {
  /* ---- panduan di hab: butang demi butang, Buku Sejarah di hujung ---- */
  hub: {
    door:     'Itu Pintu. Di situ kamu melaraskan muzik, kesan bunyi dan suara pembaca cerita. Kalau telinga penat, perlahankan sahaja.',
    mirror:   'Cermin ini untuk menukar rupa wiramu. Tukarlah bila-bila masa. Hamba tak kisah, asal kacak.',
    notebook: 'Diari ini mencatat perjalananmu, daripada era yang dibuka dan lencana yang dikumpul, hingga keputusan Kepungan.',
    trophy:   'Di bilik trofi, artifak setiap era menunggu. Lulus Kepungan Agung sesuatu era, barulah bayang artifaknya bercahaya.',
    replay:   'Mahu dengar semula bagaimana kamu ditarik masuk ke dalam buku? Tekan Ulang Prolog.',
    tema:     'Bulan ini menukar malam kepada siang. Pilih yang paling selesa untuk matamu.',
    book:     'Dan inilah Buku Sejarah, pintu ke segala zaman. Peta terbentang dari sini, dan pengembaraanmu bermula di sini.',
    /* selepas panduan hab, Pendekar menyuruh murid menekan buku (gelembung kekal sehingga buku ditekan) */
    buka:     'Sudah faham? Bagus. Sekarang tekan Buku Sejarah itu, dan mari kita buka lembaran pertama!'
  },

  /* ---- panduan di peta ---- */
  peta: {
    gerak: 'Inilah Peta Sejarah. Gerakkan wiramu dengan W A S D atau anak panah, atau klik di atas jalan untuk berjalan ke sana.',
    era:   'Setiap penanda di jalan ialah satu era. Bila kamu sudah dekat, tekan E untuk membukanya. Era yang masih terkunci hanya terbuka selepas era sebelumnya tamat.',
    jeda:  'Tekan Esc bila-bila masa untuk berhenti sebentar atau kembali ke meja. Misi yang sudah siap sentiasa disimpan.',
    mula:  'Sekarang giliran kamu! Berjalanlah ke era pertama, tekan E, lalu pilih Mulakan misi. Hamba menunggu di dalam cerita.',
    /* gelembung di peta selepas panduan tamat */
    buka:  'Pergi ke penanda era pertama, tekan E, dan pilih Mulakan misi!'
  }
};

/* ========================================================================== */
/* INGATAN "SUDAH TENGOK"  (pelayar murid sahaja, pangkalan data tidak disentuh) */
/* bahagian: 'prolog' (prolog sudah dimainkan), 'hub', 'peta'                  */
/* ========================================================================== */
const kunci = (studentID, bahagian) => `sw_tour_${studentID}_${bahagian}`;

export function tourSudah(studentID, bahagian) {
  try { return localStorage.getItem(kunci(studentID, bahagian)) === '1'; } catch { return false; }
}

export function tourTanda(studentID, bahagian) {
  try { localStorage.setItem(kunci(studentID, bahagian), '1'); } catch { /* abaikan */ }
}

/** ?tour=1 pada alamat = paksa panduan keluar (untuk menguji) */
export const tourPaksa = () => /[?&]tour=1/.test(window.location.search);

/* ========================================================================== */
/* KOTAK SEBENAR SESUATU BENDA                                                */
/* Gambar benda (cth. pintu.png) sering ada ruang lut sinar di tepinya, jadi   */
/* kotak butang lebih besar daripada benda yang kelihatan. Fungsi ini mengimbas */
/* piksel tidak lut sinar dan memulangkan kotak yang sebenar-benar menutup     */
/* benda itu, supaya cincin bercahaya tepat. Jika gagal, kotak butang dipakai.  */
/* ========================================================================== */
function kotakSebenar(sasaran) {
  const kotakButang = sasaran.getBoundingClientRect();
  const gambar = sasaran.querySelector('img');
  if (!gambar || !gambar.naturalWidth) return kotakButang;
  try {
    const L = 96;                                                   // lebar imbasan (kecil supaya laju)
    const T = Math.max(1, Math.round(L * gambar.naturalHeight / gambar.naturalWidth));
    const kanvas = document.createElement('canvas');
    kanvas.width = L;
    kanvas.height = T;
    const g = kanvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(gambar, 0, 0, L, T);
    const data = g.getImageData(0, 0, L, T).data;
    let x0 = L, y0 = T, x1 = -1, y1 = -1;
    for (let y = 0; y < T; y += 1) {
      for (let x = 0; x < L; x += 1) {
        if (data[(y * L + x) * 4 + 3] > 40) {                       // piksel yang kelihatan
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return kotakButang;
    // gambar dilukis dengan object-fit: contain, jadi kotak <img> boleh lebih besar daripada gambar
    // yang kelihatan (ada ruang kosong atas / bawah). Kira dahulu kotak sebenar gambar di tengah kotak <img>.
    const k = gambar.getBoundingClientRect();
    const nisbah = Math.min(k.width / gambar.naturalWidth, k.height / gambar.naturalHeight);
    const lebarGambar = gambar.naturalWidth * nisbah;
    const tinggiGambar = gambar.naturalHeight * nisbah;
    const kiriGambar = k.left + (k.width - lebarGambar) / 2;
    const atasGambar = k.top + (k.height - tinggiGambar) / 2;
    return {
      left: kiriGambar + (lebarGambar * x0) / L,
      top: atasGambar + (tinggiGambar * y0) / T,
      width: (lebarGambar * (x1 - x0 + 1)) / L,
      height: (tinggiGambar * (y1 - y0 + 1)) / T
    };
  } catch (err) {
    console.warn('[tour] imbasan gambar untuk cincin gagal, kotak butang dipakai:', err);
    return kotakButang;                                              // cth. gambar dari domain lain
  }
}

/* ========================================================================== */
/* Tour: jalankan senarai langkah di atas satu adegan                         */
/* ========================================================================== */
export class Tour {
  /** @param adegan  adegan yang sedang dipaparkan (HubScene / MapScene) */
  constructor(adegan) {
    this.adegan = adegan;
  }

  /**
   * Jalankan langkah demi langkah.
   * @param langkah  [{ sasaran: elemen atau null, teks: 'ayat', butang: 'teks butang terakhir',
   *                   kotak: { x, y, w, h } (pilihan, peratus pentas; paksa kedudukan cincin) }]
   * @returns Promise<'selesai' | 'langkau' | 'keluar'>
   */
  run(langkah) {
    const adegan = this.adegan;
    const root = adegan.root;

    // lapisan: penghalang klik + cincin cahaya + kad (susun atur kad ada dalam tour.html)
    const sekat = el('div', 'tour-sekat');
    const cincin = el('div', 'tour-cincin hidden');
    const kad = tpl('tour-kad');
    kad.refs.potret.appendChild(entityPortrait('smirk', 'small'));
    root.append(sekat, cincin, kad);

    return new Promise((resolve) => {
      let i = 0;
      let tamat = false;
      let lepasKekunci = () => {};

      const tutup = (hasil) => {
        if (tamat) return;
        tamat = true;
        lepasKekunci();
        sekat.remove();
        cincin.remove();
        kad.remove();
        resolve(hasil);
      };

      /** letak cincin pada sasaran (ukuran dalam piksel pentas 960 x 540) dan kad di sebelah yang kosong */
      const letak = (sasaran, kotak) => {
        if (!sasaran && !kotak) {
          cincin.classList.add('hidden');
          sekat.classList.add('tanpa-sasaran');
          kad.classList.add('di-bawah');
          kad.classList.remove('di-atas');
          return;
        }
        sekat.classList.remove('tanpa-sasaran');
        let kiri, atas, lebar, tinggi;                       // semua dalam piksel pentas 960 x 540
        if (kotak) {
          // kotak tangan (peratus pentas, sama seperti hubConfig.js): menang atas imbasan automatik
          kiri = (kotak.x / 100) * 960;
          atas = (kotak.y / 100) * 540;
          lebar = (kotak.w / 100) * 960;
          tinggi = (kotak.h / 100) * 540;
        } else {
          const R = root.getBoundingClientRect();
          const r = kotakSebenar(sasaran);
          const skala = R.width / 960;                       // pentas boleh dikecil / dibesarkan
          kiri = (r.left - R.left) / skala;
          atas = (r.top - R.top) / skala;
          lebar = r.width / skala;
          tinggi = r.height / skala;
        }
        Object.assign(cincin.style, {
          left: `${kiri - 6}px`, top: `${atas - 6}px`, width: `${lebar + 12}px`, height: `${tinggi + 12}px`
        });
        cincin.classList.remove('hidden');
        // sasaran di bahagian bawah skrin: kad di atas, selainnya kad di bawah
        const bawah = atas + tinggi / 2 < 270;
        kad.classList.toggle('di-bawah', bawah);
        kad.classList.toggle('di-atas', !bawah);
      };

      const papar = () => {
        const l = langkah[i];
        kad.refs.teks.textContent = l.teks;
        kad.refs.langkah.textContent = `${i + 1} / ${langkah.length}`;
        kad.refs.seterusnya.textContent = i === langkah.length - 1 ? (l.butang || 'Faham') : 'Seterusnya';
        kad.refs.langkau.classList.toggle('hidden', i === langkah.length - 1);
        letak(l.sasaran, l.kotak);
      };

      const seterusnya = () => {
        if (i >= langkah.length - 1) { tutup('selesai'); return; }
        i += 1;
        papar();
      };

      kad.refs.seterusnya.addEventListener('click', seterusnya);
      kad.refs.langkau.addEventListener('click', () => tutup('langkau'));

      // papan kekunci: Enter / Space = seterusnya, Esc = langkau; kekunci lain ditelan supaya hab tidak bergerak
      lepasKekunci = adegan.keys({
        onKeyDown: (k) => {
          if (k === 'Enter' || k === ' ') seterusnya();
          else if (k === 'Escape') tutup('langkau');
          return true;
        }
      });

      // jika adegan ditinggalkan semasa panduan, bersihkan
      adegan.own(() => tutup('keluar'));

      papar();
    });
  }
}
