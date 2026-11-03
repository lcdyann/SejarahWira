/**
 * assets/game/story/aftermath.js  -  "Sejarah berubah" aftermath card
 * MODULE: story  (Mission scene: story + dialogue + quests, HUD, aftermath, pieces, book end)
 * USE CASE: UC-03   CLASS DIAGRAM: Narrative, Scene, DialogueLine, Quest, QuestCompletion
 */
/**
 * ============================================================================
 * aftermath.js  -  "Akibat": what happens in the story when the player chooses wrongly
 *
 * A short cutscene instead of a telling-off: the picture drains of colour, the thread of
 * history snaps, a stamp says SEJARAH BERUBAH and the consequence is typed out.
 * The teacher writes the text per wrong choice / per quest ("Akibat jika salah").
 *
 *   const a = buildAftermath(text, { background });   // { el, skip(), typed: Promise }
 *   layer.appendChild(a.el);  ...wait for Enter / click...  a.el.remove();
 * ============================================================================
 */
import { sleep, tpl } from '../core/core.js';

export const FALLBACK_AFTERMATH = 'Peristiwa tidak berjalan seperti yang dicatat sejarah. Benang cerita terputus di sini.';

export function buildAftermath(text, { background = null, title = 'SEJARAH BERUBAH' } = {}) {
  // Susun atur: <template id="tpl-aftermath"> dalam assets/game/story/story.html
  const wrap = tpl('aftermath', { title });
  const out = wrap.refs.text;
  // gambar latar ditetapkan terus (pembolehubah CSS akan mengira laluan daripada fail CSS, bukan halaman)
  if (background) wrap.refs.pic.style.backgroundImage = `url('${background}')`;
  const full = String(text || FALLBACK_AFTERMATH);
  let skipped = false;
  const typed = (async () => {
    await sleep(900);                                   // let the thread snap first
    for (let i = 1; i <= full.length && !skipped; i += 1) {
      out.textContent = full.slice(0, i);
      await sleep(22);
    }
    out.textContent = full;
    wrap.classList.add('typed');
  })();
  return { el: wrap, typed, skip: () => { skipped = true; out.textContent = full; wrap.classList.add('typed'); } };
}
