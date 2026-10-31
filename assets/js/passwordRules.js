/**
 * ============================================================================
 * assets/js/passwordRules.js  -  peraturan kata laluan + amaran langsung di halaman
 *
 * Peraturan SAMA dengan pelayar (backend/utils/passwordPolicy.js). Pelayan tetap menyemak semula,
 * jadi fail ini hanya untuk memberi amaran awal kepada pengguna semasa menaip.
 *
 * Cara guna (lihat index.html):
 *   1. Letakkan kotak amaran (div.pw-help) di bawah ruangan kata laluan. Senarai peraturan
 *      ditulis terus dalam HTML, jadi mudah dibaca dan diubah.
 *   2. SWPassword.bind(inputKataLaluan, kotakAmaran, () => ({ username: ..., name: ... }));
 *
 * Fungsi:
 *   SWPassword.check(kata, siapa)  -> { ok, failed[], score, label, tips[] }
 *   SWPassword.bind(input, kotak, dapatkanSiapa, borang)
 *        - kemas kini senarai peraturan (hijau = lulus, merah = belum) setiap kali menaip
 *        - meter kekuatan
 *        - menghalang borang dihantar jika kata laluan belum lulus
 *   SWPassword.make()  -> kotak amaran baharu (untuk halaman yang dibina dengan JavaScript)
 * ============================================================================
 */
(function () {
  'use strict';

  // senarai kata laluan biasa yang ditolak (huruf kecil)
  var COMMON = ['password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'katalaluan', 'katalaluan1', 'katalaluan123',
    '12345678', '123456789', '1234567890', '11111111', '00000000', '12341234', '123123123', '87654321', '1q2w3e4r', '1qaz2wsx',
    'qwerty123', 'qwertyui', 'qwertyuiop', 'abc12345', 'abcd1234', 'abcdefgh', 'iloveyou', 'welcome1', 'admin123', 'admin1234',
    'sejarah123', 'sejarahwira', 'sejarahwira1', 'malaysia1', 'malaysia123', 'sekolah123', 'cikgu1234', 'murid1234', 'pelajar123',
    'letmein1', 'monkey123', 'dragon123', 'football1', 'baseball1'];

  var SEQUENCES = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  // mesej setiap peraturan (kunci sama dengan data-rule dalam HTML)
  var RULES = {
    length: 'Panjang 8 hingga 72 aksara.',
    letter: 'Ada sekurang-kurangnya satu huruf.',
    digit: 'Ada sekurang-kurangnya satu nombor.',
    common: 'Bukan kata laluan biasa yang mudah diteka.',
    username: 'Tidak mengandungi nama pengguna atau e-mel anda.',
    pattern: 'Bukan aksara berulang atau urutan mudah (contoh: aaaaaaaa, 12345678).'
  };

  function byteLength(text) {
    return new TextEncoder().encode(text).length;
  }

  function isSequence(text) {
    var t = text.toLowerCase();
    return t.length >= 6 && SEQUENCES.some(function (s) { return s.indexOf(t) !== -1; });
  }

  /** Semak kata laluan. siapa = { username, name } */
  function check(password, siapa) {
    var pw = String(password || '');
    var lower = pw.toLowerCase();
    var failed = [];
    siapa = siapa || {};

    if (pw.length < 8 || byteLength(pw) > 72) failed.push('length');
    if (!/\p{L}/u.test(pw)) failed.push('letter');
    if (!/\d/.test(pw)) failed.push('digit');
    if (COMMON.indexOf(lower) !== -1) failed.push('common');

    var username = String(siapa.username || '').toLowerCase().trim();
    var bahagianEmel = username.split('@')[0];
    var nama = [username, bahagianEmel].filter(function (n) { return n.length >= 3; });
    if (nama.some(function (n) { return lower.indexOf(n) !== -1; })) failed.push('username');

    if (/^(.)\1+$/.test(pw) || /(.)\1{4,}/.test(pw) || isSequence(pw)) failed.push('pattern');

    // kekuatan 0-4 (hanya bermakna jika semua peraturan wajib lulus)
    var score = 0;
    if (!failed.length) {
      score = 1;
      if (pw.length >= 10) score += 1;
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
      if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score += 1;
    }
    var label = failed.length ? 'Lemah' : ['', 'Sederhana', 'Baik', 'Kuat', 'Sangat kuat'][score];

    var tips = [];
    if (!failed.length) {
      if (!(/[a-z]/.test(pw) && /[A-Z]/.test(pw))) tips.push('Cadangan: campurkan huruf besar dan kecil.');
      else if (!/[^A-Za-z0-9]/.test(pw)) tips.push('Cadangan: tambah satu simbol (contoh: ! @ #).');
      else if (pw.length < 12) tips.push('Cadangan: gunakan 12 aksara atau lebih.');
    }
    return { ok: failed.length === 0, failed: failed, score: score, label: label, tips: tips };
  }

  /** Kemas kini paparan kotak amaran mengikut hasil semakan. */
  function paint(kotak, hasil, adaTaipan) {
    kotak.classList.toggle('is-hidden', !adaTaipan);
    kotak.classList.toggle('is-ok', hasil.ok);

    kotak.querySelectorAll('[data-rule]').forEach(function (li) {
      var gagal = hasil.failed.indexOf(li.getAttribute('data-rule')) !== -1;
      li.classList.toggle('is-fail', gagal);
      li.classList.toggle('is-pass', !gagal);
    });

    var bar = kotak.querySelector('.pw-meter-bar');
    var label = kotak.querySelector('.pw-meter-label');
    var tip = kotak.querySelector('.pw-tip');
    if (bar) bar.setAttribute('data-score', String(hasil.ok ? hasil.score : 0));
    if (label) label.textContent = 'Kekuatan: ' + hasil.label;
    if (tip) tip.textContent = hasil.tips[0] || '';
  }

  /**
   * Hubungkan satu ruangan kata laluan dengan kotak amaran.
   * @param {HTMLInputElement} input
   * @param {HTMLElement}      kotak         div.pw-help
   * @param {Function}         dapatkanSiapa mengembalikan { username, name } semasa
   * @param {HTMLFormElement}  [borang]      jika ada, borang tidak dihantar selagi belum lulus
   */
  function bind(input, kotak, dapatkanSiapa, borang) {
    if (!input || !kotak) return;
    var kemaskini = function () {
      paint(kotak, check(input.value, dapatkanSiapa ? dapatkanSiapa() : {}), input.value.length > 0);
    };
    input.addEventListener('input', kemaskini);
    input.addEventListener('focus', kemaskini);

    if (borang) {
      // didaftarkan lebih awal daripada pengendali hantar borang lain, jadi boleh menghalangnya
      borang.addEventListener('submit', function (e) {
        var hasil = check(input.value, dapatkanSiapa ? dapatkanSiapa() : {});
        if (!hasil.ok) {
          e.preventDefault();
          e.stopImmediatePropagation();
          kotak.classList.remove('is-hidden');
          paint(kotak, hasil, true);
          input.focus();
        }
      });
    }
  }

  /** Bina kotak amaran baharu (untuk halaman yang membina borang dengan JavaScript). */
  function make() {
    var kotak = document.createElement('div');
    kotak.className = 'pw-help is-hidden';
    kotak.setAttribute('aria-live', 'polite');

    var meter = document.createElement('div');
    meter.className = 'pw-meter';
    var bar = document.createElement('span');
    bar.className = 'pw-meter-bar';
    bar.setAttribute('data-score', '0');
    var label = document.createElement('span');
    label.className = 'pw-meter-label';
    label.textContent = 'Kekuatan: Lemah';
    meter.appendChild(bar);
    meter.appendChild(label);

    var senarai = document.createElement('ul');
    senarai.className = 'pw-rules';
    Object.keys(RULES).forEach(function (kunci) {
      var li = document.createElement('li');
      li.setAttribute('data-rule', kunci);
      li.textContent = RULES[kunci];
      senarai.appendChild(li);
    });

    var tip = document.createElement('p');
    tip.className = 'pw-tip';

    kotak.appendChild(meter);
    kotak.appendChild(senarai);
    kotak.appendChild(tip);
    return kotak;
  }

  window.SWPassword = { check: check, bind: bind, make: make, RULES: RULES };
})();
