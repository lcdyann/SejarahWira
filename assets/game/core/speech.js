/**
 * assets/game/core/speech.js  -  Suara pembaca (text to speech)
 * MODULE: core  (lapisan asas, di sebelah sound.js)
 *
 * Membacakan dialog, cerita babak, arahan misi dan Catatan Diari menggunakan suara pelayar (Web Speech API, percuma).
 * Hanya suara Melayu (ms-MY); jika peranti tiada, bunyi permainan biasa (gumam) digunakan.
 *
 *   speech.speak(teks)   baca teks (ayat panjang dipotong ikut ayat). Memanggil speak() lagi menggantikan bacaan lama.
 *   speech.stop()        hentikan serta-merta
 *   speech.enabled       hidup / mati (disimpan dalam pelayar, ditukar di Pintu)
 *   speech.rate          kelajuan (disimpan dalam pelayar)
 *   speech.available     false jika peranti tiada suara langsung
 * Tetapan lalai ada dalam soundConfig.js (TTS). Semua fungsi senyap tanpa ralat jika sesuatu gagal.
 */
import { TTS } from './soundConfig.js';
import { sound } from './sound.js';

const ON_KEY = 'sw_tts_on';
const RATE_KEY = 'sw_tts_rate';

const synth = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;

class Speech {
  constructor() {
    this.enabled = this.#readOn();
    this.rate = this.#readRate();
    this.voice = null;           // suara pelayar yang dipilih (ganti)
    this._token = 0;             // setiap speak()/stop() menaikkan nombor ini; bacaan lama yang tertangguh berhenti
    this.#pickVoice();
    // bunyi gumam di mana-mana adegan senyap apabila suara pembaca sedang bercakap (lihat sound.talkStart)
    sound.talkSuppressed = () => this.willSpeak;
    // senarai suara pelayar dimuatkan kemudian oleh sesetengah pelayar
    if (synth) synth.addEventListener('voiceschanged', () => this.#pickVoice());
    // bunyi dimatikan (butang / tekan M) atau halaman ditutup: suara berhenti
    document.addEventListener('sw-mute', () => this.stop());
    window.addEventListener('pagehide', () => this.stop());
  }

  /** ada suara pada pelayar */
  get available() {
    if (synth && !this.voice) this.#pickVoice();   // senarai suara Chrome dimuatkan lewat
    return Boolean(synth && this.voice);
  }

  /** true jika suara pembaca akan benar-benar bercakap (dihidupkan, ada sumber suara, bunyi tidak senyap) */
  get willSpeak() {
    if (synth && !this.voice) this.#pickVoice();   // suara mungkin baru dimuatkan oleh pelayar
    return this.enabled && !sound.muted && this.available;
  }

  /** true jika yang digunakan suara pelayar BUKAN Melayu (pilihan terakhir: Indonesia) */
  get usingFallbackVoice() {
    return Boolean(this.voice) && !/^ms/i.test(this.voice.lang.replace('_', '-'));
  }

  /** nama suara yang digunakan, untuk dipaparkan di Pintu */
  get voiceName() {
    return this.voice ? this.voice.name : '';
  }

  /* ------------------------------------------------------------------ tetapan */
  setEnabled(on) {
    this.enabled = Boolean(on);
    try { localStorage.setItem(ON_KEY, this.enabled ? '1' : '0'); } catch { /* storan tidak tersedia */ }
    if (!this.enabled) this.stop();
  }

  setRate(n) {
    this.rate = Math.max(TTS.rateMin, Math.min(TTS.rateMax, Number(n) || TTS.rate));
    try { localStorage.setItem(RATE_KEY, String(this.rate)); } catch { /* storan tidak tersedia */ }
  }

  /* ------------------------------------------------------------------- bacaan */
  /** Baca teks. Bacaan sebelumnya dihentikan dahulu. Tidak berbuat apa-apa jika mati / senyap / tiada suara. */
  speak(text) {
    this.stop();
    if (!this.enabled || sound.muted) return;
    const parts = this.#chunks(text);
    if (!parts.length) return;
    const token = this._token;
    this.#speakInBrowser(parts, token);
  }

  stop() {
    this._token += 1;
    if (synth) synth.cancel();
  }

  /** Bunyi contoh di Pintu */
  preview() {
    this.speak('Selamat datang, wira. Inilah suara pembaca cerita.');
  }

  /* ----------------------------------------------------------- suara pelayar */
  #speakInBrowser(parts, token) {
    if (!synth) return;
    if (!this.voice) this.#pickVoice();
    if (!this.voice) return;
    parts.forEach((part) => {
      const u = new SpeechSynthesisUtterance(part);
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = this.rate;
      u.onerror = () => { if (token === this._token) synth.cancel(); };
      synth.speak(u);                                    // pelayar menyusun potongan mengikut giliran
    });
  }

  /* ------------------------------------------------------------------- dalaman */
  #readOn() {
    try {
      const v = localStorage.getItem(ON_KEY);
      return v === null ? TTS.defaultOn : v === '1';
    } catch { return TTS.defaultOn; }
  }

  #readRate() {
    try {
      const n = parseFloat(localStorage.getItem(RATE_KEY));
      return Number.isFinite(n) ? Math.max(TTS.rateMin, Math.min(TTS.rateMax, n)) : TTS.rate;
    } catch { return TTS.rate; }
  }

  /** pilih suara pelayar: Melayu (ms-MY); bahasa lain hanya jika disenaraikan dalam TTS.fallbackLangs (lalai: kosong). */
  #pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    if (!voices.length) return;
    const same = (v, code) => v.lang.toLowerCase().replace('_', '-').startsWith(code.toLowerCase());
    for (const code of [TTS.lang, ...TTS.fallbackLangs]) {
      const found = voices.find((v) => same(v, code));
      if (found) { this.voice = found; return; }
    }
    this.voice = null;
  }

  /** potong teks panjang ikut ayat (satu permintaan pelayan / satu bacaan tidak terlalu panjang) */
  #chunks(text) {
    const full = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!full) return [];
    const sentences = full.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [full];
    const out = [];
    let cur = '';
    sentences.forEach((s) => {
      const t = s.trim();
      if (!t) return;
      if ((`${cur} ${t}`).trim().length <= TTS.maxChunk) cur = `${cur} ${t}`.trim();
      else { if (cur) out.push(cur); cur = t; }
    });
    if (cur) out.push(cur);
    return out;
  }
}

export const speech = new Speech();
