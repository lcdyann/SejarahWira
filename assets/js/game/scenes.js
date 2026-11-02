/**
 * ============================================================================
 * scenes.js  -  GameScene (base) and the "around the story" scenes
 *
 *   GameScene                 base class: lifecycle + key/cleanup helpers
 *     HubScene                the study desk (home)
 *     PrologueScene           first time: the soul is taken. Later: a 3 s soul-pull
 *     DoorsScene              after a chapter: Wira Training Grounds / The Great Siege
 *     TrophyScene             the trophy room (shelf, full mode)
 *     EpilogueScene           after ALL eras are completed
 *   (MapScene -> mapScene.js, MissionScene -> missionScene.js,
 *    BattleScene -> TrainingScene / SiegeScene -> battleScenes.js)
 * ============================================================================
 */
import { el, esc, sleep, tpl } from './core.js';
import { entityPortrait, spriteEl } from './entity.js';
import { ShelfComponent } from './shelf.js';
import { sound } from './sound.js';
import {
  HUB_BG,
  HUB_BG_DAY,
  HUB_THEME,
  HUB_OBJECTS,
  HUB_STUDENT,
  HUB_PENDEKAR,
  HUB_BUBBLE
} from './hubConfig.js';
import { PROLOGUE_BG, PROLOGUE_BOOK, PROLOGUE_HAND_WIDTH } from './prologueConfig.js';
import { HOME_LINES } from './creditsConfig.js';

/** resolves true when the picture loads (the hub works without it) */
const probeImage = (src) => new Promise((resolve) => {
  const image = new Image();
  const timer = setTimeout(() => resolve(false), 3000);

  image.onload = () => {
    clearTimeout(timer);
    resolve(true);
  };
  image.onerror = () => {
    clearTimeout(timer);
    resolve(false);
  };
  image.src = src;
});

/** use the drawn hub picture as the room when it exists */
const applyHubPicture = async (root, sources = [HUB_BG]) => {
  for (const src of sources) {                       // the first picture that exists is used
    if (await probeImage(src)) {
      root.classList.add('has-picture');
      root.style.backgroundImage = `url('${src}')`;
      return true;
    }
  }
  return false;
};

/** day / night of the hub: remembered in this browser (the hub starts at night) */
const THEME_KEY = 'sw_hub_theme';
export const getHubTheme = () => {
  try { return window.localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night'; } catch { return 'night'; }
};
const saveHubTheme = (t) => {
  try { window.localStorage.setItem(THEME_KEY, t); } catch { /* the switch still works for this visit */ }
};

/** put the student's avatar where hubConfig.js says */
const placeStudent = (node) => {
  Object.assign(node.style, {
    left: `${HUB_STUDENT.x}%`,
    top: `${HUB_STUDENT.y}%`,
    height: `${HUB_STUDENT.h}%`,
    bottom: 'auto',
    width: 'auto'
  });
};

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

/* ========================================================================== */
/* HubScene  (the study room)                                                 */
/*   sizes and positions: assets/js/game/hubConfig.js                         */
/*   look:                assets/css/game.css, section 7                      */
/* ========================================================================== */
export class HubScene extends GameScene {
  async enter(params = {}) {
    this.theme = getHubTheme();
    await this.paintRoom();

    this.root.classList.add('hub-room');
    this.editing = /[?&]hubedit=1/.test(window.location.search);
    if (this.editing) this.root.classList.add('is-editing');

    this.selectedIndex = 3;                                  // the book is selected first

    const hint = this.editing
      ? 'Mod suai: seret, roda tetikus untuk saiz'
      : '← → pilih · Enter buka · T siang/malam · F skrin penuh';

    this.root.innerHTML = `
      <div class="hub-window"><i class="moon"></i></div>
      <div class="hub-lamp"></div>
      <div class="hub-desk"></div>
      <div class="hub-items"></div>
      <button type="button" class="hub-theme-btn" aria-live="polite"></button>
      <div class="hub-pendekar"></div>
      <div class="speech-bubble hub-pendekar-bubble hidden"></div>
      <div class="hub-item-label hidden"></div>
      <div class="hub-keys-hint px">${hint}</div>`;

    this.addThemeButton();
    this.addStudent();
    this.addItems();
    this.addPendekar();
    this.placeExtras();
    this.listenKeys();

    this.select(this.selectedIndex);
    if (this.editing) this.startEditor();

    await this.entity.load(0);
    this.say(this.entity.remark('hub'));
    this.every(() => {
      if (!document.querySelector('.dlg:not(.hidden)')) this.say(this.entity.remark('hub'));
    }, 14000);

    if (params.afterEpilogue) {
      this.root.querySelector('.hub-keys-hint').textContent = 'Kau sudah pulang. Buku itu kini tenang.';
    }
  }

  /** the room picture for the current mode (day_hub.jpg by day, hub.jpg at night) */
  async paintRoom() {
    const day = this.theme === 'day';
    this.root.classList.toggle('is-day', day);
    this.root.classList.remove('has-picture');
    this.root.style.backgroundImage = '';
    await applyHubPicture(this.root, day ? [HUB_BG_DAY, HUB_BG] : [HUB_BG]);
  }

  /** moon.png at night, sun.png by day; press it (or T) to switch */
  addThemeButton() {
    const button = this.root.querySelector('.hub-theme-btn');
    button.style.left = `${HUB_THEME.x}%`;
    button.style.top = `${HUB_THEME.y}%`;
    button.style.width = `${HUB_THEME.w}%`;
    this.themeBtn = button;
    this.paintThemeButton();
    button.addEventListener('mouseenter', () => this.say(this.theme === 'day' ? 'Mahu kembali ke malam?' : 'Mahu melihat bilik di waktu siang?'));
    button.addEventListener('click', () => { if (!this.editing) this.toggleTheme(); });
  }

  paintThemeButton() {
    const day = this.theme === 'day';
    const button = this.themeBtn;
    const label = day ? 'Tukar ke mod malam' : 'Tukar ke mod siang';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.classList.toggle('is-sun', day);
    button.textContent = '';
    const fallback = el('span', 'hub-theme-icon', day ? '\u2600' : '\u{1F319}');       // shows until the picture loads
    button.appendChild(fallback);
    const picture = new Image();
    picture.alt = '';
    picture.draggable = false;
    picture.onload = () => { fallback.remove(); button.appendChild(picture); };
    picture.src = day ? HUB_THEME.sun : HUB_THEME.moon;
  }

  async toggleTheme() {
    if (this._switching) return;
    this._switching = true;
    this.theme = this.theme === 'day' ? 'night' : 'day';
    saveHubTheme(this.theme);
    this.root.classList.toggle('is-day', this.theme === 'day');   // instant: the tint changes even before the picture does
    this.paintThemeButton();
    this.root.classList.add('is-switching');
    try {
      await this.paintRoom();
    } finally {
      this.root.classList.remove('is-switching');
      this._switching = false;
    }
  }

  /** the student's avatar stands in the room */
  addStudent() {
    const student = spriteEl(this.student.avatar.assetPath, this.student.studentName, 'hub-student');
    this.root.appendChild(student);
  }

  /** door, mirror, notebook, book, trophy */
  addItems() {
    const holder = this.root.querySelector('.hub-items');
    this.itemEls = [];

    HUB_OBJECTS.forEach((item, index) => {
      const button = el('button', `hub-item item-${item.id}`);
      const icon = el('span', 'hub-item-icon', item.icon);
      button.appendChild(icon);

      if (item.img && item.img.length) this.loadItemPicture(item, index, button, icon);

      button.style.left = `${item.x}%`;
      button.style.top = `${item.y}%`;
      button.style.width = `${item.w}%`;
      button.setAttribute('aria-label', item.label);

      button.addEventListener('mouseenter', () => this.select(index));
      button.addEventListener('focus', () => this.select(index));
      button.addEventListener('click', () => {
        if (!this.editing) this.open(item.id);
      });

      holder.appendChild(button);
      this.itemEls.push(button);
    });
  }

  /** swap the emoji for the drawn picture once it has loaded */
  loadItemPicture(item, index, button, icon) {
    // img may be one path or a list of paths (the first one that exists is used)
    const candidates = Array.isArray(item.img) ? [...item.img] : [item.img];
    const picture = new Image();
    picture.alt = item.label;
    picture.draggable = false;

    picture.onerror = () => {
      if (candidates.length) picture.src = candidates.shift();
    };

    picture.onload = () => {
      icon.remove();
      button.classList.add('has-picture');
      button.appendChild(picture);
      button.style.aspectRatio = `${picture.naturalWidth} / ${picture.naturalHeight}`;
      if (index === this.selectedIndex) this.select(index);
    };

    picture.src = candidates.shift();
  }

  /** Pendekar Bayang floating in the room */
  addPendekar() {
    const holder = this.root.querySelector('.hub-pendekar');
    holder.appendChild(entityPortrait('smirk', 'floating'));
  }

  /** ← → move the selection, Enter opens it */
  listenKeys() {
    const count = HUB_OBJECTS.length;

    this.keys({
      onKeyDown: (key) => {
        if (key === 'ArrowLeft') {
          this.select((this.selectedIndex + count - 1) % count);
          return true;
        }
        if (key === 'ArrowRight') {
          this.select((this.selectedIndex + 1) % count);
          return true;
        }
        if ((key === 'Enter' || key === ' ') && !this.editing) {
          this.open(HUB_OBJECTS[this.selectedIndex].id);
          return true;
        }
        if ((key === 't' || key === 'T') && !this.editing) {
          this.toggleTheme();
          return true;
        }
        return false;
      }
    });
  }

  /** student, Pendekar Bayang and his bubble sit where hubConfig.js says */
  placeExtras() {
    const student = this.root.querySelector('.hub-student');
    const pendekar = this.root.querySelector('.hub-pendekar');
    const bubble = this.root.querySelector('.hub-pendekar-bubble');

    placeStudent(student);

    Object.assign(pendekar.style, {
      left: `${HUB_PENDEKAR.x}%`,
      top: `${HUB_PENDEKAR.y}%`,
      height: `${HUB_PENDEKAR.h}%`
    });

    Object.assign(bubble.style, {
      left: `${HUB_BUBBLE.x}%`,
      top: `${HUB_BUBBLE.y}%`
    });
  }

  /* ---------------------------------------------------------------------- */
  /* ?hubedit=1 : drag things into place, wheel = size, "Salin" = numbers    */
  /* ---------------------------------------------------------------------- */
  startEditor() {
    const stageEl = this.root.parentElement.parentElement;           // .stage (scaled)

    const targets = [
      ...this.itemEls.map((node, i) => ({
        node,
        cfg: HUB_OBJECTS[i],
        size: 'w',
        name: HUB_OBJECTS[i].id
      })),
      { node: this.themeBtn,                                   cfg: HUB_THEME,    size: 'w',  name: 'theme' },
      { node: this.root.querySelector('.hub-student'),         cfg: HUB_STUDENT,  size: 'h',  name: 'student' },
      { node: this.root.querySelector('.hub-pendekar'),        cfg: HUB_PENDEKAR, size: 'h',  name: 'pendekar' },
      { node: this.root.querySelector('.hub-pendekar-bubble'), cfg: HUB_BUBBLE,   size: null, name: 'bubble' }
    ];

    const bubble = targets[targets.length - 1].node;
    bubble.classList.remove('hidden');
    bubble.textContent = 'Gelembung Pendekar Bayang';
    this.every(() => bubble.classList.remove('hidden'), 500);

    const panel = el('div', 'hub-editor px', '<textarea readonly></textarea><button class="btn-px small">Salin</button>');
    this.root.appendChild(panel);
    const area = panel.querySelector('textarea');

    const round = (n) => Math.round(n * 10) / 10;

    /** the text that is pasted into hubConfig.js */
    const writeNumbers = () => {
      area.value = [
        'export const HUB_OBJECTS = [',
        ...HUB_OBJECTS.map((o) => `  { id: '${o.id}', x: ${round(o.x)}, y: ${round(o.y)}, w: ${round(o.w)} },`),
        '];',
        `export const HUB_THEME = { x: ${round(HUB_THEME.x)}, y: ${round(HUB_THEME.y)}, w: ${round(HUB_THEME.w)}, moon: '${HUB_THEME.moon}', sun: '${HUB_THEME.sun}' };`,
        `export const HUB_STUDENT = { x: ${round(HUB_STUDENT.x)}, y: ${round(HUB_STUDENT.y)}, h: ${round(HUB_STUDENT.h)} };`,
        `export const HUB_PENDEKAR = { x: ${round(HUB_PENDEKAR.x)}, y: ${round(HUB_PENDEKAR.y)}, h: ${round(HUB_PENDEKAR.h)} };`,
        `export const HUB_BUBBLE = { x: ${round(HUB_BUBBLE.x)}, y: ${round(HUB_BUBBLE.y)} };`
      ].join('\n');
    };

    panel.querySelector('button').addEventListener('click', () => {
      area.select();
      try {
        navigator.clipboard.writeText(area.value);
      } catch {
        document.execCommand('copy');
      }
    });

    /** move / resize the node to match its numbers */
    const applyNumbers = (t) => {
      t.node.style.left = `${t.cfg.x}%`;
      t.node.style.top = `${t.cfg.y}%`;
      if (t.size === 'w') t.node.style.width = `${t.cfg.w}%`;
      if (t.size === 'h') t.node.style.height = `${t.cfg.h}%`;
      writeNumbers();
    };

    targets.forEach((t) => {
      t.node.style.pointerEvents = 'auto';
      t.node.style.cursor = 'move';

      // drag = move
      t.node.addEventListener('pointerdown', (down) => {
        down.preventDefault();
        const rect = stageEl.getBoundingClientRect();
        const startX = down.clientX;
        const startY = down.clientY;
        const originX = t.cfg.x;
        const originY = t.cfg.y;

        const onMove = (move) => {
          t.cfg.x = originX + ((move.clientX - startX) / rect.width) * 100;
          t.cfg.y = originY + ((move.clientY - startY) / rect.height) * 100;
          applyNumbers(t);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      // wheel = size
      t.node.addEventListener('wheel', (wheel) => {
        if (!t.size) return;
        wheel.preventDefault();
        const step = wheel.deltaY < 0 ? 0.5 : -0.5;
        t.cfg[t.size] = Math.max(3, t.cfg[t.size] + step);
        applyNumbers(t);
      }, { passive: false });
    });

    writeNumbers();
  }

  /* ---------------------------------------------------------------------- */

  /** Pendekar Bayang says something in his bubble for a few seconds */
  say(text) {
    const bubble = this.root.querySelector('.hub-pendekar-bubble');
    if (!bubble) return;

    bubble.textContent = text;
    bubble.classList.remove('hidden');

    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), 5200);
    this.own(() => clearTimeout(this._bubbleTimer));
  }

  /** highlight one item and show its name just under it */
  select(index) {
    this.selectedIndex = index;

    const items = this.root.querySelectorAll('.hub-item');
    items.forEach((node, i) => node.classList.toggle('is-selected', i === index));

    const label = this.root.querySelector('.hub-item-label');
    const node = items[index];

    label.textContent = HUB_OBJECTS[index].label;
    label.style.left = `${node.offsetLeft + node.offsetWidth / 2}px`;
    label.style.top = `${node.offsetTop + node.offsetHeight + 6}px`;      // just under the item
    label.classList.remove('hidden');
  }

  async open(id) {
    switch (id) {
      case 'book':
        return this.game.openBook();

      case 'trophy':
        await this.entity.speak('trofi');
        return this.game.go('TrophyScene');

      case 'notebook':
        return this.notebook();

      case 'mirror':
        return this.mirror();

      case 'replay':
        return this.game.go('PrologueScene', { full: true, replay: true, eraID: this.game.eras[0].eraID });

      case 'door':
        return this.doorMenu();

      default:
        return null;
    }
  }

  /** the notebook: a short summary, with a button to the full progress page */
  async notebook() {
    let body;

    try {
      const data = await this.student.viewLearningProgress(this.api);
      const sum = data.summary || {};

      const eras = (data.eras || [])
        .map((e) => {
          const status = esc((e.eraStatus || '').replace(' ', '-'));
          return `<li><b>${esc(e.eraName)}</b> <span class="tag ${status}">${esc(e.eraStatus)}</span></li>`;
        })
        .join('');

      body = `
        <div class="nb-grid">
          <div><b>${sum.completedEras ?? 0}/${sum.totalEras ?? 0}</b><span>Era selesai</span></div>
          <div><b>${sum.questsCompleted ?? 0}</b><span>Misi selesai</span></div>
          <div><b>${sum.badgesEarned ?? 0}</b><span>Lencana</span></div>
          <div><b>${sum.artifactsUnlocked ?? 0}</b><span>Artifak</span></div>
          <div><b>${sum.bestScore ?? 0}%</b><span>Skor terbaik</span></div>
        </div>
        <ul class="nb-eras">${eras}</ul>`;
    } catch (err) {
      body = `<p>${esc(err.message)}</p>`;
    }

    await this.game.openModal({
      title: 'Diari',
      body,
      buttons: [
        { label: 'Halaman penuh', onClick: () => this.game.go('ProgressScene') },
        { label: 'Tutup', primary: true }
      ]
    });
  }

  /** the mirror: the avatar, with buttons to change it or see the profile */
  async mirror() {
    const avatar = this.student.avatar;

    await this.game.openModal({
      title: this.student.studentName,
      body: `
        <div class="mirror-body">
          <img src="${esc(avatar.assetPath)}" alt="" onerror="this.style.display='none'">
          <p>${esc(avatar.avatarName)}</p>
        </div>`,
      buttons: [
        { label: 'Tukar avatar', onClick: () => this.student.customizeAvatar(this.game) },
        { label: 'Profil & kelas', onClick: () => this.game.go('ProfileScene') },
        { label: 'Tutup', primary: true }
      ]
    });
  }

  /** the door in the hub: game settings (susun atur bunyi: <template id="tpl-sound"> dalam templates.html) */
  async doorMenu() {
    // kawalan bunyi: isi nilai semasa, kemudian ikut gerakan gelangsar
    const panel = tpl('sound', {});
    const paintMute = () => { panel.refs.mute.textContent = sound.muted ? '🔇 Bunyi mati' : '🔊 Bunyi hidup'; };
    paintMute();
    panel.refs.mute.addEventListener('click', () => sound.toggleMute());
    const onMute = () => { if (panel.refs.mute.isConnected) paintMute(); };      // juga bila tekan M
    document.addEventListener('sw-mute', onMute);

    panel.refs.music.value = Math.round(sound.musicLevel * 100);
    panel.refs.sfx.value = Math.round(sound.sfxLevel * 100);
    panel.refs.music.addEventListener('input', () => sound.setMusicLevel(panel.refs.music.value / 100));
    panel.refs.sfx.addEventListener('input', () => sound.setSfxLevel(panel.refs.sfx.value / 100));
    panel.refs.sfx.addEventListener('change', () => sound.sfx('betul'));         // bunyi contoh

    await this.game.openModal({
      title: 'Pintu',
      body: panel,
      buttons: [
        { label: 'Skrin penuh (F)', onClick: () => this.stage.toggleFullscreen(), keep: true },
        { label: 'Log keluar', onClick: () => this.student.logout() },
        { label: 'Tutup', primary: true }
      ]
    });
    document.removeEventListener('sw-mute', onMute);
  }
}

/* ========================================================================== */
/* PrologueScene                                                              */
/* ========================================================================== */
export class PrologueScene extends GameScene {
  /** params: { full: boolean, eraID, replay: true when played again from the hub } */
  async enter({ full = true, eraID = 1, replay = false } = {}) {
    // the prologue is in the real world: normal_hub (hub.jpg while that picture is missing)
    await applyHubPicture(this.root, full ? PROLOGUE_BG : [HUB_BG]);

    this.root.classList.add('hub-room', 'prologue');
    this.eraID = eraID;

    if (!full) {
      await this.short();
      return;
    }

    this.root.innerHTML = `
      <div class="hub-window"><i class="moon"></i></div>
      <div class="hub-lamp"></div>
      <div class="hub-desk"></div>
      <div class="prologue-book"><span class="prologue-book-icon">\u{1F4D6}</span></div>
      <div class="prologue-pendekar"></div>
      <div class="prologue-skip ${replay ? '' : 'hidden'} px">Esc: langkau</div>`;

    const student = spriteEl(this.student.avatar.assetPath, this.student.studentName, 'hub-student');
    this.root.appendChild(student);
    placeStudent(student);

    // the book: buku.png where prologueConfig.js says (the emoji stays while the picture is missing)
    const book = this.root.querySelector('.prologue-book');
    Object.assign(book.style, { left: `${PROLOGUE_BOOK.x}%`, top: `${PROLOGUE_BOOK.y}%`, width: `${PROLOGUE_BOOK.w}%` });
    if (await probeImage(PROLOGUE_BOOK.img)) {
      const picture = new Image();
      picture.src = PROLOGUE_BOOK.img;
      picture.alt = '';
      picture.draggable = false;
      book.replaceChildren(picture);
    }

    // Esc skips the story (the button appears after 5 seconds)
    let skipped = false;
    const skipHint = this.root.querySelector('.prologue-skip');
    const showSkip = setTimeout(() => skipHint.classList.remove('hidden'), 5000);
    this.own(() => clearTimeout(showSkip));

    const trySkip = () => {
      if (skipHint.classList.contains('hidden')) return false;
      skipped = true;
      this.dialog.hide();
      return true;
    };
    this.keys({ onKeyDown: (key) => (key === 'Escape' ? trySkip() : false) });

    // while a line is on screen the dialogue box has the keys, so it passes Escape on to us
    this.dialog.onEscape = trySkip;
    this.own(() => { this.dialog.onEscape = null; });

    await this.entity.load(0);

    const studentSays = (text) => this.dialog.say({
      name: this.student.studentName,
      text,
      portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'),
      side: 'right'
    });

    await sleep(900);
    if (!skipped) await studentSays('Ugh... kenapa perlu belajar Sejarah? Tak penting pun!');

    if (!skipped) {
      this.root.querySelector('.prologue-book').classList.add('glow');
      this.root.classList.add('quake');
      await sleep(1600);
      this.root.classList.remove('quake');

      const holder = this.root.querySelector('.prologue-pendekar');
      holder.appendChild(entityPortrait('whispering', 'rise'));
      await sleep(1200);
    }

    if (!skipped) {
      for (const text of this.entity.lines('prolog', {}, 0)) {
        if (skipped) break;
        await this.dialog.say({
          name: this.entity.name,
          text,
          portrait: entityPortrait('whispering'),
          tone: 'whisper'
        });
      }
    }

    this.dialog.hide();

    // a hand reaches out of the book, grabs the student and pulls them in (glow flash)
    // replay: they land in the study room again; the first time: they land in the first era
    await this.game.transition.bookGrab({
      book,
      suck: [student],
      handWidth: PROLOGUE_HAND_WIDTH,
      ms: skipped ? 2200 : 3800,
      middle: async () => {
        if (replay) await this.game.go('HubScene');
        else await this.game.beginEra(this.eraID);
      }
    });
  }

  /** Every later entry: 3 seconds + one line, no story. */
  async short() {
    this.root.innerHTML = '<div class="scene-dim"></div>';
    await this.entity.load(0);

    const line = this.entity.remark('pindahJiwa');

    await this.game.transition.soulPull({
      line,
      ms: 3000,
      middle: async () => { await this.game.afterPull(); }
    });
  }
}

/* ========================================================================== */
/* DoorsScene  (Gelanggang Latihan / Kepungan Agung)                          */
/*   the two big buttons show the picture of the page they open:              */
/*   see .door-training and .door-siege in assets/css/game.css, section 8     */
/* ========================================================================== */
export class DoorsScene extends GameScene {
  /** params: { eraID, first, trained, message } */
  async enter({ eraID, first = true, trained = false, message = '' } = {}) {
    this.root.classList.add('doors');
    this.eraID = eraID;
    this.trained = trained;

    const era = this.game.eraById(eraID);
    const title = message || (era ? era.eraName : '');

    this.root.innerHTML = `
      <div class="doors-backdrop"></div>
      <div class="doors-title">${esc(title)}</div>

      <div class="doors-row">
        <button class="door-button door-training" data-go="training">
          <b class="door-title">Gelanggang Latihan</b>
          <small class="door-subtitle">Tiada darah tumpah. Markah tidak disimpan.</small>
        </button>

        <button class="door-button door-siege" data-go="siege">
          <b class="door-title">Kepungan Agung</b>
          <small class="door-subtitle">Perang sebenar. Markah direkodkan.</small>
        </button>
      </div>

      <button class="btn-px small doors-back-button">Kembali ke peta (Esc)</button>`;

    this.root.querySelectorAll('.door-button').forEach((door) => {
      door.addEventListener('click', () => this.pick(door.dataset.go));
    });
    this.root.querySelector('.doors-back-button').addEventListener('click', () => this.pick('map'));

    this.keys({
      onKeyDown: (key) => {
        if (key === '1') { this.pick('training'); return true; }
        if (key === '2') { this.pick('siege'); return true; }
        if (key === 'Escape') { this.pick('map'); return true; }
        return false;
      }
    });

    if (first) await this.entity.speak('cabaran', {}, { eraID });
  }

  async pick(go) {
    if (this._picked) return;
    this._picked = true;

    if (go === 'training') {
      await this.entity.speak('latihanBuka', {}, { eraID: this.eraID });
      return this.game.go('TrainingScene', { eraID: this.eraID });
    }

    if (go === 'siege') {
      await this.entity.speak(this.trained ? 'kepungBersedia' : 'kepungSegera', {}, { eraID: this.eraID });
      return this.game.go('SiegeScene', { eraID: this.eraID, trained: this.trained });
    }

    return this.game.go('MapScene', { focusEra: this.eraID });
  }
}

/* ========================================================================== */
/* TrophyScene                                                                */
/* ========================================================================== */
export class TrophyScene extends GameScene {
  async enter() {
    this.root.classList.add('trophy');
    this.root.innerHTML = '<div class="trophy-bg"></div><button class="btn-px small back-hub">◀ Meja (Esc)</button>';
    this.root.querySelector('.back-hub').addEventListener('click', () => this.game.go('HubScene'));
    this.keys({ onKeyDown: (k) => { if (k === 'Escape') { this.game.go('HubScene'); return true; } return false; } });
    this.shelf = new ShelfComponent(this.game);
    await this.shelf.mountFull(this.root, { onSelect: (item, kind) => this.detail(item, kind) });
  }

  async detail(item, kind) {
    if (!item.isUnlocked) {
      const cond = kind === 'badge'
        ? (item.eraName ? `Selesaikan semua misi ${item.eraName} untuk membuka lencana ini.` : 'Selesaikan semua misi era berkaitan.')
        : (item.eraName ? `Dapatkan skor sekurang-kurangnya ${item.artifactScore ?? 80}% dalam Kepungan Agung ${item.eraName} untuk mendapat artifak era ini.` : 'Lulus Kepungan Agung era berkaitan.');
      await this.game.openModal({ title: 'Terkunci', body: `<p>${esc(cond)}</p>`, buttons: [{ label: 'Tutup', primary: true }] });
      return;
    }
    const date = item.acquiredAt ? new Date(item.acquiredAt).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    // the picture of the badge / artifact, then its details (a drawn mark shows while the picture is missing)
    const body = el('div', 'trophy-detail');
    const pic = el('div', 'trophy-detail-pic');
    const img = new Image();
    img.alt = item.name; img.draggable = false;
    img.onerror = () => { img.remove(); pic.textContent = kind === 'artifact' ? '\u{1F3FA}' : '\u{1F3C5}'; };
    img.src = item.asset || '';
    pic.appendChild(img);
    const info = el('div', 'trophy-detail-info');
    info.innerHTML = `<p class="muted">Diperoleh: ${esc(date)}</p><p>${esc(item.eraName || '')}</p>`;
    body.append(pic, info);
    await this.game.openModal({ title: item.name, body, buttons: [{ label: kind === 'artifact' && item.moralLesson ? 'Dengar pengajaran' : 'Tutup', primary: true }] });
    if (kind === 'artifact' && item.moralLesson) {
      // in the trophy room the original role is the student, so the avatar reads the lesson
      await this.dialog.say({
        name: this.student.studentName, text: `Rupanya... ${item.moralLesson}`,     // long lessons are cut into pages by the dialogue box
        portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'), side: 'right'
      });
      this.dialog.hide();
    }
  }
}

/* ========================================================================== */
/* EpilogueScene                                                              */
/* ========================================================================== */
export class EpilogueScene extends GameScene {
  /**
   * 1. Pendekar Bayang closes the story (book world)
   * 2. the fist pulls the student out of the book: they land in the REAL room (normal_hub)
   * 3. the student says what they learned
   * 4. the credits roll (CreditsScene), then the desk
   * What the student says and the credits are written in creditsConfig.js.
   */
  async enter() {
    this.root.classList.add('epilogue');
    this.root.innerHTML = '<div class="epi-bg"></div>';
    await this.entity.load(0);
    await sleep(600);
    for (const text of this.entity.lines('epilog', {}, 0)) {
      await this.dialog.say({ name: this.entity.name, text, portrait: entityPortrait('impressed') });
    }
    this.dialog.hide();

    // the student is sucked out of the book; the real room appears while the screen is bright
    await this.game.transition.soulPull({
      ms: 3600, line: '',
      middle: async () => { await this.realRoom(); }
    });

    for (const text of HOME_LINES) {
      await this.dialog.say({
        name: this.student.studentName, text,
        portrait: spriteEl(this.student.avatar.assetPath, '', 'npc-portrait'), side: 'right'
      });
    }
    this.dialog.hide();

    await this.game.transition.fadeOut(900);
    await this.game.go('CreditsScene');
    await this.game.transition.fadeIn(900);
  }

  /** the real-world room (normal_hub): the student at home, the book closed on the desk */
  async realRoom() {
    this.root.classList.remove('epilogue');
    this.root.classList.add('hub-room', 'prologue');
    await applyHubPicture(this.root, PROLOGUE_BG);
    this.root.innerHTML = `
      <div class="hub-window"><i class="moon"></i></div>
      <div class="hub-lamp"></div>
      <div class="hub-desk"></div>
      <div class="prologue-book"><span class="prologue-book-icon">\u{1F4D6}</span></div>`;
    const student = spriteEl(this.student.avatar.assetPath, this.student.studentName, 'hub-student');
    this.root.appendChild(student);
    placeStudent(student);
    const book = this.root.querySelector('.prologue-book');
    Object.assign(book.style, { left: `${PROLOGUE_BOOK.x}%`, top: `${PROLOGUE_BOOK.y}%`, width: `${PROLOGUE_BOOK.w}%` });
    if (await probeImage(PROLOGUE_BOOK.img)) {
      const picture = new Image();
      picture.src = PROLOGUE_BOOK.img;
      picture.alt = '';
      picture.draggable = false;
      book.replaceChildren(picture);
    }
  }
}
