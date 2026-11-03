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

/** Ucapan pedagang (sebenarnya Pendekar Bayang yang menyamar) */
const UCAPAN = {
  tahap: [
    'Selamat datang ke Lompong Masa! Aku hanya pedagang biasa. Bukan Pendekar Bayang. Jangan tanya.',
    'Masa berhenti di sini. Duduklah. Cerita itu tidak ke mana-mana... buat masa ini.'
  ],
  jeda: [
    'Masa sudah kubekukan. Rehatlah, aku pedagang biasa sahaja, bukan sesiapa yang kau fikirkan.'
  ],
  main: 'Pilih satu. Aku tak ada kena-mengena dengan permainan ini.',
  tamat: 'Hehe... eh, maksudku, bagus! Kisah ini belum selesai, ingat?'
};

/* ------------------------------------------------------------------------- */
/* Mini game 1: Padan Kad  (6 pasang gambar hub, tiada had kesilapan)          */
/* ------------------------------------------------------------------------- */
function mainKad(play, tamat) {
  play.innerHTML = '<div class="rh-grid"></div><p class="rh-note">Klik dua kad. Jika sama, ia kekal terbuka.</p>';
  const grid = play.querySelector('.rh-grid');
  const pilih = IKON.slice(0, 6);
  let buka = [];
  let siap = 0;
  let kunci = false;
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
        if (siap === pilih.length) tamat('Cantik! Semua pasangan dijumpai.');
      } else {
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
function mainGelembung(play, tamat) {
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
      if (pecah === sasaran) tamat('Tenang dan menyegarkan!');
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
function mainSorok(play, tamat) {
  play.innerHTML = `
    <div class="rh-seek-say" data-ref="say"></div>
    <div class="rh-seek-row"></div>
    <p class="rh-note"></p>`;
  const say = play.querySelector('.rh-seek-say');
  const row = play.querySelector('.rh-seek-row');
  const note = play.querySelector('.rh-note');
  const JUMLAH = 3;
  let pusingan = 0;
  const EJEK = ['Kosong! Hehe.', 'Bukan di sini...', 'Sejuk, sejuk!', 'Aku tak pandai bersembunyi? Cuba lagi!'];

  const mula = () => {
    pusingan += 1;
    note.textContent = `Pusingan ${pusingan} daripada ${JUMLAH}`;
    say.textContent = 'Aku sudah bersembunyi. Cari aku!';
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
          return;
        }
        t.classList.add('found');                        // betul: Pendekar muncul
        t.appendChild(entityPortrait('surprised', 'rh-seek-pendekar'));
        sound.sfx('betul');
        say.textContent = 'Eh! Kau jumpa aku!';
        await sleep(1300);
        if (!row.isConnected) return;
        if (pusingan >= JUMLAH) tamat('Kau memang pandai mencari. Aku tidak akan bersembunyi lagi... mungkin.');
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
      const ucapan = jeda ? UCAPAN.jeda : UCAPAN.tahap;
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
      const buka = (nama, fn) => {
        page.refs.main.classList.add('hidden');
        page.refs.actions.classList.add('hidden');
        page.refs.arena.classList.remove('hidden');
        page.refs.gameName.textContent = nama;
        page.refs.say.textContent = UCAPAN.main;
        fn(page.refs.play, (mesej) => {
          page.refs.say.textContent = UCAPAN.tamat;
          page.refs.play.appendChild(el('p', 'rh-done', esc(mesej)));
        });
      };
      page.refs.btnMemory.addEventListener('click', () => buka('Padan Kad', mainKad));
      page.refs.btnBubble.addEventListener('click', () => buka('Pecah Gelembung', mainGelembung));
      page.refs.btnSeek.addEventListener('click', () => buka('Cari Pendekar', mainSorok));
      page.refs.btnBack.addEventListener('click', () => {
        page.refs.arena.classList.add('hidden');
        page.refs.play.innerHTML = '';
        page.refs.main.classList.remove('hidden');
        page.refs.actions.classList.remove('hidden');
        page.refs.say.textContent = UCAPAN.tahap[0];
      });
      const tutup = (hasil) => { page.remove(); resolve(hasil); };
      page.refs.btnGo.addEventListener('click', () => tutup('terus'));
      if (jeda) {
        page.refs.btnLeave.classList.remove('hidden');
        page.refs.btnLeave.addEventListener('click', () => tutup('keluar'));
      }
      this.root.appendChild(page);
    });
  }
}
