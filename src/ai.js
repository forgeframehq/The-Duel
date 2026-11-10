// ai.js — the CPU opponent. It only reads the world and returns a command object,
// exactly like a human player's input does.
import { hasLOS, angDiff, PARRY_WINDOW } from './sim.js';

export const DIFFICULTY = {
  easy: { react: 0.4, block: 0.25, parry: 0.03, dodge: 0.08, aggro: 0.45, heavy: 0.15, comboMax: 2, rest: 1.5 },
  normal: { react: 0.22, block: 0.45, parry: 0.1, dodge: 0.18, aggro: 0.65, heavy: 0.25, comboMax: 3, rest: 1.0 },
  hard: { react: 0.13, block: 0.55, parry: 0.27, dodge: 0.15, aggro: 0.85, heavy: 0.3, comboMax: 3, rest: 0.6 },
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
    mode: 'approach', modeT: 0, modeDur: 1, circleDir: 1, comboLeft: 0, wantHeavy: false,
    seenSwing: -1, react: null, blockUntil: 0, lastSeen: null, clock: 0, lastRound: -1,
  };
}

function setMode(ai, mode, dur) { ai.mode = mode; ai.modeT = 0; ai.modeDur = dur; }

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
  const cmd = { mx: 0, mz: 0, faceYaw: null, attack: false, heavy: false, block: false, dodge: false, sprint: false };
  const dt = 1 / 60;
  ai.clock += dt; ai.modeT += dt;
  if (ai.lastRound !== w.round) { ai.lastRound = w.round; ai.lastSeen = null; ai.react = null; ai.blockUntil = 0; setMode(ai, 'approach', 1); }
  if (w.phase !== 'fight' || f.state === 'dead' || e.state === 'dead') return cmd;

  const dx = e.x - f.x, dz = e.z - f.z, dist = Math.hypot(dx, dz) || 0.001;
  const los = hasLOS(w, f.x, f.z, e.x, e.z);
  if (los) ai.lastSeen = { x: e.x, z: e.z };
  const toE = Math.atan2(dx, dz);
  if (los && dist < 18) cmd.faceYaw = toE;

  // Where to walk when heading for the enemy: straight at them, or to where they were last seen.
  let gx = e.x, gz = e.z;
  if (!los && ai.lastSeen && Math.hypot(ai.lastSeen.x - f.x, ai.lastSeen.z - f.z) > 1.5) { gx = ai.lastSeen.x; gz = ai.lastSeen.z; }
  else if (!los) ai.lastSeen = null;
  const gd = Math.hypot(gx - f.x, gz - f.z) || 1;
  const ux = (gx - f.x) / gd, uz = (gz - f.z) / gd;
  const nx = dx / dist, nz = dz / dist;

  // --- Defence: decide once per incoming swing how to answer it.
  if (e.state === 'attack' && e.swingId !== ai.seenSwing && los && dist < e.atk.range + 1.2) {
    ai.seenSwing = e.swingId;
    const impact = ai.clock + (e.atk.windup - e.t);
    const roll = r();
    if (roll < p.parry) ai.react = { type: 'block', at: impact - PARRY_WINDOW * 0.6, until: impact + 0.25 };
    else if (roll < p.parry + p.block) {
      // A plain block goes up early enough that it is not an accidental parry.
      // If there is no time left to do that, the shield comes up late and this swing lands.
      const early = impact - PARRY_WINDOW - 0.04;
      const at = early >= ai.clock + 0.05 ? Math.min(ai.clock + p.react, early) : impact + 0.03;
      ai.react = { type: 'block', at, until: impact + 0.3 };
    }
    else if (roll < p.parry + p.block + p.dodge) ai.react = { type: 'dodge', at: Math.max(ai.clock + p.react, impact - 0.12) };
    else ai.react = null;
  }
  if (ai.react && ai.clock >= ai.react.at) {
    if (ai.react.type === 'block') ai.blockUntil = ai.react.until;
    else if (f.state === 'idle' || f.state === 'block') {
      const side = r() < 0.5 ? 1 : -1, back = r() < 0.5;
      cmd.mx = back ? -nx : -nz * side; cmd.mz = back ? -nz : nx * side; cmd.dodge = true;
    }
    ai.react = null;
    if (cmd.dodge) return cmd;
  }
  if (ai.clock < ai.blockUntil && (f.state === 'idle' || f.state === 'block')) {
    cmd.block = true; cmd.faceYaw = toE;
    return cmd;
  }

  // --- Offence
  const opening = (e.state === 'stagger' && e.staggerDur - e.t > 0.25) || (e.state === 'attack' && e.t > e.atk.windup + e.atk.active);
  if (opening && dist < 3.4 && f.stam > 20 && ai.mode !== 'attack' && los) {
    ai.comboLeft = 1 + Math.floor(r() * p.comboMax); ai.wantHeavy = e.parried && r() < 0.7;
    setMode(ai, 'attack', 2.5);
  }

  const facing = Math.abs(angDiff(f.yaw, toE)) < 0.5;
  switch (ai.mode) {
    case 'approach': {
      const [sx, sz] = steer(w, f, ux, uz);
      cmd.mx = sx; cmd.mz = sz; cmd.sprint = dist > 9 && f.stam > 40;
      if (los && dist < 3.3) {
        if (f.stam > 35 && r() < p.aggro) { ai.comboLeft = 1 + Math.floor(r() * p.comboMax); ai.wantHeavy = r() < p.heavy; setMode(ai, 'attack', 2.5); }
        else { ai.circleDir = r() < 0.5 ? 1 : -1; setMode(ai, 'circle', 0.5 + r() * 1.1); }
      }
      break;
    }
    case 'circle': {
      // Strafe around the enemy while holding a comfortable distance.
      const want = 3.1, radial = Math.max(-1, Math.min(1, (dist - want) * 0.9));
      const [sx, sz] = steer(w, f, -nz * ai.circleDir + nx * radial, nx * ai.circleDir + nz * radial);
      cmd.mx = sx * 0.75; cmd.mz = sz * 0.75;
      if (!los || dist > 6) setMode(ai, 'approach', 1);
      else if (f.stam < 22) setMode(ai, 'retreat', 1.2 + r());
      else if (ai.modeT > ai.modeDur) {
        if (f.stam > 35 && r() < p.aggro) { ai.comboLeft = 1 + Math.floor(r() * p.comboMax); ai.wantHeavy = r() < p.heavy; setMode(ai, 'attack', 2.5); }
        else { if (r() < 0.4) ai.circleDir *= -1; setMode(ai, 'circle', 0.4 + r() * p.rest); }
      }
      break;
    }
    case 'attack': {
      const reach = ai.wantHeavy ? 2.3 : 2.0;
      if (dist > reach) { const [sx, sz] = steer(w, f, ux, uz); cmd.mx = sx; cmd.mz = sz; }
      const canStart = f.state === 'idle' || f.state === 'block';
      const canChain = f.state === 'attack' && f.t > f.atk.windup + f.atk.active && !f.queued;
      if (dist <= reach + 0.25 && facing && ai.comboLeft > 0 && (canStart || canChain) && f.stam > 8) {
        if (ai.wantHeavy) { cmd.heavy = true; ai.wantHeavy = false; } else cmd.attack = true;
        ai.comboLeft--;
      }
      const done = ai.comboLeft <= 0 && f.state === 'idle';
      if (done || ai.modeT > ai.modeDur || !los || f.stam < 6) {
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
