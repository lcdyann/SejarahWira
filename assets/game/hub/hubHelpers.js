/**
 * assets/game/hub/hubHelpers.js  -  Helpers shared by hub / prologue / epilogue
 * MODULE: hub  (Study desk (home), prologue, epilogue, credits, sound settings)
 * USE CASE: UC-01, UC-02, UC-07, UC-08, UC-09 (entry point)   CLASS DIAGRAM: Student
 */
import { HUB_BG, HUB_STUDENT } from './hubConfig.js';

/** resolves true when the picture loads (the hub works without it) */
export const probeImage = (src) => new Promise((resolve) => {
  const image = new Image();
  const timer = setTimeout(() => resolve(false), 3000);

  image.onload = () => {
    clearTimeout(timer);
    resolve(true);
  };
  image.onerror = () => {
    clearTimeout(timer);
    resolve(false);
  };
  image.src = src;
});


/** use the drawn hub picture as the room when it exists */
export const applyHubPicture = async (root, sources = [HUB_BG]) => {
  for (const src of sources) {                       // the first picture that exists is used
    if (await probeImage(src)) {
      root.classList.add('has-picture');
      root.style.backgroundImage = `url('${src}')`;
      return true;
    }
  }
  return false;
};


/** day / night of the hub: remembered in this browser (the hub starts at night) */
const THEME_KEY = 'sw_hub_theme';


export const getHubTheme = () => {
  try { return window.localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night'; } catch { return 'night'; }
};


export const saveHubTheme = (t) => {
  try { window.localStorage.setItem(THEME_KEY, t); } catch { /* the switch still works for this visit */ }
};


/** put the student's avatar where hubConfig.js says */
export const placeStudent = (node) => {
  Object.assign(node.style, {
    left: `${HUB_STUDENT.x}%`,
    top: `${HUB_STUDENT.y}%`,
    height: `${HUB_STUDENT.h}%`,
    bottom: 'auto',
    width: 'auto'
  });
};
