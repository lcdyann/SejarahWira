/**
 * assets/game/core/domain.js  -  Domain model = class diagram
 * MODULE: core  (Base layer: stage, helpers, templates loader, API, domain model, sound)
 * USE CASE: all   CLASS DIAGRAM: User, Student, Teacher, Avatar, ... (domain.js mirrors the class diagram)
 */
/**
 * ============================================================================
 * domain.js  -  the class diagram, on the front end
 *
 * Same class names, same attributes (private, behind getters) and the same methods as
 * the class diagram. Inheritance:  User -> Student / Teacher.
 * (Assessment -> FormativeAssessment / SummativeAssessment and Question are the classes
 *  already in assets/js/assessmentEngine.js and are re-exported at the bottom.)
 *
 * The classes hold data and talk to the server through Api. They never touch the screen:
 * the scenes (hub/, map/, story/, battle/ ...) do that.
 * ============================================================================
 */
import { AVATAR_SILAT, DEFAULT_SILAT } from '../student/avatarConfig.js';
import { Question, Assessment, FormativeAssessment, SummativeAssessment } from '../../js/assessmentEngine.js';

const resolveAsset = (raw, folder, fallback) => {
  if (!raw) return fallback;
  return raw.startsWith('../') || raw.startsWith('http') || raw.startsWith('/') ? raw : `../assets/gameAsset/${folder}/${raw}`;
};

/* ------------------------------------------------------------------ User */
export class User {
  #userID; #username; #role; #token;
  constructor({ userID = null, username = '', role = 'Student', token = null } = {}) {
    this.#userID = userID; this.#username = username; this.#role = role; this.#token = token;
  }
  get userID() { return this.#userID; }
  get username() { return this.#username; }
  get role() { return this.#role; }
  get token() { return this.#token; }
  get password() { return undefined; }            // never kept on the client

  /** login happens on the login page; here it only restores the saved session. */
  static login(storage = window.localStorage) {
    try {
      const raw = JSON.parse(storage.getItem('sejarahwira_user') || 'null');
      return raw && (raw.studentID || raw.teacherID) ? raw : null;
    } catch { return null; }
  }

  logout(storage = window.localStorage) {
    storage.removeItem('sejarahwira_user');
    window.location.href = '../index.html';
  }
}

/* ---------------------------------------------------------------- Avatar */
const SILAT_CODE = /(?:^|\/)([MF]_(?:HAIR_|HIJABI_)?[A-Z]+)(?:\/[a-z_]+\.png)?$/;   // old rows that point straight at a silat folder
const FALLBACK_AVATAR = '../assets/gameAsset/avatar/avatar_melayu_lelaki.png';

export class Avatar {
  #avatarID; #avatarName; #assetPath; #code;
  constructor({ avatarID = 1, avatarName = 'Wira', asset = null, assetPath = null } = {}) {
    this.#avatarID = avatarID; this.#avatarName = avatarName;
    const raw = String(assetPath || asset || '');
    const file = raw.split('/').pop();
    const legacy = SILAT_CODE.exec(raw);
    // outside a fight the student is the STATIC picture; the silat fighter comes from avatarConfig.js
    if (legacy) {
      this.#code = legacy[1];
      this.#assetPath = `../assets/gameAsset/silat/${legacy[1]}/idle.png`;
    } else {
      this.#code = AVATAR_SILAT[file] || DEFAULT_SILAT;
      this.#assetPath = resolveAsset(raw, 'avatar', FALLBACK_AVATAR);
    }
  }
  get avatarID() { return this.#avatarID; }
  get avatarName() { return this.#avatarName; }
  get assetPath() { return this.#assetPath; }
  /** the silat sprite set this avatar fights as (Wira Training Grounds, The Great Siege) */
  get silatCode() { return this.#code; }

  /** the fighting pose of this avatar (idle, punch, kick, block, evade) */
  pose(name = 'idle') {
    return `../assets/gameAsset/silat/${this.#code}/${name}.png`;
  }

  /** Avatar.loadAvatarAsset(): every avatar the student can pick + the equipped one. */
  static async loadAll(api, studentID) {
    const data = await api.avatars(studentID);
    return { equippedID: data.equippedAvatarID, list: (data.avatars || []).map((a) => new Avatar(a)) };
  }

  /** Avatar.loadAvatarAsset(): the student's equipped avatar from the server (falls back to the saved one). */
  static async loadAvatarAsset(api, studentID, equippedID, saved = {}) {
    try {
      const { equippedID: eq, list } = await Avatar.loadAll(api, studentID);
      const want = eq ?? equippedID;
      const a = list.find((x) => Number(x.avatarID) === Number(want)) || list[0];
      if (a) return a;
    } catch { /* use the saved copy */ }
    return new Avatar({ avatarID: equippedID, avatarName: saved.avatarName, asset: saved.avatarAsset });
  }

  /** Avatar.saveCustomization(): UC-02 (AvatarScene). */
  async saveCustomization(api, studentID) {
    return api.post('avatar/save', { studentID, avatarID: this.#avatarID });
  }
}

/* ----------------------------------------------------------------- Class */
/** Class diagram: Class { -classID -className -batchYear  joinClass() leaveClass() } */
export class ClassGroup {
  #classID; #className; #batchYear;
  constructor(d = {}) { this.#classID = d.classID ?? null; this.#className = d.className ?? ''; this.#batchYear = d.batchYear ?? null; }
  get classID() { return this.#classID; }
  get className() { return this.#className; }
  get batchYear() { return this.#batchYear; }
  /** the student enters a class with the code from the teacher; resolves to the class they joined */
  static async joinClass(api, classCode) { return new ClassGroup((await api.joinClass(classCode)).class); }
  /** the student leaves; progress is kept and they wait in the public class */
  static async leaveClass(api) { return new ClassGroup((await api.leaveClass()).class); }
}

/* --------------------------------------------------------------- Student */
export class Student extends User {
  #studentID; #classID; #studentName; #avatar; #profile;
  constructor(profile = {}, avatar = null) {
    super({ userID: profile.userID, username: profile.username, role: 'Student', token: profile.token });
    this.#studentID = profile.studentID;
    this.#classID = profile.classID || null;
    this.#studentName = profile.studentName || profile.username || 'Wira';
    this.#avatar = avatar || new Avatar({ avatarID: profile.avatarID || 1, asset: profile.avatarAsset });
    this.#profile = profile;
  }
  get studentID() { return this.#studentID; }
  get classID() { return this.#classID; }
  get studentName() { return this.#studentName; }
  get avatar() { return this.#avatar; }
  get silatID() { return this.#avatar.silatCode || 'M_BLACK'; }

  /** UC-02: the mirror in the hub opens the avatar scene. */
  customizeAvatar(game) { return game.go('AvatarScene'); }
  /** the avatar changed (UC-02 saved): the whole game now uses the new one */
  equip(avatar) { this.#avatar = avatar; }
  /** UC-03: the game asks the world map to open the era (see Game.learnHistoricalEra). */
  learnHistoricalEra(game, eraID) { return game.learnHistoricalEra(eraID); }
  /** UC-05 / UC-06 */
  takeAssessment(game, type, eraID) { return game.takeAssessment(type, eraID); }
  /** Class.joinClass() / Class.leaveClass() for this student */
  async joinClass(api, classCode) { const c = await ClassGroup.joinClass(api, classCode); this.#classID = c.classID; return c; }
  async leaveClass(api) { const c = await ClassGroup.leaveClass(api); this.#classID = c.classID; return c; }
  /** Student.loadProfile() */
  loadProfile(api) { return api.profile(this.#studentID); }
  /** UC-07 */
  viewBadges(api) { return api.badges(this.#studentID); }
  /** UC-08 */
  viewArtifacts(api) { return api.artifacts(this.#studentID); }
  /** UC-09 */
  viewLearningProgress(api) { return api.progress(this.#studentID); }
}

/* --------------------------------------------------------------- Teacher */
export class Teacher extends User {
  #teacherID; #teacherName;
  constructor(profile = {}) {
    super({ userID: profile.userID, username: profile.username, role: 'Teacher', token: profile.token });
    this.#teacherID = profile.teacherID; this.#teacherName = profile.teacherName;
  }
  get teacherID() { return this.#teacherID; }
  get teacherName() { return this.#teacherName; }
  manageLearningContent() { window.location.href = '../teacher/content_manager.html'; }
  monitorStudentPerformance() { window.location.href = '../teacher/monitor_analytics.html'; }
  viewLearningProgress() { window.location.href = '../teacher/learning_progress_teacher.html'; }
}

/* -------------------------------------------------------------------- NPC */
export class NPC {
  #npcID; #name; #biography; #contribution; #asset;
  constructor(d = {}) {
    this.#npcID = d.npcID ?? 0;
    this.#name = d.name || 'Tokoh Sejarah';
    this.#biography = d.biography || 'Tiada maklumat biografi.';
    this.#contribution = d.contribution || 'Tiada maklumat sumbangan.';
    this.#asset = d.asset || '../assets/gameAsset/npc/tunku_abdul_rahman.png';
  }
  get npcID() { return this.#npcID; }
  get name() { return this.#name; }
  get asset() { return this.#asset; }
  get isPlayer() { return this.#npcID === 0; }
  viewBiography() { return this.#biography; }
  viewContribution() { return this.#contribution; }
}

/* ---------------------------------------------------------- DialogueLine */
export class DialogueLine {
  #dialogueID; #sequenceOrder; #dialogueLine; #speaker; #teacherNote;
  constructor(d = {}) {
    this.#dialogueID = d.dialogueID; this.#sequenceOrder = d.sequenceOrder;
    this.#dialogueLine = d.dialogueLine || '';
    this.#teacherNote = d.teacherNote || '';          // nota guru (tambahan, tidak mengubah dialog tetap)
    this.#speaker = new NPC(d.speaker || {});
  }
  get dialogueID() { return this.#dialogueID; }
  get sequenceOrder() { return this.#sequenceOrder; }
  get characterSpeaker() { return this.#speaker; }
  get dialogueLine() { return this.#dialogueLine; }
  /** DialogueLine.displayLine(): what the dialogue box needs. */
  displayLine(playerName = 'Pemain') {
    const s = this.#speaker;
    return { name: s.isPlayer ? playerName : s.name, text: this.#dialogueLine, isPlayer: s.isPlayer, npc: s, note: this.#teacherNote };
  }
}

/** DialogueLine.nextLine(): walks a list of lines. */
export class DialogueReader {
  #lines; #i = 0;
  constructor(lines) { this.#lines = lines; }
  get done() { return this.#i >= this.#lines.length; }
  nextLine() { return this.#lines[this.#i++] || null; }
  reset() { this.#i = 0; }
}

/* ----------------------------------------------------------------- Scene */
export class Scene {
  #sceneID; #sceneStoryline; #sceneOrder; #asset; #lines;
  constructor(d = {}) {
    this.#sceneID = d.sceneID; this.#sceneStoryline = d.sceneStoryline || ''; this.#sceneOrder = d.sceneOrder || 0;
    this.#asset = d.asset || '../assets/gameAsset/background/village.jpg';
    this.#lines = (d.dialogues || []).map((x) => new DialogueLine(x));
  }
  get sceneID() { return this.#sceneID; }
  get sceneStoryline() { return this.#sceneStoryline; }
  get sceneOrder() { return this.#sceneOrder; }
  get asset() { return this.#asset; }
  get dialogues() { return this.#lines; }
  /** NPCs that speak in this scene (the player excluded) */
  get characters() {
    const seen = new Map();
    this.#lines.forEach((l) => { const n = l.characterSpeaker; if (!n.isPlayer && !seen.has(n.npcID)) seen.set(n.npcID, n); });
    return [...seen.values()];
  }
  /** Scene.loadScene(): scenes arrive already built with the narrative. */
  static loadScene(raw) { return new Scene(raw); }
  /** Scene.displayScene(): the background + the timeline card text. */
  displayScene() { return { background: this.#asset, card: this.#sceneStoryline }; }
  /** Scene.loadNextScene() */
  loadNextScene(narrative) { return narrative.selectScene(narrative.indexOf(this) + 1); }
}

/* ------------------------------------------------------------- Narrative */
export class Narrative {
  #narrativeID; #title; #summary; #scenes; #role;
  constructor(d = {}) {
    this.#narrativeID = d.narrativeID; this.#title = d.narrativeTitle || d.title || '';
    this.#summary = d.summary || '';
    this.#scenes = (d.scenes || []).map(Scene.loadScene);
    this.#role = d.role ? { npc: new NPC(d.role), lines: d.role.lines || {} } : null;
  }
  get narrativeID() { return this.#narrativeID; }
  get title() { return this.#title; }
  get summary() { return this.#summary; }
  get scenes() { return this.#scenes; }
  get role() { return this.#role; }
  indexOf(scene) { return this.#scenes.indexOf(scene); }

  /** Narrative.loadNarrative() */
  static async loadNarrative(api, { eraID, studentID, narrativeID, excludeNarrativeID }) {
    const data = await api.loadNarrative({ eraID, studentID, narrativeID, excludeNarrativeID });
    return new Narrative(data.scenario);
  }
  /** Narrative.selectScene() */
  selectScene(i) { return this.#scenes[i] || null; }
  /** Narrative.evaluateBadgeUnlock() */
  async evaluateBadgeUnlock(api, body) { return api.evaluateBadgeUnlock({ ...body, narrativeID: this.#narrativeID }); }
}

/* ---------------------------------------------------------------- Quest */
export class Quest {
  #questID; #questName; #instructions;
  constructor(d = {}) {
    this.#questID = d.questID; this.#questName = d.questName || ''; this.#instructions = d.instruction || d.description || '';
    this.sceneID = d.sceneID; this.questType = Number(d.questType);
    this.content = d.questContent || null;
    this.hint = d.hint || ''; this.explanation = d.explanation || ''; this.feedback = d.feedback || '';
    this.isCompleted = !!d.isCompleted;
  }
  get questID() { return this.#questID; }
  get questName() { return this.#questName; }
  get instructions() { return this.#instructions; }

  /** Quest.assignQuest(): the "hanger" - one quest (random if several) for every scene that has quests. */
  static async assignQuest(api, { narrativeID, studentID, questIDs }) {
    const data = await api.assignQuest({ narrativeID, studentID, questIDs: questIDs && questIDs.length ? questIDs.join(',') : undefined });
    return data.quests;
  }
  static async load(api, questID, base = {}) {
    const data = await api.loadQuest(questID);
    return new Quest({ ...base, ...data.quest });
  }
}

/** QuestCompletion.verifyCompletion() */
export class QuestCompletion {
  static async verifyCompletion(api, { studentID, questID, eraID, narrativeID, questIDs }) {
    return api.verifyCompletion({ studentID, questID, eraID, narrativeID, questIDs });
  }
  static async resetReplay(api, { studentID, eraID }) { return api.resetReplay({ studentID, eraID }); }
}

/* ---------------------------------------------------------- HistoricalEra */
export class HistoricalEra {
  #eraID; #eraName; #description;
  constructor(d = {}) {
    this.#eraID = Number(d.eraID); this.#eraName = d.eraName || ''; this.#description = d.description || '';
    this.status = d.eraStatus || 'locked';
    this.narrativeDone = !!d.narrativeDone;
  }
  get eraID() { return this.#eraID; }
  get eraName() { return this.#eraName; }
  get description() { return this.#description; }
  get isUnlocked() { return this.status !== 'locked'; }
  get isCompleted() { return this.status === 'completed'; }

  /** HistoricalEra.loadEra() -> all eras with the student's status */
  static async loadEra(api, studentID) {
    const data = await api.eras(studentID);
    return data.eras.map((e) => new HistoricalEra(e));
  }
  /** HistoricalEra.loadRandomNarrative(): `excludeNarrativeID` makes a replay different. */
  loadRandomNarrative(api, studentID, excludeNarrativeID) {
    return Narrative.loadNarrative(api, { eraID: this.#eraID, studentID, excludeNarrativeID });
  }
  /** HistoricalEra.evaluateUnlockAssessment(): the assessments open when the badge is owned. */
  evaluateUnlockAssessment() { return this.narrativeDone || this.isCompleted; }
}

/* ------------------------------------------------------------ Badge etc. */
export class Badge {
  constructor(d = {}) { Object.assign(this, d); }
  /** Badge.displayBadge() */
  displayBadge() { return { name: this.badgeTitle || this.name, asset: this.badgeAsset || this.asset, era: this.eraName }; }
}

export class Artifact {
  constructor(d = {}) { Object.assign(this, d); }
  displayArtifact() { return { name: this.name, asset: this.asset }; }
  displayMoralLesson() { return this.moralLesson || ''; }
}

/* ------------------------------------------------------- LearningSupport */
export class LearningSupport {
  #hint; #explanation; #feedback;
  constructor({ hint = '', explanation = '', feedback = '' } = {}) {
    this.#hint = hint; this.#explanation = explanation; this.#feedback = feedback;
  }
  provideHint() { return this.#hint || 'Perhatikan butiran dalam kad garis masa tadi.'; }
  provideExplanation() { return this.#explanation || 'Baca semula kad garis masa dan fikirkan urutan peristiwa.'; }
  provideFeedback() { return this.#feedback || 'Tepat sekali.'; }
}

/* ------------------------------------------------- EraProgression (state) */
export class EraProgression {
  constructor(eras) { this.eras = eras; }
  statusOf(eraID) { return (this.eras.find((e) => e.eraID === Number(eraID)) || {}).status || 'locked'; }
  /** Every era completed -> the epilogue plays. */
  get allCompleted() { return this.eras.length > 0 && this.eras.every((e) => e.isCompleted); }
  /** First time ever: the first era is still only "unlocked". */
  get isFirstTime() { return this.eras.length > 0 && this.eras[0].status === 'unlocked'; }
  nextEra(eraID) {
    const i = this.eras.findIndex((e) => e.eraID === Number(eraID));
    return i >= 0 ? this.eras[i + 1] || null : null;
  }
}

export { Question, Assessment, FormativeAssessment, SummativeAssessment };
export { resolveAsset };
