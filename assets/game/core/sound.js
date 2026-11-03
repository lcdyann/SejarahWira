/**
 * assets/game/core/sound.js  -  Music + sound effects
 * MODULE: core  (Base layer: stage, helpers, templates loader, API, domain model, sound)
 * USE CASE: all   CLASS DIAGRAM: User, Student, Teacher, Avatar, ... (domain.js mirrors the class diagram)
 */
/**
 * ============================================================================
 * sound.js  -  bunyi permainan: kesan bunyi (SFX) dan muzik latar
 *
 * Cara guna dalam kod babak:
 *     import { sound } from './sound.js';
 *     sound.sfx('serang');              // kesan bunyi sekali
 *     sound.playMusic('latihan');       // tukar muzik latar (silih-ganti 1.5s; fail sama = bersambung)
 *     sound.talkStart(); sound.talkStop();   // bunyi bercakap ketika teks ditaip
 *
 * Senarai nama dan fail: soundConfig.js.  Fail tiada = senyap, tiada ralat.
 * Tekan M (atau butang di penjuru) untuk senyapkan; pilihan diingati.
 * ============================================================================
 */
import { CROSSFADE_MS, MUSIC, SCENE_MUSIC, SFX, SOUND_FOLDER, VOLUME } from './soundConfig.js';

const MUTE_KEY = 'sw_sound_muted';
const MUSIC_KEY = 'sw_music_level';      // kuat muzik pilihan pemain (0 - 1)
const SFX_KEY = 'sw_sfx_level';          // kuat kesan bunyi pilihan pemain (0 - 1)

class Sound {
  constructor() {
    this.muted = this.#readMuted();
    this.musicLevel = this.#readLevel(MUSIC_KEY);   // pengali muzik dari gelangsar
    this.sfxLevel = this.#readLevel(SFX_KEY);       // pengali kesan bunyi dari gelangsar
    this.track = null;          // nama muzik yang sedang dimainkan
    this.voices = [];           // suara muzik yang sedang hidup (lagu semasa + lagu yang sedang senyap)
    this.current = null;        // suara lagu semasa
    this.blocked = false;       // pelayar menghalang bunyi sehingga pemain menekan sesuatu
    this.talk = null;           // elemen Audio bunyi bercakap
    this.missing = new Set();   // fail yang tiada: jangan cuba lagi
    this.button = null;
  }

  /* ------------------------------------------------------------ pilihan senyap */
  #readMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  }

  /** baca kuat bunyi yang disimpan (tiada = penuh) */
  #readLevel(key) {
    try {
      const n = parseFloat(localStorage.getItem(key));
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    } catch { return 1; }
  }

  /** gelangsar muzik: 0 - 1 (dikuatkuasakan serta-merta pada lagu yang sedang main) */
  setMusicLevel(n) {
    this.musicLevel = Math.max(0, Math.min(1, n));
    try { localStorage.setItem(MUSIC_KEY, String(this.musicLevel)); } catch { /* storan tidak tersedia */ }
    this.#applyVolumes();
  }

  /** gelangsar kesan bunyi: 0 - 1 (terpakai pada bunyi seterusnya) */
  setSfxLevel(n) {
    this.sfxLevel = Math.max(0, Math.min(1, n));
    try { localStorage.setItem(SFX_KEY, String(this.sfxLevel)); } catch { /* storan tidak tersedia */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* storan tidak tersedia */ }
    this.#applyVolumes();
    if (this.muted) this.talkStop();
    this.#paintButton();
    document.dispatchEvent(new Event('sw-mute'));   // beritahu kawalan bunyi lain (cth. di pintu)
  }

  /** butang kecil di penjuru pentas */
  attachButton(parent) {
    this.button = document.createElement('button');
    this.button.className = 'sound-btn';
    this.button.type = 'button';
    this.button.addEventListener('click', () => this.toggleMute());
    parent.appendChild(this.button);
    this.#paintButton();
  }

  #paintButton() {
    if (!this.button) return;
    this.button.textContent = this.muted ? '🔇' : '🔊';
    this.button.title = this.muted ? 'Bunyi dimatikan (M)' : 'Bunyi dihidupkan (M)';
  }

  /* ----------------------------------------------------------------- fail audio */
  /** nama fail ada ruang dan kurungan: ubah kepada alamat yang sah */
  #url(file) { return file.split('/').map(encodeURIComponent).join('/'); }

  #make(file, volume) {
    if (!file || this.missing.has(file)) return null;
    const a = new Audio(SOUND_FOLDER + this.#url(file));
    a.volume = this.muted ? 0 : Math.min(1, volume * this.sfxLevel);
    a.addEventListener('error', () => this.missing.add(file), { once: true });
    return a;
  }

  /* ------------------------------------------------------------- kesan bunyi */
  /**
   * mainkan satu kesan bunyi (boleh bertindih)
   * @param {{maxMs?: number}} [opt] maxMs = potong bunyi panjang selepas masa ini (dengan senyap perlahan)
   */
  sfx(name, { maxMs = 0 } = {}) {
    if (this.muted) return;
    const a = this.#make(SFX[name], VOLUME.sfx);
    if (!a) return;
    a.play().catch(() => {});
    if (maxMs > 0) {
      setTimeout(() => {
        const fade = setInterval(() => {
          a.volume = Math.max(0, a.volume - 0.1);
          if (a.volume <= 0) { clearInterval(fade); a.pause(); }
        }, 60);
      }, maxMs);
    }
  }

  /** bunyi bercakap: bermula bila dialog dibuka, berhenti bila teks habis ditaip */
  talkStart() {
    this.talkStop();
    if (this.muted) return;
    this.talk = this.#make(SFX.bercakap, VOLUME.sfx);
    if (this.talk) { this.talk.loop = true; this.talk.play().catch(() => {}); }
  }

  talkStop() {
    if (!this.talk) return;
    this.talk.pause();
    this.talk = null;
  }

  /* ------------------------------------------------------------------ muzik */
  /**
   * tukar muzik latar mengikut nama dalam MUSIC.
   *  - nama sama atau FAIL sama  -> lagu diteruskan; hanya kuat bunyinya diubah perlahan-lahan
   *  - fail lain                 -> silih-ganti: lagu lama senyap, lagu baharu naik (CROSSFADE_MS)
   */
  playMusic(name) {
    const def = MUSIC[name];
    if (!def || name === this.track) return;
    this.track = name;

    const cur = this.current;
    if (cur && cur.file === def.file) {                    // lagu sama: bersambung
      cur.name = name;
      this.#ramp(cur, 'vol', def.vol);
      return;
    }
    if (cur) this.#retire(cur);                            // lagu lain: lagu lama keluar
    this.current = this.#startVoice(name, def.file, def.vol, 0);
    if (this.current) this.#ramp(this.current, 'level', 1);
    this.#ensureTimer();
  }

  /** cipta satu suara muzik (elemen Audio + keadaan senyap/naik) */
  #startVoice(name, file, vol, level) {
    if (this.missing.has(file)) return null;
    const el = new Audio(SOUND_FOLDER + this.#url(file));
    el.preload = 'auto';
    const v = { name, file, el, vol, level, retiring: false, successor: false };
    el.addEventListener('error', () => {                   // fail tiada: senyap sahaja
      this.missing.add(file);
      this.#drop(v);
      if (this.current === v) this.current = null;
    }, { once: true });
    el.addEventListener('ended', () => {                   // jaring keselamatan jika ulangan tidak sempat
      if (!v.retiring && this.current === v) { el.currentTime = 0; el.play().catch(() => {}); }
    });
    this.voices.push(v);
    this.#apply(v);
    this.#play(v);
    return v;
  }

  #play(v) {
    v.el.play().catch(() => this.#waitForTap());
  }

  /** pelayar menghalang bunyi sebelum pemain menekan sesuatu: cuba lagi pada tekanan pertama */
  #waitForTap() {
    if (this.blocked) return;
    this.blocked = true;
    const retry = () => {
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
      this.blocked = false;
      this.voices.forEach(v => { if (!v.retiring) v.el.play().catch(() => {}); });
    };
    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
  }

  /** suara ini tidak lagi lagu semasa: senyap perlahan-lahan, kemudian dibuang */
  #retire(v) {
    v.retiring = true;
    this.#ramp(v, 'level', 0);
  }

  #drop(v) {
    v.el.pause();
    v.el.removeAttribute('src');
    this.voices = this.voices.filter(x => x !== v);
  }

  /** mula perubahan perlahan bagi v.level (naik/senyap) atau v.vol (kuat lagu) */
  #ramp(v, key, to) {
    v[key + 'Ramp'] = { from: v[key], to, t0: performance.now(), ms: CROSSFADE_MS };
  }

  /** kuat sebenar = lengkung kuasa sama (untuk silih-ganti yang licin) x kuat lagu x pengali x senyap */
  #apply(v) {
    const kuasaSama = Math.sin(Math.max(0, Math.min(1, v.level)) * Math.PI / 2);
    v.el.volume = this.muted ? 0 : Math.max(0, Math.min(1, kuasaSama * v.vol * VOLUME.music * this.musicLevel));
  }

  #applyVolumes() { this.voices.forEach(v => this.#apply(v)); }

  #ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.#tick(), 50);
  }

  /** dijalankan setiap 50ms: gerakkan perubahan kuat bunyi, sambung ulangan lagu, buang suara yang sudah senyap */
  #tick() {
    const now = performance.now();
    for (const v of [...this.voices]) {
      for (const key of ['level', 'vol']) {
        const r = v[key + 'Ramp'];
        if (!r) continue;
        const p = Math.min(1, (now - r.t0) / r.ms);
        v[key] = r.from + (r.to - r.from) * p;
        if (p >= 1) delete v[key + 'Ramp'];
      }
      this.#apply(v);
      if (v.retiring && v.level <= 0.001) { this.#drop(v); continue; }
      this.#loopSeamless(v);
    }
  }

  /**
   * ULANGAN TANPA JEDA: mp3 selalunya ada jeda kecil di hujung bila diulang.
   * Jadi sebelum lagu tamat, salinan baharu dimulakan dari awal dan bertindih lembut dengan hujung lagu.
   */
  #loopSeamless(v) {
    if (v.retiring || v.successor || this.current !== v) return;
    const { duration: d, currentTime: t } = v.el;
    const xf = CROSSFADE_MS / 1000;
    if (!isFinite(d) || d < xf * 4) { v.el.loop = isFinite(d); return; }   // lagu pendek: ulang biasa
    if (v.el.paused || d - t > xf + 0.15) return;
    v.successor = true;
    const next = this.#startVoice(v.name, v.file, v.vol, 0);
    if (!next) return;
    this.#ramp(next, 'level', 1);
    this.#retire(v);
    this.current = next;
  }

  /** dipanggil oleh Game bila babak bertukar */
  forScene(sceneName) { this.playMusic(SCENE_MUSIC[sceneName]); }
}

export const sound = new Sound();
