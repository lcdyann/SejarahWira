/**
 * ============================================================================
 * koyak.js  -  bentuk kepingan KERTAS KOYAK untuk kepingan lencana
 *
 * koyakPaths(bilangan, saiz, benih)  ->  senarai { d } (tepat `bilangan` kepingan)
 *
 * Kenapa kertas koyak (bukan teka-teki)?
 *   Teka-teki hanya boleh dibahagi ikut petak (lajur x baris), jadi bilangan kepingan
 *   tidak sentiasa sama dengan bilangan misi. Kertas koyak boleh dibahagi kepada
 *   BILANGAN YANG TEPAT: satu misi = satu kepingan, untuk berapa-berapa misi pun.
 *
 * Cara kerjanya (ringkas):
 *   1. Gambar dibahagi kepada beberapa baris. Bilangan kepingan dibahagi sama rata antara baris.
 *   2. Garis antara baris, dan garis antara kepingan dalam satu baris, dilukis sebagai garis
 *      BERGERIGI (koyak): sedikit bergelombang + gigi kecil rawak.
 *   3. Kedua-dua kepingan di sebelah garis menggunakan garis gerigi yang SAMA, jadi tiada ruang kosong.
 *   4. `benih` (nombor era) menetapkan gerigi: sama setiap kali bagi era yang sama.
 *
 * Fail ini hanya mengira bentuk. Warna dan susun atur: templates.html (tpl-pieces) dan game.css.
 * ============================================================================
 */

/** penjana nombor rawak yang tetap bagi benih yang sama (mulberry32) */
function penjana(benih) {
  let a = (benih * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Garis koyak dari (ax, ay) ke (bx, by): senarai titik.
 * `tegak` = arah gerigi (sisi garis); `rawak` = penjana nombor.
 */
function garisKoyak(ax, ay, bx, by, rawak, kasar = 1) {
  const panjang = Math.hypot(bx - ax, by - ay);
  const bahagian = Math.max(4, Math.round(panjang / 7));        // satu titik setiap ~7 unit
  const nx = -(by - ay) / panjang;                              // arah serenjang
  const ny = (bx - ax) / panjang;
  const fasa = rawak() * Math.PI * 2;
  const titik = [[ax, ay]];
  for (let i = 1; i < bahagian; i += 1) {
    const u = i / bahagian;
    const gelombang = Math.sin(u * Math.PI * 3 + fasa) * 4.5 * kasar;   // lengkung perlahan
    const gigi = (rawak() - 0.5) * 7 * kasar;                           // gigi kecil rawak
    const sisi = gelombang + gigi;
    titik.push([ax + (bx - ax) * u + nx * sisi, ay + (by - ay) * u + ny * sisi]);
  }
  titik.push([bx, by]);
  return titik;
}

/** kedudukan y pada garis (mendatar) di x tertentu */
function yPada(garis, x) {
  for (let i = 1; i < garis.length; i += 1) {
    if (x <= garis[i][0]) {
      const [x0, y0] = garis[i - 1];
      const [x1, y1] = garis[i];
      return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return garis[garis.length - 1][1];
}

/** bahagian garis (mendatar) dari x1 hingga x2, termasuk titik hujung yang tepat */
function potong(garis, x1, x2) {
  const dalam = garis.filter(([x]) => x > x1 && x < x2);
  return [[x1, yPada(garis, x1)], ...dalam, [x2, yPada(garis, x2)]];
}

const tulis = (titik) => titik.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

export function koyakPaths(bilangan, saiz, benih = 1) {
  const rawak = penjana(benih);
  const baris = Math.max(1, Math.round(Math.sqrt(bilangan)));
  const dasar = Math.floor(bilangan / baris);
  const lebihan = bilangan % baris;                       // beberapa baris mendapat satu kepingan lebih
  const tinggi = saiz / baris;

  // garis mendatar antara baris (garis pertama dan terakhir lurus: tepi gambar)
  const mendatar = [];
  for (let j = 0; j <= baris; j += 1) {
    const y = j * tinggi;
    mendatar.push(j === 0 || j === baris ? [[0, y], [saiz, y]] : garisKoyak(0, y, saiz, y, rawak));
  }

  const hasil = [];
  for (let j = 0; j < baris; j += 1) {
    const atas = mendatar[j];
    const bawah = mendatar[j + 1];
    const bilBaris = dasar + (j < lebihan ? 1 : 0);
    const lebar = saiz / bilBaris;

    // garis menegak antara kepingan dalam baris ini (dari atas ke bawah)
    const menegak = [];
    for (let k = 0; k <= bilBaris; k += 1) {
      const x = k * lebar;
      const hujungAtas = yPada(atas, x);
      const hujungBawah = yPada(bawah, x);
      menegak.push(k === 0 || k === bilBaris
        ? [[x, hujungAtas], [x, hujungBawah]]                        // tepi gambar: lurus
        : garisKoyak(x, hujungAtas, x, hujungBawah, rawak));
    }

    for (let k = 0; k < bilBaris; k += 1) {
      const x1 = k * lebar;
      const x2 = x1 + lebar;
      const titik = [
        ...potong(atas, x1, x2),                                     // atas: kiri ke kanan
        ...menegak[k + 1].slice(1),                                  // kanan: atas ke bawah
        ...potong(bawah, x1, x2).reverse().slice(1),                 // bawah: kanan ke kiri
        ...menegak[k].slice(0, -1).reverse().slice(0, -1)            // kiri: bawah ke atas
      ];
      hasil.push({ d: `${tulis(titik)} Z` });
    }
  }
  return hasil;
}
