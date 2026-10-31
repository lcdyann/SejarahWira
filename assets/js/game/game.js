/**
 * ============================================================================
 * game.js  -  Game: the one controller behind game.html
 *
 * One page, scenes swapped inside a fixed 960x540 stage, so fullscreen is never left.
 * Owns: stage, input, dialogue box, transitions, api, the student, the eras, Pendekar Bayang.
 * Scenes ask it to move: go(), learnHistoricalEra(), takeAssessment(), timeTravel() ...
 * ============================================================================
 */
import { Stage, Input, DialogueBox, Transition, el, esc, sleep } from './core.js';
import { Api } from './api.js';
import { User, Student, Avatar, HistoricalEra, EraProgression } from './domain.js';
import { PendekarBayang, spriteEl, entityPortrait } from './entity.js';
import { fillMarkers, ROLE_LINES, ENTITY_NAME } from './entityLines.js';
import { HubScene, PrologueScene, DoorsScene, TrophyScene, EpilogueScene } from './scenes.js';
import { CreditsScene } from './creditsScene.js';
import { MapScene } from './mapScene.js';
import { MissionScene } from './missionScene.js';
import { TrainingScene, SiegeScene } from './battleScenes.js';
import { AvatarScene, ProfileScene, ProgressScene } from './studentScenes.js';

const SCENES = { HubScene, PrologueScene, DoorsScene, TrophyScene, EpilogueScene, CreditsScene, MapScene, MissionScene, TrainingScene, SiegeScene, AvatarScene, ProfileScene, ProgressScene };

/* ------------------------------------------------------------------------- */
/** Where a play-through is remembered: the chosen narrative, its quests and the scene (local storage). */
export class RunStore {
  constructor(storage = window.localStorage) { this.s = storage; }
  _k(sid, era, what) { return `sw_${what}_${sid}_${era}`; }
  _read(k) { try { return JSON.parse(this.s.getItem(k) || 'null'); } catch { return null; } }
  _write(k, v) { try { if (v === null) this.s.removeItem(k); else this.s.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  get(sid, era) { return this._read(this._k(sid, era, 'run')); }
  set(sid, era, run) { this._write(this._k(sid, era, 'run'), run); }
  clear(sid, era) { this._write(this._k(sid, era, 'run'), null); }
  last(sid, era) { return this._read(this._k(sid, era, 'last')); }
  setLast(sid, era, narrativeID) { this._write(this._k(sid, era, 'last'), narrativeID); }
  role(sid, era) { return this._read(this._k(sid, era, 'role')); }
  setRole(sid, era, role) { this._write(this._k(sid, era, 'role'), role); }
}

/* ------------------------------------------------------------------------- */
export class Game {
  constructor(root) {
    this.root = root;
    this.stage = new Stage(root);
    this.input = new Input();
    this.dialog = new DialogueBox(this.stage, this.input);
    this.transition = new Transition(this.stage);
    this.runStore = new RunStore();
    this.scene = null;
    this._seq = 0;
    this.eras = [];
    this.lastEraID = null;
    this.input.global.f = () => this.stage.toggleFullscreen();
  }

  /* ----------------------------------------------------------------- boot */
  async boot() {
    const loading = el('div', 'loading', '<div class="ld-title">SEJARAH WIRA</div><div class="ld-bar"><i></i></div><div class="ld-msg">Memuatkan buku...</div>');
    this.stage.sceneLayer.appendChild(loading);
    const bar = loading.querySelector('i');
    const msg = loading.querySelector('.ld-msg');
    const step = (p) => { bar.style.width = `${p}%`; };

    const saved = User.login();
    if (!saved || saved.role === 'Teacher' || !saved.studentID) {
      window.location.href = '../index.html';
      return;
    }
    try {
      this.api = new Api(saved);
      step(15);
      const avatar = await Avatar.loadAvatarAsset(this.api, saved.studentID, saved.avatarID || 1, saved);
      step(35);
      this.student = new Student(saved, avatar);
      this.entity = new PendekarBayang({ dialog: this.dialog, api: this.api, student: this.student });
      await this.refreshEras();
      step(60);
      await Promise.all([this.entity.load(0), this.preload(avatar.assetPath, step), this.fontsReady()]);
      step(100);
    } catch (err) {
      msg.innerHTML = `${esc(err.message || 'Permainan tidak dapat dimuatkan.')} <button class="btn-px small">Cuba lagi</button>`;
      msg.querySelector('button').addEventListener('click', () => { loading.remove(); this.boot(); });
      return;
    }
    await sleep(250);
    loading.remove();
    // kali pertama: pilih avatar dahulu, kemudian prolog
    if (this.progression.isFirstTime) {
      await this.go('AvatarScene', { first: true, next: { scene: 'PrologueScene', params: { full: true, eraID: this.eras[0].eraID } } });
    }
    else await this.go('HubScene');
  }

  fontsReady() {
    return Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), sleep(2500)]);
  }

  preload(avatarSrc, step) {
    const poses = ['smirk', 'laughing', 'angry', 'surprised', 'impressed', 'whispering'];
    const srcs = [avatarSrc, ...poses.map((p) => `../assets/gameAsset/npc/pendekar_bayang_${p}.png`), '../assets/gameAsset/npc/pendekar_bayang_suprised.png'];
    let n = 0;
    return Promise.race([
      Promise.all(srcs.map((s) => new Promise((r) => {
        const i = new Image();
        i.onload = i.onerror = () => { n += 1; step(60 + Math.round((n / srcs.length) * 38)); r(); };
        i.src = s;
      }))),
      sleep(4000)
    ]);
  }

  /* --------------------------------------------------------------- scenes */
  async go(name, params = {}) {
    const Cls = SCENES[name];
    if (!Cls) throw new Error(`Babak ${name} tidak wujud.`);
    const seq = ++this._seq;
    if (this.scene) this.scene.exit();
    this.dialog.hide();
    this.scene = new Cls(this);
    this.scene.name = name;
    try {
      await this.scene.mount(params);
    } catch (err) {
      if (seq === this._seq) this.fatal(err);
    }
  }

  fatal(err) {
    console.error(err);
    this.openModal({
      title: 'Ralat',
      body: `<p>${esc(err && err.message ? err.message : 'Sesuatu tidak kena.')}</p>`,
      buttons: [{ label: 'Kembali ke meja', primary: true, onClick: () => this.go('HubScene') }]
    });
  }

  /* ----------------------------------------------------------------- eras */
  async refreshEras() {
    this.eras = await HistoricalEra.loadEra(this.api, this.student.studentID);
    this.progression = new EraProgression(this.eras);
    return this.eras;
  }
  eraById(id) { return this.eras.find((e) => e.eraID === Number(id)) || null; }

  /* --------------------------------------------------------- big movements */
  /** hub -> world map (3-second soul-pull; the story itself plays only the first time) */
  openBook() { return this.go('PrologueScene', { full: false }); }
  afterPull() { return this.go('MapScene'); }
  beginEra(eraID) { this.lastEraID = Number(eraID); return this.go('MissionScene', { eraID }); }

  /** UC-03: map -> era. Soul-pull inside one world, time machine to a different era. */
  async learnHistoricalEra(eraID) {
    const era = this.eraById(eraID);
    const go = () => this.go('MissionScene', { eraID });
    const prev = this.eraById(this.lastEraID);
    await this.entity.load(eraID);
    if (prev && prev.eraID !== era.eraID) {
      await this.transition.timeMachine({ from: prev.eraName, to: era.eraName, line: this.entity.remark('mesinMasa', {}, eraID), middle: go });
    } else {
      await this.transition.soulPull({ line: this.entity.remark('pindahJiwa', {}, eraID), ms: 2600, middle: go });
    }
    this.lastEraID = Number(eraID);
  }

  /** after a passed Siege: time machine to the next era on the map */
  async timeTravel(fromID, toID) {
    const a = this.eraById(fromID); const b = this.eraById(toID);
    await this.entity.load(toID);
    await this.transition.timeMachine({
      from: a ? a.eraName : '', to: b ? b.eraName : '', line: this.entity.remark('mesinMasa', {}, toID),
      middle: () => this.go('MapScene', { focusEra: toID })
    });
    this.lastEraID = Number(toID);
  }

  /** UC-05 / UC-06 straight from the map */
  async takeAssessment(type, eraID) {
    await this.entity.load(eraID);
    if (type === 'training') {
      await this.entity.speak('latihanBuka', {}, { eraID });
      return this.go('TrainingScene', { eraID });
    }
    await this.entity.speak('kepungSegera', {}, { eraID });
    return this.go('SiegeScene', { eraID });
  }

  /* ------------------------------------------------------ the student's role */
  /**
   * The role the student played voices the badge line (n = 1) and the moral lesson (n = 2).
   * role = { npc, lines } (a narrative) or { name, asset, lines } (saved). Missing -> the avatar speaks.
   */
  async roleSpeak(role, n, extra = '') {
    const r = role && (role.npc ? { name: role.npc.name, asset: role.npc.asset, lines: role.lines } : role);
    const nama = this.student.studentName;
    let name; let text; let portrait;
    if (r && r.name) {                                   // the character the student played speaks (never the avatar)
      name = r.name;
      text = fillMarkers((r.lines && r.lines[n]) || ROLE_LINES[n].fallback, { nama, peranan: r.name });
      portrait = () => spriteEl(r.asset, name, 'npc-portrait');
    } else {                                             // no role was set for this narrative: Pendekar Bayang speaks
      name = ENTITY_NAME;
      text = fillMarkers(n === 1 ? 'Misi selesai, {nama}. Kitab ini mengakui jasamu.' : ROLE_LINES[n].fallback, { nama });
      portrait = () => entityPortrait('impressed');
    }
    const tone = r && r.name ? 'me' : '';
    await this.dialog.say({ name, text, portrait: portrait(), side: 'right', tone });
    if (extra) await this.dialog.say({ name, text: extra, portrait: portrait(), side: 'right', tone });
    this.dialog.hide();
  }

  /* ----------------------------------------------------------------- modal */
  /**
   * openModal({ title, body (html string or Element), buttons:[{label, primary, keep, onClick}] })
   * Resolves with the label of the pressed button (null for Esc).
   */
  openModal({ title = '', body = '', buttons = [{ label: 'Tutup', primary: true }] }) {
    return new Promise((resolve) => {
      const wrap = el('div', 'modal');
      const card = el('div', 'modal-card px parchment');
      card.appendChild(el('h3', 'modal-title', esc(title)));
      const b = el('div', 'modal-body');
      if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
      card.appendChild(b);
      const row = el('div', 'modal-btns');
      let primary = null;
      let closed = false;
      const close = (label) => { if (closed) return; closed = true; off(); wrap.remove(); resolve(label); };
      buttons.forEach((def) => {
        const btn = el('button', `btn-px small${def.primary ? ' gold' : ''}`, esc(def.label));
        btn.addEventListener('click', () => {
          if (def.onClick) def.onClick();
          if (!def.keep) close(def.label);
        });
        row.appendChild(btn);
        if (def.primary) primary = btn;
      });
      card.appendChild(row);
      wrap.appendChild(card);
      this.stage.modalLayer.appendChild(wrap);
      const off = this.input.push({
        onKeyDown: (k) => {
          if (k === 'Escape') { close(null); return true; }
          if (k === 'Enter' && primary) { primary.click(); return true; }
          return false;
        }
      });
      if (primary) primary.focus();
    });
  }
}

/** Mulakan permainan. (core.js menunggu templat HTML dimuatkan, jadi DOMContentLoaded mungkin sudah berlalu.) */
function mula() {
  const root = document.getElementById('game-root');
  if (!root || root.dataset.preview) return;      // pratonton pengurus kandungan membina Game sendiri
  const game = new Game(root);
  window.sejarahwira = game;               // berguna untuk nyahpepijat dalam konsol
  game.boot();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mula);
else mula();
