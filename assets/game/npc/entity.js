/**
 * assets/game/npc/entity.js  -  Pendekar Bayang + portrait helpers
 * MODULE: npc  (Pendekar Bayang + NPC portraits and their lines)
 * USE CASE: UC-03   CLASS DIAGRAM: NPC
 */
/**
 * ============================================================================
 * entity.js  -  Pendekar Bayang
 * He speaks every briefing (taklimat), hint (bisikan), correction (pembetulan) and praise
 * (pujian). His lines come from entityLines.js (defaults) + the teacher overrides loaded
 * from GET /api/entity/lines. Poses come from the category.
 * ============================================================================
 */
import { el, esc } from '../core/core.js';
import { CATEGORY_BY_KEY, ENTITY_NAME, fillMarkers, pickLine } from './entityLines.js';

export const NPC_DIR = '../assets/gameAsset/npc';

/** other file names tried when the main one is not found */
const POSE_FILES = { surprised: ['surprised', 'suprised'], impressed: ['impressed', 'impresed', 'impressd'] };

/** A portrait element: the pose picture, or a drawn silhouette when the picture is missing. */
export const entityPortrait = (pose = 'smirk', cls = '') => {
  const wrap = el('div', `entity-portrait ${cls}`);
  wrap.dataset.pose = pose;
  const img = new Image();
  img.alt = ENTITY_NAME;
  // a picture may have been saved with a common spelling mistake (suprised): try those too, then give up
  const tries = (POSE_FILES[pose] || [pose]).map((name) => `${NPC_DIR}/pendekar_bayang_${name}.png`);
  let n = 0;
  img.src = tries[0];
  img.onerror = () => {
    n += 1;
    if (n < tries.length) { img.src = tries[n]; return; }
    img.remove();
    wrap.innerHTML = `<div class="shadow-figure" data-pose="${esc(pose)}"><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i></div>`;
  };
  wrap.appendChild(img);
  return wrap;
};

/** A picture of an NPC / avatar with a simple fallback. */
export const spriteEl = (src, name = '', cls = 'npc-portrait') => {
  const wrap = el('div', cls);
  const img = new Image();
  img.alt = name;
  img.src = src;
  img.onerror = () => { img.remove(); wrap.innerHTML = `<div class="sprite-fallback">${esc((name || '?').slice(0, 1))}</div>`; };
  wrap.appendChild(img);
  return wrap;
};

export class PendekarBayang {
  /** @param {{dialog: import('../dialogue/dialogueBox.js').DialogueBox, api: any, student: any}} deps */
  constructor({ dialog, api, student }) {
    this.dialog = dialog;
    this.api = api;
    this.student = student;
    this.overrides = new Map();       // eraID -> [{era, category, line, text}]
    this.lastUsed = new Map();        // category code -> last text (avoid repeating)
    this.muted = false;
  }

  get name() { return ENTITY_NAME; }

  /** GET /api/entity/lines - never fails the game: defaults are used if the server cannot answer. */
  async load(eraID = 0) {
    const key = Number(eraID);
    if (this.overrides.has(key)) return;
    try {
      const data = await this.api.entityLines(key);
      this.overrides.set(key, data.lines || []);
    } catch {
      this.overrides.set(key, []);
    }
  }

  poseOf(categoryKey) { return CATEGORY_BY_KEY[categoryKey].pose; }

  /** The finished text lines for a moment (markers filled in). */
  lines(categoryKey, values = {}, eraID = 0) {
    const cat = CATEGORY_BY_KEY[categoryKey];
    const list = this.overrides.get(Number(eraID)) || this.overrides.get(0) || [];
    const last = this.lastUsed.get(cat.code) || null;
    const raw = pickLine(list, cat.code, eraID, last);
    if (!cat.ordered && raw[0]) this.lastUsed.set(cat.code, raw[0]);
    const vals = { nama: this.student ? this.student.studentName : 'Wira', ...values };
    return raw.map((t) => fillMarkers(t, vals, cat.content || null));
  }

  /** One line (first of lines()) - for toasts and short remarks. */
  remark(categoryKey, values = {}, eraID = 0) {
    return this.lines(categoryKey, values, eraID)[0];
  }

  /**
   * Speak a category in the dialogue box. Resolves after the last line.
   * @param {string} categoryKey  e.g. 'taklimat'
   * @param {object} values       marker values ({taklimat: '...'})
   * @param {{eraID?:number, pose?:string, side?:string}} opts
   */
  async speak(categoryKey, values = {}, opts = {}) {
    const eraID = opts.eraID || 0;
    await this.load(eraID);
    const pose = opts.pose || this.poseOf(categoryKey);
    const tone = ['angry', 'laughing'].includes(pose) ? 'loud' : pose === 'whispering' ? 'whisper' : '';
    for (const text of this.lines(categoryKey, values, eraID)) {
      await this.dialog.say({ name: ENTITY_NAME, text, portrait: entityPortrait(pose), side: opts.side || 'left', tone });
    }
    this.dialog.hide();
  }
}
