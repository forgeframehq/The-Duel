// sim.js — pure game rules. No rendering, no DOM, no input devices.
// The world advances in fixed ticks from one command object per fighter,
// so the same code can later be driven by a network peer instead of the AI.

export const TICK = 1 / 60;
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
export const PARRY_WINDOW = 0.2;
export const DODGE_TIME = 0.4;
const RADIUS = 0.48;

export const LIGHT = [
  { name: 'slashR', windup: 0.28, active: 0.12, recover: 0.26, dmg: 10, stam: 12, range: 2.35, arc: 1.05, lunge: 3.0, stagger: 0.3, knock: 3 },
  { name: 'slashL', windup: 0.25, active: 0.12, recover: 0.26, dmg: 10, stam: 12, range: 2.35, arc: 1.05, lunge: 3.0, stagger: 0.3, knock: 3 },
  { name: 'overhead', windup: 0.32, active: 0.12, recover: 0.34, dmg: 14, stam: 14, range: 2.45, arc: 0.8, lunge: 3.6, stagger: 0.42, knock: 4.5 },
];
export const HEAVY = { name: 'heavy', heavy: true, windup: 0.62, active: 0.14, recover: 0.5, dmg: 26, stam: 26, range: 2.7, arc: 0.85, lunge: 4.5, stagger: 0.62, knock: 7 };

export const EMPTY_CMD = Object.freeze({ mx: 0, mz: 0, faceYaw: null, attack: false, heavy: false, block: false, dodge: false, sprint: false });

// Upgrade hook for the progression phase: everything a character build can change lives here.
export function defaultStats() {
  return { maxHp: 100, maxStam: 100, power: 1, armor: 0, speed: 4.4, reach: 0 };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angDiff(a, b) { return wrapAngle(b - a); }
function turnToward(cur, target, maxStep) {
  const d = angDiff(cur, target);
  return wrapAngle(cur + Math.max(-maxStep, Math.min(maxStep, d)));
}

function makeFighter(id, stats) {
  return {
    id, stats, x: 0, z: 0, vx: 0, vz: 0, yaw: 0,
    hp: stats.maxHp, stam: stats.maxStam, regenDelay: 0,
    state: 'idle', t: 0, atk: null, combo: 0, comboT: 0, hitDone: false, swung: false, queued: null,
    swingId: 0, blockT: 0, staggerDur: 0, parried: false, ddx: 0, ddz: 0,
  };
}

export function createWorld(arena, statsA = defaultStats(), statsB = defaultStats()) {
  const w = {
    R: arena.R, obstacles: arena.obstacles, spawns: arena.spawns,
    fighters: [makeFighter(0, statsA), makeFighter(1, statsB)],
    phase: 'intro', phaseT: 0, round: 1, score: [0, 0], timeLeft: ROUND_TIME,
    winner: -1, matchWinner: -1, events: [], tick: 0,
  };
  resetRound(w);
  return w;
}

export function resetRound(w) {
  w.fighters.forEach((f, i) => {
    const s = w.spawns[i];
    Object.assign(f, {
      x: s.x, z: s.z, vx: 0, vz: 0, yaw: s.yaw, hp: f.stats.maxHp, stam: f.stats.maxStam, regenDelay: 0,
      state: 'idle', t: 0, atk: null, combo: 0, comboT: 0, hitDone: false, swung: false, queued: null,
      blockT: 0, staggerDur: 0, parried: false,
    });
  });
  w.phase = 'intro'; w.phaseT = 0; w.timeLeft = ROUND_TIME; w.winner = -1;
  w.events.push({ type: 'round', round: w.round });
}

function endRound(w, winner, timeout) {
  w.phase = 'ko'; w.phaseT = 0; w.winner = winner;
  if (winner >= 0) {
    w.score[winner]++;
    if (w.score[winner] >= ROUNDS_TO_WIN) w.matchWinner = winner;
  }
  w.events.push({ type: 'roundend', winner, timeout: !!timeout });
}

export function stepWorld(w, cmds) {
  w.tick++; w.phaseT += TICK;
  const [a, b] = w.fighters;
  const live = w.phase === 'fight';

  if (w.phase === 'intro' && w.phaseT >= 2.2) { w.phase = 'fight'; w.phaseT = 0; w.events.push({ type: 'fight' }); }
  if (live) {
    w.timeLeft -= TICK;
    if (w.timeLeft <= 0) {
      w.timeLeft = 0;
      const ra = a.hp / a.stats.maxHp, rb = b.hp / b.stats.maxHp;
      endRound(w, ra === rb ? -1 : ra > rb ? 0 : 1, true);
    }
  }

  updateFighter(a, live ? cmds[0] : EMPTY_CMD, b, w);
  updateFighter(b, live ? cmds[1] : EMPTY_CMD, a, w);
  if (w.phase === 'fight') {
    // Detect both swings before applying either, so a simultaneous exchange is a true trade
    // and neither side wins it just by being first in the list.
    const ha = findHit(a, b, w), hb = findHit(b, a, w);
    if (ha) applyHit(a, b, ha, w);
    if (hb) applyHit(b, a, hb, w);
  }
  separate(a, b);
  collide(a, w); collide(b, w);

  if (w.phase === 'fight' && (a.state === 'dead' || b.state === 'dead')) {
    const bothDead = a.state === 'dead' && b.state === 'dead';
    endRound(w, bothDead ? -1 : a.state === 'dead' ? 1 : 0, false);
  }
  if (w.phase === 'ko' && w.phaseT >= 3.6) {
    if (w.matchWinner >= 0) { w.phase = 'over'; w.events.push({ type: 'matchover', winner: w.matchWinner }); }
    else { w.round++; resetRound(w); }
  }
}

function startAttack(f, heavy, w) {
  if (f.stam < 4) return false;
  const atk = heavy ? HEAVY : LIGHT[f.combo % 3];
  f.stam = Math.max(0, f.stam - atk.stam); f.regenDelay = 0.75;
  f.state = 'attack'; f.t = 0; f.atk = atk; f.hitDone = false; f.swung = false; f.queued = null; f.swingId++;
  w.events.push({ type: 'windup', id: f.id, heavy: !!atk.heavy });
  return true;
}

function startDodge(f, cmd, w) {
  if (f.stam < 8) return false;
  let dx = cmd.mx, dz = cmd.mz;
  const m = Math.hypot(dx, dz);
  if (m > 0.2) { dx /= m; dz /= m; } else { dx = -Math.sin(f.yaw); dz = -Math.cos(f.yaw); }
  f.ddx = dx; f.ddz = dz;
  f.stam = Math.max(0, f.stam - 20); f.regenDelay = 0.6;
  f.state = 'dodge'; f.t = 0;
  w.events.push({ type: 'dodge', id: f.id });
  return true;
}

export function dodgeInvulnerable(f) { return f.state === 'dodge' && f.t >= 0.03 && f.t <= 0.28; }

function face(f, cmd, rate, dt) {
  if (cmd.faceYaw != null) f.yaw = turnToward(f.yaw, cmd.faceYaw, rate * dt);
  else if (Math.hypot(cmd.mx, cmd.mz) > 0.25) f.yaw = turnToward(f.yaw, Math.atan2(cmd.mx, cmd.mz), rate * dt);
}

function updateFighter(f, cmd, other, w) {
  const dt = TICK;
  f.t += dt;
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);

  if (f.state !== 'dead') {
    if (f.regenDelay > 0) f.regenDelay -= dt;
    else {
      const rate = f.state === 'block' ? 9 : f.state === 'attack' || f.state === 'dodge' ? 0 : 26;
      f.stam = Math.min(f.stats.maxStam, f.stam + rate * dt);
    }
  }

  let tvx = 0, tvz = 0, accel = 14;

  switch (f.state) {
    case 'idle': {
      if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }
      if (cmd.dodge && startDodge(f, cmd, w)) break;
      if (cmd.heavy && startAttack(f, true, w)) break;
      if (cmd.attack && startAttack(f, false, w)) break;
      if (cmd.block) { f.state = 'block'; f.t = 0; f.blockT = 0; break; }
      let sp = f.stats.speed;
      const mag = Math.min(1, Math.hypot(cmd.mx, cmd.mz));
      if (cmd.sprint && mag > 0.5 && f.stam > 1) { sp *= 1.5; f.stam = Math.max(0, f.stam - 13 * dt); f.regenDelay = 0.35; }
      // Backpedalling while facing the enemy is slower than advancing.
      if (mag > 0.1 && cmd.faceYaw != null) {
        const along = (cmd.mx * fx + cmd.mz * fz) / mag;
        if (along < 0) sp *= 1 + 0.3 * along;
      }
      tvx = cmd.mx * sp; tvz = cmd.mz * sp;
      face(f, cmd, 11, dt);
      break;
    }
    case 'block': {
      f.blockT += dt;
      if (cmd.dodge && startDodge(f, cmd, w)) break;
      if (cmd.heavy && startAttack(f, true, w)) break;
      if (cmd.attack && startAttack(f, false, w)) break;
      if (!cmd.block && f.blockT > 0.12) { f.state = 'idle'; f.t = 0; break; }
      const sp = f.stats.speed * 0.45;
      tvx = cmd.mx * sp; tvz = cmd.mz * sp;
      face(f, cmd, 9, dt);
      break;
    }
    case 'attack': {
      const a = f.atk, total = a.windup + a.active + a.recover;
      if (cmd.attack) f.queued = 'light';
      if (cmd.heavy) f.queued = 'heavy';
      if (f.t < a.windup) face(f, cmd, 7, dt);
      const gap = Math.hypot(other.x - f.x, other.z - f.z);
      if (f.t > a.windup * 0.55 && f.t < a.windup + a.active && gap > 1.35) { tvx = fx * a.lunge; tvz = fz * a.lunge; }
      accel = 18;
      if (!f.swung && f.t >= a.windup) { f.swung = true; w.events.push({ type: 'swing', id: f.id, heavy: !!a.heavy }); }
      if (cmd.dodge && f.t >= a.windup + a.active + a.recover * 0.45 && startDodge(f, cmd, w)) break;
      if (f.t >= total) {
        f.combo = a.heavy ? 0 : (f.combo + 1) % 3; f.comboT = 0.5;
        const q = f.queued;
        f.state = 'idle'; f.t = 0; f.queued = null;
        if (q) startAttack(f, q === 'heavy', w);
      }
      break;
    }
    case 'dodge': {
      const k = 1 - f.t / DODGE_TIME, sp = 10.5 * (0.35 + 0.65 * k);
      f.vx = f.ddx * sp; f.vz = f.ddz * sp; accel = 0;
      if (cmd.faceYaw != null) f.yaw = turnToward(f.yaw, cmd.faceYaw, 6 * dt);
      if (f.t >= DODGE_TIME) { f.state = 'idle'; f.t = 0; }
      break;
    }
    case 'stagger': {
      accel = 6;
      if (f.t >= f.staggerDur) { f.state = 'idle'; f.t = 0; f.parried = false; f.combo = 0; }
      break;
    }
    case 'dead': accel = 5; break;
  }

  if (accel > 0) {
    const k = Math.min(1, accel * dt);
    f.vx += (tvx - f.vx) * k; f.vz += (tvz - f.vz) * k;
  }
  f.x += f.vx * dt; f.z += f.vz * dt;
}

function stagger(f, dur, kx, kz, parried = false) {
  f.state = 'stagger'; f.t = 0; f.staggerDur = dur; f.parried = parried; f.vx = kx; f.vz = kz; f.queued = null;
}

function findHit(a, b, w) {
  if (a.state !== 'attack' || a.hitDone || b.state === 'dead') return null;
  const atk = a.atk;
  if (a.t < atk.windup || a.t > atk.windup + atk.active) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > atk.range + (a.stats.reach || 0)) return null;
  if (Math.abs(angDiff(a.yaw, Math.atan2(dx, dz))) > atk.arc) return null;
  if (!hasLOS(w, a.x, a.z, b.x, b.z)) return null;
  return atk;
}

function applyHit(a, b, atk, w) {
  if (b.state === 'dead') return;
  const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), toB = Math.atan2(dx, dz);
  a.hitDone = true;
  const nx = dist > 0.001 ? dx / dist : Math.sin(a.yaw), nz = dist > 0.001 ? dz / dist : Math.cos(a.yaw);
  const px = b.x - nx * 0.35, pz = b.z - nz * 0.35;
  if (dodgeInvulnerable(b)) { w.events.push({ type: 'evade', id: b.id, x: b.x, z: b.z }); return; }

  // How far the attacker is from the direction the defender is facing: 0 = head on, PI = from behind.
  const off = Math.abs(angDiff(b.yaw, toB + Math.PI));
  const raw = atk.dmg * a.stats.power;

  if (b.state === 'block' && off <= 1.15) {
    if (b.blockT <= PARRY_WINDOW) {
      stagger(a, atk.heavy ? 1.1 : 0.9, -nx * 3, -nz * 3, true);
      b.stam = Math.min(b.stats.maxStam, b.stam + 12);
      w.events.push({ type: 'parry', id: b.id, target: a.id, x: px, z: pz });
      return;
    }
    b.stam -= raw * (atk.heavy ? 1.3 : 0.9); b.regenDelay = 0.8;
    if (b.stam <= 0) {
      b.stam = 0;
      const dmg = raw * 0.3;
      b.hp = Math.max(1, b.hp - dmg);
      stagger(b, 1.0, nx * atk.knock, nz * atk.knock);
      w.events.push({ type: 'guardbreak', id: a.id, target: b.id, dmg, x: px, z: pz });
    } else {
      b.vx = nx * atk.knock * 0.6; b.vz = nz * atk.knock * 0.6;
      w.events.push({ type: 'block', id: a.id, target: b.id, heavy: !!atk.heavy, x: px, z: pz });
    }
    return;
  }

  const backstab = off > 2.2;
  const dmg = raw * (backstab ? 1.5 : 1) * (1 - b.stats.armor);
  b.hp -= dmg;
  if (b.hp <= 0) {
    b.hp = 0; b.state = 'dead'; b.t = 0; b.vx = nx * atk.knock; b.vz = nz * atk.knock;
    w.events.push({ type: 'hit', id: a.id, target: b.id, dmg, heavy: !!atk.heavy, backstab, kill: true, x: px, z: pz });
  } else {
    stagger(b, atk.stagger, nx * atk.knock, nz * atk.knock);
    w.events.push({ type: 'hit', id: a.id, target: b.id, dmg, heavy: !!atk.heavy, backstab, kill: false, x: px, z: pz });
  }
}

function separate(a, b) {
  if (a.state === 'dead' || b.state === 'dead') return;
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = RADIUS * 2;
  if (d >= min) return;
  const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0, push = (min - d) / 2;
  a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
}

function collide(f, w) {
  for (const o of w.obstacles) {
    if (o.kind === 'circle') {
      const dx = f.x - o.x, dz = f.z - o.z, d = Math.hypot(dx, dz), min = o.r + RADIUS;
      if (d < min) {
        const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
        f.x = o.x + nx * min; f.z = o.z + nz * min;
      }
    } else {
      const cx = Math.max(o.x - o.hw, Math.min(o.x + o.hw, f.x));
      const cz = Math.max(o.z - o.hd, Math.min(o.z + o.hd, f.z));
      let dx = f.x - cx, dz = f.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < 0.0001) {
        // Centre is inside the box: leave through the nearest face.
        const px = o.hw - Math.abs(f.x - o.x), pz = o.hd - Math.abs(f.z - o.z);
        if (px < pz) f.x = o.x + Math.sign(f.x - o.x || 1) * (o.hw + RADIUS);
        else f.z = o.z + Math.sign(f.z - o.z || 1) * (o.hd + RADIUS);
      } else if (d < RADIUS) {
        dx /= d; dz /= d;
        f.x = cx + dx * RADIUS; f.z = cz + dz * RADIUS;
      }
    }
  }
  const d = Math.hypot(f.x, f.z), max = w.R - RADIUS;
  if (d > max) { f.x *= max / d; f.z *= max / d; }
}

function segCircle(ax, az, bx, bz, o) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((o.x - ax) * dx + (o.z - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < o.r;
}
function segBox(ax, az, bx, bz, o) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, o.x - o.hw, o.x + o.hw], [az, dz, o.z - o.hd, o.z + o.hd]]) {
    if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) return false; continue; }
    let u = (lo - p) / d, v = (hi - p) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

// True when nothing tall stands between the two points. Low cover (crates) does not block sight.
export function hasLOS(w, ax, az, bx, bz) {
  for (const o of w.obstacles) {
    if (!o.tall) continue;
    if (o.kind === 'circle' ? segCircle(ax, az, bx, bz, o) : segBox(ax, az, bx, bz, o)) return false;
  }
  return true;
}
