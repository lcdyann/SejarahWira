/**
 * ============================================================================
 * contentQuest.js  -  quest editor (UC-10 A3)
 * Uses: h(), setChildren(), chip()  (contentManagerEngine.js), Dialog, formField... (contentUi.js),
 *       Library (contentLibrary.js) and QuestRules (questRules.js, the SAME rules as the server).
 *
 * The teacher picks one of the five mechanics students can play, fills a small guided form
 * (no JSON, no file paths) and sees a live preview of what the student will see.
 *
 *   QuestEditor.open({ scene, quest })   create or edit a quest of a scene
 *   QuestEditor.preview(quest)           read-only preview of an existing quest
 *   QuestPreview                         the preview itself: the real game mechanic in an iframe
 * ============================================================================
 */

const DEFAULT_QUEST_BG = '../assets/gameAsset/background/sb_03.jpg';   // what quest_game.html uses when no image is set
const QUEST_BG_DIR = '../assets/gameAsset/background/';

/* ------------------------------------------------------------------------ */
/* PREVIEW (approximate: same content, simplified look)                     */
/* ------------------------------------------------------------------------ */

function pctOf(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

function hotspotArea(bgImage, hotspots, { onClick = null, activeIndex = -1, big = false } = {}) {
  const area = h('div', { class: `qp-hotspot-area${onClick ? ' is-clickable' : ''}${big ? ' is-big' : ''}` },
    thumb(bgImage || DEFAULT_QUEST_BG, 'Gambar latar misi', 'qp-hotspot-img'),
    hotspots.map((p, i) => h('span', {
      class: `qp-dot${i === activeIndex ? ' is-active' : ''}`,
      style: `top:${pctOf(p.top)}%;left:${pctOf(p.left)}%`,
      title: p.name || `Titik ${i + 1}`
    }, String(i + 1))));
  if (onClick) area.addEventListener('click', onClick);
  return area;
}

/**
 * The preview is the REAL game: teacher/quest_preview.html runs the same quest mechanic and the same
 * stylesheet as the student's game inside an iframe, so the teacher plays exactly what the student plays.
 * It only appears once the form is complete (the same rules as saving). Nothing is saved from it.
 */
class QuestPreview {
  constructor() {
    this.ready = false;
    this.pending = null;
    this.lastSent = '';
    this.timer = null;
    this.frame = h('iframe', { class: 'qp-frame', src: 'quest_preview.html', title: 'Pratonton misi seperti yang dilihat pelajar' });
    this.missing = h('div', { class: 'qp-missing is-hidden', role: 'status' });
    this.wrap = h('div', { class: 'qp-frame-wrap' }, this.frame);
    this.el = h('div', { class: 'qp-live' }, this.missing, this.wrap,
      h('p', { class: 'qp-note', text: 'Ini permainan sebenar yang dimainkan pelajar. Cuba mainkannya sendiri. Tiada apa-apa disimpan.' }));
    this.onMessage = (e) => {
      if (e.source !== this.frame.contentWindow) return;
      if (e.data && e.data.type === 'quest-preview-ready') { this.ready = true; this.flush(); }
    };
    window.addEventListener('message', this.onMessage);
  }

  destroy() {
    window.removeEventListener('message', this.onMessage);
    clearTimeout(this.timer);
  }

  /** @param data {{questName, questType, form, background}} */
  update(data) {
    const type = Number(data.questType);
    const note = (title, items = []) => {
      setChildren(this.missing, h('strong', { text: title }), items.length ? h('ul', {}, items.slice(0, 4).map((m) => h('li', { text: m }))) : null);
      this.missing.classList.remove('is-hidden');
      this.wrap.classList.add('is-waiting');
    };
    if (!QuestRules.TYPES[type]) { note('Pilih jenis misi untuk melihat pratonton.'); return; }
    const form = data.form || {};
    const errors = QuestRules.validateContent(type, form).filter((m) => !/^Giliran Anda/.test(m) && !/: mengapa peristiwa/.test(m));   // turns and the "mengapa" lines do not stop the game from running
    if (errors.length) { note('Pratonton muncul apabila borang lengkap. Masih perlu:', errors); return; }

    this.missing.classList.add('is-hidden');
    this.wrap.classList.remove('is-waiting');
    const content = QuestRules.toStored(type, { ...form, turns: [] });
    this.pending = { type: 'quest-preview', quest: { questName: String(data.questName || '').trim() || 'Misi', questType: type, content }, background: data.background || null };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    if (!this.ready || !this.pending || !this.frame.contentWindow) return;
    const key = JSON.stringify(this.pending);
    if (key === this.lastSent) { this.pending = null; return; }     // nothing changed: do not restart the game
    this.lastSent = key;
    this.frame.contentWindow.postMessage(this.pending, window.location.origin);
    this.pending = null;
  }
}

/* ------------------------------------------------------------------------ */
/* EDITOR                                                                   */
/* ------------------------------------------------------------------------ */

class QuestEditor {
  constructor(app, library) {
    this.app = app;
    this.library = library;
  }

  /** Read-only look at an existing quest. */
  preview(quest) {
    const dlg = new Dialog({ title: 'Pratonton Misi', size: 'wide', app: this.app });
    const preview = new QuestPreview();
    dlg.onClose = () => preview.destroy();
    dlg.setBody(preview.el);
    preview.update({ ...quest, form: quest.form });
    dlg.setFooter(uiButton('Tutup', 'cm-btn-ghost', () => dlg.close()));
  }

  /** @returns {Promise<boolean>} true when something was saved or deleted */
  open({ scene, quest = null }) {
    return new Promise((resolve) => {
      let changed = false;
      const forms = {};
      [1, 2, 3, 4, 5].forEach((t) => { forms[t] = QuestRules.defaultForm(t); });
      if (quest) forms[quest.questType] = JSON.parse(JSON.stringify(quest.form));
      // "Giliran Anda" moments belong to the story, not to the mechanic: keep them when the type changes
      let carriedAftermath = quest && quest.form && typeof quest.form.aftermath === 'string' ? quest.form.aftermath : '';
      const carriedTurns = quest && quest.form && Array.isArray(quest.form.turns) ? JSON.parse(JSON.stringify(quest.form.turns)) : [];

      const state = {
        questName: quest ? quest.questName : '',
        description: quest ? quest.description : '',
        instruction: quest ? quest.instruction : '',
        questType: quest ? quest.questType : 0,
        hint: quest ? quest.hint : '',
        explanation: quest ? quest.explanation : '',
        feedback: quest ? quest.feedback : ''
      };
      const snap = () => JSON.stringify({ ...state, form: forms[state.questType] || null, all: forms });
      let snapshot = snap();
      let moveIndex = null;                       // hotspot waiting to be moved by the next click on the image

      const dlg = new Dialog({
        title: quest ? 'Edit Misi' : `Tambah Misi (Babak ${scene.order})`,
        size: 'wide',
        isDirty: () => snap() !== snapshot,
        app: this.app
      });
      dlg.onClose = () => { preview.destroy(); resolve(changed); };

      const previewHost = h('div', { class: 'qe-preview-host' });
      const typePanel = h('div', { class: 'qe-type-panel' });
      const errorBox = h('div', { class: 'qe-errors is-hidden', role: 'alert' });
      const fieldErr = { questName: errSpan(), description: errSpan(), instruction: errSpan(), questType: errSpan(), hint: errSpan(), explanation: errSpan(), feedback: errSpan() };

      const preview = new QuestPreview();
      previewHost.appendChild(preview.el);
      const refreshPreview = () => preview.update({ ...state, form: { ...forms[state.questType], aftermath: carriedAftermath }, background: scene.assetUrl || null });
      const touch = () => { refreshPreview(); };

      /* ----- small builders ----- */
      const textInput = (get, set, { max = 200, placeholder = '' } = {}) => {
        const el = h('input', { type: 'text', maxlength: String(max), placeholder, value: get(), oninput: (e) => { set(e.target.value); touch(); } });
        return el;
      };
      const areaInput = (get, set, { max = 2000, rows = 3, placeholder = '' } = {}) => {
        const el = h('textarea', { rows: String(rows), maxlength: String(max), placeholder, oninput: (e) => { set(e.target.value); touch(); } });
        el.value = get();
        return el;
      };
      const rowButtons = (list, i, rerender, minLen) => [
        h('button', { type: 'button', class: 'cm-icon-btn', 'aria-label': 'Naik', disabled: i === 0 ? '' : null, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; rerender(); touch(); } }, h('i', { class: 'fas fa-arrow-up' })),
        h('button', { type: 'button', class: 'cm-icon-btn', 'aria-label': 'Turun', disabled: i === list.length - 1 ? '' : null, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; rerender(); touch(); } }, h('i', { class: 'fas fa-arrow-down' })),
        h('button', { type: 'button', class: 'cm-icon-btn is-danger', 'aria-label': 'Buang', disabled: list.length <= minLen ? '' : null, onclick: () => { list.splice(i, 1); rerender(); touch(); } }, h('i', { class: 'fas fa-trash' }))
      ];

      /* ----- type panels ----- */
      const panelTimeline = () => {
        const f = forms[1];
        const rows = h('div', { class: 'qe-rows' });
        const render = () => {
          setChildren(rows, f.items.map((it, i) => h('div', { class: 'qe-tl-item' },
            h('div', { class: 'qe-row' },
              h('span', { class: 'qe-num', text: String(i + 1) }),
              textInput(() => it.year, (v) => { it.year = v; }, { max: 40, placeholder: 'Tarikh, cth: 16 Sept 1963' }),
              textInput(() => it.text, (v) => { it.text = v; }, { max: 200, placeholder: 'Peristiwa (jangan taip tarikh di sini)' }),
              rowButtons(f.items, i, render, QuestRules.LIMITS.timeline[0])),
            h('div', { class: 'qe-row qe-why' },
              h('i', { class: 'fas fa-link', title: 'Pautan sebab dan akibat' }),
              textInput(() => it.why, (v) => { it.why = v; }, { max: QuestRules.LIMITS.why,
                placeholder: i === 0 ? 'Mengapa cerita bermula di sini (pilihan)' : `Mengapa peristiwa ${i + 1} berlaku selepas peristiwa ${i}? (wajib)` })))));
        };
        render();
        return [
          h('p', { class: 'cm-hint', text: 'Taip peristiwa mengikut urutan yang BETUL (paling awal di atas). Tarikh DISEMBUNYIKAN daripada pelajar: mereka menyusun berdasarkan apa yang berlaku, satu pautan demi satu pautan. Tarikh dicap pada kad apabila ia diletakkan dengan betul.' }),
          h('p', { class: 'cm-hint', text: 'Baris "mengapa" ialah sebab peristiwa ini berlaku selepas peristiwa sebelumnya. Ia dipaparkan apabila pelajar meletakkan kad dengan betul, jadi tulis sebagai sebab dan akibat, bukan sekadar tarikh.' }),
          rows,
          uiButton('Tambah Peristiwa', 'cm-btn-ghost cm-btn-sm', () => { if (f.items.length < QuestRules.LIMITS.timeline[1]) { f.items.push({ year: '', text: '', why: '' }); render(); touch(); } }, 'fa-plus')
        ];
      };

      const panelHotspot = () => {
        const f = forms[2];
        const areaHost = h('div', { class: 'qe-area-host' });
        const rows = h('div', { class: 'qe-rows' });
        const bgLabel = h('span', { class: 'qe-bg-name' });

        const renderBg = () => {
          const known = f.bgImage ? this.library.backgroundName(f.bgImage.split('/').pop()) : null;
          bgLabel.textContent = f.bgImage ? `Gambar: ${known}` : 'Gambar lalai (belum memilih gambar)';
        };
        // Klik pada gambar: letak titik baharu, atau alihkan titik yang dipilih ("Alih").
        // Digunakan oleh gambar kecil DAN gambar besar (butang <-->), jadi hasilnya sama.
        const onAreaClick = (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const pos = (v, total) => `${Math.round(Math.max(0, Math.min(100, (v / total) * 100)) * 10) / 10}%`;
            const left = pos(e.clientX - rect.left, rect.width);
            const top = pos(e.clientY - rect.top, rect.height);
            if (moveIndex !== null && f.hotspots[moveIndex]) {
              f.hotspots[moveIndex].left = left; f.hotspots[moveIndex].top = top; moveIndex = null;
            } else if (f.hotspots.length < QuestRules.LIMITS.hotspots[1]) {
              f.hotspots.push({ name: '', top, left });
            } else {
              this.app.toast(`Maksimum ${QuestRules.LIMITS.hotspots[1]} titik bukti.`, 'error');
              return;
            }
            renderAll(); touch();
        };

        let bigHost = null;                       // kotak gambar besar (hanya ada apabila dialog besar dibuka)
        const areaOptions = (big) => ({ activeIndex: moveIndex === null ? -1 : moveIndex, onClick: onAreaClick, big });
        const renderArea = () => {
          setChildren(areaHost, hotspotArea(f.bgImage, f.hotspots, areaOptions(false)));
          if (bigHost) setChildren(bigHost, hotspotArea(f.bgImage, f.hotspots, areaOptions(true)));
        };

        // Butang <--> : buka gambar dalam dialog besar supaya titik bukti lebih mudah diletakkan
        const openBig = () => {
          const big = new Dialog({ title: 'Letak titik bukti pada gambar', size: 'wide', app: this.app });
          big.card.classList.add('is-max');
          bigHost = h('div', { class: 'qe-area-big' });
          big.setBody(
            h('p', { class: 'cm-hint', text: 'Klik pada gambar untuk meletakkan titik bukti. Untuk mengalih titik, tekan "Alih" pada senarai di bawah, kemudian klik di tempat baharu.' }),
            bigHost,
            rows);                                 // senarai titik dipindahkan ke sini sementara
          big.onClose = () => { bigHost = null; renderAll(); areaHost.after(rows); };
          big.setFooter(uiButton('Siap', 'cm-btn-primary', () => big.close(), 'fa-check'));
          renderAll();
        };
        const renderRows = () => setChildren(rows, f.hotspots.map((p, i) => h('div', { class: `qe-row${moveIndex === i ? ' is-moving' : ''}` },
          h('span', { class: 'qe-num', text: String(i + 1) }),
          textInput(() => p.name, (v) => { p.name = v; }, { max: 80, placeholder: 'Nama bahan bukti' }),
          h('span', { class: 'qe-pos', text: `${p.left}, ${p.top}` }),
          uiButton(moveIndex === i ? 'Klik pada gambar...' : 'Alih', 'cm-btn-ghost cm-btn-sm', () => { moveIndex = moveIndex === i ? null : i; renderAll(); }),
          h('button', { type: 'button', class: 'cm-icon-btn is-danger', 'aria-label': 'Buang titik', onclick: () => { f.hotspots.splice(i, 1); moveIndex = null; renderAll(); touch(); } }, h('i', { class: 'fas fa-trash' })))));
        const renderAll = () => { renderBg(); renderArea(); renderRows(); };
        renderAll();

        return [
          h('p', { class: 'cm-hint', text: 'Pilih gambar, kemudian KLIK pada gambar di tempat bahan bukti tersembunyi. Pelajar perlu menemui semua titik.' }),
          h('div', { class: 'qe-bg-row' }, bgLabel,
            uiButton('Pilih Gambar', 'cm-btn-ghost cm-btn-sm', async () => {
              const picked = await this.library.pickAsset({ type: 'background', title: 'Pilih Gambar Latar Misi', currentFile: f.bgImage ? f.bgImage.split('/').pop() : null });
              if (picked) { f.bgImage = `${QUEST_BG_DIR}${picked.file}`; renderAll(); touch(); }
            }, 'fa-image'),
            f.bgImage ? uiButton('Guna gambar lalai', 'cm-btn-ghost cm-btn-sm', () => { f.bgImage = ''; renderAll(); touch(); }) : null),
          h('div', { class: 'qe-area-bar' },
            h('span', { class: 'cm-hint', text: 'Gambar bukti (klik untuk letak titik)' }),
            h('button', { type: 'button', class: 'cm-icon-btn cm-expand-btn', title: 'Besarkan gambar', 'aria-label': 'Besarkan gambar', onclick: openBig },
              h('i', { class: 'fas fa-up-right-and-down-left-from-center' }))),
          areaHost,
          rows
        ];
      };

      const panelChoices = (keyName, label, placeholder, rows) => {
        const f = forms[state.questType];
        const list = h('div', { class: 'qe-rows' });

        // senarai jenis benda: kosong = dokumen (lalai). Hanya untuk misi Bantu NPC.
        const itemSelect = (o) => {
          const pilih = h('select', { class: 'cm-input qe-item', 'aria-label': 'Jenis benda yang dihulurkan', onchange: (e) => { o.item = e.target.value; touch(); } },
            [['', 'Dokumen (lalai)'], ...Object.entries(QuestRules.ITEMS)].map(([nilai, nama]) => h('option', { value: nilai, text: nama })));
          pilih.value = o.item || '';
          return pilih;
        };
        const render = () => {
          setChildren(list, f.options.map((o, i) => h('div', { class: 'qe-opt' }, h('div', { class: 'qe-row' },
            h('input', { type: 'radio', name: 'qe-correct', class: 'qe-radio', 'aria-label': `Pilihan ${i + 1} ialah jawapan betul`, onchange: () => { f.options.forEach((x, j) => { x.isCorrect = j === i; }); render(); touch(); } }),
            textInput(() => o.text, (v) => { o.text = v; }, { max: 200, placeholder: keyName === 'prompt' ? `Benda ${i + 1}, cth: Kaset lagu Perak` : `Pilihan ${i + 1}` }),
            keyName === 'prompt' ? itemSelect(o) : null,        // jenis benda (Bantu NPC sahaja)
            h('button', { type: 'button', class: 'cm-icon-btn is-danger', 'aria-label': 'Buang pilihan', disabled: f.options.length <= QuestRules.LIMITS.options[0] ? '' : null, onclick: () => { const wasCorrect = o.isCorrect; f.options.splice(i, 1); if (wasCorrect && f.options[0]) f.options[0].isCorrect = true; render(); touch(); } }, h('i', { class: 'fas fa-trash' }))),
            // a wrong choice shows what happens in the story when it is picked
            o.isCorrect ? null : h('div', { class: 'qe-consequence' },
              h('i', { class: 'fas fa-burst' }),
              textInput(() => o.consequence || '', (v) => { o.consequence = v; }, { max: 200, placeholder: 'Jika dipilih, apa yang berlaku dalam cerita? Cth: Kota jatuh dalam sehari.' })))));
          // the radios exist only now, so the saved "correct answer" is ticked after they are built
          Array.from(list.children).forEach((box, i) => {
            const radio = box.querySelector('.qe-radio');
            if (radio) radio.checked = Boolean(f.options[i] && f.options[i].isCorrect);
          });
        };
        render();
        return [
          // nama NPC yang dibantu (Bantu NPC sahaja)
          keyName === 'prompt' ? formField('Nama NPC yang dibantu', textInput(() => f.npcName || '', (v) => { f.npcName = v; }, { max: 40, placeholder: 'Cth: Wong Pow Nee' }),
            { optional: true, hint: 'NPC ialah watak LAIN, bukan peranan yang dimainkan pelajar. Namanya dipaparkan pada gelembung fikiran.' }) : null,
          formField(label, areaInput(() => f[keyName], (v) => { f[keyName] = v; }, { max: keyName === 'prompt' ? 400 : 500, rows, placeholder }), { required: true }),
          h('p', { class: 'cm-hint', text: keyName === 'prompt' ? 'Benda yang boleh dihulurkan. Pilih jenis benda, dan tandakan bulatan di sebelah benda yang betul (hanya satu).' : 'Pilihan jawapan. Tandakan bulatan di sebelah jawapan yang betul (hanya satu).' }),
          list,
          uiButton('Tambah Pilihan', 'cm-btn-ghost cm-btn-sm', () => { if (f.options.length < QuestRules.LIMITS.options[1]) { f.options.push({ text: '', item: '', isCorrect: false }); render(); touch(); } }, 'fa-plus')
        ];
      };

      const panelMatching = () => {
        const f = forms[4];
        const rows = h('div', { class: 'qe-rows' });
        const render = () => setChildren(rows, f.pairs.map((p, i) => h('div', { class: 'qe-row' },
          h('span', { class: `qe-num qp-pair-${i % 6}`, text: String(i + 1) }),
          textInput(() => p.a, (v) => { p.a = v; }, { max: 80, placeholder: 'Kad kiri, cth: Tunku Abdul Rahman' }),
          h('i', { class: 'fas fa-arrows-left-right qe-link' }),
          textInput(() => p.b, (v) => { p.b = v; }, { max: 80, placeholder: 'Pasangannya, cth: Bapa Kemerdekaan' }),
          h('button', { type: 'button', class: 'cm-icon-btn is-danger', 'aria-label': 'Buang pasangan', disabled: f.pairs.length <= QuestRules.LIMITS.pairs[0] ? '' : null, onclick: () => { f.pairs.splice(i, 1); render(); touch(); } }, h('i', { class: 'fas fa-trash' })))));
        render();
        return [
          h('p', { class: 'cm-hint', text: 'Setiap baris ialah satu pasangan. Pelajar melihat semua kad bercampur dan perlu memadankannya.' }),
          rows,
          uiButton('Tambah Pasangan', 'cm-btn-ghost cm-btn-sm', () => { if (f.pairs.length < QuestRules.LIMITS.pairs[1]) { f.pairs.push({ a: '', b: '' }); render(); touch(); } }, 'fa-plus')
        ];
      };

      const renderTypePanel = () => {
        const t = state.questType;
        moveIndex = null;
        if (!QuestRules.TYPES[t]) {
          setChildren(typePanel, h('p', { class: 'qp-placeholder', text: 'Pilih jenis misi di atas untuk mula mengisi.' }));
        } else {
          const nodes = t === 1 ? panelTimeline()
            : t === 2 ? panelHotspot()
              : t === 3 ? panelChoices('prompt', 'Masalah NPC (gelembung fikiran)', 'Contoh: Aku perlu lagu negeri yang betul untuk majlis ini. Benda mana patut aku guna?', 3)
                : t === 4 ? panelMatching()
                  : panelChoices('clueText', 'Teks clue', 'Contoh: Dokumen ini ditulis dalam tulisan Jawi pada 1963.', 4);
          const aftermath = formField('Akibat jika salah', areaInput(() => carriedAftermath, (v) => { carriedAftermath = v; }, { max: 200, rows: 2, placeholder: 'Apa yang berlaku dalam cerita jika pelajar gagal? Cth: Tanpa kerjasama, kota Melaka jatuh ke tangan Portugis.' }),
            { optional: true, hint: t === 3 || t === 5 ? 'Dipaparkan sebagai adegan selepas jawapan salah. Jika pilihan itu ada akibat sendiri (di atas), akibat itu dipaparkan.' : 'Dipaparkan sebagai adegan selepas pelajar gagal, sebelum Pendekar Bayang menerangkan dan babak diputar semula.' });
          setChildren(typePanel, h('p', { class: 'qe-done', text: `Syarat selesai: ${QuestRules.TYPES[t].done}` }), nodes, aftermath);
        }
        refreshPreview();
      };

      /* ----- type chooser ----- */
      const typeCards = h('div', { class: 'qe-types', role: 'radiogroup', 'aria-label': 'Jenis misi' });
      const renderTypes = () => setChildren(typeCards, [1, 2, 3, 4, 5].map((t) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': state.questType === t ? 'true' : 'false',
        class: `qe-type${state.questType === t ? ' is-selected' : ''}`,
        onclick: () => { state.questType = t; setErr(fieldErr.questType, ''); renderTypes(); renderTypePanel(); }
      }, h('i', { class: `fas ${QuestRules.TYPES[t].icon}` }), h('strong', { text: QuestRules.TYPES[t].label }), h('small', { text: QuestRules.TYPES[t].help }))));

      /* ----- save ----- */
      const showErrors = ({ errors = {}, contentErrors = [] }) => {
        Object.keys(fieldErr).forEach((k) => setErr(fieldErr[k], errors[k]));
        if (contentErrors.length) {
          setChildren(errorBox, h('strong', { text: `Misi belum boleh disimpan (${contentErrors.length} perkara):` }), h('ul', {}, contentErrors.map((m) => h('li', { text: m }))));
          errorBox.classList.remove('is-hidden');
          if (errorBox.scrollIntoView) errorBox.scrollIntoView({ block: 'nearest' });
        } else {
          errorBox.classList.add('is-hidden');
        }
      };

      const saveBtn = uiButton(quest ? 'Simpan Perubahan' : 'Simpan Misi', 'cm-btn-primary', async () => {
        const payload = { ...state, sceneID: scene.sceneID, form: { ...forms[state.questType], aftermath: carriedAftermath, turns: carriedTurns } };
        const local = QuestRules.validate(payload);                // same rules as the server (E1)
        showErrors(local);
        if (!local.valid) return;

        dlg.setBusy(true); saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan...';
        try {
          if (quest) await this.app.api(`/quests/${quest.questID}`, { method: 'PUT', body: payload });
          else await this.app.api('/quests', { method: 'POST', body: payload });
          changed = true;
          snapshot = snap();
          dlg.setBusy(false);
          dlg.close();
          this.app.toast(quest ? 'Misi berjaya dikemas kini.' : 'Misi berjaya ditambah.');
        } catch (err) {
          dlg.setBusy(false);
          if (err.status === 401) return;
          if (err.status === 422) showErrors(err.data);
          else {
            this.app.reportError(quest ? 'Mengemas kini misi' : 'Menambah misi', err,
              { where: `${this.app.where()} > Babak ${scene.sceneID} > Misi${quest ? ` "${quest.questName}"` : ' baharu'}` });   // E2
          }
          saveBtn.disabled = false; saveBtn.textContent = quest ? 'Simpan Perubahan' : 'Simpan Misi';
        }
      }, 'fa-floppy-disk');

      const deleteBtn = quest ? uiButton('Padam Misi', 'cm-btn-danger', async () => {
        const ok = await this.app.askConfirm({
          title: 'Padam misi?', text: `Misi "${quest.questName}" dan rekod penyelesaian pelajar bagi misi ini akan dipadam. Tindakan ini tidak boleh dibatalkan.`,
          confirmText: 'Padam', danger: true
        });
        if (!ok) return;
        try {
          await this.app.api(`/quests/${quest.questID}`, { method: 'DELETE' });
          changed = true; snapshot = snap(); dlg.close();
          this.app.toast('Misi berjaya dipadam.');
        } catch (err) {
          if (err.status !== 401) this.app.reportError('Memadam misi', err, { where: `${this.app.where()} > Babak ${scene.sceneID} > Misi "${quest.questName}"` });
        }
      }, 'fa-trash') : null;

      /* ----- layout ----- */
      const bind = (key, control) => control;
      dlg.setBody(h('div', { class: 'qe-grid' },
        h('div', { class: 'qe-form' },
          errorBox,
          formField('Nama misi', bind('questName', textInput(() => state.questName, (v) => { state.questName = v; }, { max: 255, placeholder: 'Contoh: Susun Peristiwa Pembentukan Malaysia' })), { required: true, error: fieldErr.questName }),
          formField('Taklimat misi', areaInput(() => state.instruction, (v) => { state.instruction = v; }, { rows: 2, placeholder: 'Contoh: Susun peristiwa berikut mengikut urutan yang betul.' }), { required: true, hint: 'Pendekar Bayang menyebutnya sebelum objektif misi dipaparkan.', error: fieldErr.instruction }),
          formField('Objektif pembelajaran', areaInput(() => state.description, (v) => { state.description = v; }, { rows: 2, placeholder: 'Apa yang pelajar akan faham selepas misi ini' }), { optional: true, error: fieldErr.description }),
          h('div', { class: 'cm-field' }, h('label', { text: 'Jenis misi' }), typeCards, fieldErr.questType),
          typePanel,
          // Catatan Diari: nota lekat yang muncul selepas cerita babak, sebelum babak seterusnya (sengaja diletak di luar bahagian pilihan supaya mudah dilihat)
          formField('Catatan Diari (nota selepas babak)', areaInput(() => state.explanation, (v) => { state.explanation = v; }, { rows: 3, placeholder: 'Contoh: Hari ini aku belajar bahawa... (satu ayat perasaan watak, kemudian satu ayat fakta utama)' }), { optional: true, hint: 'Muncul sebagai nota lekat pada halaman diari selepas cerita babak ini habis, sebelum babak seterusnya. Pendekar Bayang juga menyebutnya untuk membetulkan pelajar yang tersilap.', error: fieldErr.explanation }),
          h('details', { class: 'qe-extras' },
            h('summary', { text: 'Bantuan & mesej (pilihan)' }),
            formField('Petunjuk', textInput(() => state.hint, (v) => { state.hint = v; }, { max: 255, placeholder: 'Jangan tulis jawapan; tunjukkan di mana dalam cerita jawapan itu boleh dijumpai' }), { optional: true, hint: 'Dipaparkan apabila murid menekan butang Petunjuk (mentol), dan dibisikkan automatik selepas kegagalan kedua. Selepas kegagalan ketiga murid mendapat petunjuk yang lebih jelas (bukan jawapan).', error: fieldErr.hint }),
            formField('Pujian', areaInput(() => state.feedback, (v) => { state.feedback = v; }, { rows: 2, placeholder: 'Tepat sekali! Perpaduan menyelamatkan kota.' }), { optional: true, hint: 'Pendekar Bayang memuji selepas misi berjaya.', error: fieldErr.feedback }))),
        h('aside', { class: 'qe-preview' }, h('h4', {}, h('i', { class: 'fas fa-eye' }), ' Pratonton Pelajar'), previewHost)));
      dlg.setFooter(deleteBtn, h('span', { class: 'cm-spacer' }), uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), saveBtn);

      renderTypes();
      renderTypePanel();
    });
  }
}