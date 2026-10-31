/**
 * ============================================================================
 * contentPlayer.js  -  "Main": the teacher plays the story exactly as a student does
 * Uses: h() (contentManagerEngine.js), Dialog, uiButton (contentUi.js), QuestRules,
 *       board.library (NPCs), board.app (api, era), board.sceneNumber().
 *
 * It opens teacher/story_preview.html in an <iframe>. That page runs the REAL game scene
 * (the same MissionScene, dialogue box, quests and game.css the student game uses) with the story
 * sent from here, so what the teacher sees is what a student gets: timeline card, story with
 * "Giliran Anda", Pendekar Bayang's briefing, the quest, praise and the diary note.
 * Nothing is ever saved from here.
 *
 *   StoryPlayer.play({ scenes, title })
 *   Keys inside the game are the student's keys (Enter / Space = next, 1-5 = choose, H = hint).
 * ============================================================================
 */
class StoryPlayer {
  /** @param {StoryBoard} board */
  constructor(board) {
    this.board = board;
    this.app = board.app;
    this.library = board.library;
    this.frame = null;
    this.story = null;
    this.ready = false;
    this.dlg = null;
  }

  /** @param {{scenes: object[], title: string}} o */
  async play({ scenes, title }) {
    this.dlg = new Dialog({ title: `Main: ${title}`, size: 'wide', app: this.app });
    this.dlg.setBody(h('p', { class: 'cm-hint player-note' }, h('i', { class: 'fas fa-spinner fa-spin' }), ' Menyediakan permainan...'));
    this.dlg.setFooter(uiButton('Tutup', 'cm-btn-ghost', () => this.dlg.close()));

    const skipped = [];
    const [entityLines, role] = await Promise.all([this.entityLines(), this.roleOf()]);
    this.story = this.buildStory({ scenes, title, skipped, entityLines, role });

    this.frame = h('iframe', { class: 'qp-frame', src: 'story_preview.html', title: 'Pratonton cerita seperti yang dilihat pelajar', allow: 'fullscreen' });
    const wrap = h('div', { class: 'qp-frame-wrap' }, this.frame);
    const warn = skipped.length
      ? h('div', { class: 'qp-missing' }, h('strong', { text: 'Quest yang belum lengkap dilangkau dalam pratonton ini:' }),
        h('ul', {}, skipped.slice(0, 5).map((m) => h('li', { text: m }))))
      : null;
    const noRole = role ? null : h('div', { class: 'qp-missing' }, h('strong', { text: 'Naratif ini belum ada peranan pelajar.' }),
      h('p', { text: 'Dalam permainan, pelajar tidak akan tahu siapa dirinya dan baris "Pemain" disebut oleh avatar. Pilih watak di tab Suara Pendekar Bayang, Peranan pelajar.' }));
    const extra = scenes.some((s) => s.quests.length > 1)
      ? h('p', { class: 'cm-hint', text: 'Babak yang mempunyai beberapa quest: pelajar mendapat satu secara rawak. Pratonton ini memaparkan quest pertama.' })
      : null;

    const onMessage = (e) => {
      if (e.source !== this.frame.contentWindow) return;
      if (e.data && e.data.type === 'story-preview-ready') {
        this.ready = true;
        this.frame.contentWindow.postMessage({ type: 'story-preview', story: this.story }, window.location.origin);
        this.frame.focus();                                 // so Enter / 1-5 / H go straight to the game
      }
      if (e.data && e.data.type === 'story-preview-end') this.dlg.close();
    };
    window.addEventListener('message', onMessage);
    this.dlg.onClose = () => window.removeEventListener('message', onMessage);

    this.dlg.setBody(
      h('div', { class: 'qp-live' },
        h('p', { class: 'cm-hint player-note' },
          h('i', { class: 'fas fa-play-circle' }),
          ' Ini permainan sebenar yang dimainkan pelajar. Klik pada permainan, kemudian tekan Enter untuk mula. Tiada apa-apa disimpan.'),
        noRole, warn, extra, wrap));
    this.dlg.setFooter(
      uiButton('Mula semula', 'cm-btn-ghost', () => this.restart(), 'fa-rotate-left'),
      h('span', { class: 'cm-spacer' }),
      uiButton('Tutup', 'cm-btn-primary', () => this.dlg.close()));
  }

  restart() {
    if (this.frame && this.frame.contentWindow && this.ready) {
      this.frame.contentWindow.postMessage({ type: 'story-preview', story: this.story }, window.location.origin);
      this.frame.focus();
    }
  }

  /** The character the student possesses in this narrative (null when none was chosen). */
  async roleOf() {
    try {
      const d = await this.app.api(`/narratives/${this.board.narrativeID}/role-lines`);
      if (!d.role || !d.role.npcID) return null;
      return { npcID: d.role.npcID, lines: { 1: d.role.badgeLine || '', 2: d.role.moralLine || '', 3: d.role.introLine || '' } };
    } catch { return null; }
  }

  /** Pendekar Bayang's lines (all eras + this era), the same ones a student hears. */
  async entityLines() {
    const get = async (id) => {
      try { return (await this.app.api(`/entity-lines?eraID=${id}`)).lines || []; } catch { return []; }
    };
    const [all, mine] = await Promise.all([get(0), get(this.app.era.eraID)]);
    return [...all, ...mine].map(({ era, category, line, text }) => ({ era, category, line, text }));
  }

  buildStory({ scenes, title, skipped, entityLines, role }) {
    const npcs = (this.library.npcs || []).map((n) => ({
      npcID: n.npcID, name: n.name, url: n.url, biography: n.biography, contribution: n.contribution
    }));
    const usable = (quest) => !QuestRules.validateContent(quest.questType, quest.form || {})
      .filter((m) => !/^Giliran Anda/.test(m) && !/: mengapa peristiwa/.test(m)).length;

    return {
      title,
      eraID: this.app.era.eraID,
      eraName: this.app.era.eraName,
      playerName: 'Pelajar',
      role,
      npcs,
      entityLines,
      scenes: scenes.map((s) => {
        let quest = null;
        const q = s.quests[0];
        if (q) {
          if (usable(q)) {
            const content = QuestRules.toStored(q.questType, q.form);
            // an unfinished "Giliran Anda" is left out (the story then plays without it) so the game never stalls
            if (QuestRules.validateContent(q.questType, q.form || {}).some((m) => /^Giliran Anda/.test(m))) content.turns = [];
            quest = {
              questID: q.questID, questName: q.questName, questType: q.questType,
              content,
              instruction: q.instruction || q.description || '', hint: q.hint || '', explanation: q.explanation || '', feedback: q.feedback || ''
            };
          } else {
            skipped.push(`Babak ${this.board.sceneNumber(s)}: "${q.questName}"`);
          }
        }
        return {
          sceneID: s.sceneID, storyline: s.storyline, asset: s.assetUrl || s.asset,
          dialogues: s.dialogues.map((d) => ({ npcID: d.npcID || 0, text: d.text })),
          quest
        };
      })
    };
  }
}
