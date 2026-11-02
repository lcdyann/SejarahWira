/**
 * ============================================================================
 * contentEntity.js  -  tab "Suara Pendekar Bayang" (UC-10 Manage Learning Content)
 * Uses: h(), setChildren(), chip() (contentManagerEngine.js), uiButton() (contentUi.js).
 * Shares assets/js/game/entityLines.js with the game, so the categories, the markers and the
 * 255-character rule are the same here and in the game.
 *
 *   EntityVoice   the 20 moments Pendekar Bayang speaks. Nothing written = the built-in line
 *                 (shown greyed). A line can be set for ALL eras or for ONE era; this era's
 *                 lines win over the all-era lines.
 *   (Peranan pelajar: watak yang dimainkan pelajar dipilih pada kad "KAU KINI IALAH" dalam kotak
 *    Naratif, tab Naratif, Dialog & Quest, bukan di sini. Lihat contentBoard.js, rolePanel().)
 *
 * Database: nothing new. Lines are DialogueLine rows (see entityLines.js).
 * ============================================================================
 */

const SAMPLE = {
  nama: 'Aidan', taklimat: 'Bantu Tun Perak memilih strategi.', petunjuk: 'Fikir tentang perpaduan.',
  penerangan: 'Perpaduan rakyat memperkukuh pertahanan.', maklumbalas: 'Tepat sekali!', skor: '85%'
};

class EntityVoice {
  constructor(app) {
    this.app = app;
    this.mod = null;                 // entityLines.js (loaded once)
    this.scope = 'era';              // 'era' | 'all'
    this.rows = new Map();           // category code -> [{ line, text, saved }]
    this.inherited = new Map();      // category code -> [text]  (all-era lines shown while editing one era)
    this.lastArea = null;
  }

  get scopeEra() { return this.scope === 'all' ? 0 : this.app.era.eraID; }

  async open() {
    this.app.loadingBox('Memuatkan suara Pendekar Bayang...');
    try {
      if (!this.mod) this.mod = await import('./game/entityLines.js');
      await this.load();
    } catch (err) {
      if (err.status === 401) return;
      this.app.showError('Suara Pendekar Bayang tidak dapat dimuatkan.', () => this.app.manageLearningContent(), 'Kembali ke Senarai Era', err);
      return;
    }
    this.render();
  }

  async load() {
    const mine = await this.app.api(`/entity-lines?eraID=${this.scopeEra}`);
    const all = this.scope === 'era' ? await this.app.api('/entity-lines?eraID=0') : { lines: [] };
    this.rows = new Map();
    mine.lines.forEach((l) => {
      if (!this.rows.has(l.category)) this.rows.set(l.category, []);
      this.rows.get(l.category).push({ line: l.line, text: l.text, saved: true });
    });
    this.rows.forEach((list) => list.sort((a, b) => a.line - b.line));
    this.inherited = new Map();
    all.lines.forEach((l) => {
      if (!this.inherited.has(l.category)) this.inherited.set(l.category, []);
      this.inherited.get(l.category).push(l.text);
    });
  }

  /* ----------------------------------------------------------------- shell */
  render() {
    this.formCat = this.formCat || this.mod.CATEGORIES[0].code;
    this.formLine = null;              // null = a new line, number = changing a saved line
    this.formText = '';
    this.openCats = new Set([...this.rows.keys()]);

    this.scopeBox = h('div', { class: 'ev-scope' });
    this.formBox = h('div', { class: 'ev-new' });
    this.listBox = h('div', { class: 'ev-list' });

    setChildren(this.app.$('tab-content'),
      h('div', { class: 'ev-intro' },
        h('h3', {}, h('i', { class: 'fas fa-ghost' }), ' Suara Pendekar Bayang'),
        h('p', { class: 'cm-muted', text: 'Pendekar Bayang ialah penjaga kitab yang menarik jiwa pelajar ke dalam buku. Setiap kali dia bercakap ada ayat lalai. Tulis ayat sendiri di kiri untuk menggantikannya, dan lihat semua ayat di kanan. Ayat tidak melebihi 255 aksara dan tidak boleh mengandungi < atau >.' })),
      this.scopeBox,
      h('div', { class: 'ev-split' },
        h('section', { class: 'ev-col ev-col-new' }, this.formBox),
        h('section', { class: 'ev-col ev-col-list' },
          h('h4', { class: 'ev-col-title' }, h('i', { class: 'fas fa-list' }), ' Ayat yang sudah ada'),
          h('p', { class: 'cm-hint', text: 'Klik satu bahagian untuk membukanya. Ayat kelabu ialah ayat lalai permainan.' }),
          this.listBox)),
      this.host = h('div', { class: 'ev-host' }));
    this.renderScope();
    this.renderForm();
    this.renderList();
  }

  renderScope() {
    const btn = (id, label) => h('button', { type: 'button', class: `cm-tab${this.scope === id ? ' is-active' : ''}`, onclick: () => this.setScope(id) }, label);
    setChildren(this.scopeBox,
      h('span', { class: 'ev-scope-label', text: 'Ayat untuk:' }),
      btn('era', `Era ${this.app.era.eraID} sahaja`),
      btn('all', 'Semua era'));
  }

  async setScope(scope) {
    if (scope === this.scope) return;
    this.scope = scope;
    try { await this.load(); } catch (err) { if (err.status !== 401) this.app.reportError('Memuatkan ayat Pendekar Bayang', err); return; }
    this.formLine = null;
    this.openCats = new Set([...this.rows.keys()]);
    this.renderScope();
    this.renderForm();
    this.renderList();
  }

  /* ------------------------------------------------- left: write a new line */
  renderForm() {
    const { CATEGORIES, MARKERS, MAX_LINE, validateLineText, fillMarkers } = this.mod;
    const cat = CATEGORIES.find((c) => c.code === this.formCat);
    const changing = this.formLine !== null;

    const select = h('select', { class: 'cm-input', 'aria-label': 'Bila Pendekar Bayang bercakap' },
      CATEGORIES.map((c) => h('option', { value: String(c.code), text: `${c.label}  (${c.when})` })));
    select.value = String(cat.code);
    select.disabled = changing;
    select.addEventListener('change', () => {
      this.formText = area.value;
      this.formCat = Number(select.value);
      this.renderForm();
    });

    const area = h('textarea', { rows: 4, maxlength: String(MAX_LINE), class: 'ev-area', placeholder: 'Contoh: Selamat datang, {nama}!', 'aria-label': 'Ayat Pendekar Bayang' });
    area.value = this.formText;
    const count = h('span', { class: 'ev-count' });
    const err = h('span', { class: 'cm-error' });
    const preview = h('div', { class: 'ev-preview' });
    const saveBtn = uiButton(changing ? 'Simpan perubahan' : 'Simpan ayat', 'cm-btn-primary', () => save(), 'fa-floppy-disk');

    const update = () => {
      this.formText = area.value;
      count.textContent = `${area.value.length}/${MAX_LINE}`;
      count.classList.toggle('is-over', area.value.length > MAX_LINE);
      const check = validateLineText(area.value);
      err.textContent = area.value.trim() && !check.ok ? check.message : '';
      preview.textContent = check.ok ? `Begini bunyinya: ${fillMarkers(check.text, { ...SAMPLE, era: this.app.era.eraName }, cat.content)}` : '';
      saveBtn.disabled = !check.ok;
    };
    area.addEventListener('input', update);

    const markerBtn = (key, label) => h('button', {
      type: 'button',
      class: `ev-marker${cat.content === key ? ' is-suggested' : ''}`,
      title: `Masukkan ${label.toLowerCase()} di tempat kursor`,
      onclick: () => this.insertMarker(area, key)
    }, h('b', { text: label }), h('small', { text: cat.content === key ? 'sesuai di sini' : `{${key}}` }));

    const save = async () => {
      const check = validateLineText(area.value);
      if (!check.ok) { err.textContent = check.message; return; }
      let line = this.formLine;
      const list = this.rows.get(cat.code) || [];
      if (line === null) {
        const used = new Set(list.map((r) => r.line));
        line = 1; while (used.has(line)) line += 1;
        if (line > 9) { err.textContent = 'Maksimum 9 ayat bagi satu saat. Padam satu ayat dahulu.'; return; }
      }
      saveBtn.disabled = true;
      try {
        await this.app.api('/entity-lines', { method: 'PUT', body: { eraID: this.scopeEra, category: cat.code, line, text: check.text } });
        const found = list.find((r) => r.line === line);
        if (found) { found.text = check.text; found.saved = true; } else list.push({ line, text: check.text, saved: true });
        list.sort((a, b) => a.line - b.line);
        this.rows.set(cat.code, list);
        this.openCats.add(cat.code);
        this.formLine = null; this.formText = '';
        this.app.toast('Ayat Pendekar Bayang disimpan.');
        this.renderForm();
        this.renderList();
      } catch (e) {
        if (e.status !== 401) { err.textContent = (e.data && e.data.message) || 'Ayat tidak dapat disimpan.'; this.app.reportError('Menyimpan ayat Pendekar Bayang', e, { where: `${this.app.where()} > Suara Pendekar Bayang > ${cat.label || cat.code} > Ayat ${line}` }); }
        saveBtn.disabled = false;
      }
    };

    const hint = cat.ordered
      ? 'Ayat-ayat di bahagian ini dimainkan mengikut turutan nombor.'
      : 'Jika ada lebih daripada satu ayat, salah satu dipilih secara rawak.';

    setChildren(this.formBox,
      h('h4', { class: 'ev-col-title' }, h('i', { class: 'fas fa-plus' }), changing ? ` Ubah Ayat ${this.formLine}` : ' Tambah ayat baharu'),

      h('div', { class: 'ev-step' },
        h('div', { class: 'ev-step-title' }, h('span', { class: 'ev-step-no', text: '1' }), 'Bila Pendekar Bayang bercakap?'),
        select,
        h('p', { class: 'cm-hint', text: hint })),

      h('div', { class: 'ev-step' },
        h('div', { class: 'ev-step-title' }, h('span', { class: 'ev-step-no', text: '2' }), 'Tulis ayatnya'),
        area,
        h('div', { class: 'ev-row-head' }, count)),

      h('div', { class: 'ev-step' },
        h('div', { class: 'ev-step-title' }, h('span', { class: 'ev-step-no', text: '3' }), 'Mahu masukkan nama atau maklumat? (pilihan)'),
        h('p', { class: 'cm-hint', text: 'Klik satu butang. Permainan menggantikannya dengan maklumat sebenar, contohnya {nama} menjadi nama pelajar.' }),
        h('div', { class: 'ev-palette' }, Object.entries(MARKERS).map(([key, label]) => markerBtn(key, label))),
        cat.content ? h('p', { class: 'cm-hint', text: `Jika {${cat.content}} tidak ditulis, kandungannya ditambah pada baris baharu supaya tidak tersembunyi.` }) : null),

      h('div', { class: 'ev-step' },
        h('div', { class: 'ev-step-title' }, h('span', { class: 'ev-step-no', text: '4' }), 'Semak dan simpan'),
        preview, err,
        h('div', { class: 'ev-row-btns' },
          changing || this.formText ? uiButton(changing ? 'Batal' : 'Kosongkan', 'cm-btn-ghost', () => { this.formLine = null; this.formText = ''; this.renderForm(); this.renderList(); }, 'fa-xmark') : null,
          saveBtn)));
    update();
  }

  insertMarker(area, key) {
    const token = `{${key}}`;
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? start;
    area.value = area.value.slice(0, start) + token + area.value.slice(end);
    area.focus();
    area.selectionStart = area.selectionEnd = start + token.length;
    area.dispatchEvent(new Event('input'));
  }

  /* ----------------------------------------------- right: lines that exist */
  renderList() {
    setChildren(this.listBox, this.mod.CATEGORIES.map((c) => this.categoryCard(c)));
  }

  statusChip(cat) {
    const mine = this.rows.get(cat.code) || [];
    const inherited = this.inherited.get(cat.code) || [];
    if (mine.length) return chip(`${mine.length} ayat ${this.scope === 'all' ? '(semua era)' : `(era ${this.app.era.eraID})`}`, 'ok', 'fa-pen');
    if (inherited.length) return chip(`${inherited.length} ayat semua era`, 'warn', 'fa-globe');
    return chip('Lalai', '', 'fa-lock');
  }

  categoryCard(cat) {
    const mine = this.rows.get(cat.code) || [];
    const inherited = this.inherited.get(cat.code) || [];
    const details = h('details', { class: 'ev-cat' },
      h('summary', {},
        h('b', { text: cat.label }),
        h('span', { class: 'cm-muted ev-when', text: cat.when }),
        this.statusChip(cat)));
    details.open = this.openCats.has(cat.code);
    details.addEventListener('toggle', () => { if (details.open) this.openCats.add(cat.code); else this.openCats.delete(cat.code); });

    const body = h('div', { class: 'ev-body' });
    if (mine.length) {
      mine.forEach((r) => body.appendChild(this.lineRow(cat, r)));
      body.appendChild(h('div', { class: 'ev-actions' },
        uiButton('Tambah ayat di sini', 'cm-btn-ghost', () => this.startNew(cat, ''), 'fa-plus'),
        uiButton(this.scope === 'all' ? 'Guna lalai semula' : 'Guna ayat semua era / lalai', 'cm-btn-ghost', () => this.resetCategory(cat, mine), 'fa-rotate-left')));
    } else {
      const source = inherited.length ? inherited : cat.defaults;
      body.appendChild(h('span', { class: 'cm-muted', text: inherited.length ? 'Ayat semua era (dipakai sekarang):' : 'Ayat lalai (dipakai sekarang):' }));
      source.forEach((t) => body.appendChild(h('div', { class: 'ev-line is-default' },
        h('p', { class: 'ev-line-text', text: t }),
        h('div', { class: 'ev-line-btns' }, uiButton('Ubah suai', 'cm-btn-ghost', () => this.startNew(cat, t), 'fa-pen')))));
      body.appendChild(h('div', { class: 'ev-actions' }, uiButton('Tulis ayat sendiri', 'cm-btn-primary', () => this.startNew(cat, ''), 'fa-plus')));
    }
    details.appendChild(body);
    return details;
  }

  lineRow(cat, row) {
    const editing = this.formCat === cat.code && this.formLine === row.line;
    return h('div', { class: `ev-line${editing ? ' is-editing' : ''}` },
      h('span', { class: 'ev-line-no', text: String(row.line) }),
      h('p', { class: 'ev-line-text', text: row.text }),
      h('div', { class: 'ev-line-btns' },
        uiButton('Ubah', 'cm-btn-ghost', () => { this.formCat = cat.code; this.formLine = row.line; this.formText = row.text; this.focusForm(); }, 'fa-pen'),
        uiButton('Padam', 'cm-btn-ghost', () => this.removeLine(cat, row), 'fa-trash')));
  }

  /** put a category + starting text into the left side and move the cursor there */
  startNew(cat, text) {
    this.formCat = cat.code; this.formLine = null; this.formText = text;
    this.focusForm();
  }

  focusForm() {
    this.renderForm();
    this.renderList();
    const area = this.formBox.querySelector('textarea');
    this.formBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (area) area.focus();
  }

  async removeLine(cat, row) {
    try {
      if (row.saved) await this.app.api(`/entity-lines?eraID=${this.scopeEra}&category=${cat.code}&line=${row.line}`, { method: 'DELETE' });
      const list = (this.rows.get(cat.code) || []).filter((r) => r !== row);
      if (list.length) this.rows.set(cat.code, list); else this.rows.delete(cat.code);
      if (this.formCat === cat.code && this.formLine === row.line) { this.formLine = null; this.formText = ''; this.renderForm(); }
      this.renderList();
      this.app.toast('Ayat dipadam.');
    } catch (e) { if (e.status !== 401) this.app.reportError('Memadam ayat Pendekar Bayang', e, { where: `${this.app.where()} > Suara Pendekar Bayang > ${cat.label || cat.code}` }); }
  }

  async resetCategory(cat, mine) {
    const ok = await this.app.askConfirm({ title: 'Guna ayat lalai?', text: 'Semua ayat yang ditulis untuk bahagian ini akan dipadam dan ayat lalai digunakan semula.', confirmText: 'Guna lalai', danger: true });
    if (!ok) return;
    try {
      for (const r of mine.filter((x) => x.saved)) {
        await this.app.api(`/entity-lines?eraID=${this.scopeEra}&category=${cat.code}&line=${r.line}`, { method: 'DELETE' });
      }
      this.rows.delete(cat.code);
      if (this.formCat === cat.code) { this.formLine = null; this.renderForm(); }
      this.app.toast('Ayat lalai digunakan semula.');
      this.renderList();
    } catch (err) { if (err.status !== 401) this.app.reportError('Menetapkan semula ayat lalai', err, { where: `${this.app.where()} > Suara Pendekar Bayang > ${cat.label || cat.code}` }); }
  }
}
