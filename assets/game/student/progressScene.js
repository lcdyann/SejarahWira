/**
 * assets/game/student/progressScene.js  -  ProgressScene (UC-09)
 * MODULE: student  (Student pages: avatar, profile, learning progress (diary))
 * USE CASE: UC-02, UC-09   CLASS DIAGRAM: Avatar, LearningProgression, EraProgression
 */
import { el, esc } from '../core/core.js';
import { GameScene } from '../core/scene.js';
import { fmtDate, wireBack } from './studentHelpers.js';

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
