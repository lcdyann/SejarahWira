/**
 * ============================================================================
 * contentTurns.js  -  "Giliran Anda" editor (the story moments where the student speaks)
 * Uses: h(), setChildren() (contentManagerEngine.js), Dialog, uiButton, formField, errSpan (contentUi.js),
 *       QuestRules (questRules.js, the SAME rules as the server), board.library (speakers).
 *
 * A turn belongs to a scene's quest (it is saved inside the quest, no new table):
 *     after    the dialogue line after which that character turns to the student
 *     options  2-3 replies the student can say (one right); each has the character's reaction
 *     clue     what Pendekar Bayang whispers when a wrong reply rewinds the exchange
 *
 *   TurnEditor.open({ scene, quest })  -> Promise<boolean>  true when saved
 * ============================================================================
 */
class TurnEditor {
  constructor(app, library) {
    this.app = app;
    this.library = library;
  }

  /** addAfter = baris dialog tempat Giliran Anda baharu ditambah terus apabila tetingkap dibuka (pilihan) */
  open({ scene, quest, addAfter = null }) {
    return new Promise((resolve) => {
      let changed = false;
      const L = QuestRules.LIMITS;
      const lines = scene.dialogues
        .map((l, i) => ({ n: i + 1, npcID: l.npcID, text: l.text }))
        .filter((l) => l.npcID);                              // only a character (not the student) can ask
      const turns = JSON.parse(JSON.stringify((quest.form && quest.form.turns) || []));
      const snap = () => JSON.stringify(turns);
      let snapshot = snap();
      // dibuka daripada butang "+ Giliran Anda selepas baris ini": sediakan satu Giliran Anda kosong di baris itu
      if (addAfter && !turns.some((x) => Number(x.after) === Number(addAfter)) && turns.length < L.turns[1] && lines.some((l) => l.n === Number(addAfter))) {
        const fresh = QuestRules.defaultTurn(); fresh.after = Number(addAfter); turns.push(fresh);
      }

      const dlg = new Dialog({
        title: `Giliran Anda: ${quest.questName}`, size: 'wide',
        isDirty: () => snap() !== snapshot, app: this.app
      });
      dlg.onClose = () => resolve(changed);

      const list = h('div', { class: 'te-list' });
      const errorBox = h('div', { class: 'qe-errors is-hidden', role: 'alert' });
      const speakerName = (npcID) => this.library.speaker(npcID).name;
      const short = (t) => (t.length > 70 ? `${t.slice(0, 67)}...` : t);
      const freeLine = () => {
        const used = new Set(turns.map((t) => Number(t.after)));
        const hit = lines.find((l) => !used.has(l.n));
        return hit ? hit.n : null;
      };

      const field = (label, control, hint) => h('label', { class: 'te-field' }, h('span', { text: label }), control, hint ? h('small', { text: hint }) : null);
      const input = (get, set, max, placeholder) =>
        h('input', { type: 'text', maxlength: String(max), placeholder, value: get(), oninput: (e) => { set(e.target.value); } });

      // tajuk langkah bernombor supaya guru baharu faham urutan: 1 siapa bertanya, 2 balasan, 3 bisikan
      const step = (no, title, hint) => h('div', { class: 'te-step' },
        h('span', { class: 'te-step-no', text: String(no) }), h('strong', { text: title }), hint ? h('small', { text: hint }) : null);

      const renderTurn = (t, ti) => {
        const asker = lines.find((l) => l.n === Number(t.after));
        const select = h('select', { 'aria-label': 'Selepas baris dialog', onchange: (e) => { t.after = Number(e.target.value); render(); } },
          lines.map((l) => h('option', { value: String(l.n), selected: l.n === Number(t.after) ? '' : null }, `Baris ${l.n}. ${speakerName(l.npcID)}: ${short(l.text)}`)));
        const opts = h('div', { class: 'qe-rows' }, t.options.map((o, oi) => h('div', { class: 'te-option' },
          h('div', { class: 'qe-row' },
            h('input', {
              type: 'radio', name: `te-correct-${ti}`, class: 'qe-radio', 'aria-label': `Balasan ${oi + 1} ialah yang betul`,
              checked: o.isCorrect ? '' : null,
              onchange: () => { t.options.forEach((x, j) => { x.isCorrect = j === oi; }); render(); }
            }),
            input(() => o.text, (v) => { o.text = v; }, L.turnReply, `Apa yang anda katakan (balasan ${oi + 1})`),
            h('button', {
              type: 'button', class: 'cm-icon-btn is-danger', 'aria-label': 'Buang balasan',
              disabled: t.options.length <= L.turnOptions[0] ? '' : null,
              onclick: () => { const was = o.isCorrect; t.options.splice(oi, 1); if (was && t.options[0]) t.options[0].isCorrect = true; render(); }
            }, h('i', { class: 'fas fa-trash' }))),
          h('div', { class: 'qe-row te-reaction' },
            h('i', { class: `fas ${o.isCorrect ? 'fa-circle-check' : 'fa-triangle-exclamation'}`, title: o.isCorrect ? 'Reaksi jika betul' : 'Kesan dalam cerita jika salah' }),
            input(() => o.reaction, (v) => { o.reaction = v; }, L.turnReaction,
              o.isCorrect ? 'Watak menjawab (cerita diteruskan)' : 'Kesan dalam cerita (bukan "Salah!")')))));

        return h('section', { class: 'te-turn' },
          h('header', { class: 'te-turn-head' },
            h('strong', { text: `Giliran Anda ${ti + 1}` }),
            h('span', { class: 'cm-spacer' }),
            h('button', { type: 'button', class: 'cm-icon-btn is-danger', 'aria-label': 'Buang Giliran Anda ini', onclick: () => { turns.splice(ti, 1); render(); } }, h('i', { class: 'fas fa-trash' }))),
          step(1, 'Siapa bertanya kepada pelajar?', 'Pilih baris dialog. Baris itu mesti berbentuk soalan kepada "kau".'),
          field('Selepas baris:', select, asker ? null : 'Baris dialog ini sudah tiada. Pilih baris lain.'),
          asker ? h('div', { class: 'te-asker' }, h('b', { text: `${speakerName(asker.npcID)}: ` }), asker.text) : null,
          step(2, 'Apa yang pelajar boleh balas?', 'Tandakan bulatan di sebelah balasan yang BETUL (hanya satu). Bawahnya, tulis kesan dalam cerita.'),
          opts,
          t.options.length < L.turnOptions[1]
            ? uiButton('Tambah balasan', 'cm-btn-ghost cm-btn-sm', () => { t.options.push({ text: '', isCorrect: false, reaction: '' }); render(); }, 'fa-plus') : null,
          step(3, 'Bisikan jika pelajar tersilap', 'Pendekar Bayang berbisik, kemudian watak bertanya semula.'),
          field('Bisikan Pendekar Bayang selepas balasan salah:', input(() => t.clue, (v) => { t.clue = v; }, L.turnClue, 'Rujuk apa yang watak katakan tadi. Jangan tulis jawapan.'),
            'Pelajar mesti dapat mencarinya dalam dialog sebelum ini. Itulah yang menjadikan membaca penting.'));
      };

      const render = () => {
        const hasLines = lines.length > 0;
        setChildren(list,
          !hasLines ? h('p', { class: 'cm-muted', text: 'Babak ini belum ada dialog daripada watak. Tulis dialog dahulu (kad Dialog), kemudian kembali ke sini.' }) : null,
          turns.map(renderTurn),
          turns.length === 0 && hasLines ? h('p', { class: 'cm-muted', text: 'Belum ada Giliran Anda. Tanpanya, pelajar hanya membaca dialog selepas misi seperti biasa.' }) : null,
          hasLines && turns.length < L.turns[1] && freeLine() !== null
            ? uiButton('Tambah Giliran Anda', 'cm-btn-primary cm-btn-sm', () => { const t = QuestRules.defaultTurn(); t.after = freeLine(); turns.push(t); render(); }, 'fa-plus') : null);
      };

      const showErrors = (messages) => {
        if (messages.length) {
          setChildren(errorBox, h('strong', { text: 'Sila betulkan:' }), h('ul', {}, messages.map((m) => h('li', { text: m }))));
          errorBox.classList.remove('is-hidden');
        } else errorBox.classList.add('is-hidden');
      };

      const saveBtn = uiButton('Simpan', 'cm-btn-primary', async () => {
        turns.sort((a, b) => Number(a.after) - Number(b.after));
        const payload = {
          questName: quest.questName, description: quest.description, instruction: quest.instruction,
          questType: quest.questType, hint: quest.hint, explanation: quest.explanation, feedback: quest.feedback,
          sceneID: scene.sceneID, form: { ...quest.form, turns }
        };
        const local = QuestRules.validate(payload);
        const bad = turns.filter((t) => !lines.some((l) => l.n === Number(t.after))).map((t, i) => `Giliran Anda ${i + 1}: baris dialog tiada.`);
        const messages = [...local.contentErrors, ...bad];
        showErrors(messages);
        if (messages.length) return;

        dlg.setBusy(true); saveBtn.disabled = true;
        try {
          await this.app.api(`/quests/${quest.questID}`, { method: 'PUT', body: payload });
          changed = true; snapshot = snap(); dlg.setBusy(false); dlg.close();
          this.app.toast('Giliran Anda disimpan.');
        } catch (err) {
          dlg.setBusy(false); saveBtn.disabled = false;
          if (err.status === 401) return;
          showErrors(err.status === 422 && err.data ? [...(err.data.contentErrors || []), ...Object.values(err.data.errors || {})] : [(err.data && err.data.message) || 'Gagal disimpan. Tiada perubahan dibuat.']);
        }
      }, 'fa-floppy-disk');

      dlg.setBody(h('div', { class: 'te-wrap' },
        h('p', { class: 'cm-hint' }, h('i', { class: 'fas fa-comments' }), ' Pelajar tidak boleh menekan Enter sahaja: di sini watak berpaling kepada mereka dan mereka mesti memilih apa yang hendak dikatakan, berdasarkan apa yang baru dibaca. Cadangan: 1 hingga 3 setiap babak.'),
        errorBox, list));
      dlg.setFooter(h('span', { class: 'cm-spacer' }), uiButton('Batal', 'cm-btn-ghost', () => dlg.requestClose()), saveBtn);
      render();
    });
  }
}
