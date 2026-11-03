/**
 * assets/game/map/mapScene.js  -  MapScene: walk the avatar to an era
 * MODULE: map  (World map: pick the era (chapter))
 * USE CASE: UC-03   CLASS DIAGRAM: HistoricalEra, EraProgression
 */
/**
 * ============================================================================
 * mapScene.js  -  MapScene: the world map you walk on
 *   WASD / arrows walk, click walks along the road, E opens a node, Esc pauses.
 *   The camera follows the student's own avatar over a 1920x1080 world.
 *   Node states: locked / unlocked / in progress / completed.
 * ============================================================================
 */
import { el, esc } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { LANE_RADIUS, NODE_RADIUS, START, TALK_RADIUS, WORLD, WORLD_IMAGE, WORLD_MASK, nodeFor } from './mapConfig.js';
import { entityPortrait } from '../npc/entity.js';
import { AVATAR_FACES } from '../student/avatarConfig.js';

const VIEW_W = 960;
const VIEW_H = 540;
const SPEED = 240;

const prng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const segDist = (px, py, a, b) => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return { d: Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)), t, x: a.x + t * dx, y: a.y + t * dy };
};

export class MapScene extends GameScene {
  async enter({ focusEra = null } = {}) {
    this.root.classList.add('map');
    this.eras = await this.game.refreshEras();
    this.nodes = this.eras.map((e, i) => ({ era: e, ...nodeFor(i), index: i }));
    this.path = [START, ...this.nodes.map((n) => ({ x: n.x, y: n.y }))];

    this.canvas = el('canvas', 'map-canvas');
    this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.ctx = this.canvas.getContext('2d');
    this.root.innerHTML = `
      <div class="map-top px"><span class="map-title">PETA SEJARAH</span><span class="map-sub">Esc: meja</span></div>
      <div class="map-prompt px hidden"></div>
      <div class="map-entity"></div>
      <div class="speech-bubble map-bubble hidden"></div>`;
    this.root.prepend(this.canvas);
    this.root.querySelector('.map-entity').appendChild(entityPortrait('smirk', 'floating small'));

    const focus = focusEra ? this.nodes.find((n) => n.era.eraID === Number(focusEra)) : null;
    const startNode = focus || this.nodes.find((n) => n.era.status === 'in progress') || this.nodes.find((n) => n.era.status === 'unlocked') || null;
    this.p = startNode ? { x: startNode.x - 70, y: startNode.y + 20 } : { ...START };
    this.face = AVATAR_FACES === 'left' ? -1 : 1;     // -1 = walking left, 1 = walking right
    this.route = [];
    this.near = null;
    this.t = 0;
    this.moving = false;

    this.world = this.paintWorld();
    this.loadMask();
    this.avatarImg = new Image();
    this.avatarImg.src = this.student.avatar.assetPath;

    this.canvas.addEventListener('click', (e) => this.onClick(e));
    this.keys({
      onKeyDown: (k) => {
        if (k === 'e' || k === 'Enter') { this.interact(); return true; }
        if (k === 'Escape') { this.pause(); return true; }
        return ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k);
      }
    });

    this.last = performance.now();
    const loop = (now) => {
      if (!this.alive) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.update(dt);
      this.draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this.own(() => cancelAnimationFrame(this._raf));

    await this.entity.load(0);
    setTimeout(() => this.say(this.entity.remark('peta', { era: this.prevName(this.nodes.find((n) => n.era.status === 'locked')) })), 900);
    this.every(() => { if (!this.paused) this.say(this.entity.remark('peta', { era: this.prevName(this.nodes.find((n) => n.era.status === 'locked')) })); }, 20000);
  }

  prevName(node) {
    if (!node) return 'era sebelumnya';
    const prev = this.nodes[node.index - 1];
    return prev ? prev.era.eraName : 'era sebelumnya';
  }

  say(text) {
    const b = this.root.querySelector('.map-bubble');
    if (!b || !text) return;
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.add('hidden'), 4800);
    this.own(() => clearTimeout(this._bt));
  }

  /* ------------------------------------------------------------ walking */
  loadMask() {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = WORLD.w; c.height = WORLD.h;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, WORLD.w, WORLD.h);
        this.mask = g.getImageData(0, 0, WORLD.w, WORLD.h).data;
      } catch { this.mask = null; }
    };
    img.onerror = () => { this.mask = null; };
    img.src = WORLD_MASK;
  }

  walkable(x, y) {
    if (x < 10 || y < 10 || x > WORLD.w - 10 || y > WORLD.h - 10) return false;
    if (this.mask) {
      const i = (Math.round(y) * WORLD.w + Math.round(x)) * 4;
      return this.mask[i + 3] > 128 && this.mask[i] > 128;
    }
    for (let i = 0; i < this.path.length - 1; i++) if (segDist(x, y, this.path[i], this.path[i + 1]).d <= LANE_RADIUS) return true;
    return this.nodes.some((n) => Math.hypot(x - n.x, y - n.y) <= NODE_RADIUS);
  }

  /** closest point of the road to (x, y): returns { i (segment), t, x, y } */
  project(x, y) {
    let best = null;
    for (let i = 0; i < this.path.length - 1; i++) {
      const r = segDist(x, y, this.path[i], this.path[i + 1]);
      if (!best || r.d < best.d) best = { ...r, i };
    }
    return best;
  }

  onClick(e) {
    if (this.paused) return;
    const r = this.canvas.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * VIEW_W;
    const sy = ((e.clientY - r.top) / r.height) * VIEW_H;
    const wx = sx + this.cam.x; const wy = sy + this.cam.y;
    const node = this.nodes.find((n) => Math.hypot(wx - n.x, wy - n.y) < 46);
    const target = node ? { x: node.x, y: node.y } : this.project(wx, wy);
    this.walkTo(target);
    if (node) this.clickedNode = node;
  }

  walkTo(target) {
    const a = this.project(this.p.x, this.p.y);
    const b = this.project(target.x, target.y);
    const pts = [{ x: a.x, y: a.y }];
    if (a.i < b.i) { for (let i = a.i + 1; i <= b.i; i++) pts.push({ ...this.path[i] }); }
    else if (a.i > b.i) { for (let i = a.i; i > b.i; i--) pts.push({ ...this.path[i] }); }
    pts.push({ x: b.x, y: b.y });
    this.route = pts;
  }

  update(dt) {
    this.t += dt;
    const inp = this.input;
    let dx = 0; let dy = 0;
    if (inp.isDown('a', 'ArrowLeft')) dx -= 1;
    if (inp.isDown('d', 'ArrowRight')) dx += 1;
    if (inp.isDown('w', 'ArrowUp')) dy -= 1;
    if (inp.isDown('s', 'ArrowDown')) dy += 1;
    if (dx || dy) {
      this.route = []; this.clickedNode = null;
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    } else if (this.route.length) {
      const tgt = this.route[0];
      const vx = tgt.x - this.p.x; const vy = tgt.y - this.p.y;
      const l = Math.hypot(vx, vy);
      if (l < 6) {
        this.route.shift();
        if (!this.route.length && this.clickedNode) { this.interact(this.clickedNode); this.clickedNode = null; }
      } else { dx = vx / l; dy = vy / l; }
    }
    this.moving = !!(dx || dy);
    if (this.moving) {
      if (dx) this.face = dx > 0 ? 1 : -1;
      const nx = this.p.x + dx * SPEED * dt;
      const ny = this.p.y + dy * SPEED * dt;
      if (this.walkable(nx, this.p.y) || this.route.length) this.p.x = nx;
      if (this.walkable(this.p.x, ny) || this.route.length) this.p.y = ny;
    }
    this.cam = {
      x: Math.max(0, Math.min(WORLD.w - VIEW_W, this.p.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(WORLD.h - VIEW_H, this.p.y - VIEW_H / 2))
    };
    const n = this.nodes.find((q) => Math.hypot(this.p.x - q.x, this.p.y - q.y) <= TALK_RADIUS) || null;
    if (n !== this.near) {
      this.near = n;
      const pr = this.root.querySelector('.map-prompt');
      if (n) {
        pr.innerHTML = `<b>E</b> ${esc(n.era.eraName)} <span class="tag ${esc(n.era.status.replace(' ', '-'))}">${esc(n.era.status)}</span>`;
        pr.classList.remove('hidden');
      } else pr.classList.add('hidden');
    }
  }
  get cam() { return this._cam || { x: 0, y: 0 }; }
  set cam(v) { this._cam = v; }

  /* --------------------------------------------------------- interaction */
  async interact(node = this.near) {
    const n = node || this.near;
    if (!n || this.paused) return;
    const era = n.era;
    this.paused = true;
    try {
      if (era.status === 'locked') {
        await this.entity.speak('peta', { era: this.prevName(n) });
        return;
      }
      const run = this.game.runStore.get(this.student.studentID, era.eraID);
      const replay = era.isCompleted || era.narrativeDone;
      const buttons = [];
      let choice = null;
      buttons.push({ label: run ? 'Teruskan misi' : replay ? 'Ulang misi (cerita baharu)' : 'Mulakan misi', primary: true, onClick: () => { choice = 'story'; } });
      if (era.evaluateUnlockAssessment()) {
        buttons.push({ label: 'Gelanggang Latihan', onClick: () => { choice = 'training'; } });
        buttons.push({ label: 'Kepungan Agung', onClick: () => { choice = 'siege'; } });
      }
      buttons.push({ label: 'Batal' });
      await this.game.openModal({ title: era.eraName, body: `<p>${esc(era.description || '')}</p>`, buttons });
      if (choice === 'story') await this.game.learnHistoricalEra(era.eraID);
      else if (choice === 'training') await this.game.takeAssessment('training', era.eraID);
      else if (choice === 'siege') await this.game.takeAssessment('siege', era.eraID);
    } finally {
      if (this.alive) this.paused = false;
    }
  }

  async pause() {
    if (this.paused) return;
    this.paused = true;
    let leave = false;
    await this.game.openModal({
      title: 'Jeda',
      body: '<p>Kemajuan misi yang siap sudah disimpan.</p>',
      buttons: [{ label: 'Sambung', primary: true }, { label: 'Kembali ke meja', onClick: () => { leave = true; } }]
    });
    if (leave) return this.game.go('HubScene');
    this.paused = false;
    return null;
  }

  /* -------------------------------------------------------------- drawing */
  paintWorld() {
    const c = document.createElement('canvas');
    c.width = WORLD.w; c.height = WORLD.h;
    const g = c.getContext('2d');
    const rnd = prng(20260);

    const grad = g.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    grad.addColorStop(0, '#4d7a3a'); grad.addColorStop(0.5, '#5f8a42'); grad.addColorStop(1, '#3f6b3b');
    g.fillStyle = grad; g.fillRect(0, 0, WORLD.w, WORLD.h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '30,70,30' : '120,160,80'},${0.05 + rnd() * 0.1})`;
      g.beginPath(); g.ellipse(rnd() * WORLD.w, rnd() * WORLD.h, 30 + rnd() * 120, 20 + rnd() * 70, rnd() * 3, 0, 7); g.fill();
    }
    // a river
    g.strokeStyle = '#3f86b5'; g.lineWidth = 70; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-40, 560); g.bezierCurveTo(500, 420, 700, 640, 1000, 540); g.bezierCurveTo(1300, 440, 1500, 640, 1960, 560); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 8; g.stroke();
    // mountains + trees
    for (let i = 0; i < 24; i++) {
      const x = rnd() * WORLD.w; const y = 40 + rnd() * 150; const s = 40 + rnd() * 70;
      g.fillStyle = '#6b6f78'; g.beginPath(); g.moveTo(x - s, y + s); g.lineTo(x, y); g.lineTo(x + s, y + s); g.fill();
      g.fillStyle = '#e9eef2'; g.beginPath(); g.moveTo(x - s * 0.25, y + s * 0.3); g.lineTo(x, y); g.lineTo(x + s * 0.25, y + s * 0.3); g.fill();
    }
    for (let i = 0; i < 260; i++) {
      const x = rnd() * WORLD.w; const y = rnd() * WORLD.h;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x, y + 12, 12, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#2f5a2c'; g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill();
      g.fillStyle = '#3e7239'; g.beginPath(); g.arc(x - 3, y - 4, 7, 0, 7); g.fill();
    }
    // the road (wide, so the corridor is visible)
    const road = (w, col) => {
      g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); this.path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    };
    road(LANE_RADIUS * 2 + 12, '#5a3f22');
    road(LANE_RADIUS * 2, '#c9a56a');
    g.setLineDash([14, 18]); road(4, 'rgba(90,60,30,0.55)'); g.setLineDash([]);
    this.nodes.forEach((n) => {
      g.fillStyle = '#b79152'; g.beginPath(); g.arc(n.x, n.y, 66, 0, 7); g.fill();
      g.strokeStyle = '#5a3f22'; g.lineWidth = 6; g.stroke();
    });
    g.fillStyle = '#3b2412'; g.beginPath(); g.arc(START.x, START.y, 20, 0, 7); g.fill();
    g.fillStyle = '#ff9a2b'; g.beginPath(); g.arc(START.x, START.y - 6, 9, 0, 7); g.fill();

    const bg = new Image();
    bg.onload = () => { this.world = (() => { const w = document.createElement('canvas'); w.width = WORLD.w; w.height = WORLD.h; w.getContext('2d').drawImage(bg, 0, 0, WORLD.w, WORLD.h); return w; })(); };
    bg.src = WORLD_IMAGE;
    return c;
  }

  draw() {
    const g = this.ctx;
    const cam = this.cam;
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.drawImage(this.world, cam.x, cam.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

    // nodes
    this.nodes.forEach((n) => {
      const x = n.x - cam.x; const y = n.y - cam.y;
      if (x < -120 || x > VIEW_W + 120 || y < -120 || y > VIEW_H + 120) return;
      const st = n.era.status;
      const pulse = 1 + Math.sin(this.t * 3 + n.index) * 0.06;
      const col = { locked: '#6b6b6b', unlocked: '#f2c14e', 'in progress': '#ff8a3d', completed: '#4ade80' }[st] || '#6b6b6b';
      g.save();
      g.translate(x, y);
      if (st !== 'locked') { g.shadowColor = col; g.shadowBlur = 18 * pulse; }
      g.fillStyle = '#1a0f07'; g.beginPath(); g.arc(0, 0, 34 * (st === 'locked' ? 1 : pulse), 0, 7); g.fill();
      g.lineWidth = 6; g.strokeStyle = col; g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = col; g.font = 'bold 22px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(st === 'locked' ? '\u{1F512}' : st === 'completed' ? '✓' : String(n.index + 1), 0, 2);
      if (this.near === n) {
        g.fillStyle = '#fff'; g.font = '12px "Press Start 2P", monospace';
        const label = n.era.eraName.length > 28 ? `${n.era.eraName.slice(0, 27)}…` : n.era.eraName;
        const tw = g.measureText(label).width + 16;
        g.fillStyle = 'rgba(20,10,4,0.85)'; g.fillRect(-tw / 2, 44, tw, 24);
        g.fillStyle = '#f2e0b8'; g.fillText(label, 0, 57);
      }
      g.restore();
    });

    // avatar
    const ax = this.p.x - cam.x; const ay = this.p.y - cam.y;
    const bob = this.moving ? Math.abs(Math.sin(this.t * 14)) * 5 : Math.sin(this.t * 2) * 1.5;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(ax, ay + 4, 20, 7, 0, 0, 7); g.fill();
    const img = this.avatarImg;
    if (img && img.complete && img.naturalWidth) {
      const h = 78; const w = (img.naturalWidth / img.naturalHeight) * h;
      // the picture looks LEFT as drawn (avatarConfig.js): mirror it while walking right
      const flip = AVATAR_FACES === 'left' ? -this.face : this.face;
      g.save(); g.translate(ax, ay - bob); g.scale(flip, 1); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, -w / 2, -h, w, h); g.restore();
    } else {
      g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(ax, ay - 30 - bob, 16, 0, 7); g.fill();
      g.fillStyle = '#9a2b12'; g.fillRect(ax - 11, ay - 16 - bob, 22, 18);
    }
  }
}
