// weapons.js — what each weapon does. Any fighter can hold any weapon: the fighter supplies the body
// (health, armour, speed, stamina) and the weapon supplies the moves.
//
// Every weapon has the same shape, borrowed from Naraka: Bladepoint:
//   h       horizontal attacks, chained by tapping (wide arc, catches side-steps)
//   v       vertical attacks, chained by tapping (narrow, longer, hit harder)
//   focusH  the charged horizontal strike, released after holding the button
//   focusV  the charged vertical strike
//
// Timings are in seconds. `anim` is [clip, start, moment of impact, end] within the motion library,
// and `hold` is the moment of the clip a fighter freezes on while charging.

const SWORD = {
  label: 'Sword',
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

// A copy of a weapon with every attack slowed or sped up and its damage scaled.
function tuned(base, label, time, dmg, extra = {}) {
  const fix = (a) => ({ ...a, windup: a.windup * time, recover: a.recover * time, dmg: a.dmg * dmg, stam: a.stam * (time > 1 ? 1.15 : 1) });
  return { ...base, label, h: base.h.map(fix), v: base.v.map(fix), focusH: fix(base.focusH), focusV: fix(base.focusV), ...extra };
}

const SPEAR = {
  label: 'Spear',
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
  sword: SWORD,
  divine: { ...SWORD, label: 'Divine sword' },
  // The mace keeps the big hammer swing for its charged horizontal strike.
  mace: tuned({ ...SWORD, focusH: { ...SWORD.focusH, anim: ['Heavy_Hammer_Swing', 1.05, 1.53, 1.8], hold: 1.05 } }, 'Mace', 1.15, 1.2),
  spear: SPEAR,
};

export const weaponOf = (id) => WEAPONS[id] || WEAPONS.sword;
