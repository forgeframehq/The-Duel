// Rival against rival, many matches, to check that the difficulties rank correctly and nothing breaks.
//     node tools/dev/simtest.mjs
import fs from 'node:fs';
import { createWorld, stepWorld } from '../../src/sim.js';
import { createAI, thinkAI } from '../../src/ai.js';
const src = fs.readFileSync(new URL('../../src/arena.js', import.meta.url), 'utf8');
const obstacles = eval(src.match(/const OBSTACLES = (\[[\s\S]*?\n\]);/)[1]);
const arena = { R: 26, obstacles, spawns: [{ x: 0, z: -17, yaw: 0 }, { x: 0, z: 17, yaw: Math.PI }] };
const st = (skill, weapon = 'sword') => ({ maxHp: 100, maxStam: 100, power: 1, armor: 0.1, speed: 4.4, reach: 0, weapon, skill });
for (const [la, lb] of [['normal', 'normal'], ['hard', 'easy'], ['normal', 'easy'], ['hard', 'normal'], ['hard', 'hard']]) {
  const wins = [0, 0], ev = {}, titles = {}; let ticks = 0, draws = 0;
  for (let g = 0; g < 20; g++) {
    const w = createWorld(arena, st('sunburst', g % 4 === 3 ? 'spear' : 'sword'), st('rush', g % 5 === 4 ? 'mace' : 'sword')), a = createAI(la, g * 7 + 1), b = createAI(lb, g * 13 + 5);
    let n = 0;
    while (w.phase !== 'over' && n < 60 * 60 * 8) {
      stepWorld(w, [thinkAI(a, w, 0), thinkAI(b, w, 1)]);
      for (const e of w.events) { ev[e.type] = (ev[e.type] || 0) + 1; if (e.type === 'hit' && e.title) titles[e.title] = (titles[e.title] || 0) + 1; if (e.type === 'hit' && e.ground) ev.ground = (ev.ground || 0) + 1; }
      w.events.length = 0; n++;
      for (const f of w.fighters) if (!isFinite(f.x) || !isFinite(f.z) || !isFinite(f.hp)) throw new Error('NaN');
    }
    if (w.matchWinner >= 0) wins[w.matchWinner]++; else draws++;
    ticks += n;
  }
  console.log(la, 'vs', lb, 'wins', wins, 'unfinished', draws, 'avg match s', (ticks / 20 / 60).toFixed(0));
  console.log('   ', JSON.stringify(ev), JSON.stringify(titles));
}
