/**
 * assets/game/hub/hubScene.js  -  HubScene: the study desk
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
import { el, esc, tpl, labelStatus } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { sound } from '../core/sound.js';
import { HUB_BG, HUB_BG_DAY, HUB_BUBBLE, HUB_OBJECTS, HUB_PENDEKAR, HUB_STUDENT, HUB_THEME } from './hubConfig.js';
import { applyHubPicture, getHubTheme, placeStudent, saveHubTheme } from './hubHelpers.js';
import { entityPortrait, spriteEl } from '../npc/entity.js';

/* ========================================================================== */
/* HubScene  (the study room)                                                 */
/*   sizes and positions: assets/js/game/hubConfig.js                         */
/*   look:                assets/game/hub/hub.css                      */
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
          return `<li><b>${esc(e.eraName)}</b> <span class="tag ${status}">${esc(labelStatus(e.eraStatus))}</span></li>`;
        })
        .join('');

      body = `
        <div class="nb-grid">
          <div><b>${sum.completedEras ?? 0}/${sum.totalEras ?? 0}</b><span>Era selesai</span></div>
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

  /** the door in the hub: game settings (susun atur bunyi: <template id="tpl-sound"> dalam hub/hub.html) */
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
        { label: 'Log keluar', danger: true, icon: 'fas fa-right-from-bracket', onClick: () => this.student.logout() },
        { label: 'Tutup', primary: true }
      ]
    });
    document.removeEventListener('sw-mute', onMute);
  }
}
