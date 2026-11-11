// ai.js — the CPU opponent. It only reads the world and returns a command object,
// exactly like a human player's input does.
import { hasLOS, angDiff, armored } from './sim.js';

// parry:  chance it parries a charged strike it sees coming.
// dodge:  chance it dodges a normal swing (and a charged one it failed to parry).
// armor:  chance it answers a normal swing by charging straight through it.
// focus:  how often its own attack is a charged strike rather than a combo.
// punish: chance it takes an opening. smart: whether it stops hitting a charging enemy and waits to parry.
export const DIFFICULTY = {
  easy: { parry: 0.12, dodge: 0.06, armor: 0.04, aggro: 0.4, focus: 0.18, comboMax: 2, rest: 1.7, punish: 0.4, smart: false, feint: 0 },
  normal: { parry: 0.4, dodge: 0.14, armor: 0.12, aggro: 0.58, focus: 0.26, comboMax: 3, rest: 1.1, punish: 0.75, smart: true, feint: 0.1 },
  hard: { parry: 0.68, dodge: 0.22, armor: 0.22, aggro: 0.8, focus: 0.3, comboMax: 3, rest: 0.6, punish: 1, smart: true, feint: 0.25 },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAI(level = 'normal', seed = 1234) {
  return {
    p: DIFFICULTY[level] || DIFFICULTY.normal, rand: rng(seed),
    mode: 'approach', modeT: 0, modeDur: 1, circleDir: 1, comboLeft: 0, plan: 'combo', hold: null,
    seenSwing: -1, openingKey: '', takeOpening: false, react: null, lastSeen: null, clock: 0, lastRound: -1,
  };
}

function setMode(ai, mode, dur) { ai.mode = mode; ai.modeT = 0; ai.modeDur = dur; }

// Decide what the next attack will be: a combo of normal hits, or a charged strike.
function planAttack(ai, forceFocus = false) {
  const r = ai.rand, p = ai.p;
  ai.plan = forceFocus || r() < p.focus ? 'focus' : 'combo';
  ai.comboLeft = ai.plan === 'focus' ? 1 : 1 + Math.floor(r() * p.comboMax);
  setMode(ai, 'attack', 2.6);
}

// Push the desired direction away from, and around, nearby obstacles.
function steer(w, f, dx, dz) {
  let ox = dx, oz = dz;
  for (const o of w.obstacles) {
    let cx, cz;
    if (o.kind === 'circle') {
      const ex = f.x - o.x, ez = f.z - o.z, d = Math.hypot(ex, ez) || 1;
      cx = o.x + (ex / d) * o.r; cz = o.z + (ez / d) * o.r;
    } else {
      cx = Math.max(o.x - o.hw, Math.min(o.x + o.hw, f.x));
      cz = Math.max(o.z - o.hd, Math.min(o.z + o.hd, f.z));
    }
    let nx = f.x - cx, nz = f.z - cz;
    const d = Math.hypot(nx, nz);
    if (d > 1.7 || d < 0.001) continue;
    nx /= d; nz /= d;
    if (dx * nx + dz * nz > 0.2) continue; // already heading away
    const k = (1.7 - d) / 1.7;
    let tx = -nz, tz = nx;
    if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
    ox += nx * k * 1.2 + tx * k * 1.8; oz += nz * k * 1.2 + tz * k * 1.8;
  }
  const m = Math.hypot(ox, oz);
  return m > 0.001 ? [ox / m, oz / m] : [0, 0];
}

export function thinkAI(ai, w, selfIdx) {
  const f = w.fighters[selfIdx], e = w.fighters[1 - selfIdx], p = ai.p, r = ai.rand;
  const cmd = { mx: 0, mz: 0, faceYaw: null, h: false, v: false, hHold: false, vHold: false, parry: false, dodge: false, sprint: false };
  const dt = 1 / 60;
  ai.clock += dt; ai.modeT += dt;
  if (ai.lastRound !== w.round) { ai.lastRound = w.round; ai.lastSeen = null; ai.react = null; ai.hold = null; setMode(ai, 'approach', 1); }
  if (w.phase !== 'fight' || f.state === 'dead' || e.state === 'dead') return cmd;

  const dx = e.x - f.x, dz = e.z - f.z, dist = Math.hypot(dx, dz) || 0.001;
  const los = hasLOS(w, f.x, f.z, e.x, e.z);
  if (los) ai.lastSeen = { x: e.x, z: e.z };
  const toE = Math.atan2(dx, dz);
  if (los && dist < 18) cmd.faceYaw = toE;
  const reachBonus = f.stats.reach || 0;

  // Where to walk when heading for the enemy: straight at them, or to where they were last seen.
  let gx = e.x, gz = e.z;
  if (!los && ai.lastSeen && Math.hypot(ai.lastSeen.x - f.x, ai.lastSeen.z - f.z) > 1.5) { gx = ai.lastSeen.x; gz = ai.lastSeen.z; }
  else if (!los) ai.lastSeen = null;
  const gd = Math.hypot(gx - f.x, gz - f.z) || 1;
  const ux = (gx - f.x) / gd, uz = (gz - f.z) / gd;
  const nx = dx / dist, nz = dz / dist;
  const free = f.state === 'idle';

  // --- A charge in progress: keep the button down until it is time to let go.
  if (ai.hold) {
    const started = f.state === 'charge' || (f.state === 'attack' && !f.atk.focus);
    if (!started && ai.clock - ai.hold.start > 0.25) ai.hold = null;      // it never got going, or has been released
    else if (ai.hold.feint && f.state === 'charge' && ai.clock >= ai.hold.until - 0.1) {
      cmd.mx = -nz * ai.circleDir; cmd.mz = nx * ai.circleDir; cmd.dodge = true; ai.hold = null; // feint: dodge out of the charge
      return cmd;
    } else if (ai.clock < ai.hold.until || (dist > 3.2 + reachBonus && ai.clock < ai.hold.until + 0.5)) {
      cmd[ai.hold.btn + 'Hold'] = true;
      if (dist > 1.9) { cmd.mx = nx; cmd.mz = nz; }
      return cmd;
    } else ai.hold = null;
  }
  const beginHold = (btn, secs, feint = false) => { cmd[btn] = true; cmd[btn + 'Hold'] = true; ai.hold = { btn, start: ai.clock, until: ai.clock + secs, feint }; };

  // --- Defence: decide once per incoming swing how to answer it.
  if (e.state === 'attack' && e.swingId !== ai.seenSwing && los && dist < e.atk.range + (e.stats.reach || 0) + 1.2) {
    ai.seenSwing = e.swingId;
    const impact = ai.clock + Math.max(0, e.atk.windup - e.t), roll = r();
    if (e.atk.focus) {
      if (roll < p.parry) ai.react = { type: 'parry', at: Math.max(ai.clock + 0.02, impact - 0.22) };
      else if (roll < p.parry + p.dodge * 2) ai.react = { type: 'dodge', at: Math.max(ai.clock + 0.03, impact - 0.12) };
      else ai.react = null;
    } else if (roll < p.dodge) ai.react = { type: 'dodge', at: Math.max(ai.clock + 0.05, impact - 0.12) };
    else if (roll < p.dodge + p.armor && free && f.stam > 35) ai.react = { type: 'armor', at: ai.clock };
    else ai.react = null;
  }
  if (ai.react && ai.clock >= ai.react.at) {
    const kind = ai.react.type;
    ai.react = null;
    if (kind === 'parry' && free) { cmd.parry = true; return cmd; }
    if (kind === 'dodge' && free) {
      const side = r() < 0.5 ? 1 : -1, back = r() < 0.5;
      cmd.mx = back ? -nx : -nz * side; cmd.mz = back ? -nz : nx * side; cmd.dodge = true;
      return cmd;
    }
    if (kind === 'armor' && free) { beginHold(r() < 0.5 ? 'h' : 'v', 0.4 + r() * 0.3); return cmd; }
  }

  // Out of breath: back off and recover.
  if (f.winded > 0 && ai.mode !== 'retreat') setMode(ai, 'retreat', 1.4);

  // A charging enemy shrugs off normal hits. A smart fighter stops swinging and gets ready to parry.
  if (p.smart && armored(e) && ai.mode === 'attack' && ai.plan === 'combo') { ai.circleDir = r() < 0.5 ? 1 : -1; setMode(ai, 'circle', 0.5 + r() * 0.5); }

  // An opening is the enemy off balance, recovering from a swing, out of breath or stuck in a missed parry.
  const opening = (e.state === 'stagger' && e.staggerDur - e.t > 0.25) || (e.state === 'attack' && e.t > e.atk.windup + e.atk.active) || e.winded > 0.4 || (e.state === 'parry' && e.t > 0.08);
  const key = e.state + ':' + e.swingId + ':' + Math.round((ai.clock - e.t) * 5);
  if (opening && key !== ai.openingKey) { ai.openingKey = key; ai.takeOpening = r() < p.punish; }
  if (opening && ai.takeOpening && dist < 3.4 + reachBonus && f.stam > 20 && f.winded <= 0 && ai.mode !== 'attack' && los) {
    // A parried enemy is helpless long enough for a full charged strike; anything else gets a quick combo.
    planAttack(ai, e.state === 'stagger' && e.parried && r() < 0.6);
    if (!(e.state === 'stagger' && e.parried)) ai.plan = 'combo', ai.comboLeft = Math.max(ai.comboLeft, 2);
  }

  const facing = Math.abs(angDiff(f.yaw, toE)) < 0.5;
  switch (ai.mode) {
    case 'approach': {
      const [sx, sz] = steer(w, f, ux, uz);
      cmd.mx = sx; cmd.mz = sz; cmd.sprint = dist > 9 && f.stam > 40;
      if (los && dist < 3.3 + reachBonus) {
        if (f.stam > 35 && r() < p.aggro) planAttack(ai);
        else { ai.circleDir = r() < 0.5 ? 1 : -1; setMode(ai, 'circle', 0.5 + r() * 1.1); }
      }
      break;
    }
    case 'circle': {
      // Strafe around the enemy while holding a comfortable distance.
      const want = 3.1 + reachBonus * 0.5, radial = Math.max(-1, Math.min(1, (dist - want) * 0.9));
      const [sx, sz] = steer(w, f, -nz * ai.circleDir + nx * radial, nx * ai.circleDir + nz * radial);
      cmd.mx = sx * 0.75; cmd.mz = sz * 0.75;
      if (!los || dist > 6) setMode(ai, 'approach', 1);
      else if (f.stam < 22) setMode(ai, 'retreat', 1.2 + r());
      else if (ai.modeT > ai.modeDur && !(p.smart && armored(e))) {
        if (f.stam > 35 && r() < p.aggro) planAttack(ai);
        else { if (r() < 0.4) ai.circleDir *= -1; setMode(ai, 'circle', 0.4 + r() * p.rest); }
      }
      break;
    }
    case 'attack': {
      const reach = (ai.plan === 'focus' ? 2.6 : 2.0) + reachBonus * 0.8;
      if (dist > reach) { const [sx, sz] = steer(w, f, ux, uz); cmd.mx = sx; cmd.mz = sz; }
      const canChain = f.state === 'attack' && !f.atk.focus && f.t > f.atk.windup + f.atk.active && !f.queued;
      if (dist <= reach + 0.25 && facing && ai.comboLeft > 0 && f.stam > 16) {
        if (ai.plan === 'focus' && free) { beginHold(r() < 0.5 ? 'h' : 'v', 0.35 + r() * 0.6, r() < p.feint); ai.comboLeft = 0; }
        else if (ai.plan === 'combo' && (free || canChain)) { cmd[r() < 0.6 ? 'h' : 'v'] = true; ai.comboLeft--; }
      }
      const done = ai.comboLeft <= 0 && free && !ai.hold;
      if (done || ai.modeT > ai.modeDur || !los || f.stam < 14) {
        ai.circleDir = r() < 0.5 ? 1 : -1;
        if (f.stam < 30 || r() > p.aggro) setMode(ai, 'retreat', 0.7 + r() * p.rest);
        else setMode(ai, 'circle', 0.3 + r() * p.rest);
      }
      break;
    }
    case 'retreat': {
      const [sx, sz] = steer(w, f, -nx + -nz * ai.circleDir * 0.6, -nz + nx * ai.circleDir * 0.6);
      cmd.mx = sx; cmd.mz = sz;
      if (dist > 7 || ai.modeT > ai.modeDur || Math.hypot(f.x, f.z) > w.R - 2.5) {
        setMode(ai, f.stam > 45 ? 'approach' : 'circle', 0.6 + r() * p.rest);
      }
      break;
    }
  }
  return cmd;
}
