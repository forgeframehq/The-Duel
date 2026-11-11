// weapons.js — what each weapon does. Any fighter can hold any weapon: the fighter supplies the body
// (health, armour, speed, stamina) and the weapon supplies the moves.
//
// Every weapon has the same shape, borrowed from Naraka: Bladepoint:
//   h, v     normal attacks on the Horizontal and Vertical buttons. Horizontals are quick and wide;
//            verticals are slower, narrower and heavier, and are the only attacks that reach a fighter on the ground
//   strings  what the third press of a string becomes, by the order of the buttons:
//              H H H  Tempest         a wide sweep
//              V V V  Earthsplitter   a slam that knocks the enemy flat
//              H H V  Rising Fang     the uppercut: knocks the enemy into the air, where more hits can follow
//              V V H  Reaper's Arc    a spinning cut that throws the enemy back
//   launch   the uppercut used by Rising Fang
//   focusH   the charged strike, released after holding Horizontal
//   focusV   the charged slam, released after holding Vertical
//   riposte  the automatic counter after a successful parry
//
// Timings are in seconds. `anim` is [clip, start, moment of impact, end] within the motion library,
// and `hold` is the moment of the clip a fighter freezes on while charging.

const LAUNCH = { name: 'launch', title: 'Rising Fang', launch: true, anim: ['Charged_Upward_Slash', 0.55, 1.05, 1.7], windup: 0.3, active: 0.12, recover: 0.3, dmg: 10, stam: 10, range: 2.5, arc: 0.85, lunge: 3.2, stagger: 0.3, knock: 1.2 };
const RIPOSTE = { name: 'riposte', anim: ['Counterstrike', 2.05, 2.37, 3.0], windup: 0.14, active: 0.14, recover: 0.3, dmg: 16, stam: 0, range: 3.4, arc: 1.7, lunge: 7, stagger: 0.55, knock: 5 };
// The two finishers every weapon shares until it gets moves of its own.
const SLAM = { name: 'slam', title: 'Earthsplitter', slam: true, ender: true, ground: true, heavy: true, anim: ['Charged_Ground_Slam', 1.2, 1.66, 2.5], windup: 0.36, active: 0.14, recover: 0.5, dmg: 17, stam: 11, range: 2.6, arc: 0.7, lunge: 4.2, stagger: 0.6, knock: 1.5 };
const SPIN = { name: 'spin', title: "Reaper's Arc", ender: true, heavy: true, anim: ['Heavy_Hammer_Swing', 1.05, 1.53, 1.8], windup: 0.32, active: 0.14, recover: 0.44, dmg: 14, stam: 10, range: 2.7, arc: 2.5, lunge: 3.2, stagger: 0.7, knock: 11 };

const SWORD = {
  label: 'Sword', launch: LAUNCH, riposte: RIPOSTE,
  h: [
    { name: 'h1', anim: ['Triple_Combo_Attack', 0.3, 0.77, 1.1], windup: 0.26, active: 0.12, recover: 0.24, dmg: 9, stam: 7, range: 2.35, arc: 1.1, lunge: 3.0, stagger: 0.32, knock: 3 },
    { name: 'h2', anim: ['Triple_Combo_Attack', 1.1, 1.53, 1.85], windup: 0.24, active: 0.12, recover: 0.24, dmg: 9, stam: 7, range: 2.35, arc: 1.1, lunge: 3.0, stagger: 0.32, knock: 3 },
    { name: 'h3', anim: ['Triple_Combo_Attack', 1.85, 2.23, 2.9], windup: 0.3, active: 0.12, recover: 0.38, dmg: 13, stam: 9, range: 2.45, arc: 1.0, lunge: 3.6, stagger: 0.46, knock: 5 },
  ],
  v: [
    { name: 'v1', anim: ['Right_Hand_Sword_Slash', 0.1, 0.53, 1.1], windup: 0.3, active: 0.12, recover: 0.28, dmg: 11, stam: 8, range: 2.55, arc: 0.7, lunge: 3.4, stagger: 0.36, knock: 3.5 },
    { name: 'v2', anim: ['Thrust_Slash', 0.3, 0.73, 1.1], windup: 0.3, active: 0.12, recover: 0.4, dmg: 14, stam: 9, range: 2.8, arc: 0.55, lunge: 4.2, stagger: 0.46, knock: 5 },
  ],
  focusH: { name: 'focusH', focus: true, heavy: true, anim: ['Charged_Slash', 0.8, 1.17, 2.0], hold: 0.8, windup: 0.2, active: 0.14, recover: 0.5, dmg: 24, stam: 16, range: 2.8, arc: 1.3, lunge: 4.5, stagger: 0.75, knock: 7 },
  focusV: { name: 'focusV', focus: true, heavy: true, anim: ['Charged_Ground_Slam', 1.1, 1.66, 2.7], hold: 1.1, windup: 0.22, active: 0.14, recover: 0.6, dmg: 30, stam: 18, range: 2.65, arc: 0.7, lunge: 5.0, stagger: 0.9, knock: 9 },
};

// Every attack a weapon can make, for anything that needs to walk the whole list.
export const attacksOf = (w) => [...w.h, ...w.v, ...Object.values(w.strings), w.launch, w.focusH, w.focusV, w.riposte];

// The attack that comes out for a string of presses such as 'H', 'HV' or 'VVH' (the last letter is the press just made).
export function attackFor(w, seq) {
  if (w.strings[seq]) return w.strings[seq];
  const list = seq[seq.length - 1] === 'H' ? w.h : w.v;
  return list[Math.min(seq.length - 1, list.length - 1)];
}

// The named strings, in the order the move list shows them.
export const STRINGS = [
  { seq: 'HHH', name: 'Tempest', note: 'Fast, wide sweep' },
  { seq: 'VVV', name: 'Earthsplitter', note: 'Slam that knocks them flat' },
  { seq: 'HHV', name: 'Rising Fang', note: 'Launches them: keep hitting in the air' },
  { seq: 'VVH', name: "Reaper's Arc", note: 'Spinning cut that throws them back' },
];

// Fills in the parts every weapon shares: verticals reach the ground, and the four named finishers.
function finish(w) {
  const v = w.v.map((a) => ({ ...a, ground: true })), last = w.h[w.h.length - 1];
  return { ...w, v, focusV: { ...w.focusV, ground: true },
    strings: {
      HHH: { ...last, name: 'sweep', title: 'Tempest', ender: true, heavy: true, dmg: last.dmg + 3, arc: 1.6, stagger: 0.55, knock: 6.5 },
      VVV: { ...SLAM, dmg: SLAM.dmg * (w.scale || 1), range: Math.max(SLAM.range, v[v.length - 1].range - 0.2) },
      HHV: w.launch,
      VVH: { ...SPIN, dmg: SPIN.dmg * (w.scale || 1) },
    } };
}

// A copy of a weapon with every attack slowed or sped up and its damage scaled.
function tuned(base, label, time, dmg, extra = {}) {
  const fix = (a) => ({ ...a, windup: a.windup * time, recover: a.recover * time, dmg: a.dmg * dmg, stam: a.stam * (time > 1 ? 1.15 : 1) });
  return { ...base, label, scale: dmg, h: base.h.map(fix), v: base.v.map(fix), launch: fix(base.launch), focusH: fix(base.focusH), focusV: fix(base.focusV), ...extra };
}

const SPEAR = {
  label: 'Spear', launch: { ...LAUNCH, range: 2.8 }, riposte: { ...RIPOSTE, anim: ['Thrust_Slash', 0.45, 0.73, 1.1] },
  h: [
    { name: 'h1', anim: ['Thrust_Slash', 1.1, 1.4, 1.9], windup: 0.28, active: 0.12, recover: 0.28, dmg: 9, stam: 7, range: 2.5, arc: 1.0, lunge: 3.0, stagger: 0.32, knock: 3.5 },
    { name: 'h2', anim: ['Right_Hand_Sword_Slash', 0.1, 0.53, 1.1], windup: 0.28, active: 0.12, recover: 0.34, dmg: 10, stam: 8, range: 2.5, arc: 1.0, lunge: 3.0, stagger: 0.36, knock: 4 },
  ],
  v: [
    { name: 'v1', anim: ['Thrust_Slash', 0.3, 0.73, 1.1], windup: 0.26, active: 0.12, recover: 0.26, dmg: 10, stam: 7, range: 2.9, arc: 0.45, lunge: 3.8, stagger: 0.34, knock: 3.5 },
    { name: 'v2', anim: ['Thrust_Slash', 0.3, 0.73, 1.1], windup: 0.26, active: 0.12, recover: 0.4, dmg: 13, stam: 9, range: 3.0, arc: 0.45, lunge: 4.4, stagger: 0.44, knock: 5 },
  ],
  focusH: SWORD.focusH,
  focusV: { ...SWORD.focusV, range: 2.9 },
};

export const WEAPONS = {
  sword: finish(SWORD),
  divine: finish({ ...SWORD, label: 'Divine sword' }),
  // The mace keeps the big hammer swing for its charged horizontal strike.
  mace: finish(tuned({ ...SWORD, focusH: { ...SWORD.focusH, anim: ['Heavy_Hammer_Swing', 1.05, 1.53, 1.8], hold: 1.05 } }, 'Mace', 1.15, 1.2)),
  spear: finish(SPEAR),
  // Lighter and quicker than a sword, and a little less in every cut.
  katana: finish(tuned(SWORD, 'Katana', 0.86, 0.94)),
};

export const weaponOf = (id) => WEAPONS[id] || WEAPONS.sword;
