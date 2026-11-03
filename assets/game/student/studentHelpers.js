/**
 * assets/game/student/studentHelpers.js  -  Helpers shared by the student pages
 * MODULE: student  (Student pages: avatar, profile, learning progress (diary))
 * USE CASE: UC-02, UC-09   CLASS DIAGRAM: Avatar, LearningProgression, EraProgression
 */
import { el } from '../core/core.js';

/** ikon butang keluar (Font Awesome), sama di semua butang Keluar / Log keluar */
export const IKON_KELUAR = '<i class="fas fa-right-from-bracket"></i> ';


export const fmtDate = (d) => {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
};


/** back button + Esc, shared by the three scenes */
export function wireBack(scene, label, goBack) {
  const b = el('button', 'btn-px small page-back', label);
  b.addEventListener('click', goBack);
  scene.root.appendChild(b);
  // only the top key handler receives keys, so the scene adds its own keys through scene.extraKeys
  scene.keys({ onKeyDown: (k) => {
    if (k === 'Escape') { goBack(); return true; }
    return scene.extraKeys ? scene.extraKeys(k) : false;
  } });
  return b;
}
