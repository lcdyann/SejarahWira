/**
 * assets/game/student/profileScene.js  -  ProfileScene
 * MODULE: student  (Student pages: avatar, profile, learning progress (diary))
 * USE CASE: UC-02, UC-09   CLASS DIAGRAM: Avatar, LearningProgression, EraProgression
 */
import { el, esc } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { spriteEl } from '../npc/entity.js';
import { IKON_KELUAR, wireBack } from './studentHelpers.js';

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
