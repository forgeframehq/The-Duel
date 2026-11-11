// sim.js — pure game rules. No rendering, no DOM, no input devices.
// The world advances in fixed ticks from one command object per fighter,
// so the same code can later be driven by a network peer instead of the AI.
//
// The fight is a triangle, after Naraka: Bladepoint:
//   normal attacks  beat a parry      (a parry does not stop them)
//   a charged strike beats normal attacks (it cannot be interrupted by them)
//   a parry          beats a charged strike (and leaves the attacker wide open)
import { weaponOf, attackFor } from './weapons.js';
import { skillOf } from './skills.js';

export const TICK = 1 / 60;
export const ROUND_TIME = 99;
export const ROUNDS_TO_WIN = 2;
export const DODGE_TIME = 0.55;
// Hold an attack button this long into a swing and it becomes a charge instead.
export const CHARGE_AFTER = 0.12;
export const MIN_CHARGE = 0.3;    // a charge must be held at least this long before it can be released
export const FULL_CHARGE = 0.9;   // held this long, the strike does its most damage
export const MAX_CHARGE = 1.5;    // held this long, it goes off by itself
// A parry: the moment it starts working, the moment it stops, and when the fighter can act again.
export const PARRY = { start: 0.03, end: 0.7, total: 0.95 };
// A parried fighter's weapon is knocked out of their hand. It comes back when they walk over it, or by itself after this long.
export const DISARM_TIME = 7, PICKUP_RANGE = 1.0;
// A press made a moment too early (while reeling, rolling or recovering) is remembered this long,
// and a string stays open this long after a swing ends. Both are generous on purpose: thumbs on glass are not buttons.
export const BUFFER_TIME = 0.28, STRING_GAP = 0.75;
// A launched fighter hangs in the air this long, can be hit this many more times, then lies on the ground and gets up.
export const AIR_TIME = 1.05, JUGGLE_MAX = 3, DOWN_TIME = 0.7, GETUP_TIME = 0.7, AIR_HEIGHT = 1.5;
const RADIUS = 0.48;

export const EMPTY_CMD = Object.freeze({ mx: 0, mz: 0, faceYaw: null, h: false, v: false, hHold: false, vHold: false, parry: false, dodge: false, skill: false, sprint: false });

// Upgrade hook for the progression phase: everything a character build can change lives here.
export function defaultStats() {
  return { maxHp: 100, maxStam: 100, power: 1, armor: 0, speed: 4.4, reach: 0, weapon: 'sword', skill: 'wind' };
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

const FRESH = () => ({
  state: 'idle', t: 0, atk: null, btn: null, seq: '', seqT: 0, bufBtn: null, bufT: 0, hitDone: false, swung: false, queue: '',
  disarmed: false, disarmT: 0, dropX: 0, dropZ: 0, groundHit: false, floored: false,
  charge: null, chargeMul: 1, juggle: 0, airDur: AIR_TIME, buffT: 0, skillCd: 0, staggerDur: 0, parried: false, bounced: false, connected: false, winded: 0, regenDelay: 0,
});

function makeFighter(id, stats) {
  return { id, stats, weapon: weaponOf(stats.weapon), skill: skillOf(stats.skill), x: 0, z: 0, vx: 0, vz: 0, yaw: 0, hp: stats.maxHp, stam: stats.maxStam, swingId: 0, ddx: 0, ddz: 0, ...FRESH() };
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
    Object.assign(f, { x: s.x, z: s.z, vx: 0, vz: 0, yaw: s.yaw, hp: f.stats.maxHp, stam: f.stats.maxStam, ...FRESH() });
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
    // Detect both swings before applying either, so a simultaneous exchange is fair
    // and neither side wins it just by being first in the list.
    const ha = findHit(a, b, w), hb = findHit(b, a, w);
    if (ha && hb && !ha.focus && !hb.focus) clash(a, b, w);
    else {
      if (ha) applyHit(a, b, ha, w);
      if (hb) applyHit(b, a, hb, w);
    }
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

// Spending stamina. Running dry leaves the fighter winded: for a moment they cannot attack,
// parry, dodge or sprint, which is what makes button mashing a losing plan.
export const WINDED_TIME = 1.6;
function spend(f, amount, delay, w) {
  f.stam -= amount; f.regenDelay = Math.max(f.regenDelay, delay);
  if (f.stam <= 0) {
    f.stam = 0;
    if (f.winded <= 0) { f.winded = WINDED_TIME; f.regenDelay = 1.0; w.events.push({ type: 'winded', id: f.id }); }
  }
}

function beginSwing(f, atk, w) {
  f.state = 'attack'; f.t = 0; f.atk = atk; f.hitDone = false; f.connected = false; f.swung = false; f.swingId++;
  w.events.push({ type: 'windup', id: f.id, heavy: !!atk.focus });
}

// A normal attack on the Horizontal ('H') or Vertical ('V') button. Which one comes out depends on
// the presses before it: the third press of a string is a finisher chosen by the order of the buttons.
function startAttack(f, btn, w) {
  if (f.disarmed) { w.events.push({ type: 'unarmed', id: f.id }); return false; }
  if (f.winded > 0 || f.stam <= 0) return false;
  const seq = (f.seq.length >= 3 ? '' : f.seq) + btn, atk = attackFor(f.weapon, seq);
  spend(f, atk.stam, 0.7, w);
  f.chargeMul = 1; f.seq = seq; f.btn = btn;
  beginSwing(f, atk, w);
  w.events.push({ type: 'string', id: f.id, seq, title: atk.title || '' });
  return true;
}

function endString(f, w) {
  if (f.seq) { f.seq = ''; w.events.push({ type: 'string', id: f.id, seq: '', title: '' }); }
  f.seqT = 0;
}

// The fighter's special. Ready again after its cooldown.
function startSkill(f, w) {
  if (f.skillCd > 0) return false;
  const sk = f.skill;
  if (sk.atk && sk.atk.armed && f.disarmed) { w.events.push({ type: 'unarmed', id: f.id }); return false; }
  f.skillCd = sk.cooldown;
  w.events.push({ type: 'skill', id: f.id, name: sk.name, kind: sk.atk ? sk.atk.name : 'wind' });
  if (sk.atk) { f.chargeMul = 1; endString(f, w); f.parried = false; f.bounced = false; beginSwing(f, sk.atk, w); }
  else { f.stam = f.stats.maxStam; f.winded = 0; f.regenDelay = 0; f.buffT = sk.buff; }
  return true;
}

function startParry(f, w) {
  if (f.disarmed || f.winded > 0 || f.stam <= 0) return false;
  spend(f, 12, 0.6, w);
  f.state = 'parry'; f.t = 0; endString(f, w);
  w.events.push({ type: 'parrystance', id: f.id });
  return true;
}

function startDodge(f, cmd, w) {
  if (f.winded > 0 || f.stam <= 0) return false;
  let dx = cmd.mx, dz = cmd.mz;
  const m = Math.hypot(dx, dz);
  if (m > 0.2) { dx /= m; dz /= m; } else { dx = -Math.sin(f.yaw); dz = -Math.cos(f.yaw); }
  f.ddx = dx; f.ddz = dz;
  spend(f, 20, 0.6, w);
  f.state = 'dodge'; f.t = 0; f.charge = null; f.queue = '';
  w.events.push({ type: 'dodge', id: f.id });
  return true;
}

export function dodgeInvulnerable(f) { return f.state === 'dodge' && f.t >= 0.03 && f.t <= 0.38; }
// While charging and while the charged strike is coming out, normal attacks cannot stop a fighter.
export function armored(f) { return f.state === 'charge' || (f.state === 'attack' && f.atk.focus && f.t < f.atk.windup + f.atk.active); }
export function parrying(f) { return f.state === 'parry' && f.t >= PARRY.start && f.t <= PARRY.end; }

function face(f, cmd, rate, dt) {
  if (cmd.faceYaw != null) f.yaw = turnToward(f.yaw, cmd.faceYaw, rate * dt);
  else if (Math.hypot(cmd.mx, cmd.mz) > 0.25) f.yaw = turnToward(f.yaw, Math.atan2(cmd.mx, cmd.mz), rate * dt);
}

function updateFighter(f, cmd, other, w) {
  const dt = TICK;
  f.t += dt;
  const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);

  if (f.state !== 'dead') {
    if (f.winded > 0) f.winded -= dt;
    if (f.buffT > 0) f.buffT -= dt;
    if (f.skillCd > 0) f.skillCd -= dt;
    if (f.regenDelay > 0) f.regenDelay -= dt;
    else if (f.state === 'idle' || f.state === 'stagger') f.stam = Math.min(f.stats.maxStam, f.stam + 26 * dt);
    // Remember an attack pressed a moment too early, so it comes out as soon as the fighter is free.
    if (f.bufT > 0) f.bufT -= dt;
    if ((cmd.h || cmd.v) && f.state !== 'idle' && f.state !== 'attack' && f.state !== 'charge') { f.bufBtn = cmd.h ? 'H' : 'V'; f.bufT = BUFFER_TIME; }
    // Disarmed: the weapon lies where it fell until its owner reaches it.
    if (f.disarmed) {
      f.disarmT -= dt;
      const near = Math.hypot(f.x - f.dropX, f.z - f.dropZ) < PICKUP_RANGE;
      if ((near && (f.state === 'idle' || f.state === 'dodge')) || f.disarmT <= 0) { f.disarmed = false; w.events.push({ type: 'pickup', id: f.id, x: f.x, z: f.z }); }
    }
  }

  let tvx = 0, tvz = 0, accel = 14;

  switch (f.state) {
    case 'idle': {
      if (f.seqT > 0) { f.seqT -= dt; if (f.seqT <= 0) endString(f, w); }
      if (cmd.dodge && startDodge(f, cmd, w)) break;
      if (cmd.parry && startParry(f, w)) break;
      if (cmd.skill && startSkill(f, w)) break;
      const press = cmd.h ? 'H' : cmd.v ? 'V' : f.bufT > 0 ? f.bufBtn : null;
      if (press) { f.bufT = 0; if (startAttack(f, press, w)) break; }
      let sp = f.stats.speed;
      const mag = Math.min(1, Math.hypot(cmd.mx, cmd.mz));
      if (cmd.sprint && mag > 0.5 && f.winded <= 0 && f.stam > 0) { sp *= 1.5; spend(f, 13 * dt, 0.35, w); }
      if (f.winded > 0) sp *= 0.8;
      // Backpedalling while facing the enemy is slower than advancing.
      if (mag > 0.1 && cmd.faceYaw != null) {
        const along = (cmd.mx * fx + cmd.mz * fz) / mag;
        if (along < 0) sp *= 1 + 0.3 * along;
      }
      tvx = cmd.mx * sp; tvz = cmd.mz * sp;
      face(f, cmd, 11, dt);
      break;
    }
    case 'attack': {
      // A swing that touches nothing (missed or dodged) takes longer to recover from: an opening for the other side.
      const a = f.atk, recover = a.recover * (f.connected || f.t < a.windup + a.active ? 1 : 1.4), total = a.windup + a.active + recover;
      // Presses made during a swing wait their turn (two at most), so a string can be tapped out quickly.
      if (cmd.h) f.queue = (f.queue + 'H').slice(0, 2);
      if (cmd.v) f.queue = (f.queue + 'V').slice(0, 2);
      // Still holding the button early in a normal swing: wind it back into a charge.
      // Horizontal becomes the wide charged strike, Vertical the charged slam.
      if (!a.focus && !a.launch && !a.ender && a !== f.weapon.riposte && f.t >= CHARGE_AFTER && f.t < a.windup && (f.btn === 'H' ? cmd.hHold : cmd.vHold)) {
        f.state = 'charge'; f.t = 0; f.charge = f.btn === 'H' ? 'h' : 'v'; f.queue = '';
        endString(f, w);
        w.events.push({ type: 'charge', id: f.id });
        break;
      }
      if (f.t < a.windup) face(f, cmd, a.focus ? 9 : 7, dt);
      const gap = Math.hypot(other.x - f.x, other.z - f.z);
      if (f.t > a.windup * (a.dash ? 0.3 : 0.55) && f.t < a.windup + a.active && gap > 1.35) { tvx = fx * a.lunge; tvz = fz * a.lunge; }
      accel = 18;
      if (!f.swung && f.t >= a.windup) { f.swung = true; w.events.push({ type: 'swing', id: f.id, heavy: !!a.focus }); }
      if (cmd.dodge && f.t >= a.windup + a.active + recover * 0.45 && startDodge(f, cmd, w)) break;
      if (f.t >= total) {
        const q = f.queue[0], free = a.launch || a === f.weapon.riposte;
        f.state = 'idle'; f.t = 0; f.queue = f.queue.slice(1); f.seqT = STRING_GAP;
        // A string is three presses at most; a finisher, a charged strike or a special always ends one.
        const ended = a.focus || a.ender || free || f.seq.length >= 3;
        if (ended) endString(f, w);
        if (a.focus) { f.queue = ''; break; }
        // After a finisher there is a breath before the next string (an opening for the other side),
        // except after the uppercut or a counter, where the follow-up hits come straight away.
        if (q && (!ended || free)) startAttack(f, q, w); else f.queue = '';
      }
      break;
    }
    case 'charge': {
      // Rooted to a slow walk, glowing, and unstoppable by normal attacks. Dodging out of it is a feint.
      if (cmd.dodge && startDodge(f, cmd, w)) break;
      f.regenDelay = Math.max(f.regenDelay, 0.5);
      const sp = f.stats.speed * 0.3;
      tvx = cmd.mx * sp; tvz = cmd.mz * sp;
      face(f, cmd, 6, dt);
      const held = f.charge === 'h' ? cmd.hHold : cmd.vHold;
      if ((!held && f.t >= MIN_CHARGE) || f.t >= MAX_CHARGE) {
        const atk = f.charge === 'h' ? f.weapon.focusH : f.weapon.focusV;
        f.chargeMul = 1 + 0.3 * Math.max(0, Math.min(1, (f.t - MIN_CHARGE) / (FULL_CHARGE - MIN_CHARGE)));
        spend(f, atk.stam, 0.9, w);
        f.charge = null;
        beginSwing(f, atk, w);
      }
      break;
    }
    case 'parry': {
      accel = 10;
      if (cmd.faceYaw != null) f.yaw = turnToward(f.yaw, cmd.faceYaw, 5 * dt);
      if (f.t >= PARRY.total) { f.state = 'idle'; f.t = 0; }
      break;
    }
    case 'dodge': {
      const k = 1 - f.t / DODGE_TIME, sp = 8.8 * (0.35 + 0.65 * k);
      f.vx = f.ddx * sp; f.vz = f.ddz * sp; accel = 0;
      if (cmd.faceYaw != null) f.yaw = turnToward(f.yaw, cmd.faceYaw, 6 * dt);
      if (f.t >= DODGE_TIME) { f.state = 'idle'; f.t = 0; }
      break;
    }
    case 'air': {
      // Knocked off the ground and helpless until landing.
      accel = 3;
      if (f.t >= f.airDur) { f.state = 'down'; f.t = 0; f.groundHit = false; f.vx = f.vz = 0; w.events.push({ type: 'land', id: f.id, x: f.x, z: f.z }); }
      break;
    }
    case 'down': accel = 12; if (f.t >= DOWN_TIME) { f.state = 'getup'; f.t = 0; } break;
    case 'getup': accel = 12; if (f.t >= GETUP_TIME) { f.state = 'idle'; f.t = 0; } break;
    case 'stagger': {
      accel = 6;
      // A special can be fired while reeling from a hit (though not while thrown open by a parry).
      if (cmd.skill && !f.parried && startSkill(f, w)) break;
      if (f.t >= f.staggerDur) { f.state = 'idle'; f.t = 0; f.parried = false; f.bounced = false; }
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

function stagger(f, dur, kx, kz, parried = false, bounced = false) {
  f.state = 'stagger'; f.t = 0; f.staggerDur = dur; f.parried = parried; f.bounced = bounced; f.vx = kx; f.vz = kz; f.queue = ''; f.charge = null; f.seq = ''; f.seqT = 0;
}

// Knocked flat on the ground. One vertical attack can reach a fighter there before they get up.
function floor(f, kx, kz) {
  f.state = 'down'; f.t = 0; f.groundHit = false; f.vx = kx; f.vz = kz; f.queue = ''; f.charge = null; f.seq = ''; f.seqT = 0;
}

// The weapon flies out of a parried fighter's hand and lands a few steps away, off to one side.
function disarm(a, b, w) {
  const away = Math.atan2(a.x - b.x, a.z - b.z);
  let x = a.x, z = a.z;
  search: for (const d of [4.2, 3, 2]) for (const turn of [0.95, -0.95, 2.0, -2.0, 0]) {
    const cx = a.x + Math.sin(away + turn) * d, cz = a.z + Math.cos(away + turn) * d;
    if (Math.hypot(cx, cz) > w.R - 1.6 || !hasLOS(w, a.x, a.z, cx, cz)) continue;
    if (w.obstacles.some((o) => (o.kind === 'circle' ? Math.hypot(cx - o.x, cz - o.z) < o.r + 0.9 : Math.abs(cx - o.x) < o.hw + 0.9 && Math.abs(cz - o.z) < o.hd + 0.9))) continue;
    x = cx; z = cz; break search;
  }
  a.disarmed = true; a.disarmT = DISARM_TIME; a.dropX = x; a.dropZ = z;
  w.events.push({ type: 'disarm', id: a.id, x, z });
}

function findHit(a, b, w) {
  // A fighter getting up cannot be hit, and one lying on the ground only once and only by a vertical
  // attack, which stops a combo going on for ever.
  if (a.state !== 'attack' || a.hitDone || b.state === 'dead' || b.state === 'getup') return null;
  const atk = a.atk;
  if (b.state === 'down' && (!atk.ground || b.groundHit)) return null;
  if (a.t < atk.windup || a.t > atk.windup + atk.active) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > atk.range + (a.stats.reach || 0)) return null;
  if (Math.abs(angDiff(a.yaw, Math.atan2(dx, dz))) > atk.arc) return null;
  if (!hasLOS(w, a.x, a.z, b.x, b.z)) return null;
  return atk;
}

// Two normal swings meeting at the same instant ring off each other and both fighters are pushed back.
function clash(a, b, w) {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
  a.hitDone = b.hitDone = true; a.connected = b.connected = true;
  stagger(a, 0.4, -nx * 4, -nz * 4, false, true);
  stagger(b, 0.4, nx * 4, nz * 4, false, true);
  w.events.push({ type: 'clash', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
}

function applyHit(a, b, atk, w) {
  if (b.state === 'dead') return;
  const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), toB = Math.atan2(dx, dz);
  a.hitDone = true;
  const nx = dist > 0.001 ? dx / dist : Math.sin(a.yaw), nz = dist > 0.001 ? dz / dist : Math.cos(a.yaw);
  const px = b.x - nx * 0.35, pz = b.z - nz * 0.35;
  if (dodgeInvulnerable(b)) { w.events.push({ type: 'evade', id: b.id, x: b.x, z: b.z }); return; }

  a.connected = true;
  // How far the attacker is from the direction the defender is facing: 0 = head on, PI = from behind.
  const off = Math.abs(angDiff(b.yaw, toB + Math.PI));
  const backstab = off > 2.2;
  const raw = atk.dmg * a.stats.power * (atk.focus ? a.chargeMul : 1) * (a.buffT > 0 ? 1.2 : 1);

  if (b.state === 'down') {
    // A vertical attack on a fighter lying on the ground: reduced damage, and it keeps them there a little longer.
    const dmg = raw * 0.7 * (1 - b.stats.armor);
    b.groundHit = true; b.hp -= dmg;
    const info = { type: 'hit', id: a.id, target: b.id, dmg, heavy: !!atk.focus, ground: true, title: atk.title || '', x: px, z: pz };
    if (b.hp <= 0) { b.hp = 0; b.state = 'dead'; b.t = 0; b.floored = true; b.vx = b.vz = 0; w.events.push({ ...info, kill: true }); }
    else { b.t = Math.max(0, b.t - 0.2); w.events.push({ ...info, kill: false }); }
    return;
  }

  if (atk.focus && !atk.skill && parrying(b) && off <= 1.6) {
    // A parry beats a charged strike (not a special): the attacker's weapon is knocked out of their hand,
    // they are thrown wide open, and the defender counters at once.
    stagger(a, 1.2, -nx * 2, -nz * 2, true);
    disarm(a, b, w);
    b.stam = Math.min(b.stats.maxStam, b.stam + 25); b.regenDelay = 0; b.seq = ''; b.chargeMul = 1;
    b.yaw = Math.atan2(-dx, -dz);
    beginSwing(b, b.weapon.riposte, w);
    w.events.push({ type: 'parry', id: b.id, target: a.id, x: px, z: pz });
    return;
  } else if (atk.focus) {
    // charged strikes and specials go straight through
  } else if (armored(b) && !backstab) {
    // A charged strike beats normal attacks: the blow lands for half and does not stop them.
    const dmg = raw * 0.5 * (1 - b.stats.armor);
    b.hp -= dmg;
    if (b.hp > 0) { w.events.push({ type: 'armor', id: a.id, target: b.id, dmg, x: px, z: pz }); return; }
    b.hp += dmg; // a killing blow goes through as a normal hit below
  }

  // Normal attacks beat a parry: a fighter caught in the stance takes extra.
  const riposte = b.state === 'stagger' && b.parried;
  if (riposte) b.parried = false; // only the first hit after a parry is a riposte
  const punish = !atk.focus && b.state === 'parry';
  const bonus = backstab || riposte ? 1.5 : punish ? 1.25 : 1;
  const dmg = raw * bonus * (1 - b.stats.armor);
  const info = { type: 'hit', id: a.id, target: b.id, dmg, heavy: !!atk.focus || !!atk.heavy, backstab, riposte, punish, title: atk.title || '', x: px, z: pz };
  b.hp -= dmg;
  if (b.hp <= 0) {
    b.launched = !!atk.focus || b.state === 'air';
    b.hp = 0; b.state = 'dead'; b.t = 0; b.charge = null; b.vx = nx * atk.knock; b.vz = nz * atk.knock;
    w.events.push({ ...info, kill: true });
  } else if (b.state === 'air') {
    // Juggling: each hit keeps them up a little longer; a charged strike or the last allowed hit slams them down.
    b.juggle++;
    if (atk.focus || atk.slam || b.juggle >= JUGGLE_MAX) { floor(b, nx * 2, nz * 2); w.events.push({ ...info, kill: false, slam: true }); }
    else { b.t = Math.min(b.t, 0.3); b.vx = nx * 0.4; b.vz = nz * 0.4; w.events.push({ ...info, kill: false, air: true }); }
  } else if (atk.launch) {
    b.state = 'air'; b.t = 0; b.juggle = 0; b.airDur = AIR_TIME; b.charge = null; b.queue = ''; b.vx = nx * 0.5; b.vz = nz * 0.5;
    w.events.push({ ...info, kill: false, launch: true });
  } else if (atk.slam) {
    // Earthsplitter drives a standing fighter into the ground.
    floor(b, nx * atk.knock, nz * atk.knock);
    w.events.push({ ...info, kill: false, slam: true });
  } else {
    stagger(b, atk.stagger, nx * atk.knock, nz * atk.knock);
    w.events.push({ ...info, kill: false });
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
