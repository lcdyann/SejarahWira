/**
 * ============================================================================
 * questPreview.js  -  plays a quest exactly like a student does (for the content manager)
 *
 * Loaded by teacher/quest_preview.html, which the content manager shows in an <iframe>.
 *   parent -> here   { type: 'quest-preview', quest: { questName, questType, content }, background }
 *   here -> parent   { type: 'quest-preview-ready' }   (when the page can receive a quest)
 *                    { type: 'quest-preview-result', ok: boolean }
 * Uses the same QuestMechanic and the same game.css as the game. Nothing is saved.
 * ============================================================================
 */
import { Stage, el } from './game/core.js';
import { QuestMechanic } from './game/quests.js';
import { buildAftermath } from './game/aftermath.js';

const stage = new Stage(document.getElementById('game-root'));
const layer = stage.sceneLayer;
let current = null;
let run = 0;
let last = null;

const clear = () => {
  if (current) { current.destroy(); current = null; }
  layer.innerHTML = '';
  stage.modalLayer.innerHTML = '';
};

const banner = (ok) => {
  const box = el('div', 'qpv-result px');
  box.innerHTML = ok
    ? '<b>Misi selesai</b><p>Pelajar mendengar pujian Pendekar Bayang, kemudian cerita diteruskan.</p>'
    : '<b>Cerita terputus</b><p>Dalam permainan, adegan akibat dipaparkan, Pendekar Bayang menerangkan sebabnya, kemudian babak diputar semula dari awal.</p>';
  const again = el('button', 'btn-px gold', 'Main semula');
  again.addEventListener('click', () => play(last));
  box.appendChild(again);
  stage.modalLayer.appendChild(box);
};

async function play(data) {
  last = data;
  const mine = ++run;
  clear();
  let mech;
  try {
    mech = QuestMechanic.create(
      { questName: data.quest.questName || 'Quest', questType: Number(data.quest.questType), content: data.quest.content },
      { background: data.background || null }
    );
  } catch (err) {
    layer.appendChild(el('div', 'qpv-result px', `<b>Tidak dapat dipaparkan</b><p>${String(err.message)}</p>`));
    return;
  }
  current = mech;
  const result = await mech.play(layer);
  if (mine !== run) return;                         // a newer version of the quest replaced this one
  window.parent.postMessage({ type: 'quest-preview-result', ok: result.ok }, window.location.origin);
  if (!result.ok) await showAftermath(result.aftermath, data.background, mine);
  if (mine !== run) return;
  banner(result.ok);
}

/** the same cutscene a student sees after a wrong choice; a click carries on */
function showAftermath(text, background, mine) {
  return new Promise((resolve) => {
    const a = buildAftermath(text, { background });
    layer.appendChild(a.el);
    const next = () => {
      if (mine !== run) { resolve(); return; }
      if (!a.el.classList.contains('typed')) { a.skip(); return; }
      a.el.remove(); window.removeEventListener('keydown', onKey); resolve();
    };
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
    a.el.addEventListener('click', next);
    window.addEventListener('keydown', onKey);
  });
}

window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  const d = e.data;
  if (d && d.type === 'quest-preview' && d.quest) play(d);
});
window.parent.postMessage({ type: 'quest-preview-ready' }, window.location.origin);
