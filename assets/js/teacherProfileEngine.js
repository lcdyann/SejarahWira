/**
 * ============================================================================
 * SejarahWira - Teacher Profile Engine (teacherProfileEngine.js)
 * Presentation tier for teacher_profile.html      GET /api/teacher-profile (teacher token)
 * Shows the teacher's info, class list with student counts and shortcuts.
 * Everything from the server is written with textContent, never innerHTML.
 * ============================================================================
 */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}
const setChildren = (el, ...n) => el.replaceChildren(...n.flat().filter((x) => x !== null && x !== undefined && x !== false));

class TeacherProfileEngine {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    let user = {};
    try { user = JSON.parse(localStorage.getItem('sejarahwira_user') || '{}'); } catch { user = {}; }
    if (String(user.role || '').toLowerCase() !== 'teacher') return this.denied('Halaman ini hanya untuk guru. Pelajar boleh melihat profil di halaman Profil Saya.');
    if (!user.token || !user.teacherID) return this.denied('Sila log masuk semula untuk melihat profil guru.');
    this.token = user.token;
    this.$('btn-retry').addEventListener('click', () => this.load());
    this.load();
  }

  show(name) {
    ['denied', 'loading', 'error', 'content'].forEach((v) => this.$(`tpf-${v}`).classList.toggle('is-hidden', v !== name));
  }
  denied(text) { this.$('tpf-denied-text').textContent = text; this.show('denied'); }

  async load() {
    this.show('loading');
    try {
      const res = await fetch('/api/teacher-profile', { headers: { Authorization: `Bearer ${this.token}` } });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.status === 401) return this.denied((data && data.message) || 'Sesi tamat. Sila log masuk semula.');
      if (!res.ok || !data || !data.success) throw new Error((data && data.message) || 'Gagal memuatkan profil.');
      this.render(data.profile);
      this.show('content');
    } catch (err) {
      this.$('tpf-error-text').textContent = err.message || 'Gagal memuatkan profil.';
      this.show('error');
    }
  }

  render(p) {
    this.$('tpf-name').textContent = p.teacherName;
    this.$('tpf-avatar').textContent = (Array.from(p.teacherName.trim())[0] || 'G').toUpperCase();
    this.$('info-teacherID').textContent = p.teacherID;
    this.$('info-username').textContent = p.username;

    const stat = (icon, value, label) => h('div', { class: 'tpf-stat' }, h('i', { class: `fas ${icon}` }), h('strong', { text: String(value) }), h('span', { text: label }));
    setChildren(this.$('tpf-stats'),
      stat('fa-school', p.classCount, 'Kelas'),
      stat('fa-user-graduate', p.studentCount, 'Pelajar'),
      stat('fa-pen-to-square', p.contentChanges, 'Perubahan kandungan'));

    if (!p.classes.length) {
      return setChildren(this.$('tpf-classes'), h('div', { class: 'tpf-empty' },
        h('i', { class: 'fas fa-seedling' }),
        h('p', { text: 'Anda belum mempunyai kelas. Cipta kelas pertama anda, kemudian tambah pelajar.' }),
        h('a', { class: 'tpf-btn tpf-btn-primary', href: 'class_manager.html' }, h('i', { class: 'fas fa-plus' }), ' Cipta Kelas')));
    }
    setChildren(this.$('tpf-classes'), h('ul', { class: 'tpf-class-list' }, p.classes.map((c) => h('li', {},
      h('a', { class: 'tpf-class', href: `class_manager.html?classID=${encodeURIComponent(c.classID)}` },
        h('span', { class: 'tpf-class-name', text: c.className }),
        h('span', { class: 'tpf-class-meta', text: `Tahun ${c.batchYear}` }),
        h('span', { class: 'tpf-pill', text: `${c.studentCount} pelajar` }))))));
  }
}
document.addEventListener('DOMContentLoaded', () => { window.teacherProfile = new TeacherProfileEngine(); });