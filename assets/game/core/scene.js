/**
 * assets/game/core/scene.js  -  GameScene: base class of every scene
 * MODULE: core  (Base layer: stage, helpers, templates loader, API, domain model, sound)
 * USE CASE: all   CLASS DIAGRAM: User, Student, Teacher, Avatar, ... (domain.js mirrors the class diagram)
 */
import { el } from './core.js';

/** thrown when a scene was left while one of its flows was still waiting */
export class SceneGone extends Error {}


/* ========================================================================== */
export class GameScene {
  constructor(game) {
    this.game = game;
    this.root = el('div', 'scene');
    this._cleanups = [];
    this._alive = true;
  }

  get stage() { return this.game.stage; }
  get input() { return this.game.input; }
  get dialog() { return this.game.dialog; }
  get entity() { return this.game.entity; }
  get student() { return this.game.student; }
  get api() { return this.game.api; }

  /** mount in the stage and start. Subclasses override enter(params). */
  async mount(params = {}) {
    this.stage.sceneLayer.appendChild(this.root);
    await this.enter(params);
  }
  async enter() { /* subclasses */ }

  /** register something to undo on exit */
  own(fn) {
    this._cleanups.push(fn);
    return fn;
  }

  /** listen to the keyboard while this scene is on top */
  keys(handlers) {
    const off = this.input.push(handlers);
    this.own(off);
    return off;
  }

  /**
   * BUTANG HUD TERTUTUP: butang (cth. Jeda, Bisikan) bertukar KELABU bila ada sesuatu menutupinya
   * (tetingkap, halaman kepingan, dialog, peralihan) kerana ketika itu ia tidak boleh diklik.
   * Cara: tanya pelayar elemen apa yang berada di tengah butang; jika bukan butang itu, ia tertutup.
   * `selectors` = senarai pemilih butang di dalam adegan ini.
   */
  watchCovered(selectors) {
    const frame = this.game.stage.frame;
    let queued = false;
    const check = () => {
      queued = false;
      selectors.forEach((sel) => {
        const btn = this.root.querySelector(sel);
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        btn.classList.toggle('is-covered', !!top && top !== btn && !btn.contains(top));
      });
    };
    const soon = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
    const watcher = new MutationObserver(soon);
    watcher.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    this.own(() => watcher.disconnect());
    soon();
  }

  /** run something every `ms` milliseconds until the scene is left */
  every(fn, ms) {
    const id = setInterval(fn, ms);
    this.own(() => clearInterval(id));
    return id;
  }

  exit() {
    this._alive = false;
    this._cleanups.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } });
    this.dialog.hide();
    this.root.remove();
  }

  get alive() { return this._alive; }

  /** await a promise, then stop the flow if the scene was left meanwhile */
  async gate(promise) {
    const r = await promise;
    if (!this._alive) throw new SceneGone();
    return r;
  }

  /** run a long flow without blocking go(); errors other than SceneGone go to the game */
  runFlow(fn) {
    Promise.resolve().then(fn).catch((err) => {
      if (err instanceof SceneGone) return;
      this.game.fatal(err);
    });
  }
}
