/**
 * ============================================================================
 * SejarahWira - Content Manager Engine (contentManagerEngine.js)
 * ============================================================================
 * Presentation tier for content_manager.html   (UC-10 Manage Learning Content)
 * Controller : contentController.js   /api/content/...   (teacher token required)
 *
 * Narrative / scene / dialogue / quest editors live in contentBoard.js, contentQuest.js and
 * contentLibrary.js (the "Naratif, Dialog & Quest" tab). This file: eras, Bank Soalan, Rekod Perubahan.
 *
 * Class-diagram names
 *   Teacher        manageLearningContent()   -> step 1-2  list of eras
 *   Teacher        viewEraContent()          -> step 3-4  selectEra()
 *   QuestionBank   addQuestion(), editQuestion(), removeQuestion()  -> saveQuestion(), removeQuestion()
 *   ContentManager viewChanges()             -> who changed what
 *
 * Use-case flow
 *   Step 6 / A5  selectContentType()   unsupported type -> error message, back to the type menu
 *   Step 9-12    openQuestionEditor() / saveQuestion()
 *   E1           validateQuestion()    errors shown under each field
 *   E2           save failure          "Tiada perubahan dibuat", the form stays open
 *   E3           retrieval failure     error view, back to the era list
 *   A4           cancelEditing()       discards unsaved changes (asks first when something changed)
 *
 * Everything from the server is written with textContent, never innerHTML.
 * ============================================================================
 */

const CM_API = '/api/content';
const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const FIELDS = ['questionText', 'optionA', 'optionB', 'optionC', 'optionD', 'hint', 'explanation'];
const LIMITS = { text: 2000, option: 255, hint: 255, explanation: 2000 };
const MARKUP = /[<>]/;

const CONTENT_TYPES = [
  { type: 'narrative', label: 'Naratif, Dialog & Misi', icon: 'fa-book-open', ready: true },
  { type: 'questions', label: 'Bank Soalan', icon: 'fa-circle-question', ready: true },
  { type: 'entity', label: 'Suara Pendekar Bayang', icon: 'fa-ghost', ready: true },
  { type: 'changes', label: 'Rekod Perubahan', icon: 'fa-clock-rotate-left', ready: true }
];

/** Older links / the use-case wording: dialogue and quest are edited on the same story board. */
const TYPE_ALIASES = { dialogue: 'narrative', quest: 'narrative' };

const STATUS = {
  sedia: { label: 'Sedia', cls: 'ok', icon: 'fa-circle-check' },
  amaran: { label: 'Ada amaran', cls: 'warn', icon: 'fa-triangle-exclamation' },
  tidak_lengkap: { label: 'Belum lengkap', cls: 'bad', icon: 'fa-circle-xmark' }
};

/* ------------------------------------------------------------------------ */
/* PURE HELPERS                                                             */
/* ------------------------------------------------------------------------ */

/** Same rules as the server (E1). Returns { field: message }; empty object = valid. */
function validateQuestion(v = {}) {
  const t = (x) => (typeof x === 'string' ? x.trim() : '');
  const f = {
    questionText: t(v.questionText),
    optionA: t(v.optionA), optionB: t(v.optionB), optionC: t(v.optionC), optionD: t(v.optionD),
    correctAnswer: t(v.correctAnswer).toUpperCase(),
    hint: t(v.hint),
    explanation: t(v.explanation)
  };
  const errors = {};

  const required = (field, label, max) => {
    if (!f[field]) errors[field] = `${label} wajib diisi.`;
    else if (f[field].length > max) errors[field] = `${label} terlalu panjang (maksimum ${max} aksara).`;
  };
  required('questionText', 'Soalan', LIMITS.text);
  OPTION_KEYS.forEach((k) => required(`option${k}`, `Pilihan ${k}`, LIMITS.option));

  if (!OPTION_KEYS.includes(f.correctAnswer)) errors.correctAnswer = 'Sila pilih jawapan yang betul (A, B, C atau D).';
  if (f.hint.length > LIMITS.hint) errors.hint = `Petunjuk terlalu panjang (maksimum ${LIMITS.hint} aksara).`;
  if (f.explanation.length > LIMITS.explanation) errors.explanation = `Penerangan terlalu panjang (maksimum ${LIMITS.explanation} aksara).`;

  const seen = new Map();
  OPTION_KEYS.forEach((k) => {
    const val = f[`option${k}`].toLowerCase();
    if (!val) return;
    if (seen.has(val)) {
      if (!errors[`option${k}`]) errors[`option${k}`] = `Pilihan ${k} sama dengan Pilihan ${seen.get(val)}.`;
    } else {
      seen.set(val, k);
    }
  });

  FIELDS.forEach((field) => {
    if (!errors[field] && MARKUP.test(f[field])) errors[field] = 'Aksara < dan > tidak dibenarkan.';
  });
  return errors;
}

/** "5 minit lalu", "2 jam lalu"... */
function relativeTime(value, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((now - date.getTime()) / 60000);
  if (minutes < 1) return 'baru sebentar tadi';
  if (minutes < 60) return `${minutes} minit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return date.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Tiny DOM builder: no innerHTML anywhere. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (val === null || val === undefined || val === false) return;
    if (key === 'class') el.className = val;
    else if (key === 'text') el.textContent = val;
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
    else el.setAttribute(key, val === true ? '' : val);
  });
  kids.flat().forEach((kid) => {
    if (kid === null || kid === undefined || kid === false) return;
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  });
  return el;
}

/** replaceChildren() that skips null / false (the browser would print "null" as text). */
function setChildren(el, ...nodes) {
  el.replaceChildren(...nodes.flat().filter((n) => n !== null && n !== undefined && n !== false));
}

const chip = (text, cls = '', icon = null) =>
  h('span', { class: `cm-chip ${cls}`.trim() }, icon ? h('i', { class: `fas ${icon}` }) : null, icon ? ` ${text}` : text);

/** Ralat daripada API. status 0 = tidak dapat menghubungi pelayan. */
class ApiError extends Error {
  constructor(status, data, path = '') {
    super((data && data.message) || 'Permintaan gagal.');
    this.status = status;
    this.data = data || {};
    this.path = path;
  }
}

/* ------------------------------------------------------------------------ */
/* ENGINE                                                                   */
/* ------------------------------------------------------------------------ */

class ContentManagerEngine {
  constructor() {
    this.$ = (id) => document.getElementById(id);

    this.eras = [];
    this.era = null;
    this.type = null;
    this.questions = [];
    this.search = '';
    this.editing = null;
    this.snapshot = null;
    this.saving = false;
    this.toastTimer = null;
    this.confirmResolve = null;
    this.errorAction = null;
    this.board = null;
    this.entityVoice = null;

    const session = this.readSession();
    if (session.error) {
      this.showDenied(session.error);
      return;
    }
    this.token = session.user.token;

    this.bindStaticEvents();
    this.start();
  }

  /* ---------------------------------------------------------------------- */
  /* SESSION + API                                                          */
  /* ---------------------------------------------------------------------- */

  readSession() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem('sejarahwira_user') || '{}'); } catch { user = {}; }

    if (String(user.role || '').toLowerCase() !== 'teacher') {
      return { error: 'Halaman ini hanya untuk guru. Sila log masuk sebagai guru.' };
    }
    if (!user.token || !user.teacherID) {
      return { error: 'Sila log masuk semula untuk mengaktifkan akses pengurusan kandungan.' };
    }
    return { user };
  }

  /** raw: { type, body } sends the file as it is (image upload); otherwise JSON. */
  async api(path, { method = 'GET', body, raw } = {}) {
    let res;
    try {
      res = await fetch(`${CM_API}${path}`, {
        method,
        headers: { 'Content-Type': raw ? raw.type : 'application/json', Authorization: `Bearer ${this.token}` },
        body: raw ? raw.body : (body ? JSON.stringify(body) : undefined)
      });
    } catch {
      // pelayan mati / tiada internet: fetch() sendiri gagal (tiada kod HTTP)
      throw new ApiError(0, { message: 'Tidak dapat menghubungi pelayan.', code: 'NETWORK' }, path);
    }

    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (res.status === 401) {
      this.showDenied((data && data.message) || 'Sesi tamat. Sila log masuk semula.');
      throw new ApiError(401, data);
    }
    if (!res.ok || !data || !data.success) {
      // pelayan menjawab tetapi bukan JSON biasa (contoh: halaman ralat): tetap beritahu kod HTTP
      if (!data) data = { message: `Pelayan menjawab dengan ralat ${res.status} tanpa penerangan.`, code: 'NO_JSON' };
      throw new ApiError(res.status, data, path);
    }
    return data;
  }

  /* ---------------------------------------------------------------------- */
  /* VIEWS, MESSAGES                                                        */
  /* ---------------------------------------------------------------------- */

  showView(name) {
    const ids = { loading: 'cm-loading', denied: 'cm-denied', error: 'cm-error', eras: 'view-eras', era: 'view-era' };
    Object.entries(ids).forEach(([key, id]) => this.$(id).classList.toggle('is-hidden', key !== name));
  }

  showDenied(text) {
    this.closeEditor();
    this.$('cm-confirm').classList.add('is-hidden');
    this.$('cm-denied-text').textContent = text;
    this.showView('denied');
  }

  /** E3: the user is sent back with a clear message and one button. */
  showError(text, action, label, err = null) {
    // tambah punca sebenar (contoh: pelayan tidak dapat dihubungi) selepas ayat umum
    const reason = err ? describeError(err) : null;
    const extra = reason ? ` Punca: ${reason.reason}${reason.code ? ` (${reason.code})` : ''}` : '';
    this.$('cm-error-text').textContent = text + extra;
    this.$('btn-error-back').textContent = label;
    this.errorAction = action;
    this.showView('error');
  }

  /** Panel ralat terperinci yang kekal (lihat reportApiError dalam contentUi.js). */
  reportError(action, err, options = {}) {
    reportApiError(this, action, err, { where: this.where(), ...options });
  }

  /** Bahagian semasa: nama era. Papan naratif menambah naratif dan babak. */
  where() {
    return this.era ? `Era ${this.era.eraID}: ${this.era.eraName || ''}`.trim() : '';
  }

  toast(message, kind = 'ok') {
    const el = this.$('cm-toast');
    el.textContent = message;
    el.className = `cm-toast${kind === 'error' ? ' is-error' : ''}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('is-hidden'), 3600);
  }

  askConfirm({ title, text, confirmText = 'Teruskan', danger = false }) {
    return new Promise((resolve) => {
      this.$('cm-confirm-title').textContent = title;
      this.$('cm-confirm-text').textContent = text;

      const ok = this.$('btn-confirm-ok');
      ok.textContent = confirmText;
      ok.className = `cm-btn ${danger ? 'cm-btn-danger' : 'cm-btn-primary'}`;

      const done = (value) => {
        this.$('cm-confirm').classList.add('is-hidden');
        this.confirmResolve = null;
        resolve(value);
      };
      this.confirmResolve = done;
      ok.onclick = () => done(true);
      this.$('btn-confirm-cancel').onclick = () => done(false);
      this.$('cm-confirm').classList.remove('is-hidden');
    });
  }

  setUrl(eraID, type) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('eraID');
      url.searchParams.delete('type');
      if (eraID) url.searchParams.set('eraID', eraID);
      if (eraID && type) url.searchParams.set('type', type);
      window.history.replaceState({}, '', url);
    } catch { /* not important */ }
  }

  bindStaticEvents() {
    this.$('btn-back-eras').addEventListener('click', () => this.backToEras());
    this.$('btn-error-back').addEventListener('click', () => { if (this.errorAction) this.errorAction(); });

    this.$('q-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveQuestion(); });
    this.$('btn-q-cancel').addEventListener('click', () => this.cancelEditing());
    this.$('btn-q-close').addEventListener('click', () => this.cancelEditing());

    const onInput = (e) => this.onFormInput(e);
    FIELDS.forEach((f) => this.$(`f-${f}`).addEventListener('input', onInput));
    OPTION_KEYS.forEach((k) => this.$(`f-correct-${k}`).addEventListener('change', onInput));

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.confirmResolve) this.confirmResolve(false);
      else if (typeof Dialog !== 'undefined' && Dialog.stack.length) Dialog.stack[Dialog.stack.length - 1].requestClose();
      else if (this.editing !== null || !this.$('q-modal').classList.contains('is-hidden')) this.cancelEditing();
    });

    window.addEventListener('beforeunload', (e) => {
      if (this.isEditorOpen() && this.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* STEP 1-2: LIST OF ERAS                                                 */
  /* ---------------------------------------------------------------------- */

  async start() {
    await this.manageLearningContent();

    // direct link, e.g. content_manager.html?eraID=2&type=questions
    const params = new URLSearchParams(window.location.search);
    const eraID = params.get('eraID');
    if (eraID && this.eras.some((e) => String(e.eraID) === eraID)) {
      await this.selectEra(Number(eraID), params.get('type') || 'narrative');
    }
  }

  /**
   * Only the admin can change the fixed / public content. Every other teacher sees the same pages
   * but without the edit buttons (the server refuses their changes too, whatever the page shows).
   */
  setCanEdit(canEdit) {
    this.canEdit = canEdit !== false;
    if (this.canEdit || this._lock) return;

    const wrapper = document.querySelector('.cm-wrapper');
    const note = h('div', { class: 'cm-readonly-note', role: 'note' },
      h('i', { class: 'fas fa-eye' }),
      h('span', {}, h('b', { text: 'Mod lihat sahaja. ' }), 'Kandungan pembelajaran awam hanya boleh diubah oleh admin. Anda boleh melihat semuanya dan menekan butang Main untuk mencuba seperti seorang pelajar.'));
    const header = wrapper.querySelector('.cm-header');
    header.insertAdjacentElement('afterend', note);

    const WRITE_ICONS = ['fa-plus', 'fa-trash', 'fa-pen', 'fa-floppy-disk', 'fa-image', 'fa-arrow-up', 'fa-arrow-down', 'fa-rotate-left', 'fa-cloud-arrow-up', 'fa-grip-vertical'];
    const lock = () => {
      wrapper.querySelectorAll('button').forEach((b) => {
        if (b.closest('.cm-readonly-note')) return;
        if (WRITE_ICONS.some((icon) => b.querySelector(`.${icon}`)) || /^Urus NPC/.test(b.textContent.trim())) b.classList.add('is-hidden');
      });
      wrapper.querySelectorAll('[draggable="true"]').forEach((n) => n.setAttribute('draggable', 'false'));
    };
    let queued = false;
    this._lock = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; lock(); });
    });
    this._lock.observe(wrapper, { childList: true, subtree: true });
    lock();
  }

  /** Teacher.manageLearningContent() */
  async manageLearningContent() {
    this.showView('loading');
    this.$('cm-subtitle').textContent = 'Pilih era untuk melihat dan mengemas kini kandungannya.';
    try {
      const [erasData, changes] = await Promise.all([
        this.api('/eras'),
        this.api('/changes?limit=8').catch((err) => { if (err.status === 401) throw err; return null; })
      ]);
      this.eras = erasData.eras;
      this.setCanEdit(erasData.canEdit);
      this.renderEraGrid();
      this.renderRecentChanges(changes ? changes.changes : null);
      this.showView('eras');
    } catch (err) {
      if (err.status === 401) return;
      this.showError('Senarai era tidak dapat dimuatkan. Sila cuba lagi.', () => this.manageLearningContent(), 'Cuba Lagi', err);
    }
  }

  renderEraGrid() {
    const cards = this.eras.map((e) => {
      const info = STATUS[e.status] || STATUS.tidak_lengkap;
      return h('button', {
        type: 'button',
        class: 'cm-era-card',
        'aria-label': `Urus kandungan Era ${e.eraID}: ${e.eraName}`,
        onclick: () => this.selectEra(e.eraID)
      },
      h('div', { class: 'cm-era-top' },
        h('span', { class: 'cm-era-num', text: String(e.eraID) }),
        h('span', { class: 'cm-era-name', text: e.eraName })),
      h('div', { class: 'cm-era-meta', text: `${e.narrativeCount} naratif \u2022 ${e.questionCount} soalan` }),
      chip(`${info.label}${e.issues.length ? ` (${e.issues.length})` : ''}`, info.cls, info.icon));
    });
    setChildren(this.$('era-grid'), ...cards);
  }

  changeItem(c, showEra) {
    const who = c.teacherName || 'Guru (akaun dipadam)';
    const era = showEra && c.eraID ? ` \u2022 Era ${c.eraID}` : '';
    return h('li', { class: 'cm-change-item' },
      h('div', { class: 'cm-change-who', text: `${who} \u2014 ${c.changesName}` }),
      c.changesDescription ? h('div', { class: 'cm-change-what', text: c.changesDescription }) : null,
      h('div', { class: 'cm-change-when', text: `${relativeTime(c.updated_at)}${era}` }));
  }

  renderRecentChanges(changes) {
    const list = this.$('recent-changes');
    if (changes === null) {
      setChildren(list, h('li', { class: 'cm-muted', text: 'Rekod perubahan tidak dapat dimuatkan.' }));
    } else if (changes.length === 0) {
      setChildren(list, h('li', { class: 'cm-muted', text: 'Belum ada perubahan direkodkan.' }));
    } else {
      setChildren(list, ...changes.map((c) => this.changeItem(c, true)));
    }
  }

  backToEras() {
    this.era = null;
    this.type = null;
    this.setUrl(null, null);
    this.manageLearningContent();
  }

  /* ---------------------------------------------------------------------- */
  /* STEP 3-4: ONE ERA                                                      */
  /* ---------------------------------------------------------------------- */

  /** Teacher.viewEraContent() */
  async selectEra(eraID, type = 'narrative') {
    this.showView('loading');
    try {
      const data = await this.api(`/overview?eraID=${encodeURIComponent(eraID)}`);
      this.setCanEdit(data.canEdit);
      this.era = data.era;
      this.board = null;
      this.entityVoice = null;
      this.search = '';
      this.renderEraHeader();
      this.showView('era');
      this.$('cm-subtitle').textContent = 'Pilih jenis kandungan yang ingin diurus.';
      await this.selectContentType(type);
    } catch (err) {
      if (err.status === 401) return;
      this.showError('Kandungan era tidak dapat dimuatkan.', () => this.manageLearningContent(), 'Kembali ke Senarai Era', err);
    }
  }

  renderEraHeader() {
    const e = this.era;
    this.$('era-title').textContent = `Era ${e.eraID}: ${e.eraName}`;

    const info = STATUS[e.status] || STATUS.tidak_lengkap;
    const panel = this.$('readiness-panel');
    panel.className = `cm-readiness st-${e.status}`;

    const body = e.issues.length === 0
      ? h('p', { class: 'cm-ok-text', text: 'Semua syarat dipenuhi. Pelajar boleh bermain dan menamatkan era ini.' })
      : h('ul', { class: 'cm-issue-list' }, e.issues.map((i) =>
        h('li', { class: 'cm-issue' },
          chip(i.level === 'ralat' ? 'Ralat' : 'Amaran', i.level === 'ralat' ? 'bad' : 'warn'),
          h('span', { text: i.text }))));

    setChildren(panel, 
      h('div', { class: 'cm-readiness-head' },
        h('h3', { text: 'Kesediaan Era' }),
        chip(info.label, info.cls, info.icon)),
      e.issues.length ? h('p', { class: 'cm-muted', text: 'Ralat menghalang pelajar menamatkan era. Amaran masih boleh dimainkan tetapi disyorkan diperbaiki.' }) : null,
      body);
  }

  async refreshEra() {
    if (!this.era) return;
    try {
      const data = await this.api(`/overview?eraID=${this.era.eraID}`);
      this.era = data.era;
      this.renderEraHeader();
    } catch (err) {
      if (err.status !== 401) console.error('refreshEra failed:', err);
    }
  }

  renderTabs() {
    const tabs = CONTENT_TYPES.map((def) =>
      h('button', {
        type: 'button',
        role: 'tab',
        class: `cm-tab${this.type === def.type ? ' is-active' : ''}`,
        'aria-selected': this.type === def.type ? 'true' : 'false',
        onclick: () => this.selectContentType(def.type)
      },
      h('i', { class: `fas ${def.icon}` }),
      def.label,
      def.ready ? null : h('span', { class: 'cm-soon', text: 'Tidak lama lagi' })));
    setChildren(this.$('content-tabs'), ...tabs);
  }

  /** Step 6 - and A5 when the type is not supported. */
  async selectContentType(requested) {
    const type = TYPE_ALIASES[requested] || requested;
    const def = CONTENT_TYPES.find((t) => t.type === type);

    if (!def) {                                       // A5
      this.type = null;
      this.renderTabs();
      this.setUrl(this.era.eraID, null);
      setChildren(this.$('tab-content'), 
        h('div', { class: 'cm-notice' }, h('i', { class: 'fas fa-hand-pointer' }), 'Sila pilih jenis kandungan di atas.'));
      this.toast('Jenis kandungan tidak disokong. Sila pilih semula.', 'error');
      return;
    }

    this.type = def.type;
    this.renderTabs();
    this.setUrl(this.era.eraID, def.type);

    if (def.type === 'narrative') {
      if (!this.board) this.board = new StoryBoard(this);
      await this.board.open();
    } else if (def.type === 'questions') await this.loadQuestions();
    else if (def.type === 'entity') {
      if (!this.entityVoice) this.entityVoice = new EntityVoice(this);
      await this.entityVoice.open();
    } else await this.viewChanges();
  }

  loadingBox(text) {
    setChildren(this.$('tab-content'), 
      h('div', { class: 'cm-notice' }, h('i', { class: 'fas fa-circle-notch fa-spin' }), text));
  }

  /* ---------------------------------------------------------------------- */
  /* BANK SOALAN                                                            */
  /* ---------------------------------------------------------------------- */

  async loadQuestions() {
    this.loadingBox('Memuatkan soalan...');
    try {
      const data = await this.api(`/questions?eraID=${this.era.eraID}`);
      this.questions = data.questions;
      this.renderQuestions();
    } catch (err) {
      if (err.status === 401) return;
      this.showError('Senarai soalan tidak dapat dimuatkan.', () => this.manageLearningContent(), 'Kembali ke Senarai Era', err);
    }
  }

  renderQuestions() {
    const box = this.$('tab-content');
    const count = this.questions.length;

    const search = h('input', {
      type: 'search',
      class: 'cm-input cm-search',
      placeholder: 'Cari soalan...',
      'aria-label': 'Cari soalan',
      value: this.search,
      oninput: (e) => { this.search = e.target.value; this.renderQuestionList(); }
    });

    this.qListBox = h('div', { class: 'cm-q-list' });

    let banner = null;
    if (count === 0) banner = 'Bank soalan kosong. Tekan "Tambah Soalan" untuk bermula.';
    else if (count < 10) banner = `Penilaian menggunakan 10 soalan. Bank soalan ini baru ada ${count}.`;

    setChildren(box, 
      h('div', { class: 'cm-toolbar' },
        chip(`${count} soalan`, count >= 10 ? 'ok' : 'warn'),
        search,
        h('button', { type: 'button', class: 'cm-btn cm-btn-primary', onclick: () => this.openQuestionEditor(null) },
          h('i', { class: 'fas fa-plus' }), 'Tambah Soalan')),
      banner ? h('div', { class: 'cm-banner', text: banner }) : null,
      this.qListBox);

    this.renderQuestionList();
  }

  renderQuestionList() {
    const needle = this.search.trim().toLowerCase();
    const shown = needle
      ? this.questions.filter((q) => q.questionText.toLowerCase().includes(needle))
      : this.questions;

    if (shown.length === 0) {
      setChildren(this.qListBox, 
        h('div', { class: 'cm-empty', text: this.questions.length ? 'Tiada soalan sepadan dengan carian.' : 'Belum ada soalan.' }));
      return;
    }

    setChildren(this.qListBox, ...shown.map((q) => {
      const number = this.questions.indexOf(q) + 1;
      return h('article', { class: 'cm-q-item' },
        h('div', { class: 'cm-q-num', text: String(number) }),
        h('div', { class: 'cm-q-body' },
          h('div', { class: 'cm-q-text', text: q.questionText }),
          h('div', { class: 'cm-q-chips' },
            chip(`Jawapan: ${q.correctAnswer}`, 'ok'),
            chip(q.hint ? 'Ada petunjuk' : 'Tiada petunjuk', q.hint ? 'ok' : ''),
            chip(q.explanation ? 'Ada penerangan' : 'Tiada penerangan', q.explanation ? 'ok' : ''))),
        h('div', { class: 'cm-q-actions' },
          h('button', { type: 'button', class: 'cm-btn cm-btn-ghost cm-btn-sm', 'aria-label': `Edit soalan ${number}`, onclick: () => this.openQuestionEditor(q) },
            h('i', { class: 'fas fa-pen' }), 'Edit'),
          h('button', { type: 'button', class: 'cm-btn cm-btn-danger cm-btn-sm', 'aria-label': `Padam soalan ${number}`, onclick: () => this.removeQuestion(q) },
            h('i', { class: 'fas fa-trash' }), 'Padam')));
    }));
  }

  /* ----- editor ----- */

  isEditorOpen() { return !this.$('q-modal').classList.contains('is-hidden'); }

  readForm() {
    const form = {};
    FIELDS.forEach((f) => { form[f] = this.$(`f-${f}`).value; });
    form.correctAnswer = OPTION_KEYS.find((k) => this.$(`f-correct-${k}`).checked) || '';
    return form;
  }

  fillForm(q) {
    FIELDS.forEach((f) => { this.$(`f-${f}`).value = q && q[f] ? q[f] : ''; });
    OPTION_KEYS.forEach((k) => { this.$(`f-correct-${k}`).checked = Boolean(q) && q.correctAnswer === k; });
  }

  isDirty() { return this.snapshot !== null && JSON.stringify(this.readForm()) !== this.snapshot; }

  /** Step 8-9 */
  openQuestionEditor(question) {
    this.editing = question || null;
    this.$('q-modal-title').textContent = question ? 'Edit Soalan' : 'Tambah Soalan';
    this.fillForm(question);
    this.showFieldErrors({});
    this.setBanner('');
    this.setSaving(false);
    this.snapshot = JSON.stringify(this.readForm());
    this.renderPreview();
    this.$('q-modal').classList.remove('is-hidden');
    this.$('f-questionText').focus();
  }

  closeEditor() {
    this.$('q-modal').classList.add('is-hidden');
    this.editing = null;
    this.snapshot = null;
  }

  /** A4: discard unsaved changes (asking first when something was typed). */
  async cancelEditing() {
    if (this.saving) return;
    if (this.isDirty()) {
      const discard = await this.askConfirm({
        title: 'Buang perubahan?',
        text: 'Perubahan yang belum disimpan akan hilang.',
        confirmText: 'Buang',
        danger: true
      });
      if (!discard) return;
    }
    this.closeEditor();
  }

  setBanner(text) {
    const banner = this.$('q-form-banner');
    banner.textContent = text;
    banner.classList.toggle('is-hidden', !text);
  }

  setSaving(on) {
    this.saving = on;
    const btn = this.$('btn-q-save');
    btn.disabled = on;
    btn.textContent = on ? 'Menyimpan...' : 'Simpan Soalan';
  }

  showFieldErrors(errors) {   // errors: { ruangan: mesej }
    [...FIELDS, 'correctAnswer'].forEach((field) => {
      const span = this.$(`err-${field}`);
      span.textContent = errors[field] || '';
      const input = FIELDS.includes(field) ? this.$(`f-${field}`) : null;
      if (input) input.classList.toggle('has-error-input', Boolean(errors[field]));
    });
    const first = [...FIELDS, 'correctAnswer'].find((f) => errors[f]);
    if (first) {
      const target = first === 'correctAnswer' ? this.$('f-correct-A') : this.$(`f-${first}`);
      target.focus();
    }
  }

  onFormInput(e) {
    const id = e.target.id || '';
    const field = id.startsWith('f-correct-') ? 'correctAnswer' : id.replace(/^f-/, '');
    const span = this.$(`err-${field}`);
    if (span) span.textContent = '';
    if (FIELDS.includes(field)) this.$(`f-${field}`).classList.remove('has-error-input');
    this.setBanner('');
    this.renderPreview();
  }

  /** What the student will see. */
  renderPreview() {
    const f = this.readForm();
    const options = OPTION_KEYS.map((k) => {
      const text = f[`option${k}`].trim();
      return h('div', { class: `pv-option${f.correctAnswer === k ? ' is-correct' : ''}` },
        h('strong', { text: `${k}.` }),
        h('span', { class: text ? '' : 'pv-placeholder', text: text || `Pilihan ${k}` }));
    });

    setChildren(this.$('q-preview'), 
      h('h3', { class: `pv-title${f.questionText.trim() ? '' : ' pv-placeholder'}`, text: f.questionText.trim() || 'Teks soalan akan dipaparkan di sini' }),
      h('div', { class: 'pv-options' }, options),
      f.hint.trim() ? h('div', { class: 'pv-box pv-hint' }, h('i', { class: 'fas fa-lightbulb' }), ` ${f.hint.trim()}`) : null,
      f.explanation.trim() ? h('div', { class: 'pv-box pv-explain' }, h('strong', { text: 'Penerangan:' }), ` ${f.explanation.trim()}`) : null,
      h('p', { class: 'pv-note', text: 'Jawapan betul ditandakan hijau hanya dalam pratonton guru.' }));
  }

  /** QuestionBank.addQuestion() / editQuestion()  - steps 10-12, E1, E2 */
  async saveQuestion() {
    if (this.saving) return;

    const form = this.readForm();
    const errors = validateQuestion(form);                                     // step 10 / E1
    if (Object.keys(errors).length > 0) {
      this.showFieldErrors(errors);
      this.setBanner(summarizeErrors(errors));          // contoh: "2 ruangan perlu dibetulkan: Teks soalan (wajib diisi); Pilihan B (...)"
      return;
    }

    this.setBanner('');
    this.setSaving(true);
    const isEdit = Boolean(this.editing);

    try {
      const body = { ...form, eraID: this.era.eraID };
      if (isEdit) await this.api(`/questions/${this.editing.questionID}`, { method: 'PUT', body });
      else await this.api('/questions', { method: 'POST', body });             // step 11

      this.setSaving(false);
      this.closeEditor();
      this.toast(isEdit ? 'Soalan berjaya dikemas kini.' : 'Soalan berjaya ditambah.');   // step 12
      await Promise.all([this.loadQuestions(), this.refreshEra()]);
    } catch (err) {
      this.setSaving(false);
      if (err.status === 401) return;
      if (err.status === 422 && err.data.errors) {
        this.showFieldErrors(err.data.errors);
        this.setBanner(summarizeErrors(err.data.errors));
      } else {
        this.setBanner('Soalan tidak disimpan dan tiada perubahan dibuat. Lihat butiran ralat.');   // E2
        this.reportError(isEdit ? 'Mengemas kini soalan' : 'Menambah soalan', err,
          { where: `${this.where()} > Bank Soalan${isEdit ? ` > Soalan ${this.editing.questionID}` : ''}` });
      }
    }
  }

  /** QuestionBank.removeQuestion() */
  async removeQuestion(q) {
    const snippet = q.questionText.length > 90 ? `${q.questionText.slice(0, 89)}\u2026` : q.questionText;
    const ok = await this.askConfirm({
      title: 'Padam soalan?',
      text: `"${snippet}" akan dipadam daripada bank soalan. Tindakan ini tidak boleh dibatalkan.`,
      confirmText: 'Padam',
      danger: true
    });
    if (!ok) return;

    try {
      await this.api(`/questions/${q.questionID}`, { method: 'DELETE' });
      this.toast('Soalan berjaya dipadam.');
      await Promise.all([this.loadQuestions(), this.refreshEra()]);
    } catch (err) {
      if (err.status === 401) return;
      this.reportError('Memadam soalan', err, { where: `${this.where()} > Bank Soalan > Soalan ${q.questionID}` });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* REKOD PERUBAHAN                                                        */
  /* ---------------------------------------------------------------------- */

  /** ContentManager.viewChanges() for the selected era */
  async viewChanges() {
    this.loadingBox('Memuatkan rekod perubahan...');
    try {
      const data = await this.api(`/changes?eraID=${this.era.eraID}&limit=50`);
      const box = this.$('tab-content');

      if (data.changes.length === 0) {
        setChildren(box, h('div', { class: 'cm-notice' }, h('i', { class: 'fas fa-clock-rotate-left' }), 'Belum ada perubahan direkodkan untuk era ini.'));
        return;
      }
      setChildren(box, 
        h('p', { class: 'cm-muted', text: 'Semua guru berkongsi kandungan yang sama. Senarai ini menunjukkan siapa menambah atau mengubah apa.' }),
        h('ul', { class: 'cm-timeline' }, data.changes.map((c) => this.changeItem(c, false))));
    } catch (err) {
      if (err.status === 401) return;
      this.showError('Rekod perubahan tidak dapat dimuatkan.', () => this.manageLearningContent(), 'Kembali ke Senarai Era', err);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.contentApp = new ContentManagerEngine();
});