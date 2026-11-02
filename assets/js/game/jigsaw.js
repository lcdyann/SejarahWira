/**
 * ============================================================================
 * jigsaw.js  -  bentuk kepingan teka-teki (jigsaw) untuk kepingan lencana
 *
 * jigsawPaths(lajur, baris, saiz, benih)  ->  senarai { d, g } (satu bagi setiap kepingan):
 *      d = bentuk penuh (untuk memotong gambar), g = garisan dalam sahaja (untuk dilukis)
 *
 * Cara kerjanya (ringkas):
 *   1. Gambar dibahagi kepada petak (lajur x baris).
 *   2. Setiap garis antara dua petak diberi satu "bonjol": ke luar bagi satu kepingan,
 *      ke dalam bagi kepingan jiran, jadi kedua-duanya muat rapat.
 *   3. Garis di tepi gambar kekal lurus.
 *   4. Arah bonjol (keluar atau masuk) ditetapkan oleh `benih`: sama setiap kali bagi era yang sama.
 *
 * Fail ini hanya mengira bentuk. Warna dan susun atur ada dalam templates.html (tpl-pieces) dan game.css.
 * ============================================================================
 */

/**
 * Bentuk satu bonjol pada garis sepanjang 1. Setiap baris = [x1, y1, x2, y2, hujungX, hujungY]
 * (satu lengkung bezier). x = kedudukan sepanjang garis (0 hingga 1), y = ketinggian bonjol.
 */
const BONJOL = [
  [0.20, 0.00, 0.34, 0.02, 0.38, 0.05],   // mendekati leher
  [0.42, 0.08, 0.30, 0.16, 0.34, 0.22],   // leher mengecil, kepala membesar
  [0.38, 0.28, 0.62, 0.28, 0.66, 0.22],   // bahagian atas kepala
  [0.70, 0.16, 0.58, 0.08, 0.62, 0.05],   // kembali ke leher
  [0.66, 0.02, 0.80, 0.00, 1.00, 0.00]    // keluar ke garis lurus
];

/** nombor "rawak" yang tetap bagi (a, b, benih): hasilnya +1 atau -1 */
function arah(a, b, benih) {
  const n = (Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(benih + 1, 83492791)) >>> 0;
  return (n >> 3) % 2 === 0 ? 1 : -1;
}

/**
 * Satu garis (dari titik A ke titik B) sebagai senarai lengkung.
 * (nx, ny) = arah "tegak" garis itu; tanda (+1 / -1) menentukan bonjol ke sebelah mana.
 */
function garis(ax, ay, bx, by, nx, ny, tanda) {
  const dx = bx - ax;
  const dy = by - ay;
  const panjang = Math.hypot(dx, dy);
  const titik = (u, v) => [ax + dx * u + nx * v * panjang * tanda, ay + dy * u + ny * v * panjang * tanda];
  return BONJOL.map(([x1, y1, x2, y2, ex, ey]) => [...titik(x1, y1), ...titik(x2, y2), ...titik(ex, ey)]);
}

/** terbalikkan satu garis (untuk kepingan yang melaluinya dari arah bertentangan) */
function terbalik(mula, lengkung) {
  const titik = [mula, ...lengkung.map((s) => [s[4], s[5]])];
  const hasil = [];
  for (let i = lengkung.length - 1; i >= 0; i -= 1) {
    hasil.push([lengkung[i][2], lengkung[i][3], lengkung[i][0], lengkung[i][1], titik[i][0], titik[i][1]]);
  }
  return { mula: titik[titik.length - 1], lengkung: hasil };
}

const tulis = (lengkung) => lengkung.map((s) => `C${s.map((n) => n.toFixed(1)).join(' ')}`).join(' ');

export function jigsawPaths(lajur, baris, saiz, benih = 1) {
  const lebar = saiz / lajur;
  const tinggi = saiz / baris;
  const laluan = [];

  for (let r = 0; r < baris; r += 1) {
    for (let c = 0; c < lajur; c += 1) {
      const x0 = c * lebar;
      const y0 = r * tinggi;
      const x1 = x0 + lebar;
      const y1 = y0 + tinggi;
      // d = bentuk penuh (untuk memotong gambar); g = hanya garisan dalam (tepi gambar tidak dilukis)
      let d = `M${x0.toFixed(1)} ${y0.toFixed(1)} `;
      let g = d;
      const lurus = (x, y) => { d += `L${x.toFixed(1)} ${y.toFixed(1)} `; g += `M${x.toFixed(1)} ${y.toFixed(1)} `; };
      const lengkung = (segs) => { const t = `${tulis(segs)} `; d += t; g += t; };

      // ATAS: kiri ke kanan (garis dikongsi dengan kepingan di atas)
      if (r === 0) lurus(x1, y0);
      else lengkung(garis(x0, y0, x1, y0, 0, 1, arah(r, c, benih)));

      // KANAN: atas ke bawah
      if (c === lajur - 1) lurus(x1, y1);
      else lengkung(garis(x1, y0, x1, y1, 1, 0, arah(c + 101, r, benih)));   // garis antara lajur c dan c+1

      // BAWAH: kanan ke kiri (garis kepingan di bawah, dilalui terbalik)
      if (r === baris - 1) lurus(x0, y1);
      else lengkung(terbalik([x0, y1], garis(x0, y1, x1, y1, 0, 1, arah(r + 1, c, benih))).lengkung);

      // KIRI: bawah ke atas (garis kepingan di kiri, dilalui terbalik)
      if (c === 0) lurus(x0, y0);
      else lengkung(terbalik([x0, y0], garis(x0, y0, x0, y1, 1, 0, arah(c + 100, r, benih))).lengkung);   // garis antara lajur c-1 dan c

      laluan.push({ d: `${d}Z`, g });
    }
  }
  return laluan;
}
