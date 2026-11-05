/**
 * ============================================================================
 * contentBoard.js  -  the story board (UC-10 A1 narrative, A2 dialogue, A3 quest)
 * Uses: h(), setChildren(), chip()  (contentManagerEngine.js), Dialog, formField... (contentUi.js),
 *       Library (contentLibrary.js), QuestEditor / buildQuestPreview (contentQuest.js).
 *
 * Layout (top to bottom):
 *     1 Naratif   a box with the narratives in one row (click one) + its title, summary and buttons
 *     below it, two columns:   2 Babak (rows: Babak 1, 2, 3 ... drag to sort)   |   3 Isi babak (big preview)
 * Click a scene row to see its content in the wide column (background, timeline card, dialogue, quests)
 * with an edit button on every card.
 * Playing is separate: "Main Naratif" / "Main Babak Ini" open the player (contentPlayer.js),
 * which runs the REAL game scene in an iframe (teacher/story_preview.html), so the teacher plays what the student plays. Nothing is saved while playing.
 *
 *   Narrative   addNarrative / editNarrative / removeNarrative       -> editNarrative(), removeNarrative()
 *   Scene       addScene / editScene / removeScene / reorderScenes   -> editScene(), removeScene(), applyOrder()
 *   Dialogue    saveDialogue                                         -> editDialogue()
 *   Quest       addQuest / editQuest / removeQuest                   -> QuestEditor
 * ============================================================================
 */

/** the first words of a text, with ... when it is cut */
const snippet = (text, max = 60) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
};

const iconBtn = (icon, label, disabled, onclick, extra = '') =>
  h('button', {
    type: 'button', class: `cm-icon-btn ${extra}`.trim(), 'aria-label': label, title: label,
    disabled: disabled ? '' : null, onclick
  }, h('i', { class: `fas ${icon}` }));

class StoryBoard {
  constructor(app) {
    this.app = app;
    this.library = new Library(app);
    this.quests = new QuestEditor(app, this.library);
    this.turnEditor = new TurnEditor(app, this.library);

    this.narratives = [];
    this.narrativeID = null;
    this.data = null;               // { narrative, scenes[] } from /narrative
    this.selectedSceneID = null;
    this.dragID = null;
    this.sceneListEl = null;
    this.role = { npcID: null };     // peranan pelajar bagi naratif yang dibuka
    this.entityMod = null;           // entityLines.js (dimuat apabila perlu)
    this.notes = {};                 // Nota Guru: { dialogueID: teks } bagi naratif tetap yang dibuka
  }

  /**
   * Naratif TETAP (cipta sistem): guru hanya boleh melihat, bermain dan menulis Nota Guru.
   * Naratif ciptaan guru sendiri: boleh diubah sepenuhnya. Pelayan menyemak perkara yang sama (editable).
   */
  get readOnly() { return Boolean(this.data && this.data.narrative.editable === false); }
  get isFixed() { return Boolean(this.data && !this.data.narrative.owned); }

  get eraID() { return this.app.era.eraID; }
  get scenes() { return this.data ? this.data.scenes : []; }
  sceneNumber(scene) { return this.scenes.findIndex((s) => s.sceneID === scene.sceneID) + 1; }

  /** Lokasi untuk mesej ralat: "Era 3: Nama > Naratif "Tajuk" > Babak 2" */
  where(scene) {
    let t = this.app.where();
    const n = this.data && this.data.narrative;
    if (n) t += ` > Naratif "${n.narrativeTitle}"`;
    if (scene) t += scene.sceneID ? ` > Babak ${this.sceneNumber(scene)}` : ' > Babak baharu';
    return t;
  }

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                */
  /* ---------------------------------------------------------------------- */

  /** Tab opened: load the narratives of the era (and the picture / NPC libraries). */
  async open() {
    this.app.loadingBox('Memuatkan naratif...');
    try {
      const [list] = await Promise.all([
        this.app.api(`/narratives?eraID=${this.eraID}`),
        this.library.loadNpcs(true).catch(() => null),
        this.library.assets('background', true).catch(() => null)
      ]);
      this.narratives = list.narratives;
      if (!this.narratives.some((n) => n.narrativeID === this.narrativeID)) {
        this.narrativeID = this.narratives.length ? this.narratives[0].narrativeID : null;
      }
      if (this.narrativeID) await this.loadNarrative();
      else { this.data = null; this.render(); }
    } catch (err) {
      if (err.status === 401) return;
      this.app.showError('Naratif tidak dapat dimuatkan.', () => this.app.manageLearningContent(), 'Kembali ke Senarai Era', err);
    }
  }

  async loadNarrative() {
    this.data = await this.app.api(`/narrative?narrativeID=${this.narrativeID}`);
    this.role = await this.loadRole();
    await this.loadNotes();
    if (!this.scenes.some((s) => s.sceneID === this.selectedSceneID)) {
      this.selectedSceneID = this.scenes.length ? this.scenes[0].sceneID : null;
    }
    this.render();
  }

  /** Nota Guru milik guru ini bagi naratif tetap (kosong untuk naratif sendiri). */
  async loadNotes() {
    this.notes = {};
    if (!this.isFixed) return;
    try {
      const d = await this.app.api(`/notes?narrativeID=${this.narrativeID}`);
      d.lines.forEach((l) => { if (l.note) this.notes[l.dialogueID] = l.note; });
      this.noteMax = d.maxLength;
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memuatkan Nota Guru', err);
    }
  }

  /** Peranan pelajar bagi naratif ini: { npcID, badgeLine, moralLine, introLine } (npcID null = belum dipilih) */
  async loadRole() {
    try {
      const d = await this.app.api(`/narratives/${this.narrativeID}/role-lines`);
      return d.role || { npcID: null };
    } catch (err) {
      return { npcID: null };
    }
  }

  /** After any change: refresh the tab counts, the board and the era readiness panel. */
  async refreshAfterChange() {
    try {
      this.narratives = (await this.app.api(`/narratives?eraID=${this.eraID}`)).narratives;
      await this.loadNarrative();
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memuat semula papan naratif', err);
      return;
    }
    this.app.refreshEra();
  }

  async switchNarrative(id) {
    if (id === this.narrativeID) return;
    this.narrativeID = id;
    this.selectedSceneID = null;
    try { await this.loadNarrative(); } catch (err) {
      if (err.status !== 401) this.app.showError('Naratif tidak dapat dimuatkan.', () => this.app.manageLearningContent(), 'Kembali ke Senarai Era', err);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                 */
  /* Three layers side by side, opened from left to right:                  */
  /*     1 Naratif   >   2 Babak (rows, drag to sort)   >   3 Isi babak     */
  /* Editing and playing are separate: every layer has its own "Main" button */
  /* ---------------------------------------------------------------------- */

  render() {
    const box = this.app.$('tab-content');

    if (!this.data) {
      setChildren(box,
        h('div', { class: 'cm-notice' },
          h('i', { class: 'fas fa-book-open' }),
          h('p', { text: 'Era ini belum mempunyai naratif. Tambah naratif pertama untuk mula membina cerita.' }),
          uiButton('Tambah Naratif Pertama', 'cm-btn-primary', () => this.editNarrative(null), 'fa-plus')));
      this.sceneListEl = null;
      return;
    }

    const keepScroll = this.sceneListEl ? this.sceneListEl.scrollTop : 0;

    setChildren(box, h('div', { class: 'story-board' },
      this.narrativePane(),
      h('div', { class: 'story-lower' },
        this.scenePane(),
        this.detailPane())));

    if (this.sceneListEl) this.sceneListEl.scrollTop = keepScroll;
    this.lockIfReadOnly();
  }

  /** the title bar of a layer: "1  Naratif" and its buttons */
  paneHead(step, title, ...actions) {
    return h('header', { class: 'story-pane-head' },
      h('span', { class: 'story-step', text: String(step) }),
      h('h3', { text: title }),
      h('span', { class: 'cm-spacer' }),
      actions);
  }

  /* ---------- layer 1: the narratives of the era (one row inside a box) ---------- */
  narrativePane() {
    const { narrative } = this.data;
    const questScenes = this.scenes.filter((s) => s.quests.length > 0).length;

    const cards = this.narratives.map((n) => {
      const selected = n.narrativeID === this.narrativeID;
      return h('button', {
        type: 'button',
        role: 'option',
        'aria-selected': selected ? 'true' : 'false',
        class: `story-narr-card${selected ? ' is-selected' : ''}`,
        onclick: () => this.switchNarrative(n.narrativeID)
      },
      h('strong', { text: n.narrativeTitle }),
      h('small', { text: `${n.sceneCount} babak \u00B7 ${n.owned ? 'Milik saya' : (n.editable ? '' : 'Tetap')}` }));
    });

    const info = h('div', { class: 'story-info' },
      h('div', { class: 'story-info-text' },
        h('strong', { class: 'story-info-title', text: narrative.narrativeTitle }),
        h('p', { class: 'story-info-summary', text: narrative.summary }),
        h('div', { class: 'story-chips' },
          this.readOnly ? chip('Kandungan tetap: lihat + Nota Guru', 'warn', 'fa-lock') : chip(narrative.owned ? 'Naratif saya' : 'Boleh diubah', 'ok', 'fa-pen'),
          chip(`${this.scenes.length} babak`),
          chip(`${questScenes} babak bermisi`,
            questScenes >= 3 ? 'ok' : (questScenes === 0 ? 'bad' : 'warn'),
            questScenes >= 3 ? 'fa-circle-check' : 'fa-triangle-exclamation')),
        h('p', { class: 'cm-hint', text: 'Naratif mesti ada sekurang-kurangnya 3 babak bermisi. Babak tanpa misi ialah babak cerita biasa.' })),
      h('div', { class: 'story-info-actions' },
        uiButton('Main Naratif', 'cm-btn-play cm-btn-sm', () => this.playNarrative(), 'fa-play'),
        uiButton('Edit', 'cm-btn-ghost cm-btn-sm', () => this.editNarrative(narrative), 'fa-pen'),
        uiButton('Padam', 'cm-btn-danger cm-btn-sm', () => this.removeNarrative(), 'fa-trash')));

    return h('section', { class: 'story-pane story-pane-narratives', 'aria-label': 'Naratif' },
      this.paneHead(1, 'Naratif',
        uiButton('Naratif Baharu', 'cm-btn-ghost cm-btn-sm', () => this.editNarrative(null), 'fa-plus'),
        this.app.isAdmin ? uiButton('Urus NPC', 'cm-btn-ghost cm-btn-sm', () => this.manageNpcs(), 'fa-users') : null),
      h('p', { class: 'cm-hint story-pane-hint', text: 'Satu cerita penuh bagi era ini. Setiap kali pelajar bermain, satu naratif dipilih secara rawak (versi berbeza, fakta sejarah sama).' }),
      h('div', { class: 'story-narr-row', role: 'listbox', 'aria-label': 'Senarai naratif' }, cards),
      info,
      this.rolePanel());
  }

  /* ---------- kad peranan: "KAU KINI IALAH ..." (watak yang dimainkan pelajar) ---------- */
  /** NPC yang boleh dipilih sebagai peranan (bukan Pendekar Bayang) */
  roleChoices() {
    return (this.library.npcs || []).filter((n) => n.name !== 'Pendekar Bayang');
  }

  rolePanel() {
    const npc = this.role.npcID ? this.library.npc(this.role.npcID) : null;

    // senarai pilihan watak
    const select = h('select', { class: 'cm-input story-role-select', 'aria-label': 'Watak yang dimainkan pelajar',
      onchange: (e) => this.saveRole(e.target.value) },
    h('option', { value: '', text: '- Pilih watak -' }),
    this.roleChoices().map((n) => h('option', { value: String(n.npcID), text: n.name })));
    select.value = npc ? String(npc.npcID) : '';

    // gambar watak (sama seperti kad dalam permainan)
    const portrait = npc
      ? thumb(npc.url, npc.name, 'story-role-img')
      : h('div', { class: 'story-role-img story-role-empty', text: '?' });

    return h('div', { class: `story-role${npc ? '' : ' is-missing'}` },
      portrait,
      h('div', { class: 'story-role-body' },
        h('div', { class: 'story-role-label', text: 'KAU KINI IALAH' }),
        select,
        npc
          ? h('p', { class: 'story-role-task' }, h('b', { text: 'Tugas bersejarah: ' }),
            this.role.badgeLine || 'Belum ditulis (ayat lalai digunakan).')
          : h('p', { class: 'story-role-task' }, 'Pilih watak sejarah yang pelajar akan menjadi dalam naratif ini. Pendekar Bayang akan memasukkan jiwa pelajar ke dalam watak itu sebelum babak 1.')),
      h('div', { class: 'story-role-actions' },
        uiButton('Ayat peranan', 'cm-btn-ghost cm-btn-sm', () => this.editRoleLines(), 'fa-pen')));
  }

  /** Pilih watak: simpan terus (ayat peranan yang sedia ada dikekalkan) */
  async saveRole(npcID) {
    if (!npcID) { this.app.toast('Pilih satu watak. Peranan tidak boleh dikosongkan kerana ayat peranan terikat padanya.', 'error'); this.render(); return; }
    try {
      await this.app.api(`/narratives/${this.narrativeID}/role-lines`, { method: 'PUT',
        body: { npcID, badgeLine: this.role.badgeLine || '', moralLine: this.role.moralLine || '', introLine: this.role.introLine || '' } });
      this.role = await this.loadRole();
      this.app.toast('Peranan pelajar disimpan.');
    } catch (e) {
      if (e.status !== 401) this.app.reportError('Menyimpan peranan pelajar', e, { where: this.where() + ' > Peranan pelajar' });
    }
    this.render();
    this.app.refreshEra();
  }

  /** Tetingkap: tiga ayat yang disebut oleh watak peranan */
  async editRoleLines() {
    if (!this.role.npcID) { this.app.toast('Pilih watak peranan dahulu.', 'error'); return; }
    if (!this.entityMod) this.entityMod = await import('../game/npc/entityLines.js');
    const mod = this.entityMod;
    const state = { intro: this.role.introLine || '', badge: this.role.badgeLine || '', moral: this.role.moralLine || '' };
    const initial = JSON.stringify(state);
    const dlg = new Dialog({ title: 'Ayat peranan', size: 'wide', isDirty: () => JSON.stringify(state) !== initial, app: this.app });
    const area = (key, line) => {
      const a = h('textarea', { rows: '3', maxlength: '255', class: 'cm-input', placeholder: mod.ROLE_LINES[line].fallback, oninput: (e) => { state[key] = e.target.value; } });
      a.value = state[key];
      return a;
    };
    const err = h('span', { class: 'cm-error' });
    const save = uiButton('Simpan ayat', 'cm-btn-primary', async () => {
      err.textContent = '';
      for (const [label, key] of [['Pengenalan peranan', 'intro'], ['Tugas bersejarah', 'badge'], ['Pembuka pengajaran', 'moral']]) {
        if (!state[key].trim()) continue;
        const c = mod.validateLineText(state[key]);
        if (!c.ok) { err.textContent = `${label}: ${c.message}`; return; }
      }
      dlg.setBusy(true); save.disabled = true;
      try {
        await this.app.api(`/narratives/${this.narrativeID}/role-lines`, { method: 'PUT',
          body: { npcID: this.role.npcID, badgeLine: state.badge, moralLine: state.moral, introLine: state.intro } });
        dlg.setBusy(false); dlg.isDirty = null; dlg.close();
        this.role = await this.loadRole();
        this.app.toast('Ayat peranan disimpan.');
        this.render();
      } catch (e) {
        dlg.setBusy(false); save.disabled = false;
        if (e.status !== 401) { err.textContent = (e.data && e.data.message) || 'Ayat tidak dapat disimpan.'; this.app.reportError('Menyimpan ayat peranan', e, { where: this.where() + ' > Ayat peranan' }); }
      }
    }, 'fa-floppy-disk');

    dlg.setBody(
      formField('1. Pengenalan peranan (Pendekar Bayang)', area('intro', 3), { optional: true, hint: 'Dikatakan apabila jiwa pelajar masuk ke dalam watak. Boleh guna {peranan} dan {nama}. Jika kosong, ayat lalai digunakan.' }),
      formField('2. Tugas bersejarah', area('badge', 1), { optional: true, hint: 'Watak menerangkan apa yang dia perlu buat supaya sejarah berlaku dan mengapa ia penting. Tulis dalam suara watak.' }),
      formField('3. Pembuka pengajaran moral', area('moral', 2), { optional: true, hint: 'Ayat pertama sebelum pengajaran moral artifak.' }),
      err);
    dlg.setFooter(uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), save);
  }

  /* ---------- layer 2: the scenes of the chosen narrative, in order ---------- */
  scenePane() {
    this.sceneListEl = h('ol', { class: 'story-rows story-scene-list', role: 'listbox', 'aria-label': 'Susunan babak' },
      this.scenes.map((scene, idx) => this.sceneRow(scene, idx)));

    return h('section', { class: 'story-pane story-pane-scenes', 'aria-label': 'Babak' },
      this.paneHead(2, 'Babak (urutan cerita)',
        uiButton('Tambah Babak', 'cm-btn-ghost cm-btn-sm', () => this.editScene(null), 'fa-plus')),
      h('p', { class: 'cm-hint story-sort-hint', text: 'Babak dimainkan dari atas ke bawah, satu peristiwa sejarah bagi setiap babak. Seret ikon \u2630 di kiri baris untuk menukar urutan; misi dan dialog bergerak bersama babaknya. Klik satu baris untuk melihat isinya.' }),
      this.sceneListEl);
  }

  /** one scene as a row: grip, number, small picture, short text, counters */
  sceneRow(scene, idx) {
    const selected = scene.sceneID === this.selectedSceneID;
    const countChip = (icon, count, label) =>
      h('span', { class: `story-mini${count ? '' : ' is-empty'}`, title: `${count} ${label}` },
        h('i', { class: `fas ${icon}` }), String(count));

    const row = h('li', {
      class: `story-row story-scene-row${selected ? ' is-selected' : ''}`,
      role: 'option',
      'aria-selected': selected ? 'true' : 'false',
      tabindex: '0',
      draggable: 'true',
      'data-scene': scene.sceneID,
      onclick: () => this.selectScene(scene.sceneID),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.selectScene(scene.sceneID); } }
    },
    h('span', { class: 'story-grip', title: 'Seret untuk menyusun semula' }, h('i', { class: 'fas fa-grip-vertical' })),
    h('span', { class: 'story-num', text: String(idx + 1) }),
    thumb(scene.assetUrl, scene.assetName, 'story-scene-thumb'),
    h('span', { class: 'story-row-main' },
      h('strong', { text: `Babak ${idx + 1}` }),
      h('small', { class: 'story-snippet', text: snippet(scene.storyline, 52) })),
    h('span', { class: 'story-minis' },
      countChip('fa-comment', scene.dialogues.length, 'baris dialog'),
      countChip('fa-puzzle-piece', scene.quests.length, 'misi')),
    h('i', { class: 'fas fa-chevron-right story-row-arrow', 'aria-hidden': 'true' }));

    this.attachDrag(row, scene);
    return row;
  }

  /** drag a row up or down; a line shows where it will land */
  attachDrag(row, scene) {
    const below = (e) => {
      const rect = row.getBoundingClientRect();
      return rect && rect.height ? e.clientY > rect.top + rect.height / 2 : true;
    };
    const clearMarks = () => {
      Array.from(this.sceneListEl ? this.sceneListEl.children : []).forEach((c) => {
        if (c.classList) ['is-dragging', 'drop-before', 'drop-after'].forEach((k) => c.classList.remove(k));
      });
    };

    row.addEventListener('dragstart', (e) => {
      this.dragID = scene.sceneID;
      row.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', scene.sceneID);
      }
    });
    row.addEventListener('dragend', () => {
      this.dragID = null;
      clearMarks();
    });
    row.addEventListener('dragover', (e) => {
      if (!this.dragID || this.dragID === scene.sceneID) return;
      e.preventDefault();
      const after = below(e);
      row.classList.toggle('drop-after', after);
      row.classList.toggle('drop-before', !after);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drop-before');
      row.classList.remove('drop-after');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!this.dragID || this.dragID === scene.sceneID) return;
      const dragged = this.dragID;
      const after = below(e);
      this.dragID = null;
      this.reorderTo(dragged, scene.sceneID, after);
    });
  }

  /* ---------- layer 3: what is inside the chosen scene ---------- */
  detailPane() {
    const scene = this.scenes.find((s) => s.sceneID === this.selectedSceneID);

    if (!scene) {
      return h('section', { class: 'story-pane story-pane-detail is-empty', 'aria-label': 'Isi babak' },
        this.paneHead(3, 'Isi Babak'),
        h('div', { class: 'story-placeholder' },
          h('i', { class: 'fas fa-hand-pointer' }),
          h('p', { text: this.scenes.length ? 'Klik satu babak di sebelah kiri untuk melihat dan mengedit isinya di sini.' : 'Belum ada babak. Tekan "Tambah Babak" untuk bermula.' })));
    }

    const number = this.sceneNumber(scene);
    const idx = number - 1;
    const lines = scene.dialogues;

    /* small card with a title and an edit button */
    const card = (title, icon, count, editButton, ...body) => stepCard(null, title, '', icon, count, editButton, ...body);
    const stepCard = (step, title, sub, icon, count, editButton, ...body) =>
      h('section', { class: `story-card${step ? ' story-card-step' : ''}` },
        h('header', { class: 'story-card-head' },
          step ? h('span', { class: 'story-card-num', text: String(step) }) : h('i', { class: `fas ${icon}` }),
          h('h4', { text: title }),
          count === null ? null : chip(String(count)),
          h('span', { class: 'cm-spacer' }),
          editButton),
        sub ? h('p', { class: 'story-card-sub', text: sub }) : null,
        h('div', { class: 'story-card-body' }, body.flat(Infinity)));

    const background = card('Latar', 'fa-image', null,
      uiButton('Tukar', 'cm-btn-ghost cm-btn-sm', () => this.changeBackground(scene), 'fa-image'),
      thumb(scene.assetUrl, scene.assetName, 'story-detail-bg'),
      h('p', { class: `story-bgname${scene.assetMissing ? ' is-missing' : ''}`, text: scene.assetMissing ? 'Gambar tiada! Sila tukar.' : scene.assetName }));

    /* ====================================================================== */
    /* BARIS 1: kad garis masa (kiri) dan gambar latar (kanan)                */
    /* ====================================================================== */
    const timeline = stepCard(1, 'Kad garis masa: apa yang berlaku, bila dan di mana', 'Pelajar membaca kad ini dahulu. Tulis dalam suara "kau" (contoh: "Kau, Tunku, berdiri di hadapan wartawan...").', 'fa-scroll', null,
      uiButton('Edit', 'cm-btn-ghost cm-btn-sm', () => this.editScene(scene), 'fa-pen'),
      h('p', { class: 'story-text', text: scene.storyline }),
      scene.hint ? h('p', { class: 'story-hint-line' }, h('i', { class: 'fas fa-lightbulb' }), ` ${scene.hint}`) : null);
    const row1 = h('div', { class: 'sd-row sd-row-1' }, timeline, background);

    /* ====================================================================== */
    /* BARIS 2: dialog (skrip) dengan Giliran Anda di tempat ia berlaku       */
    /* ====================================================================== */
    // Giliran Anda yang berada selepas baris dialog nombor n (disimpan dalam quest)
    const turnAt = (n) => {
      for (const q of scene.quests) {
        const t = ((q.form && q.form.turns) || []).find((x) => Number(x.after) === n);
        if (t) return { quest: q, turn: t };
      }
      return null;
    };
    const turnTotal = scene.quests.reduce((sum, q) => sum + ((q.form && q.form.turns) || []).length, 0);
    const turnMax = QuestRules.LIMITS.turns[1];
    const hasTurns = turnTotal > 0;
    const canAddTurn = scene.quests.length > 0 && turnTotal < turnMax;

    // GILIRAN ANDA: kotak berasingan (jalur biru penuh) supaya tidak keliru dengan baris dialog biasa.
    // Di dalamnya: pilihan A / B / C seperti butang dalam permainan, dengan tanda BETUL / SALAH.
    const turnBlock = (found) => h('div', { class: 'sd-turn' },
      h('div', { class: 'sd-turn-head' },
        h('i', { class: 'fas fa-hand-pointer' }),
        h('strong', { text: 'GILIRAN ANDA' }),
        h('span', { class: 'sd-turn-sub', text: 'Cerita berhenti di sini. Pelajar MESTI memilih satu balasan.' }),
        h('span', { class: 'cm-spacer' }),
        uiButton('Edit Giliran Anda', 'cm-btn-primary cm-btn-sm', () => this.editTurns(scene, found.quest), 'fa-pen')),
      h('ul', { class: 'sd-replies' }, found.turn.options.map((o, k) => h('li', { class: o.isCorrect ? 'is-right' : 'is-wrong' },
        h('span', { class: 'sd-letter', text: String.fromCharCode(65 + k) }),
        h('span', { class: 'sd-reply', text: o.text }),
        h('span', { class: 'sd-badge', text: o.isCorrect ? 'BETUL' : 'SALAH' }),
        o.reaction ? h('small', { class: 'sd-react', text: `Watak menjawab: ${o.reaction}` }) : null))),
      found.turn.clue ? h('p', { class: 'sd-clue' }, h('i', { class: 'fas fa-ghost' }), ` Petunjuk Pendekar Bayang jika salah: ${found.turn.clue}`) : null);

    // Butang kecil di bawah baris watak: tambah Giliran Anda di sini
    const addTurnSlot = (n) => h('button', {
      type: 'button', class: 'sd-add-turn', onclick: () => this.editTurns(scene, scene.quests[0], n)
    }, h('i', { class: 'fas fa-plus' }), ' Letak Giliran Anda di sini (pelajar akan memilih balasan)');

    // Satu baris skrip: watak lain di KIRI, "kau" di KANAN (sama seperti dalam permainan)
    const scriptLine = (l, i) => {
      const n = i + 1;
      const speaker = this.library.speaker(l.npcID);
      const isMe = !l.npcID;
      const found = turnAt(n);
      return h('li', { class: `sd-line ${isMe ? 'sd-me' : 'sd-other'}` },
        h('span', { class: 'sd-num', text: `Baris ${n}` }),
        h('div', { class: 'sd-bubble-wrap' },
          thumb(speaker.url, speaker.name, 'story-speaker'),
          h('div', { class: 'sd-bubble' },
            h('b', { text: isMe ? 'Kau (baris tetap, pelajar hanya membaca)' : speaker.name }),
            h('p', { text: l.text }))),
        found ? turnBlock(found) : (!isMe && canAddTurn ? addTurnSlot(n) : null),
        this.isFixed ? this.noteBox(l) : null);
    };

    const dialogueSub = hasTurns
      ? 'Dimainkan SEBELUM misi. Baca dari atas ke bawah seperti skrip. Kiri = watak lain, kanan (biru) = kau.'
      : 'Belum ada Giliran Anda, jadi dialog dimainkan SELEPAS misi. Tekan "+ Giliran Anda" di bawah baris watak supaya pelajar mesti membalas dahulu.';
    const dialogue = stepCard(2, 'Dialog cerita dan Giliran Anda', dialogueSub, 'fa-comments', lines.length,
      uiButton(lines.length ? 'Edit Dialog' : 'Tulis Dialog', 'cm-btn-primary cm-btn-sm', () => this.editDialogue(scene), 'fa-pen'),
      lines.length ? h('div', { class: 'sd-legend' },
        h('span', { class: 'sd-legend-item' }, h('i', { class: 'sd-key sd-key-line' }), h('b', { text: 'Baris dialog' }), ' = pelajar membaca, tekan Enter'),
        h('span', { class: 'sd-legend-item' }, h('i', { class: 'sd-key sd-key-turn' }), h('b', { text: 'Giliran Anda' }), ' = cerita berhenti, pelajar memilih balasan')) : null,
      lines.length
        ? h('ol', { class: 'sd-script' }, lines.map(scriptLine))
        : h('p', { class: 'cm-muted', text: 'Belum ada dialog. Tekan "Tulis Dialog" untuk menambah baris pertama.' }),
      lines.length && !scene.quests.length ? h('p', { class: 'cm-hint', text: 'Giliran Anda disimpan bersama misi. Tambah satu misi di baris 3 dahulu.' }) : null,
      lines.length && scene.quests.length && turnTotal >= turnMax ? h('p', { class: 'cm-hint', text: `Maksimum ${turnMax} Giliran Anda setiap babak.` }) : null);

    /* ====================================================================== */
    /* BARIS 3: misi (quest)                                                  */
    /* ====================================================================== */
    const quests = stepCard(3, 'Misi (permainan)', 'Pelajar melakukan apa yang sebenarnya berlaku dalam sejarah. Jika salah, adegan Akibat dimainkan dan babak diulang. Jika babak ada lebih daripada satu misi, satu dipilih secara rawak setiap kali bermain.', 'fa-puzzle-piece', scene.quests.length,
      uiButton('Tambah Misi', 'cm-btn-primary cm-btn-sm', () => this.editQuest(scene, null), 'fa-plus'),
      scene.quests.length
        ? scene.quests.map((q) => h('div', { class: 'story-quest' },
          h('button', { type: 'button', class: 'story-quest-main', onclick: () => this.editQuest(scene, q), title: 'Edit misi' },
            h('i', { class: `fas ${QuestRules.TYPES[q.questType].icon}` }),
            h('span', {}, h('strong', { text: q.questName }), h('small', { text: QuestRules.TYPES[q.questType].label }))),
          iconBtn('fa-play', 'Cuba misi ini', false, () => this.quests.preview(q), 'story-quest-play')))
        : h('p', { class: 'cm-muted', text: 'Tiada misi. Babak ini ialah cerita biasa: kad garis masa, kemudian dialog (jika ada).' }));

    return h('section', { class: 'story-pane story-pane-detail', 'aria-label': `Isi Babak ${number}` },
      this.paneHead(3, `Isi Babak ${number}`,
        iconBtn('fa-arrow-up', 'Alih babak ke atas', idx === 0, () => this.moveScene(scene.sceneID, -1)),
        iconBtn('fa-arrow-down', 'Alih babak ke bawah', idx === this.scenes.length - 1, () => this.moveScene(scene.sceneID, 1)),
        iconBtn('fa-trash', 'Padam babak', false, () => this.removeScene(scene), 'is-danger'),
        uiButton('Main Babak Ini', 'cm-btn-play cm-btn-sm', () => this.playScene(scene), 'fa-play')),
      h('div', { class: 'story-flow', 'aria-label': 'Urutan dalam satu babak' },
        h('span', { class: 'story-flow-step', text: '1 Kad garis masa + latar' }), h('i', { class: 'fas fa-arrow-right' }),
        h('span', { class: 'story-flow-step', text: '2 Dialog + Giliran Anda' }), h('i', { class: 'fas fa-arrow-right' }),
        h('span', { class: 'story-flow-step', text: '3 Misi' })),
      h('div', { class: 'sd-rows' }, row1, dialogue, quests));
  }

  /** Kotak Nota Guru di bawah satu baris dialog tetap. Pelajar kelas guru ini melihat ikon buku pada baris ini. */
  noteBox(line) {
    const area = h('textarea', {
      class: 'story-note-input', rows: '2', maxlength: String(this.noteMax || 500),
      placeholder: 'Tulis nota untuk murid anda di sini. Contoh: Ingat tarikh ini, ia selalu keluar dalam peperiksaan.'
    });
    area.value = this.notes[line.dialogueID] || '';
    const save = uiButton('Simpan nota', 'cm-btn-ghost cm-btn-sm', async () => {
      save.disabled = true;
      try {
        const r = await this.app.api(`/notes/${line.dialogueID}`, { method: 'PUT', body: { noteText: area.value } });
        this.notes[line.dialogueID] = r.note;
        this.app.toast(r.message);
      } catch (err) {
        if (err.status !== 401) this.app.toast((err.data && err.data.message) || 'Nota gagal disimpan.', 'error');
      } finally {
        save.disabled = false;
      }
    }, 'fa-book-open');
    return h('div', { class: 'story-note' },
      h('label', {}, h('i', { class: 'fas fa-book-open' }), ' Nota Guru'),
      area, save);
  }

  /** Naratif tetap: butang ubah dikelabukan (pelayan menolak juga). Main, Nota Guru dan Naratif Baharu kekal aktif. */
  lockIfReadOnly() {
    if (!this.readOnly) return;
    const root = this.app.$('tab-content');
    const WRITE = ['fa-plus', 'fa-trash', 'fa-pen', 'fa-floppy-disk', 'fa-image', 'fa-arrow-up', 'fa-arrow-down', 'fa-grip-vertical'];
    root.querySelectorAll('button').forEach((b) => {
      const t = b.textContent.trim();
      if (/^Naratif Baharu|^Simpan nota/.test(t) || b.closest('.story-note')) return;
      if (WRITE.some((i) => b.querySelector(`.${i}`)) || /^Urus NPC/.test(t) || b.classList.contains('story-quest-main')
        || b.classList.contains('sd-add-turn')) {
        b.disabled = true;                                   // nampak tetapi kelabu: jelas ini kandungan tetap
        b.classList.add('is-fixed-locked');
        b.title = 'Kandungan tetap: tidak boleh diubah. Tulis Nota Guru atau cipta naratif sendiri.';
      }
    });
    const board = root.querySelector('.story-board');
    if (board) board.classList.add('is-fixed');              // warna lain untuk seluruh papan (lihat contentBoard.css)
    root.querySelectorAll('[draggable="true"]').forEach((n) => n.setAttribute('draggable', 'false'));
    const pane = root.querySelector('.story-pane-narratives');
    if (pane && !pane.querySelector('.cm-readonly-note')) {
      pane.querySelector('.story-narr-row').insertAdjacentElement('beforebegin', h('div', { class: 'cm-readonly-note', role: 'note' },
        h('i', { class: 'fas fa-lock' }),
        h('span', {}, h('b', { text: 'Naratif tetap. ' }), 'Anda boleh melihat dan bermain, serta menulis Nota Guru di bawah setiap baris dialog. Mahu cerita sendiri? Tekan "Naratif Baharu".')));
    }
  }

  selectScene(id) {
    if (id === this.selectedSceneID) return;
    this.selectedSceneID = id;
    this.render();
  }

  /* ---------------------------------------------------------------------- */
  /* PLAY  (the teacher experiences what the student sees; nothing is saved) */
  /* ---------------------------------------------------------------------- */

  playNarrative() {
    new StoryPlayer(this).play({ scenes: this.scenes, title: this.data.narrative.narrativeTitle });
  }

  playScene(scene) {
    new StoryPlayer(this).play({ scenes: [scene], title: `Babak ${this.sceneNumber(scene)}` });
  }

  /* ---------------------------------------------------------------------- */
  /* ORDER (drag + arrows)                                                  */
  /* ---------------------------------------------------------------------- */

  reorderTo(draggedID, targetID, after) {
    const ids = this.scenes.map((s) => s.sceneID).filter((id) => id !== draggedID);
    ids.splice(ids.indexOf(targetID) + (after ? 1 : 0), 0, draggedID);
    return this.applyOrder(ids);
  }

  moveScene(id, delta) {
    const ids = this.scenes.map((s) => s.sceneID);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return Promise.resolve();
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return this.applyOrder(ids);
  }

  /** The new order shows at once; if saving fails the board goes back to the saved order. */
  async applyOrder(ids) {
    const current = this.scenes.map((s) => s.sceneID);
    if (ids.join('|') === current.join('|')) return;

    const byID = new Map(this.scenes.map((s) => [s.sceneID, s]));
    this.data.scenes = ids.map((id) => byID.get(id));
    this.render();

    try {
      await this.app.api(`/narratives/${this.narrativeID}/scene-order`, { method: 'PUT', body: { sceneIDs: ids } });
      this.app.toast('Susunan babak disimpan.');
    } catch (err) {
      if (err.status === 401) return;
      this.app.reportError('Menyimpan susunan babak (susunan asal dipulihkan)', err, { where: this.where() });
      try { await this.loadNarrative(); } catch { /* the error toast is enough */ }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* SCENE                                                                  */
  /* ---------------------------------------------------------------------- */

  /** Add (scene = null) or edit a scene: description, background, hint. */
  editScene(scene) {
    const isNew = !scene;
    const state = {
      sceneStoryline: scene ? scene.storyline : '',
      asset: scene ? scene.asset : '',
      assetUrl: scene ? scene.assetUrl : '',
      assetName: scene ? scene.assetName : '',
      hint: scene ? scene.hint : ''
    };
    const initial = JSON.stringify(state);
    const dlg = new Dialog({
      title: isNew ? 'Tambah Babak' : `Edit Babak ${this.sceneNumber(scene)}`,
      size: 'wide', isDirty: () => JSON.stringify(state) !== initial, app: this.app
    });

    const err = { sceneStoryline: errSpan(), asset: errSpan(), hint: errSpan() };
    const show = (errors = {}) => Object.keys(err).forEach((k) => setErr(err[k], errors[k]));

    const story = h('textarea', { rows: '5', maxlength: '2000', placeholder: 'Terangkan apa yang berlaku dalam babak ini.', oninput: (e) => { state.sceneStoryline = e.target.value; setErr(err.sceneStoryline, ''); } });
    story.value = state.sceneStoryline;
    const hint = h('input', { type: 'text', maxlength: '255', value: state.hint, placeholder: 'Petunjuk ringkas untuk babak ini (pilihan). Petunjuk misi ditulis pada borang misi.', oninput: (e) => { state.hint = e.target.value; setErr(err.hint, ''); } });

    const bgHost = h('div', { class: 'cm-bg-pick' });
    const renderBg = () => setChildren(bgHost,
      state.assetUrl ? thumb(state.assetUrl, state.assetName, 'cm-bg-img') : h('div', { class: 'cm-portrait-empty', text: 'Belum memilih gambar' }),
      h('div', { class: 'cm-bg-side' },
        state.assetName ? h('strong', { text: state.assetName }) : null,
        uiButton(state.asset ? 'Tukar Gambar' : 'Pilih Gambar', 'cm-btn-ghost cm-btn-sm', async () => {
          const picked = await this.library.pickAsset({ type: 'background', title: 'Pilih Gambar Latar Babak', currentFile: state.asset });
          if (picked) { state.asset = picked.file; state.assetUrl = picked.url; state.assetName = picked.displayName; setErr(err.asset, ''); renderBg(); }
        }, 'fa-image')));
    renderBg();

    const save = uiButton(isNew ? 'Simpan Babak' : 'Simpan Perubahan', 'cm-btn-primary', async () => {
      const errors = {};
      if (!state.sceneStoryline.trim()) errors.sceneStoryline = 'Penerangan babak wajib diisi.';
      else if (/[<>]/.test(state.sceneStoryline)) errors.sceneStoryline = 'Aksara < dan > tidak dibenarkan.';
      if (!state.asset) errors.asset = 'Sila pilih gambar latar.';
      if (/[<>]/.test(state.hint)) errors.hint = 'Aksara < dan > tidak dibenarkan.';
      show(errors);
      if (Object.keys(errors).length) { dlg.setSummary(errorItems(errors, FIELD_LABELS)); return; }

      dlg.setBusy(true); save.disabled = true;
      try {
        const body = { sceneStoryline: state.sceneStoryline, asset: state.asset, hint: state.hint };
        let newID = null;
        if (isNew) newID = (await this.app.api('/scenes', { method: 'POST', body: { ...body, narrativeID: this.narrativeID } })).sceneID;
        else await this.app.api(`/scenes/${scene.sceneID}`, { method: 'PUT', body });
        dlg.setBusy(false);
        dlg.isDirty = null;
        dlg.close();
        this.app.toast(isNew ? 'Babak berjaya ditambah.' : 'Babak berjaya dikemas kini.');
        if (newID) this.selectedSceneID = newID;
        await this.refreshAfterChange();
        if (newID && this.sceneListEl) this.sceneListEl.scrollTop = this.sceneListEl.scrollHeight;
      } catch (e) {
        dlg.setBusy(false); save.disabled = false;
        if (e.status === 401) return;
        if (e.status === 422 && e.data.errors) { show(e.data.errors); dlg.setSummary(errorItems(e.data.errors, FIELD_LABELS)); }
        else this.app.reportError(isNew ? 'Menambah babak' : 'Mengemas kini babak', e, { where: this.where(isNew ? { sceneID: null } : scene) });
      }
    }, 'fa-floppy-disk');

    dlg.setBody(h('div', { class: 'sc-form' },
      formField('Kad garis masa', story, { required: true, hint: 'Tarikh dan tempat, dengan satu ayat peristiwa. Contoh: "24 Ogos 1511, Melaka: Portugis menyerang kota." Kad ini dipaparkan sebelum misi babak, dan dibaca semula sebagai "Apa yang berlaku?" dalam butang Bantuan murid. Pastikan ia berkait dengan misi babak.', error: err.sceneStoryline }),
      h('div', { class: 'cm-field' }, h('label', {}, 'Gambar latar', h('span', { class: 'cm-req', text: ' *' })), bgHost, err.asset),
      formField('Petunjuk babak', hint, { optional: true, error: err.hint })));
    dlg.setFooter(uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), save);
  }

  /** "Tukar" on a column: pick another background and save at once. */
  async changeBackground(scene) {
    const picked = await this.library.pickAsset({ type: 'background', title: `Pilih Gambar Latar Babak ${this.sceneNumber(scene)}`, currentFile: scene.asset });
    if (!picked || picked.file === scene.asset) return;
    try {
      await this.app.api(`/scenes/${scene.sceneID}`, { method: 'PUT', body: { sceneStoryline: scene.storyline, asset: picked.file, hint: scene.hint } });
      this.app.toast('Gambar latar dikemas kini.');
      await this.refreshAfterChange();
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Menukar gambar latar babak', err, { where: this.where(scene) });
    }
  }

  async removeScene(scene) {
    const n = this.sceneNumber(scene);
    const ok = await this.app.askConfirm({
      title: `Padam Babak ${n}?`,
      text: `Babak ini beserta ${scene.dialogues.length} baris dialog dan ${scene.quests.length} misi akan dipadam. Babak seterusnya akan dinomborkan semula. Tindakan ini tidak boleh dibatalkan.`,
      confirmText: 'Padam', danger: true
    });
    if (!ok) return;
    try {
      await this.app.api(`/scenes/${scene.sceneID}`, { method: 'DELETE' });
      this.app.toast('Babak berjaya dipadam.');
      await this.refreshAfterChange();
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memadam babak', err, { where: this.where(scene) });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* DIALOGUE                                                               */
  /* ---------------------------------------------------------------------- */

  editDialogue(scene) {
    const lines = scene.dialogues.map((l) => ({ npcID: l.npcID, text: l.text }));
    const initial = JSON.stringify(lines);
    let focus = 0;
    const rowErrors = new Map();

    const dlg = new Dialog({
      title: `Dialog: Babak ${this.sceneNumber(scene)}`, size: 'wide',
      isDirty: () => JSON.stringify(lines) !== initial, app: this.app
    });

    const rowsEl = h('div', { class: 'dl-rows' });
    const stageEl = h('div', { class: 'dl-stage' });

    const renderStage = () => {
      const line = lines[focus];
      const speaker = line ? this.library.speaker(line.npcID) : null;
      setChildren(stageEl,
        h('h4', {}, h('i', { class: 'fas fa-eye' }), ' Pratonton'),
        h('div', { class: 'sb-stage' },
          thumb(scene.assetUrl, scene.assetName, 'sb-stage-bg'),
          speaker ? thumb(speaker.url, speaker.name, 'sb-stage-portrait') : null,
          h('div', { class: 'sb-stage-box' },
            speaker ? h('div', { class: 'sb-stage-name', text: speaker.name.toUpperCase() }) : null,
            h('p', { text: line && line.text.trim() ? line.text : (line ? '(dialog kosong)' : scene.storyline) }))));
    };

    const swap = (i, j) => { [lines[i], lines[j]] = [lines[j], lines[i]]; focus = j; rowErrors.clear(); renderRows(); };

    const renderRows = () => {
      if (lines.length === 0) {
        setChildren(rowsEl, h('p', { class: 'cm-empty', text: 'Belum ada baris dialog. Tekan "Tambah Baris".' }));
        renderStage();
        return;
      }
      setChildren(rowsEl, lines.map((l, i) => {
        const speaker = this.library.speaker(l.npcID);
        const select = h('select', {
          'aria-label': `Penutur baris ${i + 1}`,
          onchange: (e) => { l.npcID = e.target.value ? Number(e.target.value) : null; focus = i; renderRows(); }
        }, h('option', { value: '', text: 'Pemain (watak pelajar)' }),
        (this.library.npcs || []).map((n) => h('option', { value: String(n.npcID), text: n.name })));
        select.value = l.npcID ? String(l.npcID) : '';

        const text = h('input', {
          type: 'text', maxlength: '255', placeholder: 'Apa yang dikatakan penutur...', value: l.text, 'aria-label': `Dialog baris ${i + 1}`,
          oninput: (e) => { l.text = e.target.value; focus = i; rowErrors.delete(i); err.textContent = ''; renderStage(); },
          onfocus: () => { if (focus !== i) { focus = i; renderStage(); } }
        });
        const err = errSpan();
        setErr(err, rowErrors.get(i));

        return h('div', { class: `dl-row${rowErrors.has(i) ? ' has-error' : ''}` },
          h('span', { class: 'qe-num', text: String(i + 1) }),
          thumb(speaker.url, speaker.name, 'dl-spk'),
          h('div', { class: 'dl-fields' }, select, text, err),
          h('div', { class: 'dl-btns' },
            iconBtn('fa-arrow-up', 'Naik', i === 0, () => swap(i, i - 1)),
            iconBtn('fa-arrow-down', 'Turun', i === lines.length - 1, () => swap(i, i + 1)),
            iconBtn('fa-trash', 'Buang baris', false, () => { lines.splice(i, 1); focus = Math.max(0, Math.min(focus, lines.length - 1)); rowErrors.clear(); renderRows(); }, 'is-danger')));
      }));
      renderStage();
    };

    const addRow = () => {
      if (lines.length >= 80) { this.app.toast('Maksimum 80 baris dialog bagi satu babak.', 'error'); return; }
      const prev = lines[lines.length - 1];
      lines.push({ npcID: prev ? prev.npcID : (this.library.npcs && this.library.npcs[0] ? this.library.npcs[0].npcID : null), text: '' });
      focus = lines.length - 1;
      renderRows();
    };

    const save = uiButton('Simpan Dialog', 'cm-btn-primary', async () => {
      rowErrors.clear();
      lines.forEach((l, i) => {
        const t = l.text.trim();
        if (!t) rowErrors.set(i, 'Dialog wajib diisi.');
        else if (t.length > 255) rowErrors.set(i, 'Dialog terlalu panjang (maksimum 255 aksara).');
        else if (/[<>]/.test(t)) rowErrors.set(i, 'Aksara < dan > tidak dibenarkan.');
      });
      if (rowErrors.size) {
        renderRows();
        dlg.setSummary([...rowErrors].map(([i, m]) => ({ label: `Baris ${i + 1}`, message: m })), 'Baris dialog yang perlu dibetulkan');
        return;
      }

      dlg.setBusy(true); save.disabled = true;
      try {
        await this.app.api(`/scenes/${scene.sceneID}/dialogue`, { method: 'PUT', body: { lines: lines.map((l) => ({ npcID: l.npcID, text: l.text })) } });
        dlg.setBusy(false);
        dlg.isDirty = null;
        dlg.close();
        this.app.toast('Dialog berjaya disimpan.');
        await this.refreshAfterChange();
      } catch (e) {
        dlg.setBusy(false); save.disabled = false;
        if (e.status === 401) return;
        if (e.status === 422 && e.data.errors) {
          Object.entries(e.data.errors).forEach(([i, m]) => rowErrors.set(Number(i), m));
          renderRows();
          dlg.setSummary(errorItems(e.data.errors), 'Baris dialog yang perlu dibetulkan');
        } else {
          this.app.reportError('Menyimpan dialog babak', e, { where: this.where(scene) + ' > Dialog' });
        }
      }
    }, 'fa-floppy-disk');

    dlg.setBody(h('div', { class: 'dl-layout' },
      h('div', { class: 'dl-main' },
        h('p', { class: 'cm-hint', text: 'Dialog ini dimainkan SELEPAS pelajar berjaya dalam misi. Tulis kesannya kepada sejarah (contoh: "Kerana keputusan itu, Melaka menjadi pusat perdagangan."). Pilih penutur (NPC atau Pemain), kemudian taip. Baris dibaca dari atas ke bawah.' }),
        rowsEl,
        h('div', { class: 'dl-add' },
          uiButton('Tambah Baris', 'cm-btn-ghost cm-btn-sm', addRow, 'fa-plus'),
          this.app.isAdmin ? uiButton('Urus NPC', 'cm-btn-ghost cm-btn-sm', async () => { if (await this.library.manageNpcs()) renderRows(); }, 'fa-users') : null)),
      stageEl));
    dlg.setFooter(uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), save);
    renderRows();
  }

  async manageNpcs() {
    if (await this.library.manageNpcs()) this.render();
  }

  /* ---------------------------------------------------------------------- */
  /* QUEST                                                                  */
  /* ---------------------------------------------------------------------- */

  /** addAfter = nombor baris dialog tempat Giliran Anda baharu ditambah (pilihan) */
  async editTurns(scene, quest, addAfter = null) {
    if (await this.turnEditor.open({ scene, quest, addAfter })) await this.refreshAfterChange();
  }

  async editQuest(scene, quest) {
    const scenePlus = { ...scene, order: this.sceneNumber(scene) };
    if (await this.quests.open({ scene: scenePlus, quest })) await this.refreshAfterChange();
  }

  /* ---------------------------------------------------------------------- */
  /* NARRATIVE                                                              */
  /* ---------------------------------------------------------------------- */

  /** Add (narrative = null) or edit a narrative: title + summary. */
  editNarrative(narrative) {
    const isNew = !narrative;
    const state = { narrativeTitle: narrative ? narrative.narrativeTitle : '', summary: narrative ? narrative.summary : '' };
    const initial = JSON.stringify(state);
    const dlg = new Dialog({ title: isNew ? 'Naratif Baharu' : 'Edit Maklumat Naratif', size: 'small', isDirty: () => JSON.stringify(state) !== initial, app: this.app });

    const err = { narrativeTitle: errSpan(), summary: errSpan() };
    const show = (errors = {}) => Object.keys(err).forEach((k) => setErr(err[k], errors[k]));
    const title = h('input', { type: 'text', maxlength: '100', value: state.narrativeTitle, placeholder: 'Contoh: Perjalanan Menuju Malaysia', oninput: (e) => { state.narrativeTitle = e.target.value; setErr(err.narrativeTitle, ''); } });
    const summary = h('textarea', { rows: '4', maxlength: '2000', placeholder: 'Ringkasan cerita naratif ini', oninput: (e) => { state.summary = e.target.value; setErr(err.summary, ''); } });
    summary.value = state.summary;

    const save = uiButton(isNew ? 'Simpan Naratif' : 'Simpan Perubahan', 'cm-btn-primary', async () => {
      const errors = {};
      if (!state.narrativeTitle.trim()) errors.narrativeTitle = 'Tajuk naratif wajib diisi.';
      else if (/[<>]/.test(state.narrativeTitle)) errors.narrativeTitle = 'Aksara < dan > tidak dibenarkan.';
      if (!state.summary.trim()) errors.summary = 'Ringkasan wajib diisi.';
      else if (/[<>]/.test(state.summary)) errors.summary = 'Aksara < dan > tidak dibenarkan.';
      show(errors);
      if (Object.keys(errors).length) { dlg.setSummary(errorItems(errors, FIELD_LABELS)); return; }

      dlg.setBusy(true); save.disabled = true;
      try {
        let newID = null;
        if (isNew) newID = (await this.app.api('/narratives', { method: 'POST', body: { ...state, eraID: this.eraID } })).narrativeID;
        else await this.app.api(`/narratives/${narrative.narrativeID}`, { method: 'PUT', body: state });
        dlg.setBusy(false);
        dlg.isDirty = null;
        dlg.close();
        if (newID) { this.narrativeID = newID; this.selectedSceneID = null; }
        this.app.toast(isNew ? 'Naratif berjaya ditambah. Sekarang tambah babak pertama.' : 'Naratif berjaya dikemas kini.');
        await this.refreshAfterChange();
      } catch (e) {
        dlg.setBusy(false); save.disabled = false;
        if (e.status === 401) return;
        if (e.status === 422 && e.data.errors) { show(e.data.errors); dlg.setSummary(errorItems(e.data.errors, FIELD_LABELS)); }
        else this.app.reportError(isNew ? 'Menambah naratif' : 'Mengemas kini naratif', e, { where: isNew ? this.app.where() + ' > Naratif baharu' : this.where() });
      }
    }, 'fa-floppy-disk');

    dlg.setBody(formField('Tajuk naratif', title, { required: true, error: err.narrativeTitle }),
      formField('Ringkasan', summary, { required: true, error: err.summary }));
    dlg.setFooter(uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), save);
  }

  /** Shows exactly what will disappear before the teacher confirms. An era always keeps one narrative. */
  async removeNarrative() {
    const { narrative } = this.data;
    let impact;
    try {
      impact = (await this.app.api(`/narratives/${narrative.narrativeID}/impact`)).impact;
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memuatkan kesan pemadaman naratif', err, { where: this.where() });
      return;
    }

    if (impact.isLastInEra) {
      await this.app.askConfirm({
        title: 'Naratif tidak boleh dipadam',
        text: 'Era mesti mempunyai sekurang-kurangnya satu naratif. Tambah naratif lain dahulu sebelum memadam yang ini.',
        confirmText: 'Faham'
      });
      return;
    }

    const ok = await this.app.askConfirm({
      title: `Padam naratif "${narrative.narrativeTitle}"?`,
      text: `Ini akan memadam ${impact.scenes} babak, ${impact.dialogues} baris dialog, ${impact.quests} misi dan ${impact.completions} rekod misi pelajar yang telah selesai. Tindakan ini tidak boleh dibatalkan.`,
      confirmText: 'Padam Naratif', danger: true
    });
    if (!ok) return;

    try {
      await this.app.api(`/narratives/${narrative.narrativeID}`, { method: 'DELETE' });
      this.app.toast('Naratif berjaya dipadam.');
      this.narrativeID = null;
      await this.open();
      this.app.refreshEra();
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memadam naratif', err, { where: this.where() });
    }
  }
}