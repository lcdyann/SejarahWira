/**
 * assets/game/student/avatarScene.js  -  AvatarScene (UC-02)
 * MODULE: student  (Student pages: avatar, profile, learning progress (diary))
 * USE CASE: UC-02, UC-09   CLASS DIAGRAM: Avatar, LearningProgression, EraProgression
 */
import { el, sleep } from '../core/core.js';
import { Avatar } from '../core/domain.js';
import { GameScene } from '../core/scene.js';
import { spriteEl } from '../npc/entity.js';
import { wireBack } from './studentHelpers.js';

/* ========================================================================== */
/* AvatarScene  -  UC-02                                                      */
/* ========================================================================== */
/** the mirror picture (assets/gameAsset/hub/cermin.png, or mirror.png) */
const MIRROR_PICTURES = ['../assets/gameAsset/hub/cermin.png', '../assets/gameAsset/hub/mirror.png'];


export class AvatarScene extends GameScene {
  /** use the drawn mirror as the frame; the painted gold frame stays if no picture exists */
  useMirrorPicture() {
    const frame = this.root.querySelector('.av-frame');
    const candidates = [...MIRROR_PICTURES];
    const probe = new Image();

    probe.onload = () => {
      if (!this.alive) return;
      frame.classList.add('has-picture');
      frame.style.backgroundImage = `url('${probe.src}')`;
    };
    probe.onerror = () => {
      if (candidates.length) probe.src = candidates.shift();
    };
    probe.src = candidates.shift();
  }

  async enter(params = {}) {
    this.root.classList.add('page', 'avatar-room');
    this.backTo = params.backTo || 'HubScene';
    // kali pertama log masuk: pilih avatar dahulu, kemudian terus ke prolog (tiada butang batal)
    this.first = Boolean(params.first);
    this.next = params.next || null;                     // { scene, params } selepas avatar dipilih
    this.root.innerHTML = `
      <div class="av-title px">${this.first ? 'Pilih Wira Kamu' : 'Cermin Jiwa'}</div>
      <div class="av-stage">
        <button class="btn-px av-nav l" aria-label="Sebelumnya">◀</button>
        <div class="av-mirror"><div class="av-frame"><div class="av-fig"></div></div><div class="av-name px"></div><div class="av-fighter"></div></div>
        <button class="btn-px av-nav r" aria-label="Seterusnya">▶</button>
      </div>
      <div class="av-strip"></div>
      <div class="av-actions">
        <button class="btn-px gold av-save">${this.first ? 'Pilih dan Mula (Enter)' : 'Simpan (Enter)'}</button>
      </div>
      <div class="av-toast hidden"></div>`;
    const back = wireBack(this, '◀ Batal (Esc)', () => this.cancel());
    if (this.first) back.classList.add('hidden');         // kali pertama: mesti pilih, tidak boleh batal
    this.useMirrorPicture();

    let state;
    try {
      state = await this.gate(Avatar.loadAll(this.api, this.student.studentID));
    } catch (err) {
      this.toast(err.message || 'Avatar tidak dapat dimuatkan.', true);
      return;
    }
    this.list = state.list;                                      // A1: nothing to choose
    if (this.list.length === 0) { this.toast('Tiada avatar tersedia buat masa ini.', true); this.root.querySelector('.av-save').disabled = true; return; }
    this.equippedID = state.equippedID ?? this.student.avatar.avatarID;
    this.idx = Math.max(0, this.list.findIndex((a) => Number(a.avatarID) === Number(this.equippedID)));

    this.root.querySelector('.av-nav.l').addEventListener('click', () => this.step(-1));
    this.root.querySelector('.av-nav.r').addEventListener('click', () => this.step(1));
    this.root.querySelector('.av-save').addEventListener('click', () => this.save());
    const strip = this.root.querySelector('.av-strip');
    this.list.forEach((a, i) => {
      const t = el('button', 'av-thumb px');
      t.setAttribute('aria-label', a.avatarName);
      t.appendChild(spriteEl(a.assetPath, a.avatarName, 'av-thumb-img'));
      t.addEventListener('click', () => this.show(i));
      strip.appendChild(t);
    });

    this.extraKeys = (k) => {
      if (k === 'ArrowLeft') { this.step(-1); return true; }
      if (k === 'ArrowRight') { this.step(1); return true; }
      if (k === 'Enter') { this.save(); return true; }
      return false;
    };
    this.show(this.idx);
  }

  get current() { return this.list[this.idx]; }
  step(d) { this.show((this.idx + d + this.list.length) % this.list.length); }

  show(i) {
    this.idx = i;
    const a = this.current;
    const fig = this.root.querySelector('.av-fig');
    fig.innerHTML = '';
    const img = new Image();
    img.className = 'av-big'; img.alt = a.avatarName; img.src = a.assetPath;
    img.onerror = () => { img.onerror = null; img.replaceWith(spriteEl(a.assetPath, a.avatarName, 'av-fallback')); };
    fig.appendChild(img);
    this.root.querySelector('.av-name').textContent = a.avatarName + (Number(a.avatarID) === Number(this.equippedID) ? '  (dipakai)' : '');
    // in a fight this avatar becomes the silat fighter below (set in avatarConfig.js)
    const fighter = this.root.querySelector('.av-fighter');
    fighter.innerHTML = '';
    const fi = new Image(); fi.src = a.pose('idle'); fi.alt = ''; fi.className = 'av-fighter-img';
    fi.onerror = () => fi.remove();
    fighter.append(fi, el('span', 'av-fighter-txt', 'Gaya silat dalam gelanggang'));
    this.root.querySelectorAll('.av-thumb').forEach((t, n) => t.classList.toggle('on', n === i));
  }

  toast(text, bad = false) {
    const t = this.root.querySelector('.av-toast');
    t.textContent = text;
    t.classList.toggle('bad', bad);
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t && t.classList.add('hidden'), 3200);
    this.own(() => clearTimeout(this._tt));
  }

  cancel() { return this.first ? undefined : this.game.go(this.backTo); }

  /** selepas simpan: kali pertama -> scene seterusnya (prolog); selainnya -> kembali */
  leave() {
    if (this.first && this.next) return this.game.go(this.next.scene, this.next.params);
    return this.game.go(this.backTo);
  }

  async save() {
    if (this._saving || !this.list || !this.list.length) return;
    const a = this.current;
    if (Number(a.avatarID) === Number(this.equippedID)) {
      if (this.first) { this.leave(); return; }          // kali pertama: kekalkan avatar asal terus ke prolog
      this.toast('Avatar ini sudah dipakai.'); return;
    }
    this._saving = true;
    try {
      await this.gate(a.saveCustomization(this.api, this.student.studentID));        // E1/E2: server refuses -> stays here
      this.student.equip(a);
      this.equippedID = a.avatarID;
      this.show(this.idx);
      this.toast('Avatar disimpan!');
      await this.gate(sleep(900));
      this.leave();
    } catch (err) {
      if (this._alive) this.toast(err.message || 'Avatar tidak dapat disimpan.', true);
    } finally { this._saving = false; }
  }
}
