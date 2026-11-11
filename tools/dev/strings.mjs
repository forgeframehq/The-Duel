// Scripted checks of the fighting rules: every string, the ground hit, the charge, and the disarming parry.
//     node tools/dev/strings.mjs
import { createWorld, stepWorld, EMPTY_CMD } from '../../src/sim.js';
const st = (weapon = 'sword', skill = 'sunburst') => ({ maxHp: 300, maxStam: 300, power: 1, armor: 0, speed: 4.4, reach: 0, weapon, skill });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
function fresh(weapon) {
  const w = createWorld({ R: 19, obstacles: [], spawns: [{ x: 0, z: -1.1, yaw: 0 }, { x: 0, z: 1.0, yaw: Math.PI }] }, st(weapon), st('sword', 'rush'));
  while (w.phase !== 'fight') stepWorld(w, [EMPTY_CMD, EMPTY_CMD]);
  w.events.length = 0; return w;
}
// Press the buttons in `seq` one after the other, each as soon as the last swing has landed, and collect what happened.
function play(w, seq, gap = 26, foe = () => EMPTY_CMD) {
  const log = [];
  let i = 0, wait = 0;
  for (let n = 0; n < 60 * 6; n++) {
    const cmd = { ...EMPTY_CMD, faceYaw: 0 };
    if (i < seq.length && wait-- <= 0) { cmd[seq[i] === 'H' ? 'h' : 'v'] = true; i++; wait = gap; }
    stepWorld(w, [cmd, foe(n)]);
    for (const e of w.events) log.push(e);
    w.events.length = 0;
  }
  return log;
}
const hits = (log) => log.filter((e) => e.type === 'hit' && e.id === 0);
for (const weapon of ['sword', 'spear', 'mace']) {
  let w = fresh(weapon), log = play(w, 'HHH'), h = hits(log);
  check(`${weapon} HHH lands three hits ending in Tempest`, h.length === 3 && h[2].title === 'Tempest', h.map((e) => e.title || '-').join(','));
  w = fresh(weapon); log = play(w, 'VVV'); h = hits(log);
  check(`${weapon} VVV ends in Earthsplitter and floors them`, h.length === 3 && h[2].title === 'Earthsplitter' && h[2].slam, h.map((e) => (e.title || '-') + (e.slam ? '!' : '')).join(','));
  w = fresh(weapon); log = play(w, 'HHV'); h = hits(log);
  check(`${weapon} HHV ends in Rising Fang and launches`, h.length === 3 && h[2].title === 'Rising Fang' && h[2].launch, h.map((e) => (e.title || '-') + (e.launch ? '^' : '')).join(','));
  w = fresh(weapon); log = play(w, 'VVH'); h = hits(log);
  check(`${weapon} VVH ends in Reaper's Arc and throws them back`, h.length === 3 && h[2].title === "Reaper's Arc" && Math.hypot(w.fighters[1].x, w.fighters[1].z) > 3, 'rival ended ' + Math.hypot(w.fighters[1].x, w.fighters[1].z).toFixed(1) + ' m out');
}
{ // launcher then air hits then the ground
  // two horizontals, the uppercut, then keep tapping Horizontal while they hang in the air
  const w = fresh(), log = play(w, 'HHV' + 'H'.repeat(12), 12), h = hits(log);
  check('HHV then HHH juggles in the air and slams', h.some((e) => e.air) && h.some((e) => e.slam), h.map((e) => e.launch ? 'launch' : e.air ? 'air' : e.slam ? 'slam' : 'hit').join(','));
}
{ // ground hit: only a vertical reaches, and only once
  let w = fresh(); play(w, 'VVV', 26); Object.assign(w.fighters[1], { state: 'down', t: 0, groundHit: false, x: 0, z: 0.9 }); Object.assign(w.fighters[0], { x: 0, z: -1.0, state: 'idle', seq: '' });
  let h = hits(play(w, 'H', 1)).filter((e) => e.ground);
  check('a horizontal passes over a fighter on the ground', h.length === 0);
  w = fresh(); Object.assign(w.fighters[1], { state: 'down', t: 0, groundHit: false });
  h = hits(play(w, 'VV', 20)).filter((e) => e.ground);
  check('a vertical hits a fighter on the ground exactly once', h.length === 1, h.length + ' ground hits');
}
{ // a press made too early is remembered
  const w = fresh(); Object.assign(w.fighters[0], { state: 'stagger', t: 0, staggerDur: 0.2 });
  let started = false;
  for (let n = 0; n < 30; n++) { stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, h: n === 4 }, EMPTY_CMD]); if (w.fighters[0].state === 'attack') started = true; }
  check('an attack pressed while reeling comes out once free', started);
}
{ // hold = charge; H gives the wide strike, V the slam; dodge cancels
  for (const [btn, want] of [['h', 'focusH'], ['v', 'focusV']]) {
    const w = fresh(); let name = '';
    for (let n = 0; n < 150; n++) { stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, [btn]: n === 0, [btn + 'Hold']: n < 50 }, EMPTY_CMD]); if (w.fighters[0].state === 'attack' && w.fighters[0].atk.focus) name = w.fighters[0].atk.name; }
    check(`holding ${btn.toUpperCase()} releases ${want}`, name === want, name);
  }
  const w = fresh(); let charged = false;
  for (let n = 0; n < 80; n++) { stepWorld(w, [{ ...EMPTY_CMD, faceYaw: 0, h: n === 0, hHold: n < 70, dodge: n === 30 }, EMPTY_CMD]); if (w.fighters[0].state === 'charge') charged = true; }
  check('dodge cancels a charge', charged && w.fighters[0].state !== 'attack' && w.fighters[0].state !== 'charge', w.fighters[0].state);
}
{ // parry: disarms a charged strike, weapon comes back when walked over; does nothing to a normal hit
  const w = fresh(); const log = [];
  for (let n = 0; n < 60 * 5; n++) {
    // the rival charges and lets go; the player parries shortly after the charge starts
    const foe = { ...EMPTY_CMD, faceYaw: Math.PI, v: n === 0, vHold: n < 45 };
    const me = { ...EMPTY_CMD, faceYaw: 0, parry: n === 30 };
    stepWorld(w, [me, foe]); for (const e of w.events) log.push({ ...e, n }); w.events.length = 0;
  }
  const dis = log.find((e) => e.type === 'disarm'), rip = log.find((e) => e.type === 'hit' && e.riposte);
  check('parrying a charged strike disarms the rival and counters', !!dis && dis.id === 1 && !!rip, dis ? `weapon lands ${Math.hypot(dis.x - w.fighters[1].x, dis.z - w.fighters[1].z).toFixed(1)} m from them` : 'no disarm');
  check('a disarmed fighter cannot attack', (() => { const before = w.fighters[1].swingId; for (let n = 0; n < 40; n++) stepWorld(w, [EMPTY_CMD, { ...EMPTY_CMD, h: n % 5 === 0 }]); return w.fighters[1].swingId === before && w.fighters[1].disarmed; })());
  w.events.length = 0; w.fighters[1].x = w.fighters[1].dropX; w.fighters[1].z = w.fighters[1].dropZ; w.fighters[1].state = 'idle';
  stepWorld(w, [EMPTY_CMD, EMPTY_CMD]);
  check('walking over the weapon picks it up', !w.fighters[1].disarmed && w.events.some((e) => e.type === 'pickup'));
  const w2 = fresh(); let hurt = false;
  for (let n = 0; n < 90; n++) { stepWorld(w2, [{ ...EMPTY_CMD, faceYaw: 0, parry: n === 5 }, { ...EMPTY_CMD, faceYaw: Math.PI, h: n === 0 }]); for (const e of w2.events) if (e.type === 'hit' && e.target === 0 && e.punish) hurt = true; w2.events.length = 0; }
  check('a parry does not stop a normal hit', hurt && !w2.fighters[1].disarmed);
}
{ // a special can be fired while reeling
  const w = fresh(); Object.assign(w.fighters[0], { state: 'stagger', t: 0, staggerDur: 0.6 });
  stepWorld(w, [{ ...EMPTY_CMD, skill: true }, EMPTY_CMD]);
  check('a special can be fired while reeling from a hit', w.fighters[0].state === 'attack' && w.fighters[0].atk.skill);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
