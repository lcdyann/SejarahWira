/**
 * ============================================================================
 * storyPreview.js  -  plays a narrative or one scene exactly like a student does
 *
 * Loaded by teacher/story_preview.html (shown in an <iframe> by the content manager).
 *   parent -> here   { type: 'story-preview', story }
 *       story = { title, eraID, eraName, playerName, avatar, role: { npcID, lines:{1,2,3} } | null,
 *                 scenes: [{ sceneID, storyline, asset, dialogues:[{npcID, text}],
 *                            quest: { questName, questType, content, instruction, hint, explanation, feedback } | null }],
 *                 npcs: [{ npcID, name, url, biography, contribution }],
 *                 entityLines: [{ era, category, line, text }] }
 *   here -> parent   { type: 'story-preview-ready' }  and  { type: 'story-preview-end' }
 *
 * It runs the same MissionScene, DialogueBox, quests and game.css as the student game.
 * Only the data source differs (it comes from the editor, not the database) and nothing is saved.
 * ============================================================================
 */
import { Game } from './game/game.js';
import { MissionScene } from './game/missionScene.js';
import { PendekarBayang } from './game/entity.js';

const PLAYER_FALLBACK = '../assets/gameAsset/avatar/avatar_melayu_lelaki.png';

/** In-memory stand-in for the server: answers the calls MissionScene makes. */
class PreviewApi {
  constructor(story) { this.story = story; }
  async entityLines() { return { success: true, lines: this.story.entityLines || [] }; }
  async loadQuest(id) {
    const s = this.story.scenes.find((x) => x.quest && x.quest.questID === Number(id));
    const q = s.quest;
    return { quest: { questID: q.questID, sceneID: s.sceneID, questName: q.questName, questType: q.questType, questContent: q.content,
      instruction: q.instruction, hint: q.hint, explanation: q.explanation, feedback: q.feedback } };
  }
  async verifyCompletion() { return { success: true }; }
  async resetReplay() { return { success: true }; }
  async evaluateBadgeUnlock() { return { isNarrativeComplete: true }; }
}

const noRun = { get: () => null, set() {}, clear() {}, last: () => null, setLast() {}, role: () => null, setRole() {} };

class PreviewMission extends MissionScene {
  async prepare() {
    const story = this.game.story;
    const npcOf = (id) => story.npcs.find((n) => Number(n.npcID) === Number(id)) || null;
    const scenes = story.scenes.map((s, i) => ({
      sceneID: s.sceneID, sceneOrder: i + 1, sceneStoryline: s.storyline, asset: s.asset,
      dialogues: s.dialogues.map((d, n) => {
        const npc = d.npcID ? npcOf(d.npcID) : null;
        return { dialogueID: n + 1, sequenceOrder: n + 1, dialogueLine: d.text,
          speaker: npc ? { npcID: npc.npcID, name: npc.name, asset: npc.url, biography: npc.biography, contribution: npc.contribution } : { npcID: 0 } };
      })
    }));
    const { Narrative } = await import('./game/domain.js');
    const r = story.role && npcOf(story.role.npcID);
    const role = r ? { npcID: r.npcID, name: r.name, asset: r.url, biography: r.biography, contribution: r.contribution, lines: story.role.lines || {} } : null;
    this.narrative = new Narrative({ narrativeID: 1, narrativeTitle: story.title, scenes, role });
    this.quests = story.scenes.filter((s) => s.quest).map((s) => ({ questID: s.quest.questID, sceneID: s.sceneID, isCompleted: false }));
    this.run = { narrativeID: 1, questIDs: this.quests.map((q) => q.questID), sceneIdx: 0 };
    if (!this.narrative.scenes.length) throw new Error('Naratif ini belum mempunyai babak.');
    this.paintChips();
  }

  async finishChapter() {
    this.layer.innerHTML = '';
    this.dialog.hide();
    await this.gate(this.roleSay(1));                 // the character thanks the student
    const pick = await this.gate(this.game.openModal({
      title: 'Tamat pratonton',
      body: '<p>Dalam permainan sebenar, pelajar kemudian menerima lencana dan memilih pintu seterusnya. Tiada apa-apa disimpan di sini.</p>',
      buttons: [{ label: 'Main semula', primary: true }, { label: 'Tutup' }]
    }));
    if (pick === 'Main semula') this.game.restart(); else window.parent.postMessage({ type: 'story-preview-end' }, window.location.origin);
  }
}

class PreviewGame extends Game {
  constructor(root) {
    super(root);
    this.runStore = noRun;
    this.input.global.f = () => this.stage.toggleFullscreen();
  }

  start(story) {
    this.story = story;
    this.api = new PreviewApi(story);
    this.student = { studentID: 0, studentName: story.playerName || 'Pelajar', avatar: { assetPath: story.avatar || PLAYER_FALLBACK } };
    this.entity = new PendekarBayang({ dialog: this.dialog, api: this.api, student: this.student });
    this.eras = [{ eraID: story.eraID, eraName: story.eraName }];
    this.restart();
  }

  restart() {
    this.stage.modalLayer.innerHTML = '';
    this.go('MissionScene', { eraID: this.story.eraID });
  }

  eraById() { return { eraID: this.story.eraID, eraName: this.story.eraName }; }
  async refreshEras() { return this.eras; }

  async go(name, params = {}) {
    if (name !== 'MissionScene') {                       // "Keluar ke peta" and the like: the preview simply ends
      if (this.scene) this.scene.exit();
      this.scene = null;
      window.parent.postMessage({ type: 'story-preview-end' }, window.location.origin);
      return;
    }
    const seq = ++this._seq;
    if (this.scene) this.scene.exit();
    this.dialog.hide();
    this.scene = new PreviewMission(this);
    this.scene.name = name;
    try { await this.scene.mount(params); } catch (err) { if (seq === this._seq) this.fatal(err); }
  }

  fatal(err) {
    console.error(err);
    this.openModal({ title: 'Tidak dapat dipaparkan', body: `<p>${String(err && err.message ? err.message : err).replace(/</g, '&lt;')}</p>`, buttons: [{ label: 'Tutup', primary: true }] });
  }
}

const game = new PreviewGame(document.getElementById('game-root'));
window.sejarahPreview = game;
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  const d = e.data;
  if (d && d.type === 'story-preview' && d.story) game.start(d.story);
});
window.parent.postMessage({ type: 'story-preview-ready' }, window.location.origin);
