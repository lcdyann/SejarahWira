/**
 * ============================================================================
 * SejarahWira - Analytics Engine (analyticsEngine.js)
 * Presentation tier for monitor_analytics.html     (UC-11 Monitor Student Performance)
 * Controller : analyticsController.js   /api/analytics/...   (teacher token required)
 *
 *   Step 1-2  load()            GET /summary
 *   Step 3 / A2  era + class filters -> load() again
 *   Step 6-7  renderDashboard() KPIs, era chart, distribution, weak topics, student table
 *   Step 8-9 / A3  openStudent() GET /student/:id
 *   A1  no data -> "Tiada data prestasi tersedia."
 *   E1  retrieval failure -> error + back to the main menu
 *   E2  partial report banner (server returns warnings)
 *   E3  chart failure -> raw data table instead
 * Everything from the server is written with textContent, never innerHTML.
 * ============================================================================
 */
const AN_API = '/api/analytics';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
const setChildren = (el, ...n) => el.replaceChildren(...n.flat().filter((x) => x !== null && x !== undefined && x !== false));
const fmt = (n) => (n === null || n === undefined ? '-' : String(n).replace('.', ','));
const pct = (n) => `${fmt(n)}%`;
const fmtDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};
const LEVEL = {
  kukuh: { label: 'Kukuh', cls: 'ok', icon: 'fa-circle-check' },
  lemah: { label: 'Lemah', cls: 'warn', icon: 'fa-triangle-exclamation' },
  kritikal: { label: 'Kritikal', cls: 'bad', icon: 'fa-circle-xmark' }
};

class AnalyticsEngine {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.token = null;
    this.data = null;
    this.eraID = 'all';
    this.classID = 'all';
    this.loadSeq = 0;
    this.filtersBuilt = false;

    const session = this.readSession();
    if (session.error) return this.showDenied(session.error);
    this.token = session.user.token;
    this.bind();
    this.load();
    this.loadThresholds();
  }

  /* ---------------- Great Siege marks (one pair for every era) ---------------- */
  async loadThresholds() {
    const body = this.$('thr-body');
    try {
      const data = await this.api('/thresholds');
      this.$('an-thresholds').classList.remove('is-hidden');
      setChildren(body, this.thresholdRow(data, data.canEdit !== false));
    } catch (err) {
      if (err.auth) return;
      setChildren(body, h('p', { class: 'an-note' }, `Skor tidak dapat dimuatkan: ${err.message}`));
    }
  }

  thresholdRow(data, canEdit) {
    const input = (value) => h('input', { type: 'number', min: '0', max: '100', step: '1', value: String(value), disabled: !canEdit });
    const pass = input(data.passScore);
    const art = input(data.artifactScore);
    const msg = h('span', { class: 'thr-msg', role: 'status' });
    const save = h('button', {
      type: 'button', class: 'an-btn an-btn-primary an-btn-sm', disabled: !canEdit,
      onclick: async () => {
        msg.textContent = '';
        save.disabled = true;
        try {
          const res = await this.api('/thresholds', { method: 'PUT', body: { passScore: pass.value, artifactScore: art.value } });
          pass.value = res.passScore; art.value = res.artifactScore;
          msg.textContent = 'Disimpan untuk semua era.';
          msg.className = 'thr-msg is-ok';
          this.load();                                   // weak topics use the pass mark
        } catch (err) {
          msg.textContent = err.message;
          msg.className = 'thr-msg is-bad';
        } finally { save.disabled = !canEdit; }
      }
    }, 'Simpan');
    return h('div', { class: 'thr-row' },
      h('label', {}, 'Skor lulus (%)', pass),
      h('label', {}, 'Skor artifak (%)', art),
      save, msg);
  }

  readSession() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem('sejarahwira_user') || '{}'); } catch { user = {}; }
    if (String(user.role || '').toLowerCase() !== 'teacher') return { error: 'Halaman ini hanya untuk guru. Sila log masuk sebagai guru.' };
    if (!user.token || !user.teacherID) return { error: 'Sila log masuk semula untuk melihat analitik prestasi.' };
    return { user };
  }

  async api(path, options = {}) {
    const res = await fetch(`${AN_API}${path}`, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${this.token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) {
      this.showDenied((data && data.message) || 'Sesi tamat. Sila log masuk semula.');
      const e = new Error('401'); e.auth = true; throw e;
    }
    if (!res.ok || !data || !data.success) throw new Error((data && data.message) || 'Permintaan gagal.');
    return data;
  }

  bind() {
    this.$('btn-retry').addEventListener('click', () => this.load());
    this.$('btn-clear-filter').addEventListener('click', () => this.setEra('all'));
    this.$('btn-close-detail').addEventListener('click', () => this.$('an-detail').classList.add('is-hidden'));
    this.$('f-era').addEventListener('change', (e) => this.setEra(e.target.value));
    this.$('f-class').addEventListener('change', (e) => { this.classID = e.target.value; this.$('an-detail').classList.add('is-hidden'); this.load(); });
  }

  showView(name) {
    ['denied', 'loading', 'error', 'empty', 'dashboard'].forEach((v) => this.$(`an-${v}`).classList.toggle('is-hidden', v !== name));
  }
  showDenied(text) { this.$('an-thresholds').classList.add('is-hidden'); this.$('an-denied-text').textContent = text; this.showView('denied'); }

  setEra(id) {
    this.eraID = String(id);
    this.$('an-detail').classList.add('is-hidden');
    this.load();
  }

  /* ---------------- steps 2-7 ---------------- */
  async load() {
    const seq = ++this.loadSeq;
    // keep the filters on screen while reloading so the teacher does not lose their place
    if (!this.data) this.showView('loading');
    const q = new URLSearchParams();
    if (this.eraID !== 'all') q.set('eraID', this.eraID);
    if (this.classID !== 'all') q.set('classID', this.classID);
    try {
      const data = await this.api(`/summary?${q}`);
      if (seq !== this.loadSeq) return;           // a newer request replaced this one
      this.data = data;
      this.render();
    } catch (err) {
      if (err.auth || seq !== this.loadSeq) return;
      this.$('an-error-text').textContent = err.message || 'Data prestasi tidak dapat diambil.';   // E1
      this.showView('error');
    }
  }

  render() {
    const d = this.data;
    if (!d.hasData) {                                   // A1
      this.$('an-empty-text').textContent = 'Tiada data prestasi tersedia.';
      this.$('btn-clear-filter').classList.add('is-hidden');
      this.showView('empty');
      return;
    }
    this.buildFilters();
    this.showView('dashboard');
    if (d.emptyForFilter) {
      this.$('an-partial').classList.add('is-hidden');
      setChildren(this.$('an-kpis'));
      ['chart-eras', 'chart-dist', 'weak-list', 'student-table'].forEach((id) => setChildren(this.$(id), h('p', { class: 'an-empty', text: 'Tiada data prestasi tersedia bagi tapisan ini.' })));
      return;
    }
    this.renderPartial();
    this.safe('kpis', () => this.renderKpis());
    this.safe('eras', () => this.renderEraChart());
    this.safe('dist', () => this.renderDistribution());
    this.safe('weak', () => this.renderWeak());
    this.safe('students', () => this.renderStudents());
  }

  /** E3: a failing section falls back to a plain data table instead of breaking the page. */
  safe(name, fn) {
    try { fn(); } catch (err) {
      console.error(`analytics ${name} render error:`, err);
      try { this.fallback(name); } catch (e2) {
        console.error('analytics fallback error:', e2);
        const id = { kpis: 'an-kpis', eras: 'chart-eras', dist: 'chart-dist', weak: 'weak-list', students: 'student-table' }[name];
        setChildren(this.$(id), h('p', { class: 'an-banner', text: 'Bahagian ini tidak dapat dipaparkan.' }));
      }
    }
  }

  buildFilters() {
    const d = this.data;
    const fill = (sel, items, all, valueKey, labelKey, current) => {
      setChildren(sel, h('option', { value: 'all', text: all }),
        items.map((i) => h('option', { value: String(i[valueKey]), text: i[labelKey] })));
      sel.value = current;
      if (sel.value !== current) sel.value = 'all';
    };
    fill(this.$('f-era'), d.eras, 'Semua Era', 'eraID', 'eraName', this.eraID);
    fill(this.$('f-class'), d.classes, 'Semua Kelas', 'classID', 'className', this.classID);
  }

  renderPartial() {
    const box = this.$('an-partial');
    const d = this.data;
    if (d.partial) {
      setChildren(box, h('i', { class: 'fas fa-circle-exclamation' }), ' Laporan separa: ', d.warnings.join(' '));
      box.classList.remove('is-hidden');
    } else box.classList.add('is-hidden');
  }

  /* ---------------- KPIs ---------------- */
  renderKpis() {
    const cs = this.data.analytics.classStats;
    if (!cs) return setChildren(this.$('an-kpis'));
    const names = (list) => (list.length > 2 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(', '));
    const kpi = (icon, label, value, sub) => h('div', { class: 'an-kpi' },
      h('i', { class: `fas ${icon}` }),
      h('div', {}, h('span', { class: 'an-kpi-label', text: label }), h('strong', { text: value }), sub ? h('small', { text: sub }) : null));
    setChildren(this.$('an-kpis'),
      kpi('fa-users', 'Pelajar dinilai', String(cs.studentCount)),
      kpi('fa-bullseye', 'Purata kelas', pct(cs.average)),
      kpi('fa-arrow-up', 'Skor tertinggi', pct(cs.highest.score), names(cs.highest.students)),
      kpi('fa-arrow-down', 'Skor terendah', pct(cs.lowest.score), names(cs.lowest.students)),
      kpi('fa-square-check', 'Kadar lulus', pct(cs.passRate)));
  }

  /* ---------------- charts ---------------- */
  renderEraChart() {
    const eras = this.data.analytics.eras;
    if (!eras.length) return setChildren(this.$('chart-eras'), h('p', { class: 'an-empty', text: 'Tiada data era.' }));
    const rows = eras.map((e) => {
      const lv = LEVEL[e.level];
      const active = this.eraID === String(e.eraID);
      return h('button', {
        type: 'button', class: `an-bar-row${active ? ' is-active' : ''}`,
        'aria-label': `${e.eraName}: purata ${fmt(e.average)} peratus, ${lv.label}. Klik untuk tapis.`,
        onclick: () => this.setEra(active ? 'all' : e.eraID)
      },
        h('span', { class: 'an-bar-name', text: e.eraName }),
        h('span', { class: 'an-bar-track' },
          h('span', { class: `an-bar-fill ${lv.cls}`, style: `width:${Math.max(0, Math.min(100, e.average))}%` }),
          h('span', { class: 'an-bar-mark', style: `left:${Math.max(0, Math.min(100, e.required))}%`, title: `Markah lulus ${e.required}%` })),
        h('span', { class: 'an-bar-val', text: pct(e.average) }),
        h('span', { class: `an-pill ${lv.cls}` }, h('i', { class: `fas ${lv.icon}` }), ` ${lv.label}`));
    });
    setChildren(this.$('chart-eras'), h('div', { class: 'an-bars' }, rows));
  }

  renderDistribution() {
    const dist = this.data.analytics.distribution;
    if (!dist.length) return setChildren(this.$('chart-dist'), h('p', { class: 'an-empty', text: 'Tiada data.' }));
    const max = Math.max(1, ...dist.map((b) => b.count));
    setChildren(this.$('chart-dist'), h('div', { class: 'an-cols', role: 'list' },
      dist.map((b) => h('div', { class: 'an-col', role: 'listitem', 'aria-label': `Skor ${b.label}: ${b.count} pelajar` },
        h('span', { class: 'an-col-count', text: String(b.count) }),
        h('span', { class: 'an-col-bar', style: `height:${Math.round((b.count / max) * 100)}%` }),
        h('span', { class: 'an-col-label', text: b.label })))));
  }

  /* ---------------- weak topics ---------------- */
  renderWeak() {
    const weak = this.data.analytics.weakTopics;
    if (!weak.length) {
      return setChildren(this.$('weak-list'), h('p', { class: 'an-ok-note' }, h('i', { class: 'fas fa-circle-check' }), ' Tiada topik lemah. Semua era mencapai markah lulus.'));
    }
    setChildren(this.$('weak-list'), h('ul', { class: 'an-weak' }, weak.map((e) => {
      const lv = LEVEL[e.level];
      return h('li', { class: `an-weak-item ${lv.cls}` },
        h('div', {}, h('strong', { text: e.eraName }),
          h('span', { class: 'an-muted', text: ` purata ${pct(e.average)} (lulus ${e.required}%), ${pct(e.passRate)} pelajar lulus` })),
        h('span', { class: `an-pill ${lv.cls}` }, h('i', { class: `fas ${lv.icon}` }), ` ${lv.label}`));
    })));
  }

  /* ---------------- students ---------------- */
  renderStudents() {
    const list = this.data.analytics.students;
    const head = h('tr', {}, ['#', 'Pelajar', 'Kelas', 'Skor', 'Era', 'Cubaan', 'Terkini', ''].map((t) => h('th', { scope: 'col', text: t })));
    const rows = list.map((s, i) => h('tr', {},
      h('td', { text: String(i + 1) }),
      h('td', { text: s.studentName }),
      h('td', { text: s.className }),
      h('td', {}, h('strong', { text: pct(s.score) })),
      h('td', { text: String(s.erasTaken) }),
      h('td', { text: String(s.attempts) }),
      h('td', { text: fmtDate(s.lastAttempt) }),
      h('td', {}, h('button', { type: 'button', class: 'an-btn an-btn-ghost an-btn-sm', onclick: () => this.openStudent(s.studentID) }, h('i', { class: 'fas fa-eye' }), ' Butiran'))));
    setChildren(this.$('student-table'), h('table', { class: 'an-table' }, h('thead', {}, head), h('tbody', {}, rows)));
  }

  /* ---------------- step 8-9 / A3 ---------------- */
  async openStudent(studentID) {
    const box = this.$('an-detail');
    box.classList.remove('is-hidden');
    setChildren(this.$('detail-body'), h('p', { class: 'an-muted' }, h('i', { class: 'fas fa-circle-notch fa-spin' }), ' Memuatkan...'));
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const { student: s } = await this.api(`/student/${encodeURIComponent(studentID)}`);
      this.renderDetail(s);
    } catch (err) {
      if (err.auth) return;
      setChildren(this.$('detail-body'), h('p', { class: 'an-error-note', text: err.message || 'Butiran pelajar tidak dapat diambil.' }));
    }
  }

  renderDetail(s) {
    this.$('detail-title').replaceChildren(h('i', { class: 'fas fa-id-card' }), ` ${s.studentName}`);
    const eraRows = s.eras.map((e) => h('tr', {},
      h('td', { text: e.eraName }),
      h('td', {}, h('strong', { text: pct(e.best) })),
      h('td', { text: pct(e.classAverage) }),
      h('td', { text: `${e.required}%` }),
      h('td', { text: String(e.attempts) }),
      h('td', {}, e.weak
        ? h('span', { class: 'an-pill warn' }, h('i', { class: 'fas fa-triangle-exclamation' }), ' Perlu diperkukuh')
        : h('span', { class: 'an-pill ok' }, h('i', { class: 'fas fa-circle-check' }), ' Lulus'))));
    const histRows = s.history.slice().reverse().map((x) => h('tr', {},
      h('td', { text: fmtDate(x.attemptDate) }),
      h('td', { text: x.eraName }),
      h('td', {}, h('strong', { text: pct(x.score) })),
      h('td', { text: x.passed ? 'Lulus' : 'Belum lulus' })));
    const table = (cols, body) => h('div', { class: 'an-table-wrap' }, h('table', { class: 'an-table' },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', text: c })))), h('tbody', {}, body)));

    setChildren(this.$('detail-body'),
      h('p', { class: 'an-muted', text: `${s.className}  |  skor keseluruhan ${pct(s.overall)}  |  ${s.attempts} cubaan` }),
      h('h3', { text: 'Prestasi Mengikut Era' }),
      table(['Era', 'Terbaik', 'Purata kelas', 'Lulus', 'Cubaan', 'Status'], eraRows),
      h('h3', { text: 'Kategori Topik Lemah' }),
      s.weakCategories.length
        ? h('ul', { class: 'an-chips' }, s.weakCategories.map((c) => h('li', { class: 'an-pill warn', text: c })))
        : h('p', { class: 'an-ok-note' }, h('i', { class: 'fas fa-circle-check' }), ' Tiada topik lemah.'),
      h('h3', { text: 'Sejarah Skor' }),
      table(['Tarikh', 'Era', 'Skor', 'Keputusan'], histRows));
  }

  /* ---------------- E3 fallback ---------------- */
  fallback(name) {
    const a = this.data.analytics;
    const target = { kpis: 'an-kpis', eras: 'chart-eras', dist: 'chart-dist', weak: 'weak-list', students: 'student-table' }[name];
    let cols = []; let rows = [];
    if (name === 'eras' || name === 'weak') {
      cols = ['Era', 'Purata', 'Tertinggi', 'Terendah', 'Kadar lulus'];
      rows = (name === 'eras' ? a.eras : a.weakTopics).filter(Boolean).map((e) => [e.eraName, pct(e.average), pct(e.highest), pct(e.lowest), pct(e.passRate)]);
    } else if (name === 'dist') {
      cols = ['Julat', 'Pelajar'];
      rows = a.distribution.map((b) => [b.label, String(b.count)]);
    } else if (name === 'students') {
      cols = ['Pelajar', 'Kelas', 'Skor'];
      rows = a.students.map((s) => [s.studentName, s.className, pct(s.score)]);
    } else if (a.classStats) {
      cols = ['Purata', 'Tertinggi', 'Terendah'];
      rows = [[pct(a.classStats.average), pct(a.classStats.highest.score), pct(a.classStats.lowest.score)]];
    }
    setChildren(this.$(target),
      h('p', { class: 'an-banner' }, 'Carta tidak dapat dipaparkan. Data mentah ditunjukkan.'),
      h('table', { class: 'an-table' },
        h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', text: c })))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', { text: c })))))));
  }
}

document.addEventListener('DOMContentLoaded', () => { window.analytics = new AnalyticsEngine(); });