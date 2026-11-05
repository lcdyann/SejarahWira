/**
 * ============================================================================
 * contentLibrary.js  -  images and NPCs
 * Uses: h(), setChildren(), chip() (contentManagerEngine.js)  +  Dialog, formField... (contentUi.js)
 *
 *   Library.pickAsset()   a picker that shows every image with its NAME and a preview.
 *                         Teachers choose by name + picture; the database stores the file name.
 *                         Images are fixed (put in assets/gameAsset by the admin); teachers can only choose, not upload.
 *   Library.manageNpcs()  list of NPCs on the left, form on the right (name, picture, biography,
 *                         contribution). An NPC that still speaks in a scene cannot be deleted.
 * ============================================================================
 */

const PLAYER_AVATAR = '../assets/gameAsset/avatar/avatar_melayu_lelaki.png';   // the student's own avatar speaks the "Pemain" lines

class Library {
  constructor(app) {
    this.app = app;
    this.cache = { background: null, npc: null };
    this.npcs = null;
  }

  /* ----- data ----- */

  async assets(type, force = false) {
    if (force || !this.cache[type]) {
      const data = await this.app.api(`/assets?type=${type}`);
      this.cache[type] = data.assets;
    }
    return this.cache[type];
  }

  async loadNpcs(force = false) {
    if (force || !this.npcs) {
      const data = await this.app.api('/npcs');
      this.npcs = data.npcs;
    }
    return this.npcs;
  }

  npc(id) {
    return (this.npcs || []).find((n) => Number(n.npcID) === Number(id)) || null;
  }

  /** Who is speaking: an NPC (name + portrait) or the player. */
  speaker(npcID) {
    const npc = npcID ? this.npc(npcID) : null;
    return npc ? { name: npc.name, url: npc.url, isNpc: true } : { name: 'Pemain', url: PLAYER_AVATAR, isNpc: false };
  }

  /** Name teachers know a background by (falls back to the file name). */
  backgroundName(file) {
    const found = (this.cache.background || []).find((a) => a.file === file);
    return found ? found.displayName : file;
  }

  /* ----- picker ----- */

  /**
   * @returns {Promise<{file,url,displayName}|null>}  null when cancelled
   */
  async pickAsset({ type, title, currentFile = null }) {
    let list;
    try {
      list = await this.assets(type, true);
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memuatkan senarai gambar', err, { where: `${this.app.where()} > Pustaka gambar` });
      return null;
    }

    return new Promise((resolve) => {
      let selected = list.find((a) => a.file === currentFile) || null;
      let query = '';
      let settled = false;

      const dlg = new Dialog({ title, size: 'wide', app: this.app });
      const finish = (value) => {
        if (settled) return;
        settled = true;
        dlg.close();
        resolve(value);
      };
      dlg.onClose = () => { if (!settled) { settled = true; resolve(null); } };

      const grid = h('div', { class: 'cm-asset-grid', role: 'listbox' });
      const useBtn = uiButton('Gunakan Gambar Ini', 'cm-btn-primary', () => { if (selected) finish(selected); }, 'fa-check');
      const refreshFooter = () => { useBtn.disabled = !selected; };

      const renderGrid = () => {
        const needle = query.trim().toLowerCase();
        const shown = needle ? list.filter((a) => a.displayName.toLowerCase().includes(needle)) : list;
        if (shown.length === 0) {
          setChildren(grid, h('p', { class: 'cm-empty', text: list.length ? 'Tiada gambar sepadan dengan carian.' : 'Belum ada gambar dalam pustaka.' }));
          return;
        }
        setChildren(grid, shown.map((a) => h('div', { class: 'cm-asset-wrap' },
          h('button', {
            type: 'button',
            role: 'option',
            class: `cm-asset-card${selected && selected.file === a.file ? ' is-selected' : ''}`,
            'aria-selected': selected && selected.file === a.file ? 'true' : 'false',
            onclick: () => { selected = a; renderGrid(); refreshFooter(); },
            ondblclick: () => finish(a)
          }, thumb(a.url, a.displayName, type === 'npc' ? 'cm-asset-img is-npc' : 'cm-asset-img'), h('span', { class: 'cm-asset-name', text: a.displayName })))));
      };

      const search = h('input', {
        type: 'search', class: 'cm-input', placeholder: 'Cari gambar mengikut nama...', 'aria-label': 'Cari gambar',
        oninput: (e) => { query = e.target.value; renderGrid(); }
      });

      dlg.setBody(
        search,
        grid);
      dlg.setFooter(uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), useBtn);

      renderGrid();
      refreshFooter();
    });
  }

  /* ----- NPC library ----- */

  /** @returns {Promise<boolean>} true when something was added / changed / deleted */
  async manageNpcs() {
    try {
      await this.loadNpcs(true);
    } catch (err) {
      if (err.status !== 401) this.app.reportError('Memuatkan senarai NPC', err, { where: `${this.app.where()} > Pustaka NPC` });
      return false;
    }

    return new Promise((resolve) => {
      let changed = false;
      let editing = null;                       // npc being edited, null = new NPC
      let form = { name: '', biography: '', contribution: '', asset: '', url: '' };
      let snapshot = JSON.stringify(form);

      const isDirty = () => JSON.stringify(form) !== snapshot;
      const dlg = new Dialog({ title: 'Pustaka NPC', size: 'wide', isDirty, app: this.app });
      dlg.onClose = () => resolve(changed);

      const listEl = h('div', { class: 'cm-npc-list' });
      const formEl = h('div', { class: 'cm-npc-form' });

      const load = (npc) => {
        editing = npc;
        form = npc
          ? { name: npc.name, biography: npc.biography, contribution: npc.contribution, asset: npc.asset, url: npc.url }
          : { name: '', biography: '', contribution: '', asset: '', url: '' };
        snapshot = JSON.stringify(form);
        renderList();
        renderForm({});
      };

      const choose = async (npc) => {
        if (isDirty()) {
          const discard = await this.app.askConfirm({ title: 'Buang perubahan?', text: 'Perubahan yang belum disimpan akan hilang.', confirmText: 'Buang', danger: true });
          if (!discard) return;
        }
        load(npc);
      };

      const renderList = () => {
        setChildren(listEl,
          uiButton('NPC Baharu', 'cm-btn-primary cm-btn-sm', () => choose(null), 'fa-plus'),
          this.npcs.length === 0 ? h('p', { class: 'cm-empty', text: 'Belum ada NPC.' }) : null,
          this.npcs.map((n) => h('button', {
            type: 'button',
            class: `cm-npc-item${editing && editing.npcID === n.npcID ? ' is-selected' : ''}`,
            onclick: () => choose(n)
          }, thumb(n.url, n.name, 'cm-npc-thumb'),
          h('span', { class: 'cm-npc-meta' }, h('strong', { text: n.name }), h('small', { text: n.lineCount ? `${n.lineCount} baris dialog` : 'Belum digunakan' })))));
      };

      const renderForm = (errors) => {
        const nameIn = h('input', { type: 'text', maxlength: '100', value: form.name, oninput: (e) => { form.name = e.target.value; } });
        const bioIn = h('textarea', { rows: '3', maxlength: '2000', oninput: (e) => { form.biography = e.target.value; } });
        const conIn = h('textarea', { rows: '3', maxlength: '2000', oninput: (e) => { form.contribution = e.target.value; } });
        bioIn.value = form.biography;
        conIn.value = form.contribution;

        const errs = { name: errSpan(), asset: errSpan(), biography: errSpan(), contribution: errSpan() };
        Object.keys(errs).forEach((k) => setErr(errs[k], errors[k]));

        const portrait = h('div', { class: 'cm-portrait-pick' },
          form.url ? thumb(form.url, form.name, 'cm-portrait-img') : h('div', { class: 'cm-portrait-empty', text: 'Belum ada gambar' }),
          uiButton(form.url ? 'Tukar Gambar' : 'Pilih Gambar', 'cm-btn-ghost cm-btn-sm', async () => {
            const picked = await this.pickAsset({ type: 'npc', title: 'Pilih Gambar NPC', currentFile: form.asset });
            if (picked) { form.asset = picked.file; form.url = picked.url; renderForm({}); }
          }, 'fa-image'));

        const save = uiButton(editing ? 'Simpan Perubahan' : 'Simpan NPC', 'cm-btn-primary', async () => {
          save.disabled = true;
          try {
            const body = { name: form.name, biography: form.biography, contribution: form.contribution, asset: form.asset };
            let id = editing && editing.npcID;
            if (editing) await this.app.api(`/npcs/${id}`, { method: 'PUT', body });
            else id = (await this.app.api('/npcs', { method: 'POST', body })).npcID;
            changed = true;
            await this.loadNpcs(true);
            load(this.npcs.find((n) => Number(n.npcID) === Number(id)) || null);
            this.app.toast('NPC berjaya disimpan.');
          } catch (err) {
            if (err.status === 401) return;
            if (err.status === 422 && err.data.errors) renderForm(err.data.errors);
            else this.app.reportError(editing ? 'Mengemas kini NPC' : 'Menambah NPC', err, { where: `${this.app.where()} > Pustaka NPC${editing ? ` > ${editing.name}` : ' > NPC baharu'}` });
          } finally {
            save.disabled = false;
          }
        }, 'fa-floppy-disk');

        const remove = editing ? uiButton('Padam NPC', 'cm-btn-danger', async () => {
          const ok = await this.app.askConfirm({
            title: 'Padam NPC?', text: `NPC "${editing.name}" akan dipadam. Tindakan ini tidak boleh dibatalkan.`, confirmText: 'Padam', danger: true
          });
          if (!ok) return;
          try {
            await this.app.api(`/npcs/${editing.npcID}`, { method: 'DELETE' });
            changed = true;
            await this.loadNpcs(true);
            load(null);
            this.app.toast('NPC berjaya dipadam.');
          } catch (err) {
            if (err.status !== 401) this.app.reportError('Memadam NPC', err, { where: `${this.app.where()} > Pustaka NPC > ${editing.name}` });
          }
        }, 'fa-trash') : null;

        setChildren(formEl,
          h('h4', { text: editing ? `Edit NPC: ${editing.name}` : 'NPC Baharu' }),
          formField('Nama NPC', nameIn, { required: true, error: errs.name }),
          formField('Gambar NPC', portrait, { required: true, error: errs.asset }),
          formField('Biografi', bioIn, { optional: true, hint: 'Dipaparkan apabila pelajar menekan gambar tokoh.', error: errs.biography }),
          formField('Sumbangan Sejarah', conIn, { optional: true, error: errs.contribution }),
          h('div', { class: 'cm-modal-actions cm-left' }, save, remove));
      };

      dlg.setBody(h('div', { class: 'cm-npc-layout' }, listEl, formEl));
      dlg.setFooter(uiButton('Tutup', 'cm-btn-ghost', () => dlg.requestClose()));
      load(null);
    });
  }
}