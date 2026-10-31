/**
 * ============================================================================
 * SejarahWira - Teacher Progress Engine (teacherProgressEngine.js)
 * Presentation tier for learning_progress_teacher.html     (UC-09, Teacher actor)
 * Controller : teacherProgressController.js   /api/teacher-progress/...
 *
 *   Step 2      role check (teacher token in localStorage 'sejarahwira_user')
 *   Step 3-5    loadClass()   GET /overview   -> class overview (A2 steps 1-2)
 *   A2 step 3-4 openStudent() GET /student/:id -> summary + categories
 *   Step 6-8    tabs: Era / Pentaksiran / Lencana / Artifak
 *   A1 no data | A3 + E1 retrieval failure (retry / back) | E2 partial warning banner
 * Deep link: learning_progress_teacher.html?studentID=XXX opens that student directly.
 * Everything from the server is written with textContent, never innerHTML.
 * ============================================================================
 */
const TP_API = '/api/teacher-progress';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
const setChildren = (el, ...n) => el.replaceChildren(...n.flat().filter((x) => x !== null && x !== undefined && x !== false));
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const fmtDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};
const STATUS = {
  completed: { label: 'Selesai', cls: 'ok', icon: 'fa-circle-check' },
  'in progress': { label: 'Sedang dilalui', cls: 'warn', icon: 'fa-hourglass-half' },
  unlocked: { label: 'Dibuka', cls: 'info', icon: 'fa-lock-open' },
  locked: { label: 'Terkunci', cls: 'mute', icon: 'fa-lock' }
};
const CATEGORIES = [
  { key: 'eras', label: 'Era Sejarah', icon: 'fa-map-marked-alt' },
  { key: 'assessments', label: 'Prestasi Pentaksiran', icon: 'fa-clipboard-check' },
  { key: 'badges', label: 'Lencana', icon: 'fa-award' },
  { key: 'artifacts', label: 'Artifak', icon: 'fa-gem' }
];

class TeacherProgressEngine {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.token = null;
    this.classID = 'all';
    this.overview = null;
    this.student = null;
    this.category = 'eras';
    this.retry = () => this.loadClass();

    const session = this.readSession();
    if (session.error) return this.showDenied(session.error);
    this.token = session.user.token;
    this.bind();
    const wanted = new URLSearchParams(location.search).get('studentID');
    if (wanted) this.openStudent(wanted, true); else this.loadClass();
  }

  readSession() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem('sejarahwira_user') || '{}'); } catch { user = {}; }
    if (String(user.role || '').toLowerCase() !== 'teacher') return { error: 'Halaman ini hanya untuk guru. Pelajar boleh melihat kemajuan sendiri di halaman Kemajuan Pembelajaran.' };
    if (!user.token || !user.teacherID) return { error: 'Sila log masuk semula untuk melihat kemajuan pelajar.' };
    return { user };
  }

  async api(path) {
    const res = await fetch(`${TP_API}${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) {
      this.showDenied((data && data.message) || 'Sesi tamat. Sila log masuk semula.');
      const e = new Error('401'); e.auth = true; throw e;
    }
    if (!res.ok || !data || !data.success) { const e = new Error((data && data.message) || 'Permintaan gagal.'); e.status = res.status; throw e; }
    return data;
  }

  bind() {
    this.$('btn-retry').addEventListener('click', () => this.retry());
    this.$('btn-error-back').addEventListener('click', () => (this.overview ? this.showClass() : (history.length > 1 ? history.back() : (location.href = 'index.html'))));
    this.$('btn-back-class').addEventListener('click', () => this.backToClass());
    this.$('f-class').addEventListener('change', (e) => { this.classID = e.target.value; this.loadClass(); });
    this.$('f-search').addEventListener('input', () => this.renderStudents());
    this.$('f-sort').addEventListener('change', () => this.renderStudents());
  }

  showView(name) {
    ['denied', 'loading', 'error', 'empty', 'class', 'student'].forEach((v) => this.$(`tp-${v}`).classList.toggle('is-hidden', v !== name));
  }
  showDenied(t) { this.$('tp-denied-text').textContent = t; this.showView('denied'); }
  showError(err) { this.$('tp-error-text').textContent = err.message || 'Gagal mendapatkan data kemajuan pembelajaran.'; this.showView('error'); }
  warn(d) {
    const box = this.$('tp-warning');
    if (d && d.partial) { setChildren(box, h('i', { class: 'fas fa-circle-exclamation' }), ` Maklumat separa: ${d.warnings.join(' ')}`); box.classList.remove('is-hidden'); }
    else box.classList.add('is-hidden');
  }

  /* ---------------- class overview ---------------- */
  async loadClass() {
    this.retry = () => this.loadClass();
    this.student = null;
    if (!this.overview) this.showView('loading');
    try {
      const q = this.classID !== 'all' ? `?classID=${encodeURIComponent(this.classID)}` : '';
      this.overview = await this.api(`/overview${q}`);
    } catch (err) { if (!err.auth) this.showError(err); return; }
    this.warn(this.overview);
    this.showClass();
  }

  showClass() {
    const d = this.overview;
    if (!d.students.length || !d.hasData) {                             // A1
      this.$('tp-empty-text').textContent = d.students.length
        ? 'Kemajuan pembelajaran belum tersedia. Belum ada pelajar yang memulakan aktiviti pembelajaran.'
        : 'Tiada pelajar dalam kelas anda.';
      this.showView('empty');
      return;
    }
    const sel = this.$('f-class');
    setChildren(sel, h('option', { value: 'all', text: 'Semua Kelas' }), d.classes.map((c) => h('option', { value: c.classID, text: c.className })));
    sel.value = this.classID;
    this.showView('class');
    this.renderKpis();
    this.renderStudents();
  }

  renderKpis() {
    const s = this.overview.summary;
    if (!s) return setChildren(this.$('tp-kpis'));
    const k = (icon, label, value, sub) => h('div', { class: 'tp-kpi' }, h('i', { class: `fas ${icon}` }),
      h('div', {}, h('span', { text: label }), h('strong', { text: value }), sub ? h('small', { text: sub }) : null));
    setChildren(this.$('tp-kpis'),
      k('fa-users', 'Pelajar', String(s.studentCount), `${s.startedCount} sudah bermula`),
      k('fa-flag-checkered', 'Purata kemajuan', `${fmt(s.averageCompletion)}%`),
      k('fa-trophy', 'Purata skor terbaik', `${fmt(s.averageBestScore)}%`),
      k('fa-scroll', 'Quest selesai', String(s.questsCompletedTotal)),
      k('fa-award', 'Lencana / Artifak', `${s.badgesTotal} / ${s.artifactsTotal}`));
  }

  renderStudents() {
    const term = this.$('f-search').value.trim().toLowerCase();
    const sort = this.$('f-sort').value;
    let list = this.overview.students.filter((s) => !term || s.studentName.toLowerCase().includes(term));
    const by = {
      name: (a, b) => a.studentName.localeCompare(b.studentName),
      completion: (a, b) => b.completionRate - a.completionRate || a.studentName.localeCompare(b.studentName),
      'completion-asc': (a, b) => a.completionRate - b.completionRate || a.studentName.localeCompare(b.studentName),
      best: (a, b) => b.bestScore - a.bestScore || a.studentName.localeCompare(b.studentName)
    };
    list = list.slice().sort(by[sort] || by.name);
    if (!list.length) return setChildren(this.$('tp-students'), h('p', { class: 'tp-empty', text: 'Tiada pelajar sepadan.' }));
    const head = h('tr', {}, ['Pelajar', 'Kelas', 'Kemajuan', 'Era', 'Quest', 'Skor terbaik', 'Lencana', 'Artifak', ''].map((t) => h('th', { scope: 'col', text: t })));
    const rows = list.map((s) => h('tr', {},
      h('td', {}, h('strong', { text: s.studentName }), s.started ? null : h('span', { class: 'tp-pill mute', text: 'Belum bermula' })),
      h('td', { text: s.className }),
      h('td', {}, h('div', { class: 'tp-mini', 'aria-label': `${fmt(s.completionRate)} peratus` }, h('span', { style: `width:${Math.min(100, s.completionRate)}%` })), h('small', { text: `${fmt(s.completionRate)}%` })),
      h('td', { text: `${s.erasCompleted}/${s.totalEras}` }),
      h('td', { text: String(s.questsCompleted) }),
      h('td', { text: s.attempts ? `${s.bestScore}%` : '-' }),
      h('td', { text: `${s.badges}/${s.totalBadges}` }),
      h('td', { text: `${s.artifacts}/${s.totalArtifacts}` }),
      h('td', {}, h('button', { type: 'button', class: 'tp-btn tp-btn-ghost tp-btn-sm', onclick: () => this.openStudent(s.studentID) }, h('i', { class: 'fas fa-eye' }), ' Lihat'))));
    setChildren(this.$('tp-students'), h('table', { class: 'tp-table' }, h('thead', {}, head), h('tbody', {}, rows)));
  }

  /* ---------------- one student ---------------- */
  async openStudent(studentID, fromLink = false) {
    this.retry = () => this.openStudent(studentID, fromLink);
    this.fromLink = fromLink;
    this.showView('loading');
    try {
      this.student = await this.api(`/student/${encodeURIComponent(studentID)}`);
    } catch (err) { if (!err.auth) this.showError(err); return; }
    this.warn(this.student);
    this.category = 'eras';
    this.renderStudent();
    this.showView('student');
    window.scrollTo({ top: 0 });
  }

  backToClass() {
    this.student = null;
    if (this.overview) this.showClass(); else this.loadClass();
    if (this.overview) this.warn(this.overview);
  }

  renderStudent() {
    const d = this.student;
    const s = d.summary;
    this.$('tp-name').textContent = d.student.studentName;
    this.$('tp-class-name').textContent = d.student.className;
    if (!s) {                                                          // E2: summary failed
      this.$('tp-rate').textContent = '-';
      setChildren(this.$('tp-stats'));
    } else {
      this.$('tp-ring').style.setProperty('--pct', String(Math.min(100, s.completionRate)));
      this.$('tp-rate').textContent = `${fmt(s.completionRate)}%`;
      const st = (icon, v, l) => h('div', { class: 'tp-stat' }, h('i', { class: `fas ${icon}` }), h('strong', { text: v }), h('span', { text: l }));
      setChildren(this.$('tp-stats'),
        st('fa-flag-checkered', `${s.erasCompleted} / ${s.totalEras}`, 'Era Selesai'),
        st('fa-scroll', `${s.questsCompleted} / ${s.totalQuests}`, 'Quest Selesai'),
        st('fa-trophy', `${s.bestScore}%`, 'Skor Terbaik'),
        st('fa-award', `${s.badges} / ${s.totalBadges}`, 'Lencana'),
        st('fa-gem', `${s.artifacts} / ${s.totalArtifacts}`, 'Artifak'));
    }
    setChildren(this.$('tp-tabs'), CATEGORIES.map((c) => h('button', {
      type: 'button', role: 'tab', class: `tp-tab${c.key === this.category ? ' is-active' : ''}`,
      'aria-selected': c.key === this.category ? 'true' : 'false',
      onclick: () => { this.category = c.key; this.renderStudent(); }
    }, h('i', { class: `fas ${c.icon}` }), ` ${c.label}`)));
    this.renderDetail();
  }

  renderDetail() {
    const d = this.student;
    const box = this.$('tp-detail');
    const none = (t) => h('p', { class: 'tp-empty', text: t });
    const table = (cols, rows) => h('div', { class: 'tp-table-wrap' }, h('table', { class: 'tp-table' },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', text: c })))), h('tbody', {}, rows)));
    const pill = (st) => h('span', { class: `tp-pill ${st.cls}` }, h('i', { class: `fas ${st.icon}` }), ` ${st.label}`);
    const yes = (ok, on, off) => pill(ok ? { cls: 'ok', icon: 'fa-circle-check', label: on } : { cls: 'mute', icon: 'fa-lock', label: off });
    let content;
    try {
      if (this.category === 'eras') {
        if (!d.eras.length) throw new Error('empty');
        content = table(['Era', 'Status', 'Quest'], d.eras.map((e) => h('tr', {},
          h('td', { text: e.eraName }), h('td', {}, pill(STATUS[e.status] || STATUS.locked)),
          h('td', { text: `${e.doneQuests} / ${e.totalQuests}` }))));
      } else if (this.category === 'assessments') {
        content = d.assessments.length
          ? table(['Tarikh', 'Era', 'Jenis', 'Skor', 'Keputusan'], d.assessments.map((a) => h('tr', {},
            h('td', { text: fmtDate(a.date) }), h('td', { text: a.eraName }),
            h('td', { text: a.type === 'Summative' ? 'Sumatif' : 'Formatif' }),
            h('td', {}, h('strong', { text: `${a.score}%` })),
            h('td', {}, yes(a.passed, 'Lulus', 'Belum lulus')))))
          : none('Pelajar ini belum menyertai sebarang pentaksiran.');
      } else if (this.category === 'badges') {
        content = d.badges.length
          ? table(['Lencana', 'Era', 'Status', 'Tarikh'], d.badges.map((b) => h('tr', {},
            h('td', { text: b.badgeName }), h('td', { text: b.eraName }), h('td', {}, yes(b.earned, 'Diperoleh', 'Belum')),
            h('td', { text: b.earnedAt ? fmtDate(b.earnedAt) : '-' })))) : none('Tiada lencana.');
      } else {
        content = d.artifacts.length
          ? table(['Artifak', 'Status', 'Tarikh'], d.artifacts.map((a) => h('tr', {},
            h('td', { text: a.artifactName }), h('td', {}, yes(a.earned, 'Dibuka', 'Terkunci')),
            h('td', { text: a.unlockedAt ? fmtDate(a.unlockedAt) : '-' })))) : none('Tiada artifak.');
      }
    } catch { content = none('Bahagian ini tidak dapat dipaparkan.'); }
    setChildren(box, h('h2', {}, h('i', { class: `fas ${CATEGORIES.find((c) => c.key === this.category).icon}` }), ` ${CATEGORIES.find((c) => c.key === this.category).label}`), content);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.teacherProgress = new TeacherProgressEngine(); });