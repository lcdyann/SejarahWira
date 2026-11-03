/**
 * ============================================================================
 * studentScenes.js  -  the student pages that used to be plain web pages,
 * now scenes of the same game (no more page jumps, same stage, same keys).
 *
 *   AvatarScene    UC-02 Customize Avatar      (was student/avatar.html)
 *   ProfileScene   Student.loadProfile()       (was student/profile.html)
 *   ProgressScene  UC-09 View Learning Progress (was student/learning_progress.html)
 *
 * Every scene leaves with Esc (back to where it was opened from).
 * ============================================================================
 */
import { el, esc, sleep } from './core.js';
import { GameScene } from './scenes.js';
import { Avatar } from './domain.js';
import { spriteEl } from './entity.js';

/** ikon butang keluar (Font Awesome), sama di semua butang Keluar / Log keluar */
const IKON_KELUAR = '<i class="fas fa-right-from-bracket"></i> ';

const fmtDate = (d) => {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** back button + Esc, shared by the three scenes */
function wireBack(scene, label, goBack) {
  const b = el('button', 'btn-px small page-back', label);
  b.addEventListener('click', goBack);
  scene.root.appendChild(b);
  // only the top key handler receives keys, so the scene adds its own keys through scene.extraKeys
  scene.keys({ onKeyDown: (k) => {
    if (k === 'Escape') { goBack(); return true; }
    return scene.extraKeys ? scene.extraKeys(k) : false;
  } });
  return b;
}

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

/* ========================================================================== */
/* ProfileScene                                                               */
/* ========================================================================== */
export class ProfileScene extends GameScene {
  async enter() {
    this.root.classList.add('page', 'profile-room');
    this.root.innerHTML = `
      <div class="pf-card px parchment">
        <div class="pf-head"><div class="pf-fig"></div><div><h2 class="pf-name"></h2><div class="pf-user muted"></div></div></div>
        <dl class="pf-list"></dl>
        <div class="pf-btns"></div>
        <div class="pf-class">
          <label class="pf-class-label" for="pf-code">Kod kelas daripada guru</label>
          <div class="pf-class-row">
            <input id="pf-code" class="pf-code" type="text" maxlength="60" autocomplete="off" placeholder="cth. 5-BESTARI">
            <button class="btn-px small gold pf-join" type="button">Sertai kelas</button>
            <button class="btn-px small danger pf-leave" type="button"><i class="fas fa-right-from-bracket"></i> Keluar kelas</button>
          </div>
          <p class="pf-class-msg muted" role="status"></p>
        </div>
      </div>`;
    wireBack(this, '◀ Meja (Esc)', () => this.game.go('HubScene'));
    const dl = this.root.querySelector('.pf-list');
    let p;
    try {
      p = (await this.gate(this.student.loadProfile(this.api))).profile;
    } catch (err) {
      dl.innerHTML = `<p>${esc(err.message || 'Profil tidak dapat dimuatkan.')}</p>`;
      return;
    }
    const a = this.student.avatar;
    this.root.querySelector('.pf-fig').appendChild(spriteEl(a.assetPath, a.avatarName, 'pf-img'));
    this.root.querySelector('.pf-name').textContent = p.studentName;
    this.root.querySelector('.pf-user').textContent = `@${p.username}`;
    const rows = [
      ['ID murid', p.studentID],
      ['Kelas', p.className || 'Belum menyertai kelas'],
      ['Tahun batch', p.batchYear],
      ['Guru kelas', p.teacherName || '-'],
      ['Avatar', a.avatarName]
    ];
    dl.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? '-')}</dd>`).join('');
    const btns = this.root.querySelector('.pf-btns');
    const mk = (label, fn, gold) => { const b = el('button', `btn-px small${gold ? ' gold' : ''}`, label); b.addEventListener('click', fn); btns.appendChild(b); };
    mk('Tukar avatar', () => this.game.go('AvatarScene', { backTo: 'ProfileScene' }));
    mk('Kemajuan saya', () => this.game.go('ProgressScene', { backTo: 'ProfileScene' }), true);

    /* Class.joinClass() / Class.leaveClass() */
    const msg = this.root.querySelector('.pf-class-msg');
    const code = this.root.querySelector('.pf-code');
    const joinBtn = this.root.querySelector('.pf-join');
    const leaveBtn = this.root.querySelector('.pf-leave');
    const showClass = (c) => {
      rows[1][1] = c.className; rows[2][1] = c.batchYear; rows[3][1] = '-';
      dl.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? '-')}</dd>`).join('');
    };
    const run = async (btn, job, after) => {
      joinBtn.disabled = leaveBtn.disabled = true;
      msg.textContent = '';
      try { await job(); after && after(); }
      catch (err) { msg.textContent = err.message || 'Tidak berjaya. Sila cuba lagi.'; }
      finally { joinBtn.disabled = leaveBtn.disabled = false; }
    };
    const submit = () => {
      const v = code.value.trim();
      if (!v) { msg.textContent = 'Sila masukkan kod kelas.'; return; }
      run(joinBtn, async () => {
        const c = await this.student.joinClass(this.api, v);
        showClass(c); code.value = ''; msg.textContent = `Anda kini dalam kelas ${c.className}.`;
        const fresh = (await this.api.profile(this.student.studentID)).profile;
        rows[2][1] = fresh.batchYear; rows[3][1] = fresh.teacherName || '-';
        dl.innerHTML = rows.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${esc(x ?? '-')}</dd>`).join('');
      });
    };
    joinBtn.addEventListener('click', submit);
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); });
    leaveBtn.addEventListener('click', () => {
      if (!leaveBtn.dataset.sure) {                       // first click asks, second click does it
        leaveBtn.dataset.sure = '1'; leaveBtn.innerHTML = IKON_KELUAR + 'Pasti? Klik lagi';
        msg.textContent = 'Kemajuan anda dikekalkan jika anda keluar.';
        setTimeout(() => { delete leaveBtn.dataset.sure; leaveBtn.innerHTML = IKON_KELUAR + 'Keluar kelas'; }, 4000);
        return;
      }
      delete leaveBtn.dataset.sure; leaveBtn.innerHTML = IKON_KELUAR + 'Keluar kelas';
      run(leaveBtn, async () => {
        const c = await this.student.leaveClass(this.api);
        showClass(c); msg.textContent = 'Anda telah keluar daripada kelas. Kemajuan anda dikekalkan.';
      });
    });
  }
}

/* ========================================================================== */
/* ProgressScene  -  UC-09                                                    */
/* ========================================================================== */
const STATUS_LABEL = { locked: 'Terkunci', unlocked: 'Dibuka', 'in progress': 'Sedang berjalan', completed: 'Selesai' };
// Lencana dan artifak dipaparkan di Bilik Piala (rak), jadi tidak diulang di sini; hanya jumlahnya dalam ringkasan.
const TABS = [
  ['eras', 'Era'], ['assessments', 'Pentaksiran']
];

export class ProgressScene extends GameScene {
  async enter(params = {}) {
    this.root.classList.add('page', 'progress-room');
    this.backTo = params.backTo || 'HubScene';
    this.root.innerHTML = `
      <div class="pg-book px parchment">
        <h2 class="pg-title">Diari</h2>
        <div class="pg-body"><p class="muted">Membuka halaman...</p></div>
      </div>`;
    wireBack(this, '◀ Kembali (Esc)', () => this.game.go(this.backTo));
    const body = this.root.querySelector('.pg-body');
    let d;
    try {
      d = await this.gate(this.student.viewLearningProgress(this.api));
    } catch (err) {
      body.innerHTML = `<p>${esc(err.message || 'Kemajuan tidak dapat dimuatkan.')}</p>`;
      return;
    }
    this.data = d;
    if (!d.hasProgress) {                                           // A1: nothing played yet
      body.innerHTML = '<p class="pg-empty">Halaman ini masih kosong. Buka Buku Sejarah dan mulakan misi pertama!</p>';
      return;
    }
    const s = d.summary;
    const pct = Math.max(0, Math.min(100, Math.round(s.completionRate)));
    body.innerHTML = `
      <div class="pg-sum">
        <div class="pg-ring" style="--pct:${pct}"><b>${pct}%</b></div>
        <div class="nb-grid">
          <div><b>${s.completedEras}/${s.totalEras}</b><span>Era selesai</span></div>
          <div><b>${s.bestScore}%</b><span>Skor terbaik</span></div>
          <div><b>${s.badgesEarned}/${s.totalBadges}</b><span>Lencana</span></div>
          <div><b>${s.artifactsUnlocked}/${s.totalArtifacts}</b><span>Artifak</span></div>
        </div>
      </div>
      ${d.partial ? '<p class="pg-warn">Sebahagian data tidak dapat dimuatkan.</p>' : ''}
      <div class="pg-tabs"></div>
      <div class="pg-detail"></div>`;
    const tabs = body.querySelector('.pg-tabs');
    TABS.forEach(([id, label]) => {
      const b = el('button', 'btn-px small pg-tab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => this.tab(id));
      tabs.appendChild(b);
    });
    this.extraKeys = (k) => {
      const i = TABS.findIndex(([id]) => id === this.active);
      if (k === 'ArrowRight') { this.tab(TABS[(i + 1) % TABS.length][0]); return true; }
      if (k === 'ArrowLeft') { this.tab(TABS[(i + TABS.length - 1) % TABS.length][0]); return true; }
      return false;
    };
    this.tab('eras');
  }

  tab(id) {
    this.active = id;
    this.root.querySelectorAll('.pg-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    const out = this.root.querySelector('.pg-detail');
    out.innerHTML = this[`render_${id}`]();
    out.scrollTop = 0;
  }

  render_eras() {
    const eras = this.data.eras || [];
    if (!eras.length) return '<p class="pg-empty">Data era tidak tersedia.</p>';
    return eras.map((e) => {
      const siege = e.summativePassed ? `Kepungan lulus${e.bestScore !== null ? ` (${e.bestScore}%)` : ''}`
        : (e.attempts > 0 ? `Kepungan belum lulus${e.bestScore !== null ? ` (${e.bestScore}%)` : ''}` : 'Kepungan belum dicuba');
      return `<div class="pg-row"><b class="pg-num">${esc(e.eraID)}</b>
        <div class="pg-main"><div class="pg-rname">${esc(e.eraName)}</div>
        <div class="pg-chips"><span>${e.narrativeDone ? 'Kisah selesai' : 'Kisah belum selesai'}</span><span>${esc(siege)}</span></div></div>
        <span class="tag ${esc(String(e.eraStatus).replace(/\s+/g, '-'))}">${esc(STATUS_LABEL[e.eraStatus] || e.eraStatus)}</span></div>`;
    }).join('');
  }

  render_assessments() {
    const a = this.data.assessments || [];
    if (!a.length) return '<p class="pg-empty">Belum ada percubaan pentaksiran.</p>';
    const rows = a.map((x) => `<tr><td>${esc(fmtDate(x.attemptDate))}</td><td>${esc(x.eraName)}</td>
      <td>${x.assessmentType === 'Summative' ? 'Kepungan Agung' : 'Latihan Wira'}</td>
      <td><b>${esc(x.score)}%</b> <small>(lulus ${esc(x.requiredScore)}%)</small></td>
      <td>${x.passed ? '<span class="tag completed">Lulus</span>' : '<span class="tag locked">Belum</span>'}</td></tr>`).join('');
    return `<table class="pg-table"><thead><tr><th>Tarikh</th><th>Era</th><th>Jenis</th><th>Skor</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}
