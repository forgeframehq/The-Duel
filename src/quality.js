// quality.js — the graphics setting. The game is built to look its best first; a phone that struggles
// is turned down here rather than the game being held back for everyone. Chosen on the title screen
// and remembered; changing it reloads the game so everything is rebuilt at the new level.
//   pixels   sharpest the picture is drawn at (1 = one drawn pixel per screen point)
//   shadows  size of the shadow picture, or 0 for none
//   grass    share of the full meadow grass
//   trees    'full' draws every near tree at full detail, 'mid' only the ones inside the arena, 'low' none
export const LEVELS = {
  low: { name: 'Low', pixels: 1, shadows: 0, grass: 0.22, trees: 'low' },
  medium: { name: 'Medium', pixels: 1.5, shadows: 1024, grass: 0.5, trees: 'mid' },
  high: { name: 'High', pixels: 2, shadows: 2048, grass: 1, trees: 'mid' },
  ultra: { name: 'Ultra', pixels: 3, shadows: 4096, grass: 1.7, trees: 'full' },
};
const ORDER = ['low', 'medium', 'high', 'ultra'];
let id = 'high';
try { const saved = localStorage.getItem('duel.quality'); if (LEVELS[saved]) id = saved; } catch { /* storage unavailable */ }
export const QUALITY = { id, ...LEVELS[id] };
// Moves to the next level (after Ultra comes Low) and remembers it. The caller reloads the page.
export function nextQuality() {
  const next = ORDER[(ORDER.indexOf(id) + 1) % ORDER.length];
  try { localStorage.setItem('duel.quality', next); } catch { /* storage unavailable */ }
  return LEVELS[next].name;
}
