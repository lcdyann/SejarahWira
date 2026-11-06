/**
 * assets/game/rest/rehat.js  -  Lompong Masa page
 * MODULE: rest  (Lompong Masa: rest page between missions (mini games))
 * USE CASE: UC-03   CLASS DIAGRAM: -
 */
/**
 * ============================================================================
 * rehat.js  -  LOMPONG MASA (tempat rehat) + mini game santai
 *
 * "Lompong Masa" = ruang kosong di antara zaman. Murid tiba di sini:
 *   - di sempadan tahap (selepas beberapa babak), dan
 *   - bila menekan Jeda (Esc).
 * Tuan rumahnya ialah "pedagang" yang sangat serupa dengan Pendekar Bayang (dia menafikannya).
 * Murid boleh melihat kemajuan tahap, main mini game santai (tiada kalah, tiada pemasa, tiada mata)
 * dan menekan "Teruskan cerita" bila bersedia.
 *
 * Susun atur: assets/game/rest/rest.html -> <template id="tpl-rehat">
 * Gambar ikon: unsur hub (bulan, matahari, buku, diari, cermin, pintu) + mesin masa
 * ============================================================================
 */
import { el, esc, shuffle, sleep, tpl } from '../core/core.js';
import { sound } from '../core/sound.js';
import { entityPortrait } from '../npc/entity.js';

/** Ikon mini game (satu set untuk semua era). Tukar/tambah gambar di sini. */
const GAMBAR = '../assets/gameAsset';
const IKON = [
  { nama: 'Bulan',      src: `${GAMBAR}/hub/moon.png` },
  { nama: 'Matahari',   src: `${GAMBAR}/hub/sun.png` },
  { nama: 'Buku',       src: `${GAMBAR}/hub/buku.png` },
  { nama: 'Diari',      src: `${GAMBAR}/hub/diari.png` },
  { nama: 'Cermin',     src: `${GAMBAR}/hub/cermin.png` },
  { nama: 'Pintu',      src: `${GAMBAR}/hub/pintu.png` },
  { nama: 'Mesin Masa', src: `${GAMBAR}/transition/time_machine.png` }
];
const gambar = (ikon) => { const i = new Image(); i.src = ikon.src; i.alt = ikon.nama; i.draggable = false; return i; };

/**
 * Ucapan Sang Penjaga Buku di Lompong Masa (nada: perlahan, santai, mengusik lembut; tiada desakan masa).
 * Tukar ayat di sini sahaja. Setiap mini game ada tiga ayat: mula, tengah (galakan) dan tamat.
 */
const UCAPAN = {
  // masuk ke Lompong Masa (sempadan tahap dan butang Jeda)
  tahap: [
    'Ahai... penat benar nampaknya otak siber kamu tu, ya? Sudah, jangan dikerutkan dahi itu lagi. Mari duduk bersila di sini sebentar. Kita berada di Lompong Masa, tempat waktu tidak bergerak dan dakwat sejarah berhenti mengalir. Ambil nafas dalam-dalam, mari rehatkan minda dengan permainan ringan sebelum kita sambung kembara.'
  ],
  jeda: [
    'Ahai... penat benar nampaknya otak siber kamu tu, ya? Sudah, jangan dikerutkan dahi itu lagi. Mari duduk bersila di sini sebentar. Kita berada di Lompong Masa, tempat waktu tidak bergerak dan dakwat sejarah berhenti mengalir. Ambil nafas dalam-dalam, mari rehatkan minda dengan permainan ringan sebelum kita sambung kembara.'
  ],
  sambung: [
    'Ha, sudah kembali rupanya. Duduklah dahulu sebentar. Di Lompong Masa ini waktu tidak ke mana-mana, jadi tak perlu tergesa-gesa. Tarik nafas dalam-dalam, kemudian kita sambung kembara.'
  ],
  main: 'Pilih mana-mana satu yang kamu suka. Tiada markah, tiada pemasa, hanya santai.',
  // gelembung
  gelembung: {
    mula: 'Tengok gelembung-gelembung sabun ni, terapung perlahan sahaja. Ha, sentuh dan pecahkan ia satu-persatu. Anggaplah setiap letupan kecil itu membuang segala stress di kepala kamu.',
    tengah: 'Ha... macam tu. Tak perlu terkejar-kejar. Tenang sahaja. Pecah lagi satu...',
    tamat: 'Amboi, lapang terus rasa pemandangan. Bagus, sekarang tarik nafas dalam-dalam. Dah sedia nak cuba yang lain?'
  },
  // padan kad
  kad: {
    mula: 'Mari kita uji ingatan manja kamu. Kad-kad ini tersenyum menanti untuk dipadankan. Buka satu-persatu perlahan-lahan, tak ada siapa yang mengejar.',
    tengah: 'Eh, hampir tepat! Cuba ingat kembali kad yang di sudut sana tadi. Tenang, fikir masak-masak.',
    tamat: 'Alhamdulillah, kemas tersusun semuanya. Minda yang tenang pasti akan menghasilkan ingatan yang tajam.'
  },
  // cari Pendekar Bayang
  sorok: {
    mula: 'Hambai... bosan pula hamba duduk diam. Mari main sorok-sorok! Hamba akan sembunyikan bayang hamba di sebalik barangan purba ini. Cuba cari di mana hamba menyorok, tapi jangan tergesa-gesa ya?',
    tengah: 'Sejuk mata memandang... nampak hujung tanjak hamba tak? Cari perlahan-lahan di kawasan yang redup itu.',
    tamat: 'Wah, tajam betul mata kamu ya! Dapat juga tangkap bayang hamba yang lincah ni.'
  },
  // tekan "Teruskan cerita"
  pergi: 'Wah, nampaknya wajah kamu pun dah mula berseri-seri semula. Bahu pun dah tak tegang. Bagus! Jiwa yang tenang adalah senjata terbaik untuk menempuh sejarah. Ayuh, mari kita kembali ke alam realiti hikayat... bab seterusnya sudah menanti kita!'
};

/* ------------------------------------------------------------------------- */
/* Mini game 1: Padan Kad  (6 pasang gambar hub, tiada had kesilapan)          */
/* ------------------------------------------------------------------------- */
function mainKad(play, tamat, cakap) {
  play.innerHTML = '<div class="rh-grid"></div><p class="rh-note">Klik dua kad. Jika sama, ia kekal terbuka.</p>';
  const grid = play.querySelector('.rh-grid');
  const pilih = IKON.slice(0, 6);
  let buka = [];
  let siap = 0;
  let kunci = false;
  let sudahGalak = false;
  shuffle([...pilih, ...pilih]).forEach((ikon) => {
    const k = el('button', 'rh-card-flip');
    k.type = 'button';
    k.dataset.nama = ikon.nama;
    k.textContent = '?';
    k.addEventListener('click', async () => {
      if (kunci || k.classList.contains('open') || k.classList.contains('matched')) return;
      k.classList.add('open');
      k.replaceChildren(gambar(ikon));
      buka.push(k);
      if (buka.length < 2) return;
      kunci = true;
      const [a, b] = buka;
      if (a.dataset.nama === b.dataset.nama) {
        a.classList.add('matched'); b.classList.add('matched');
        sound.sfx('betul');
        siap += 1;
        if (siap === pilih.length) tamat('Cantik! Semua pasangan dijumpai.', UCAPAN.kad.tamat);
      } else {
        if (!sudahGalak) { sudahGalak = true; cakap(UCAPAN.kad.tengah); }   // galakan lembut, sekali sahaja
        await sleep(700);
        [a, b].forEach((x) => { x.classList.remove('open'); x.textContent = '?'; });
      }
      buka = [];
      kunci = false;
    });
    grid.appendChild(k);
  });
}

/* ------------------------------------------------------------------------- */
/* Mini game 2: Pecah Gelembung  (gambar hub naik perlahan dalam gelembung)     */
/* ------------------------------------------------------------------------- */
function mainGelembung(play, tamat, cakap) {
  play.innerHTML = '<div class="rh-sky"></div><p class="rh-note">Pecahkan gelembung yang naik. Tiada markah, hanya santai.</p>';
  const sky = play.querySelector('.rh-sky');
  let pecah = 0;
  const sasaran = 12;
  const buat = () => {
    if (!sky.isConnected) return;                       // permainan sudah ditutup
    const b = el('button', 'rh-bubble');
    b.type = 'button';
    b.appendChild(gambar(IKON[Math.floor(Math.random() * IKON.length)]));
    b.style.left = `${5 + Math.random() * 82}%`;
    b.style.animationDuration = `${7 + Math.random() * 4}s`;
    b.addEventListener('click', () => {
      if (b.classList.contains('pop')) return;
      b.classList.add('pop');
      sound.sfx('betul');
      setTimeout(() => b.remove(), 250);
      pecah += 1;
      if (pecah === Math.floor(sasaran / 2)) cakap(UCAPAN.gelembung.tengah);   // separuh jalan
      if (pecah === sasaran) tamat('Tenang dan menyegarkan!', UCAPAN.gelembung.tamat);
    });
    b.addEventListener('animationend', () => b.remove());
    sky.appendChild(b);
    setTimeout(buat, 900);
  };
  buat();
}

/* ------------------------------------------------------------------------- */
/* Mini game 3: Cari Pendekar  (sorok-sorok; 3 pusingan)                       */
/*   Pendekar Bayang bersembunyi di belakang satu daripada enam benda.         */
/*   Klik benda itu: jika dia ada, dia terkejut; jika tiada, dia mengejek.     */
/* ------------------------------------------------------------------------- */
function mainSorok(play, tamat, cakap) {
  play.innerHTML = `
    <div class="rh-seek-say" data-ref="say"></div>
    <div class="rh-seek-row"></div>
    <p class="rh-note"></p>`;
  const say = play.querySelector('.rh-seek-say');
  const row = play.querySelector('.rh-seek-row');
  const note = play.querySelector('.rh-note');
  const JUMLAH = 3;
  let pusingan = 0;
  const EJEK = ['Kosong... hehe.', 'Bukan di sini, perlahan-lahan sahaja.', 'Sejuk, sejuk...', 'Belum lagi. Tak perlu tergesa-gesa.'];
  let sudahGalak = false;

  const mula = () => {
    pusingan += 1;
    note.textContent = `Pusingan ${pusingan} daripada ${JUMLAH}`;
    say.textContent = 'Hamba sudah bersembunyi. Cari hamba perlahan-lahan ya.';
    row.innerHTML = '';
    const tempat = Math.floor(Math.random() * 6);       // di mana dia bersembunyi
    IKON.slice(0, 6).forEach((ikon, i) => {
      const t = el('button', 'rh-spot');
      t.type = 'button';
      t.appendChild(gambar(ikon));
      t.addEventListener('click', async () => {
        if (t.classList.contains('found')) return;
        if (i !== tempat) {                              // salah: benda itu bergoyang, dia mengejek
          t.classList.add('wiggle');
          setTimeout(() => t.classList.remove('wiggle'), 400);
          say.textContent = EJEK[Math.floor(Math.random() * EJEK.length)];
          if (!sudahGalak) { sudahGalak = true; cakap(UCAPAN.sorok.tengah); }   // petunjuk lembut, sekali sahaja
          return;
        }
        t.classList.add('found');                        // betul: Pendekar muncul
        t.appendChild(entityPortrait('surprised', 'rh-seek-pendekar'));
        sound.sfx('betul');
        say.textContent = 'Eh! Kamu jumpa hamba!';
        await sleep(1300);
        if (!row.isConnected) return;
        if (pusingan >= JUMLAH) tamat('Kamu memang pandai mencari.', UCAPAN.sorok.tamat);
        else mula();
      });
      row.appendChild(t);
    });
  };
  mula();
}

export class RehatPage {
  /** @param root elemen skrin permainan (MissionScene.root) */
  constructor(root, eraID) { this.root = root; this.eraID = eraID; }

  /**
   * @param o {
   *   mode: 'tahap' (sempadan tahap) | 'sambung' (murid menyambung era) | 'jeda' (tekan Jeda),
   *   eraName, tahapJumlah, saiz,
   *   babak: [url latar bagi SETIAP babak],
   *   babakSiap: bilangan babak yang sudah selesai (babak ke-babakSiap ialah yang seterusnya)
   * }
   * @returns Promise 'terus' atau 'keluar'
   */
  show(o) {
    return new Promise((resolve) => {
      const jeda = o.mode === 'jeda';
      const jumlah = o.babak.length;
      const tahapSemasa = Math.min(o.tahapJumlah - 1, Math.floor(o.babakSiap / o.saiz));
      const page = tpl('rehat', {
        kicker: `Lompong Masa  |  ${o.eraName}`,
        title: jeda ? 'Masa dibekukan' : o.mode === 'sambung' ? 'Selamat kembali!' : `Tahap ${tahapSemasa} selesai!`
      });

      // pedagang = Pendekar Bayang menyamar (misai palsu dilukis oleh CSS)
      page.refs.merchant.appendChild(entityPortrait('smirk'));
      const ucapan = jeda ? UCAPAN.jeda : o.mode === 'sambung' ? UCAPAN.sambung : UCAPAN.tahap;
      page.refs.say.textContent = ucapan[Math.floor(Math.random() * ucapan.length)];

      /* ---------------- CAROUSEL: satu panel bagi setiap tahap ---------------- */
      for (let n = 0; n < o.tahapJumlah; n++) {
        const dari = n * o.saiz;                               // indeks babak pertama tahap ini
        const hingga = Math.min((n + 1) * o.saiz, jumlah);     // sehingga (tidak termasuk)
        const panel = el('div', 'rh-panel');
        panel.innerHTML = `<div class="rh-panel-head"><b>Tahap ${n + 1}</b><span>Babak ${dari + 1}-${hingga}</span></div><div class="rh-tiles"></div>`;
        const tiles = panel.querySelector('.rh-tiles');
        // susun jubin dalam 2 baris sama banyak (3 baris jika lebih 10 babak) supaya sentiasa kemas dan tanpa skrol
        const bilBabak = hingga - dari;
        const baris = bilBabak > 10 ? 3 : 2;
        tiles.style.gridTemplateColumns = `repeat(${Math.ceil(bilBabak / baris)}, 1fr)`;
        for (let k = dari; k < hingga; k++) {
          // siap = hijau | seterusnya = bercahaya | belum sampai = kelabu
          const status = k < o.babakSiap ? 'siap' : k === o.babakSiap ? 'semasa' : 'kunci';
          const jubin = el('div', `rh-tile ${status}`);
          if (o.babak[k]) jubin.style.backgroundImage = `url('${o.babak[k]}')`;
          const tanda = status === 'siap' ? '&#10003;' : status === 'semasa' ? '&#9654;' : '&#128274;';
          jubin.innerHTML = `<i class="rh-tile-no">${k + 1}</i><i class="rh-tile-mark">${tanda}</i>`;
          tiles.appendChild(jubin);
        }
        page.refs.track.appendChild(panel);
        const dot = el('i', 'rh-dot');
        page.refs.dots.appendChild(dot);
      }
      let idx = tahapSemasa;
      const pergi = (n) => {
        idx = Math.max(0, Math.min(o.tahapJumlah - 1, n));
        page.refs.track.style.setProperty('--i', idx);
        [...page.refs.track.children].forEach((c, k) => c.classList.toggle('on', k === idx));
        [...page.refs.dots.children].forEach((c, k) => c.classList.toggle('on', k === idx));
        page.refs.prev.disabled = idx === 0;
        page.refs.next.disabled = idx === o.tahapJumlah - 1;
      };
      page.refs.prev.addEventListener('click', () => pergi(idx - 1));
      page.refs.next.addEventListener('click', () => pergi(idx + 1));
      [...page.refs.track.children].forEach((c, k) => c.addEventListener('click', () => pergi(k)));   // klik panel jiran = ke situ
      pergi(idx);

      /* ---------------- hiasan kekosongan ---------------- */
      for (let i = 0; i < 14; i++) {
        const d = el('i', i % 3 === 0 ? 'rh-leaf' : 'rh-star');
        d.style.left = `${Math.random() * 100}%`;
        d.style.animationDelay = `${-Math.random() * 14}s`;
        d.style.animationDuration = `${10 + Math.random() * 10}s`;
        page.refs.drift.appendChild(d);
      }

      /* ---------------- mini game: ganti carousel + butang (tanpa skrol) ---------------- */
      const buka = (nama, fn, kunciUcapan) => {
        page.refs.main.classList.add('hidden');
        page.refs.actions.classList.add('hidden');
        page.refs.arena.classList.remove('hidden');
        page.refs.gameName.textContent = nama;
        page.refs.say.textContent = UCAPAN[kunciUcapan].mula;
        const cakap = (teks) => { page.refs.say.textContent = teks; };
        fn(page.refs.play, (mesej, ucapanTamat) => {
          cakap(ucapanTamat);
          page.refs.play.appendChild(el('p', 'rh-done', esc(mesej)));
        }, cakap);
      };
      page.refs.btnMemory.addEventListener('click', () => buka('Padan Kad', mainKad, 'kad'));
      page.refs.btnBubble.addEventListener('click', () => buka('Pecah Gelembung', mainGelembung, 'gelembung'));
      page.refs.btnSeek.addEventListener('click', () => buka('Cari Pendekar', mainSorok, 'sorok'));
      page.refs.btnBack.addEventListener('click', () => {
        page.refs.arena.classList.add('hidden');
        page.refs.play.innerHTML = '';
        page.refs.main.classList.remove('hidden');
        page.refs.actions.classList.remove('hidden');
        page.refs.say.textContent = UCAPAN.tahap[0];
      });
      const tutup = (hasil) => { page.remove(); resolve(hasil); };
      // tekan "Teruskan cerita": dia mengucapkan selamat jalan dahulu, kemudian halaman ditutup
      page.refs.btnGo.addEventListener('click', async () => {
        page.refs.btnGo.disabled = true;
        page.refs.say.textContent = UCAPAN.pergi;
        await sleep(3800);
        tutup('terus');
      });
      if (jeda) {
        page.refs.btnLeave.classList.remove('hidden');
        page.refs.btnLeave.addEventListener('click', () => tutup('keluar'));
      }
      this.root.appendChild(page);
    });
  }
}
