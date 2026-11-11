// Scripted checks of the fighting rules (build 20): taps the way a real thumb taps, strings, stick-direction
// moves, charging, the guard, the parry, the kick, the ground hit and the energy bar.
//     node tools/dev/strings.mjs
import { createWorld, stepWorld, EMPTY_CMD, GUARD_MAX } from '../../src/sim.js';
const st = (weapon = 'sword', skill = 'sunburst') => ({ maxHp: 400, maxStam: 400, power: 1, armor: 0, speed: 4.4, reach: 0, weapon, skill });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
function fresh(weapon, gap = 2.1) {
  const w = createWorld({ R: 19, obstacles: [], spawns: [{ x: 0, z: -gap / 2, yaw: 0 }, { x: 0, z: gap / 2, yaw: Math.PI }] }, st(weapon), st('sword', 'rush'));
  while (w.phase !== 'fight') stepWorld(w, [EMPTY_CMD, EMPTY_CMD]);
  w.fighters[1].energy = 0; w.events.length = 0; return w;
}
const TAP = 9;   // ticks a thumb tap keeps the button down: 0.15 s, the middle of the 0.1 to 0.2 s range
// Tap the buttons in `seq` one after the other, each held TAP ticks, `gap` ticks apart. `stick` is -1 (away), 0 or 1 (toward).
function play(w, seq, { gap = 20, stick = 0, foe = () => EMPTY_CMD, ticks = 60 * 6, hold = TAP } = {}) {
  const log = []; let i = 0, wait = 0, down = 0, btn = '';
  for (let n = 0; n < ticks; n++) {
    const cmd = { ...EMPTY_CMD, faceYaw: 0, mz: stick };
    if (i < seq.length && wait-- <= 0) { btn = seq[i] === 'H' ? 'h' : 'v'; cmd[btn] = true; down = hold; i++; wait = gap; }
    if (down-- > 0) cmd[btn + 'Hold'] = true;
    stepWorld(w, [cmd, foe(n, w)]);
    for (const e of w.events) log.push({ ...e, n });
    w.events.length = 0;
  }
  return log;
}
const hits = (log, id = 0) => log.filter((e) => e.type === 'hit' && e.id === id);

{ // the fault in builds 18 and 19: taps turned into charged strikes
  for (const weapon of ['sword', 'katana', 'mace', 'spear']) {
    const w = fresh(weapon), log = play(w, 'HHH'), h = hits(log), charged = log.some((e) => e.type === 'charge');
    check(`${weapon}: three thumb taps are three quick hits, never a charge`, h.length === 3 && !charged && h[2].title === 'Tempest', h.length + ' hits' + (charged ? ', CHARGED' : ''));
  }
  const w = fresh(), log = play(w, 'H', { ticks: 40 }), first = hits(log)[0];
  check('a tap lands within a quarter of a second', first && first.n <= 15, first ? (first.n / 60).toFixed(2) + ' s' : 'no hit');
}
for (const weapon of ['sword', 'katana']) {
  let w = fresh(weapon), h = hits(play(w, 'VVV'));
  check(`${weapon} VVV ends in Earthsplitter and floors them`, h.length === 3 && h[2].title === 'Earthsplitter' && h[2].slam);
  w = fresh(weapon); h = hits(play(w, 'HHV'));
  check(`${weapon} HHV ends in Rising Fang and launches`, h.length === 3 && h[2].title === 'Rising Fang' && h[2].launch);
  w = fresh(weapon); h = hits(play(w, 'VVH'));
  check(`${weapon} VVH ends in Reaper's Arc and throws them back`, h.length === 3 && h[2].title === "Reaper's Arc" && Math.hypot(w.fighters[1].x, w.fighters[1].z) > 3);
}
{ // stick-direction moves
  let w = fresh('sword', 3.0), h = hits(play(w, 'H', { stick: 1, ticks: 60 }));
  check('stick toward + H is a Lunge that reaches from further off', h.length === 1 && h[0].title === 'Lunge');
  w = fresh('sword', 3.0); h = hits(play(w, 'V', { stick: 1, ticks: 80 }));
  check('stick toward + V is Skyfall', h.length === 1 && h[0].title === 'Skyfall');
  w = fresh(); const z0 = w.fighters[0].z; let back = 0;
  for (let n = 0; n < 60; n++) { stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, mz: n < 6 ? -1 : 0, h: n === 0, hHold: n < TAP }, EMPTY_CMD]); back = Math.min(back, w.fighters[0].z - z0); }
  check('stick away + H springs back first (Back-step Cut)', back < -0.6, 'moved back ' + (-back).toFixed(2) + ' m');
}
{ // holding the button on after the hit charges; H gives the wide strike, V the slam; dodge cancels
  for (const [btn, want] of [['H', 'focusH'], ['V', 'focusV']]) {
    const w = fresh(); let name = '', quick = 0;
    const log = play(w, btn, { hold: 60, ticks: 160 });
    for (const e of log) if (e.type === 'hit' && e.heavy && !e.title) name = 'blue';
    quick = hits(log).length;
    check(`keeping ${btn} held: a quick hit, then the blue strike`, log.some((e) => e.type === 'charge') && quick === 2, quick + ' hits');
  }
  const w = fresh(); let charged = false;
  for (let n = 0; n < 90; n++) { stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, h: n === 0, hHold: n < 80, dodge: n === 40 }, EMPTY_CMD]); if (w.fighters[0].state === 'charge') charged = true; }
  check('dodge cancels a charge', charged && w.fighters[0].state !== 'attack' && w.fighters[0].state !== 'charge', w.fighters[0].state);
}
{ // guard
  const guardFoe = () => ({ ...EMPTY_CMD, faceYaw: Math.PI, guard: true });
  let w = fresh(); w.fighters[1].parryCd = 99;   // no parry: a plain held guard
  let log = play(w, 'HH', { foe: guardFoe, ticks: 90 });
  check('a held guard blocks normal hits and loses guard meter', log.filter((e) => e.type === 'block').length === 2 && hits(log).length === 0 && w.fighters[1].guardM < GUARD_MAX, 'guard left ' + Math.round(w.fighters[1].guardM));
  w = fresh(); w.fighters[1].parryCd = 99;
  log = play(w, 'HHHHHHHHHHHH', { foe: guardFoe, ticks: 60 * 8, gap: 24 });
  check('enough blows break a guard', log.some((e) => e.type === 'guardbreak'));
  w = fresh(); w.fighters[1].parryCd = 99;
  log = play(w, 'V', { stick: -1, foe: guardFoe, ticks: 70 });
  check('stick away + V (the kick) breaks a guard at once', log.some((e) => e.type === 'guardbreak'));
  w = fresh(); w.fighters[1].parryCd = 99;
  log = play(w, 'H', { hold: 70, foe: guardFoe, ticks: 200 });
  check('a blue charged strike goes through a held guard', hits(log).some((e) => e.heavy && !e.title));
  w = fresh(); w.fighters[1].parryCd = 99; Object.assign(w.fighters[1], { yaw: 0 });   // facing away
  log = play(w, 'H', { foe: () => ({ ...EMPTY_CMD, guard: true }), ticks: 40 });
  check('a guard does nothing against a blow from behind', hits(log).length === 1 && hits(log)[0].backstab);
}
{ // parry: guard pressed just as the blow lands
  let w = fresh(), log = play(w, 'H', { ticks: 80, foe: (n) => ({ ...EMPTY_CMD, faceYaw: Math.PI, guard: n >= 4 && n < 12 }) });
  const d = log.find((e) => e.type === 'deflect');
  check('parrying a normal hit deflects it: no damage, attacker off balance, weapon kept', !!d && hits(log).length === 0 && !w.fighters[0].disarmed && w.fighters[1].hp === 400);
  w = fresh(); log = [];
  for (let n = 0; n < 60 * 4; n++) {
    stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, guard: n >= 54 && n < 70 }, { ...EMPTY_CMD, faceYaw: Math.PI, v: n === 0, vHold: n < 50 }]);
    for (const e of w.events) log.push({ ...e, n }); w.events.length = 0;
  }
  check('parrying a blue strike disarms the rival and counters', log.some((e) => e.type === 'disarm' && e.id === 1) && log.some((e) => e.type === 'hit' && e.riposte), log.filter((e) => e.type === 'hit' && e.id === 1 && e.heavy).map((e) => 'blue landed at ' + e.n).join(' '));
  w = fresh(); stepWorld(w, [{ ...EMPTY_CMD, guard: true }, EMPTY_CMD]); for (let n = 0; n < 30; n++) stepWorld(w, [EMPTY_CMD, EMPTY_CMD]);
  stepWorld(w, [{ ...EMPTY_CMD, guard: true }, EMPTY_CMD]);
  check('a parry is on cooldown after an attempt (the guard still goes up)', w.fighters[0].state === 'guard' && !w.fighters[0].parryOk);
  w = fresh(); Object.assign(w.fighters[1], { disarmed: true, disarmT: 6, dropX: 9, dropZ: 9 });
  log = []; for (let n = 0; n < 60; n++) { stepWorld(w, [EMPTY_CMD, { ...EMPTY_CMD, faceYaw: Math.PI, mz: 1, v: n === 0 }]); for (const e of w.events) log.push(e); w.events.length = 0; }
  check('a disarmed fighter can still kick', log.some((e) => e.type === 'hit' && e.id === 1 && e.title === 'Guard Breaker'));
}
{ // ground hit, buffer, special
  let w = fresh(); Object.assign(w.fighters[1], { state: 'down', t: 0, groundHit: false });
  check('a horizontal passes over a fighter on the ground', hits(play(w, 'H', { ticks: 40 })).length === 0);
  w = fresh(); Object.assign(w.fighters[1], { state: 'down', t: 0, groundHit: false });
  check('a vertical hits a fighter on the ground exactly once', hits(play(w, 'VV', { ticks: 70 })).filter((e) => e.ground).length === 1);
  w = fresh(); Object.assign(w.fighters[0], { state: 'stagger', t: 0, staggerDur: 0.2 }); let started = false;
  for (let n = 0; n < 30; n++) { stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, h: n === 4 }, EMPTY_CMD]); if (w.fighters[0].state === 'attack') started = true; }
  check('an attack pressed while reeling comes out once free', started);
  w = fresh(); w.fighters[0].energy = 50; stepWorld(w, [{ ...EMPTY_CMD, skill: true }, EMPTY_CMD]);
  check('the special needs a full energy bar', w.fighters[0].state !== 'attack');
  const before = w.fighters[0].energy; play(w, 'HHH');
  check('landing hits fills the energy bar', w.fighters[0].energy > before + 15, Math.round(before) + ' to ' + Math.round(w.fighters[0].energy));
  w.fighters[0].energy = 100; Object.assign(w.fighters[0], { state: 'stagger', t: 0, staggerDur: 0.6, parried: false });
  stepWorld(w, [{ ...EMPTY_CMD, skill: true }, EMPTY_CMD]);
  check('a full bar fires the special, even while reeling, and empties', w.fighters[0].state === 'attack' && w.fighters[0].atk.skill && w.fighters[0].energy === 0);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
