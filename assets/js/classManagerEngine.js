/**
 * ============================================================================
 * SejarahWira - Class Manager Engine (classManagerEngine.js)
 * Presentation tier for class_manager.html     /api/classes/...  (teacher token)
 *   classes : create / rename / delete (only when empty)
 *   students: add one, add many from names (passwords generated), edit / move class,
 *             reset password, delete (also removes login + progress)
 * Generated passwords are shown ONCE (copy / CSV) - the server never returns them again.
 * Everything from the server is written with textContent, never innerHTML.
 * ============================================================================
 */
const CL_API = '/api/classes';
const MARKUP = /[<>]/;

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
const icon = (name) => h('i', { class: `fas ${name}` });

class ApiError extends Error {
  constructor(status, data) { super((data && data.message) || 'Permintaan gagal.'); this.status = status; this.data = data || {}; }
}

class ClassManagerEngine {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.classes = [];
    this.current = null;      // { class, students }
    this.search = '';
    this.toastTimer = null;
    this.lastFocus = null;
    this.busy = false;

    let user = {};
    try { user = JSON.parse(localStorage.getItem('sejarahwira_user') || '{}'); } catch { user = {}; }
    if (String(user.role || '').toLowerCase() !== 'teacher') return this.denied('Halaman ini hanya untuk guru. Sila log masuk sebagai guru.');
    if (!user.token || !user.teacherID) return this.denied('Sila log masuk semula untuk mengurus kelas.');
    this.token = user.token;

    this.$('btn-retry').addEventListener('click', () => this.start());
    this.$('btn-new-class').addEventListener('click', () => this.classForm());
    this.$('btn-reset-code').addEventListener('click', () => this.resetCodeForm());
    this.$('btn-modal-close').addEventListener('click', () => this.closeModal(true));
    this.$('cl-overlay').addEventListener('mousedown', (e) => { if (e.target === this.$('cl-overlay') && !this.modalLocked) this.closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.$('cl-overlay').classList.contains('is-hidden') && !this.modalLocked) this.closeModal(); });
    this.start();
  }

  /* ---------------- views / api ---------------- */
  show(name) { ['denied', 'loading', 'error', 'main'].forEach((v) => this.$(`cl-${v}`).classList.toggle('is-hidden', v !== name)); }
  denied(text) { this.$('cl-denied-text').textContent = text; this.show('denied'); }

  async api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${CL_API}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) { this.closeModal(true); this.denied((data && data.message) || 'Sesi tamat. Sila log masuk semula.'); throw new ApiError(401, data); }
    if (!res.ok || !data || !data.success) throw new ApiError(res.status, data);
    return data;
  }

  toast(text, isError = false) {
    const t = this.$('cl-toast');
    t.textContent = text; t.classList.toggle('is-error', isError); t.classList.remove('is-hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('is-hidden'), 4000);
  }

  async start() {
    this.show('loading');
    try {
      await this.loadClasses();
      const wanted = new URLSearchParams(location.search).get('classID');
      const pick = this.classes.find((c) => c.classID === wanted) || this.classes[0];
      this.show('main');
      if (pick) await this.selectClass(pick.classID); else this.renderDetail();
    } catch (err) {
      if (err.status === 401) return;
      this.$('cl-error-text').textContent = err.message || 'Gagal memuatkan data.';
      this.show('error');
    }
  }

  async loadClasses() { this.classes = (await this.api('/')).classes; this.renderClasses(); }

  async selectClass(classID) {
    try {
      this.current = await this.api(`/${encodeURIComponent(classID)}/students`);
    } catch (err) {
      if (err.status !== 401) this.toast(err.message, true);
      return;
    }
    this.search = '';
    this.renderClasses();
    this.renderDetail();
  }

  async refresh() {
    const id = this.current && this.current.class.classID;
    await this.loadClasses();
    if (id && this.classes.some((c) => c.classID === id)) await this.selectClass(id);
    else if (this.classes.length) await this.selectClass(this.classes[0].classID);
    else { this.current = null; this.renderDetail(); }
  }

  /* ---------------- render ---------------- */
  renderClasses() {
    const box = this.$('cl-class-list');
    if (!this.classes.length) {
      return setChildren(box, h('div', { class: 'cl-empty' }, icon('fa-seedling'), h('p', { text: 'Belum ada kelas. Cipta kelas pertama anda.' })));
    }
    const active = this.current && this.current.class.classID;
    setChildren(box, h('ul', { class: 'cl-class-list' }, this.classes.map((c) => h('li', {},
      h('button', {
        type: 'button', class: `cl-class${c.classID === active ? ' is-active' : ''}`,
        'aria-current': c.classID === active ? 'true' : 'false', onclick: () => this.selectClass(c.classID)
      }, h('span', { class: 'cl-class-name', text: c.className }),
        h('span', { class: 'cl-class-meta', text: `Tahun ${c.batchYear}` }),
        h('span', { class: 'cl-pill', text: `${c.studentCount} pelajar` }))))));
  }

  renderDetail() {
    const box = this.$('cl-detail');
    if (!this.current) {
      return setChildren(box, h('div', { class: 'cl-empty' }, icon('fa-arrow-left'),
        h('p', { text: this.classes.length ? 'Pilih kelas di sebelah kiri.' : 'Cipta kelas dahulu, kemudian tambah pelajar.' })));
    }
    const { class: cls, students } = this.current;

    const head = h('div', { class: 'cl-card-head' },
      h('div', {}, h('h2', { text: cls.className }), h('p', { class: 'cl-muted', text: `Tahun ${cls.batchYear}  |  ${students.length} pelajar  |  ID ${cls.classID}` }),
        this.joinCodeBox(cls.joinCode)),
      h('div', { class: 'cl-actions' },
        h('button', { type: 'button', class: 'cl-btn cl-btn-ghost cl-btn-sm', onclick: () => this.classForm(cls) }, icon('fa-pen'), ' Ubah Kelas'),
        h('button', { type: 'button', class: 'cl-btn cl-btn-danger-ghost cl-btn-sm', onclick: () => this.deleteClass(cls) }, icon('fa-trash'), ' Padam Kelas')));

    const search = h('input', { type: 'search', class: 'cl-input', placeholder: 'Cari nama, ID atau nama pengguna', maxlength: '100', 'aria-label': 'Cari pelajar', value: this.search });
    search.addEventListener('input', () => { this.search = search.value; this.renderRows(); });
    const toolbar = h('div', { class: 'cl-toolbar' }, search,
      h('button', { type: 'button', class: 'cl-btn cl-btn-primary', onclick: () => this.studentForm() }, icon('fa-user-plus'), ' Tambah Pelajar'),
      h('button', { type: 'button', class: 'cl-btn cl-btn-ghost', onclick: () => this.bulkForm() }, icon('fa-list'), ' Tambah Ramai'));

    this.rowsBox = h('div', { class: 'cl-table-wrap' });
    setChildren(box, head, toolbar, this.rowsBox);
    this.renderRows();
  }

  renderRows() {
    const { students } = this.current;
    const term = this.search.trim().toLowerCase();
    const list = students.filter((s) => !term || s.studentName.toLowerCase().includes(term) || s.username.toLowerCase().includes(term) || s.studentID.toLowerCase().includes(term));
    if (!students.length) return setChildren(this.rowsBox, h('div', { class: 'cl-empty' }, icon('fa-user-graduate'), h('p', { text: 'Kelas ini belum mempunyai pelajar.' })));
    if (!list.length) return setChildren(this.rowsBox, h('p', { class: 'cl-empty', text: 'Tiada pelajar sepadan.' }));
    const btn = (ic, label, fn, cls = '') => h('button', { type: 'button', class: `cl-icon-btn ${cls}`.trim(), title: label, 'aria-label': label, onclick: fn }, icon(ic));
    setChildren(this.rowsBox, h('table', { class: 'cl-table' },
      h('thead', {}, h('tr', {}, ['ID', 'Nama', 'Nama Pengguna', ''].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, list.map((s) => h('tr', {},
        h('td', { text: s.studentID }), h('td', {}, h('strong', { text: s.studentName })), h('td', { text: s.username }),
        h('td', { class: 'cl-row-actions' },
          h('a', { class: 'cl-icon-btn', href: `learning_progress_teacher.html?studentID=${encodeURIComponent(s.studentID)}`, title: 'Lihat kemajuan', 'aria-label': `Lihat kemajuan ${s.studentName}` }, icon('fa-chart-line')),
          btn('fa-pen', `Ubah ${s.studentName}`, () => this.editStudentForm(s)),
          btn('fa-key', `Tetapkan semula kata laluan ${s.studentName}`, () => this.resetForm(s)),
          btn('fa-right-from-bracket', `Keluarkan ${s.studentName} daripada kelas`, () => this.leaveStudent(s)),
          btn('fa-trash', `Padam ${s.studentName}`, () => this.deleteStudent(s), 'is-danger')))))));
  }

  /* ---------------- kod kelas (murid taip kod ini untuk masuk kelas anda) ---------------- */
  joinCodeBox(code) {
    const copy = h('button', { type: 'button', class: 'cl-btn cl-btn-ghost cl-btn-sm', title: 'Salin kod kelas' }, icon('fa-copy'), ' Salin');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); this.toast('Kod kelas disalin.'); } catch { this.toast('Salin tidak berjaya. Taip kod ini secara manual.', true); }
    });
    return h('div', { class: 'cl-joincode' },
      h('span', { class: 'cl-joincode-label', text: 'Kod kelas (beri kepada murid):' }),
      h('strong', { class: 'cl-joincode-value', text: code }), copy);
  }

  /* ---------------- kod tetapan semula (untuk murid / guru yang terlupa kata laluan) ---------------- */
  resetCodeForm() {
    const user = h('input', { type: 'text', maxlength: '50', placeholder: 'e-mel atau nama pengguna' });
    const who = this.field('E-mel / nama pengguna orang itu', user, { required: true,
      hint: 'Guru: murid dalam kelas anda sahaja. Admin: murid tanpa kelas dan guru lain.' });
    const out = h('div', { class: 'cl-resetcode is-hidden', role: 'status' });
    const form = this.formShell([who], 'Jana Kod', ({ save, banner }) => {
      const username = user.value.trim();
      if (!username) return who.setError('Sila masukkan e-mel atau nama pengguna.');
      who.setError('');
      this.submit(save, banner, { username: who }, async () => {
        const res = await this.codeRequest(username);
        setChildren(out,
          h('p', { class: 'cl-muted', text: `Kod untuk ${res.username} (sah ${res.minutes} minit, sekali guna):` }),
          h('strong', { class: 'cl-joincode-value', text: res.code }),
          h('p', { class: 'cl-hint', text: 'Beritahu kod ini kepada orang itu. Dia membukanya di halaman log masuk: "Lupa kata laluan?".' }));
        out.classList.remove('is-hidden');
      });
    }, { extra: out });
    this.openModal('Kod Lupa Kata Laluan', [h('p', { class: 'cl-muted', text: 'Jana kod sekali guna supaya murid atau guru yang terlupa kata laluan boleh menetapkan yang baharu sendiri.' }), form]);
  }

  async codeRequest(username) {
    const res = await fetch('/api/auth/reset-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ username })
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || !data.success) throw new ApiError(res.status, data);
    return data;
  }

  /* ---------------- modal plumbing ---------------- */
  openModal(title, bodyNodes, { locked = false } = {}) {
    this.lastFocus = document.activeElement;
    this.modalLocked = locked;
    this.$('cl-modal-title').textContent = title;
    setChildren(this.$('cl-modal-body'), bodyNodes);
    this.$('cl-overlay').classList.remove('is-hidden');
    const first = this.$('cl-modal-body').querySelector('input, textarea, select, button');
    if (first) first.focus();
  }
  closeModal(force = false) {
    if (this.modalLocked && !force) return;
    this.modalLocked = false;
    const hook = this.cancelHook; this.cancelHook = null;
    this.$('cl-overlay').classList.add('is-hidden');
    setChildren(this.$('cl-modal-body'));
    if (this.lastFocus && this.lastFocus.focus && document.contains(this.lastFocus)) this.lastFocus.focus();
    if (hook) hook();
  }

  /** field() -> { node, input, setError } */
  field(label, input, { hint, required = false, target = null } = {}) {
    const err = h('span', { class: 'cl-error', role: 'alert' });
    const id = `f-${Math.random().toString(36).slice(2, 8)}`;
    (target || input).id = id;
    const node = h('div', { class: 'cl-field' }, h('label', { for: id }, label, required ? h('span', { class: 'cl-req', text: ' *' }) : null), input, hint ? h('p', { class: 'cl-hint', text: hint }) : null, err);
    return { node, input, setError: (m) => { err.textContent = m || ''; node.classList.toggle('has-error', Boolean(m)); } };
  }

  /** shared submit wrapper: disables the button, maps 422 errors onto the fields, keeps the form open on failure */
  async submit(button, banner, fields, action) {
    if (this.busy) return;
    this.busy = true; button.disabled = true;
    banner.classList.add('is-hidden');
    Object.values(fields).forEach((f) => f.setError(''));
    try { await action(); }
    catch (err) {
      if (err.status === 401) return;
      const errors = err.data && err.data.errors;
      if (errors) {
        Object.entries(errors).forEach(([k, m]) => { if (fields[k]) fields[k].setError(m); else { banner.textContent = m; banner.classList.remove('is-hidden'); } });
        banner.textContent = banner.textContent || err.message; banner.classList.remove('is-hidden');
      } else { banner.textContent = `${err.message || 'Gagal menyimpan.'} Tiada perubahan dibuat.`; banner.classList.remove('is-hidden'); }
    } finally { this.busy = false; button.disabled = false; }
  }

  formShell(fieldsArr, submitLabel, onSubmit, { extra } = {}) {
    const banner = h('div', { class: 'cl-banner is-hidden', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'cl-btn cl-btn-primary' }, icon('fa-floppy-disk'), ` ${submitLabel}`);
    const form = h('form', { class: 'cl-form', novalidate: true }, banner, fieldsArr.map((f) => f.node), extra || null,
      h('div', { class: 'cl-modal-actions' }, h('button', { type: 'button', class: 'cl-btn cl-btn-ghost', onclick: () => this.closeModal() }, 'Batal'), save));
    form.addEventListener('submit', (e) => { e.preventDefault(); onSubmit({ save, banner }); });
    return form;
  }

  /* ---------------- class forms ---------------- */
  classForm(cls = null) {
    const name = this.field('Nama kelas', h('input', { type: 'text', maxlength: '20', value: cls ? cls.className : '', placeholder: 'Contoh: 5 Amanah' }), { required: true });
    const year = this.field('Tahun kumpulan', h('input', { type: 'number', min: '2000', max: '2100', value: cls ? String(cls.batchYear) : String(new Date().getFullYear()) }), { required: true });
    const fields = { className: name, batchYear: year };
    const form = this.formShell([name, year], cls ? 'Simpan' : 'Cipta Kelas', ({ save, banner }) => {
      const v = { className: name.input.value.trim(), batchYear: Number(year.input.value) };
      const local = {};
      if (!v.className) local.className = 'Nama kelas wajib diisi.';
      else if (v.className.length > 20) local.className = 'Nama kelas terlalu panjang (maksimum 20 aksara).';
      else if (MARKUP.test(v.className)) local.className = 'Aksara < dan > tidak dibenarkan.';
      if (!Number.isInteger(v.batchYear) || v.batchYear < 2000 || v.batchYear > 2100) local.batchYear = 'Tahun kumpulan mesti antara 2000 dan 2100.';
      Object.entries(fields).forEach(([k, f]) => f.setError(local[k]));
      if (Object.keys(local).length) return;
      this.submit(save, banner, fields, async () => {
        const res = cls ? await this.api(`/${encodeURIComponent(cls.classID)}`, { method: 'PUT', body: v }) : await this.api('/', { method: 'POST', body: v });
        this.closeModal();
        this.toast(res.message);
        await this.loadClasses();
        await this.selectClass(cls ? cls.classID : res.class.classID);
      });
    });
    this.openModal(cls ? 'Ubah Kelas' : 'Kelas Baharu', form);
  }

  async deleteClass(cls) {
    const ok = await this.confirm('Padam kelas?', `Kelas "${cls.className}" akan dipadam. Hanya kelas tanpa pelajar boleh dipadam.`, 'Padam Kelas', true);
    if (!ok) return;
    try { const res = await this.api(`/${encodeURIComponent(cls.classID)}`, { method: 'DELETE' }); this.toast(res.message); this.current = null; await this.refresh(); }
    catch (err) { if (err.status !== 401) this.toast(err.message, true); }
  }

  /* ---------------- student forms ---------------- */
  /**
   * Ruangan kata laluan + butang Jana + kotak amaran langsung (assets/js/passwordRules.js).
   * getWho() mengembalikan { username, name } semasa supaya amaran "mengandungi nama pengguna" tepat.
   */
  passwordInput(getWho = () => ({})) {
    const input = h('input', { type: 'text', maxlength: '72', autocomplete: 'off', placeholder: 'Minimum 8 aksara, ada huruf dan nombor' });
    const help = SWPassword.make();                    // kotak peraturan (hijau = lulus, merah = belum)
    const gen = h('button', { type: 'button', class: 'cl-btn cl-btn-ghost cl-btn-sm', onclick: () => { input.value = this.randomPassword(); input.focus(); input.dispatchEvent(new Event('input')); } }, icon('fa-wand-magic-sparkles'), ' Jana');
    SWPassword.bind(input, help, getWho);
    return { input, help, wrap: h('div', {}, h('div', { class: 'cl-inline' }, input, gen), help) };
  }
  /** Semak kata laluan; mengembalikan mesej ralat atau '' jika lulus. */
  passwordProblem(password, who) {
    const r = SWPassword.check(password, who);
    return r.ok ? '' : `Kata laluan belum memenuhi syarat: ${r.failed.map((k) => SWPassword.RULES[k]).join(' ')}`;
  }
  /** Kata laluan rawak: sentiasa ada huruf besar, huruf kecil dan nombor (lulus peraturan kata laluan). */
  randomPassword(len = 8) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (;;) {
      const buf = new Uint32Array(Math.max(8, len)); crypto.getRandomValues(buf);
      const pw = Array.from(buf, (n) => chars[n % chars.length]).join('');
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) return pw;
    }
  }

  studentForm() {
    const cls = this.current.class;
    const name = this.field('Nama pelajar', h('input', { type: 'text', maxlength: '100' }), { required: true });
    const user = this.field('Nama pengguna', h('input', { type: 'text', maxlength: '50', autocomplete: 'off', placeholder: 'Contoh: ali.ahmad' }), { required: true, hint: 'Huruf, nombor, titik, garis bawah atau sengkang. Digunakan untuk log masuk.' });
    const pw = this.passwordInput(() => ({ username: user.input.value.trim(), name: name.input.value.trim() }));
    const pass = this.field('Kata laluan', pw.wrap, { required: true, target: pw.input });
    const sid = this.field('ID pelajar (pilihan)', h('input', { type: 'text', maxlength: '20', autocomplete: 'off' }), { hint: 'Biarkan kosong untuk ID automatik (contoh S1005).' });
    const fields = { studentName: name, username: user, password: pass, studentID: sid };
    const form = this.formShell([name, user, pass, sid], 'Tambah Pelajar', ({ save, banner }) => {
      const v = { studentName: name.input.value.trim(), username: user.input.value.trim(), password: pw.input.value, studentID: sid.input.value.trim() };
      const local = {};
      if (!v.studentName) local.studentName = 'Nama pelajar wajib diisi.'; else if (MARKUP.test(v.studentName)) local.studentName = 'Aksara < dan > tidak dibenarkan.';
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(v.username)) local.username = 'Nama pengguna 3-50 aksara: huruf, nombor, titik, garis bawah atau sengkang.';
      const pwMsg = this.passwordProblem(v.password, { username: v.username, name: v.studentName });
      if (pwMsg) local.password = pwMsg;
      if (v.studentID && !/^[A-Za-z0-9_-]{1,20}$/.test(v.studentID)) local.studentID = 'ID pelajar: huruf, nombor, garis bawah atau sengkang (maksimum 20).';
      Object.entries(fields).forEach(([k, f]) => f.setError(local[k]));
      if (Object.keys(local).length) return;
      this.submit(save, banner, fields, async () => {
        const res = await this.api(`/${encodeURIComponent(cls.classID)}/students`, { method: 'POST', body: v });
        this.credentialsDialog('Pelajar ditambah', [{ studentID: res.student.studentID, studentName: v.studentName, username: v.username, password: v.password }], cls);
        await this.loadClasses(); await this.selectClass(cls.classID);
      });
    });
    this.openModal(`Tambah Pelajar - ${cls.className}`, form);
  }

  bulkForm() {
    const cls = this.current.class;
    const area = h('textarea', { rows: '9', maxlength: '6000', placeholder: 'Satu nama setiap baris:\nAhmad bin Ali\nSiti Aminah\nTan Wei Ming' });
    const names = this.field('Senarai nama pelajar', area, { required: true, hint: 'Nama pengguna dan kata laluan dijana secara automatik. Maksimum 60 nama.' });
    const count = h('p', { class: 'cl-hint' });
    const parse = () => area.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    area.addEventListener('input', () => { count.textContent = `${parse().length} nama`; });
    count.textContent = '0 nama';
    const form = this.formShell([names], 'Tambah Semua', ({ save, banner }) => {
      const list = parse();
      let msg = '';
      if (!list.length) msg = 'Masukkan sekurang-kurangnya satu nama.';
      else if (list.length > 60) msg = 'Maksimum 60 pelajar sekali gus.';
      else { const i = list.findIndex((n) => MARKUP.test(n) || n.length > 100); if (i >= 0) msg = `Baris ${i + 1}: nama terlalu panjang atau mengandungi < atau >.`; }
      names.setError(msg);
      if (msg) return;
      this.submit(save, banner, { names }, async () => {
        const res = await this.api(`/${encodeURIComponent(cls.classID)}/students/bulk`, { method: 'POST', body: { names: list } });
        this.credentialsDialog(res.message, res.students, cls);
        await this.loadClasses(); await this.selectClass(cls.classID);
      });
    }, { extra: count });
    this.openModal(`Tambah Ramai - ${cls.className}`, form);
  }

  editStudentForm(s) {
    const name = this.field('Nama pelajar', h('input', { type: 'text', maxlength: '100', value: s.studentName }), { required: true });
    const sel = h('select', {}, this.classes.map((c) => h('option', { value: c.classID, text: `${c.className} (${c.batchYear})` })));
    sel.value = s.classID;
    const cls = this.field('Kelas', sel, { hint: 'Tukar kelas untuk memindahkan pelajar. Kemajuan pelajar dikekalkan.' });
    const fields = { studentName: name, classID: cls };
    const form = this.formShell([name, cls], 'Simpan', ({ save, banner }) => {
      const v = { studentName: name.input.value.trim(), classID: sel.value };
      const local = {};
      if (!v.studentName) local.studentName = 'Nama pelajar wajib diisi.'; else if (MARKUP.test(v.studentName)) local.studentName = 'Aksara < dan > tidak dibenarkan.';
      Object.entries(fields).forEach(([k, f]) => f.setError(local[k]));
      if (Object.keys(local).length) return;
      this.submit(save, banner, fields, async () => {
        const res = await this.api(`/students/${encodeURIComponent(s.studentID)}`, { method: 'PUT', body: v });
        this.closeModal(); this.toast(res.message);
        await this.loadClasses(); await this.selectClass(this.current.class.classID);
      });
    });
    this.openModal(`Ubah Pelajar - ${s.studentID}`, form);
  }

  resetForm(s) {
    const pw = this.passwordInput(() => ({ username: s.username, name: s.studentName }));
    const pass = this.field('Kata laluan baharu', pw.wrap, { hint: 'Biarkan kosong untuk kata laluan automatik.', target: pw.input });
    const form = this.formShell([pass], 'Tetapkan Semula', ({ save, banner }) => {
      const v = pw.input.value;
      const pwMsg = v ? this.passwordProblem(v, { username: s.username, name: s.studentName }) : '';
      if (pwMsg) return pass.setError(pwMsg);
      pass.setError('');
      this.submit(save, banner, { password: pass }, async () => {
        const res = await this.api(`/students/${encodeURIComponent(s.studentID)}/reset-password`, { method: 'POST', body: v ? { password: v } : {} });
        this.credentialsDialog('Kata laluan ditetapkan semula', [{ studentID: s.studentID, studentName: s.studentName, username: s.username, password: res.password }], this.current.class);
      });
    });
    this.openModal(`Tetapkan Semula Kata Laluan - ${s.studentName}`, [h('p', { class: 'cl-muted', text: 'Pelajar mesti menggunakan kata laluan baharu pada log masuk seterusnya.' }), form]);
  }

  async leaveStudent(s) {
    const ok = await this.confirm('Keluarkan daripada kelas?', `${s.studentName} kekal mempunyai akaun dan semua kemajuan, tetapi tidak lagi dalam kelas ini. Dia boleh menyertai kelas lain dengan kod kelas, dan anda tidak lagi boleh melihat kemajuannya.`, 'Keluarkan', true);
    if (!ok) return;
    try {
      const res = await this.api(`/students/${encodeURIComponent(s.studentID)}/leave-class`, { method: 'POST' });
      this.toast(res.message);
      await this.loadClasses(); await this.selectClass(this.current.class.classID);
    } catch (err) { if (err.status !== 401) this.toast(err.message, true); }
  }

  async deleteStudent(s) {
    const ok = await this.confirm('Padam pelajar?', `${s.studentName} (${s.studentID}) akan dipadam bersama akaun log masuk, kemajuan, lencana dan artifaknya. Tindakan ini tidak boleh dibatalkan.`, 'Padam Pelajar', true);
    if (!ok) return;
    try {
      const res = await this.api(`/students/${encodeURIComponent(s.studentID)}`, { method: 'DELETE' });
      this.toast(res.message);
      await this.loadClasses(); await this.selectClass(this.current.class.classID);
    } catch (err) { if (err.status !== 401) this.toast(err.message, true); }
  }

  /* ---------------- confirm + credentials ---------------- */
  confirm(title, text, okLabel, danger = false) {
    return new Promise((resolve) => {
      const done = (v) => { resolve(v); this.closeModal(true); };
      this.cancelHook = () => resolve(false);
      this.openModal(title, [h('p', { class: 'cl-confirm-text', text }),
        h('div', { class: 'cl-modal-actions' },
          h('button', { type: 'button', class: 'cl-btn cl-btn-ghost', onclick: () => done(false) }, 'Batal'),
          h('button', { type: 'button', class: `cl-btn ${danger ? 'cl-btn-danger' : 'cl-btn-primary'}`, onclick: () => done(true) }, okLabel))]);
    });
  }

  csvCell(v) { const s = String(v); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; }

  credentialsDialog(title, rows, cls) {
    const text = rows.map((r) => `${r.studentName}\t${r.username}\t${r.password}`).join('\n');
    const csv = `﻿${['ID', 'Nama', 'Nama pengguna', 'Kata laluan'].map((c) => this.csvCell(c)).join(',')}\n${rows.map((r) => [r.studentID, r.studentName, r.username, r.password].map((c) => this.csvCell(c)).join(',')).join('\n')}`;
    const note = h('div', { class: 'cl-banner cl-banner-warn' }, icon('fa-triangle-exclamation'), ' Simpan kata laluan ini sekarang. Ia tidak akan dipaparkan lagi selepas dialog ini ditutup.');
    const table = h('div', { class: 'cl-table-wrap' }, h('table', { class: 'cl-table' },
      h('thead', {}, h('tr', {}, ['ID', 'Nama', 'Nama Pengguna', 'Kata Laluan'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { text: r.studentID }), h('td', { text: r.studentName }), h('td', { text: r.username }), h('td', {}, h('code', { class: 'cl-code', text: r.password })))))));
    const copy = h('button', { type: 'button', class: 'cl-btn cl-btn-ghost', onclick: async () => {
      try { await navigator.clipboard.writeText(text); this.toast('Disalin ke papan klip.'); } catch { this.toast('Salin tidak dapat dilakukan. Gunakan muat turun CSV.', true); }
    } }, icon('fa-copy'), ' Salin');
    const download = h('button', { type: 'button', class: 'cl-btn cl-btn-ghost', onclick: () => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = h('a', { href: url, download: `akaun-pelajar-${cls.className.replace(/[^A-Za-z0-9]+/g, '-')}.csv` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } }, icon('fa-download'), ' Muat Turun CSV');
    const done = h('button', { type: 'button', class: 'cl-btn cl-btn-primary', onclick: () => this.closeModal(true) }, 'Selesai');
    this.openModal(title, [note, table, h('div', { class: 'cl-modal-actions' }, copy, download, done)], { locked: true });
  }
}

document.addEventListener('DOMContentLoaded', () => { window.classManager = new ClassManagerEngine(); });