/**
 * ============================================================================
 * contentUi.js  -  shared building blocks for the narrative / dialogue / quest editors
 * Loaded after contentManagerEngine.js (uses its h(), setChildren(), chip()).
 *
 *   Dialog      a modal window. Closing it (X, Batal button or Esc) asks first when
 *               something was typed and not saved yet (use-case A4: cancel discards changes).
 *   formField() label + control + hint + error line
 *   uiButton()  consistent buttons
 *   thumb()     image that hides itself when the file is missing
 *   Dialog.setSummary()   senarai "ruangan yang perlu dibetulkan" di atas borang
 *   describeError()       menerangkan ralat API: apa yang berlaku, punca, butiran setiap ruangan
 *   reportApiError()      panel ralat yang kekal sehingga ditutup (bukan toast yang hilang sendiri)
 * Nothing here uses innerHTML.
 * ============================================================================
 */

let uidCounter = 0;
const uid = (prefix = 'ctl') => `${prefix}-${++uidCounter}`;

const errSpan = () => h('span', { class: 'cm-error' });
const setErr = (el, message) => { el.textContent = message || ''; };

function formField(label, control, { required = false, optional = false, hint = '', error = null } = {}) {
  if (!control.id) control.id = uid();
  return h('div', { class: 'cm-field' },
    h('label', { for: control.id },
      label,
      required ? h('span', { class: 'cm-req', text: ' *' }) : null,
      optional ? h('span', { class: 'cm-opt', text: ' (pilihan)' }) : null),
    control,
    hint ? h('span', { class: 'cm-hint', text: hint }) : null,
    error);
}

function uiButton(label, cls, onclick, icon = null, attrs = {}) {
  return h('button', { type: 'button', class: `cm-btn ${cls}`.trim(), onclick, ...attrs },
    icon ? h('i', { class: `fas ${icon}` }) : null,
    label);
}

/** <img> that marks itself broken (instead of showing an ugly icon) when the file is missing. */
function thumb(url, alt, cls = '') {
  return h('img', {
    src: url,
    alt: alt || '',
    class: `cm-thumb ${cls}`.trim(),
    onerror: (e) => e.target.classList.add('is-broken')
  });
}

class Dialog {
  /**
   * @param {object}   o
   * @param {string}   o.title
   * @param {string}   [o.size]     'wide' | 'small'
   * @param {Function} [o.isDirty]  returns true when there is unsaved work
   * @param {object}   o.app        the ContentManagerEngine (for the confirmation question)
   */
  constructor({ title, size = 'wide', isDirty = null, app }) {
    this.app = app;
    this.isDirty = isDirty;
    this.busy = false;
    this.onClose = null;

    this.titleEl = h('h3', { text: title });
    this.bodyEl = h('div', { class: 'cm-dlg-body' });
    this.footerEl = h('div', { class: 'cm-modal-actions' });
    this.closeBtn = h('button', {
      type: 'button', class: 'cm-icon-btn', 'aria-label': 'Tutup', onclick: () => this.requestClose()
    }, h('i', { class: 'fas fa-times' }));

    // Butang besarkan <-->  (hanya untuk dialog lebar, contohnya Edit Quest). Pilihan diingati sepanjang sesi.
    this.expandIcon = h('i', { class: 'fas fa-up-right-and-down-left-from-center' });
    this.expandBtn = size === 'wide'
      ? h('button', { type: 'button', class: 'cm-icon-btn cm-expand-btn', onclick: () => this.setMaximized(!this.maximized) }, this.expandIcon)
      : null;

    this.card = h('div', { class: `cm-modal-card cm-modal-${size}` },
      h('header', { class: 'cm-modal-head' }, this.titleEl,
        h('div', { class: 'cm-modal-head-btns' }, this.expandBtn, this.closeBtn)),
      this.bodyEl,
      this.footerEl);
    this.overlay = h('div', { class: 'cm-overlay', role: 'dialog', 'aria-modal': 'true' }, this.card);

    document.body.appendChild(this.overlay);
    Dialog.stack.push(this);
    this.maximized = false;
    this.setMaximized(Boolean(Dialog.preferMax));
  }

  /** Besarkan / kecilkan dialog (hampir memenuhi skrin) */
  setMaximized(on) {
    if (!this.expandBtn) return;
    this.maximized = on;
    Dialog.preferMax = on;
    this.card.classList.toggle('is-max', on);
    this.expandIcon.className = `fas ${on ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'}`;
    const label = on ? 'Kecilkan skrin' : 'Besarkan skrin';
    this.expandBtn.title = label;
    this.expandBtn.setAttribute('aria-label', label);
  }

  setTitle(text) { this.titleEl.textContent = text; }
  setBody(...nodes) { setChildren(this.bodyEl, ...nodes); }
  setFooter(...nodes) { setChildren(this.footerEl, ...nodes); }

  /** Disables the close paths and the footer while a save is running. */
  setBusy(on) {
    this.busy = on;
    this.footerEl.classList.toggle('is-busy', on);
  }

  /** X / Batal / Esc: asks first when there is unsaved work. Returns true when it closed. */
  async requestClose() {
    if (this.busy) return false;
    if (this.isDirty && this.isDirty()) {
      const discard = await this.app.askConfirm({
        title: 'Buang perubahan?',
        text: 'Perubahan yang belum disimpan akan hilang.',
        confirmText: 'Buang',
        danger: true
      });
      if (!discard) return false;
    }
    this.close();
    return true;
  }

  close() {
    if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    Dialog.stack = Dialog.stack.filter((d) => d !== this);
    if (typeof this.onClose === 'function') this.onClose();
  }
}
Dialog.stack = [];

/* ========================================================================== */
/* RALAT YANG JELAS: bahagian mana, ruangan mana, ralat apa                    */
/* ========================================================================== */

/** Nama ruangan dalam bahasa mudah. Kunci = nama ruangan yang dihantar oleh pelayan. */
const FIELD_LABELS = {
  questionText: 'Teks soalan', optionA: 'Pilihan A', optionB: 'Pilihan B', optionC: 'Pilihan C', optionD: 'Pilihan D',
  correctAnswer: 'Jawapan betul', hint: 'Petunjuk', explanation: 'Penerangan jawapan',
  narrativeTitle: 'Tajuk naratif', summary: 'Ringkasan naratif',
  sceneStoryline: 'Kad garis masa babak', asset: 'Gambar latar',
  questName: 'Nama quest', instruction: 'Arahan quest', description: 'Objektif quest', questType: 'Jenis quest',
  name: 'Nama', biography: 'Biografi', contribution: 'Sumbangan', displayName: 'Nama gambar',
  npcID: 'Watak', lines: 'Dialog', text: 'Teks', password: 'Kata laluan', username: 'Nama pengguna'
};

/** { ruangan: mesej } -> [{ label, message }]  (kunci nombor = baris dialog / senarai) */
function errorItems(errors, labels = {}) {
  return Object.entries(errors || {}).map(([key, message]) => {
    const isRow = /^\d+$/.test(key);
    const label = labels[key] || FIELD_LABELS[key] || (isRow ? `Baris ${Number(key) + 1}` : key);
    return { label, message: String(message) };
  });
}

/** Ayat ringkas untuk sepanduk: "2 ruangan perlu dibetulkan: Teks soalan (wajib diisi.); Pilihan B (...)" */
function summarizeErrors(errors, labels = {}) {
  const items = errorItems(errors, labels);
  if (!items.length) return '';
  return `${items.length} ruangan perlu dibetulkan: ${items.map((i) => `${i.label} (${i.message.replace(/\.$/, '')})`).join('; ')}.`;
}

/** Senarai di bahagian atas dialog; items kosong = sembunyikan. Menatal ke atas supaya kelihatan. */
Dialog.prototype.setSummary = function setSummary(items, title = null) {
  if (!this.summaryEl) this.summaryEl = h('div', { class: 'cm-summary is-hidden', role: 'alert' });
  // setBody() boleh membuang kotak ini; pasang semula di bahagian atas jika perlu
  if (this.summaryEl.parentNode !== this.bodyEl) this.bodyEl.insertBefore(this.summaryEl, this.bodyEl.firstChild);
  if (!items || !items.length) { this.summaryEl.classList.add('is-hidden'); return; }
  setChildren(this.summaryEl,
    h('strong', { text: title || `${items.length} perkara perlu dibetulkan sebelum menyimpan:` }),
    h('ul', {}, items.map((i) => h('li', {}, h('b', { text: `${i.label}: ` }), i.message))));
  this.summaryEl.classList.remove('is-hidden');
  this.bodyEl.scrollTop = 0;
  if (this.summaryEl.scrollIntoView) this.summaryEl.scrollIntoView({ block: 'nearest' });
};

/** Maksud kod HTTP dan apa yang perlu dibuat. */
const HTTP_HELP = {
  0: ['Tidak dapat menghubungi pelayan.', 'Semak sambungan internet. Jika anda menjalankan sendiri, pastikan pelayan (npm start) sedang hidup.'],
  400: ['Pelayan menolak data yang dihantar.', 'Semak ruangan yang disenaraikan, kemudian cuba lagi.'],
  401: ['Sesi anda sudah tamat.', 'Log masuk semula.'],
  403: ['Anda tiada kebenaran untuk tindakan ini.', 'Hanya admin boleh mengubah kandungan pembelajaran. Guru lain hanya boleh melihat dan menekan Main.'],
  404: ['Rekod tidak dijumpai.', 'Ia mungkin sudah dipadam oleh guru lain. Muat semula halaman.'],
  409: ['Tindakan ini bercanggah dengan data sedia ada.', 'Baca butiran di bawah, selesaikan masalah itu, kemudian cuba lagi.'],
  413: ['Data atau fail terlalu besar.', 'Gunakan fail yang lebih kecil (maksimum 2 MB bagi gambar).'],
  422: ['Ada ruangan yang tidak memenuhi syarat.', 'Betulkan ruangan yang disenaraikan.'],
  429: ['Terlalu banyak permintaan dalam masa singkat.', 'Tunggu beberapa minit, kemudian cuba lagi.'],
  500: ['Ralat di pelayan.', 'Tiada perubahan dibuat. Cuba lagi; jika berulang, beritahu admin dan nyatakan kod ralat di bawah.'],
  503: ['Pelayan atau pangkalan data tidak dapat dicapai buat masa ini.', 'Tunggu sebentar dan cuba lagi.']
};

/** Menerangkan ralat API sebagai { headline, reason, hint, items[], code } */
function describeError(err, labels = {}) {
  const data = (err && err.data) || {};
  const status = (err && typeof err.status === 'number') ? err.status : 0;
  const help = HTTP_HELP[status] || HTTP_HELP[status >= 500 ? 500 : 400] || ['Ralat tidak dikenali.', 'Cuba lagi.'];
  const items = errorItems(data.errors, labels);
  (data.contentErrors || []).forEach((m) => items.push({ label: 'Kandungan quest', message: String(m) }));
  if (data.field && !items.length) items.push({ label: labels[data.field] || FIELD_LABELS[data.field] || data.field, message: data.message || 'Tidak sah.' });
  return {
    headline: data.message || (err && err.message) || help[0],
    reason: data.detail || help[0],
    hint: help[1],
    items,
    code: [data.code, status ? `HTTP ${status}` : 'Tiada jawapan'].filter(Boolean).join(' / ')
  };
}

/**
 * Panel ralat yang KEKAL sehingga guru menekan Faham (toast lama hilang dalam 3.6 saat).
 * @param {object} app      ContentManagerEngine
 * @param {string} action   apa yang cuba dibuat, contoh: 'Menyimpan babak'
 * @param {object} err      ApiError
 * @param {object} [o]      { where: 'Era 3 > Naratif "X" > Babak 2', labels: {ruangan: nama} }
 */
function reportApiError(app, action, err, { where = '', labels = {} } = {}) {
  if (err && err.status === 401) return;                      // sesi tamat sudah ada skrin sendiri
  const d = describeError(err, labels);
  const dlg = new Dialog({ title: `${action} tidak berjaya`, size: 'small', app });
  dlg.card.classList.add('cm-errreport');

  // teks biasa untuk disalin dan dihantar kepada admin
  const plain = [
    `Tindakan: ${action}`, where ? `Bahagian: ${where}` : null, `Masalah: ${d.headline}`,
    d.reason !== d.headline ? `Punca: ${d.reason}` : null,
    ...d.items.map((i) => `- ${i.label}: ${i.message}`), `Kod ralat: ${d.code}`, `Masa: ${new Date().toLocaleString('ms-MY')}`
  ].filter(Boolean).join('\n');

  const row = (title, ...content) => h('div', { class: 'cm-err-row' }, h('strong', { text: title }), ...content);
  dlg.setBody(
    row('Apa yang berlaku', h('p', { text: d.headline })),
    d.reason !== d.headline ? row('Puncanya', h('p', { text: d.reason })) : null,
    where ? row('Di bahagian mana', h('p', { text: where })) : null,
    d.items.length ? row(`Butiran (${d.items.length})`, h('ul', {}, d.items.map((i) => h('li', {}, h('b', { text: `${i.label}: ` }), i.message)))) : null,
    row('Apa yang perlu dibuat', h('p', { text: d.hint })),
    h('p', { class: 'cm-err-code', text: `Kod ralat: ${d.code}` }));
  dlg.setFooter(
    uiButton('Salin butiran', 'cm-btn-ghost', async (e) => {
      try { await navigator.clipboard.writeText(plain); e.target.textContent = 'Disalin'; } catch { e.target.textContent = 'Tidak dapat menyalin'; }
    }, 'fa-copy'),
    uiButton('Faham', 'cm-btn-primary', () => dlg.close()));
}
