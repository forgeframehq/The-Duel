import { WEAPONS } from '../../src/weapons.js';
import { SKILLS } from '../../src/skills.js';
import { DIFFICULTY } from '../../src/ai.js';
import { ROSTER } from '../../src/roster.js';
import fs from 'fs';
const FLAGS = ['focus','heavy','skill','dash','armed','launch','slam','ender','solo','ground','kick','guardBreak'];
const fix = (a) => { const o = { ...a }; for (const k of FLAGS) o[k] = !!o[k]; o.title = o.title || ''; o.back = o.back || 0; o.hold = o.hold || 0; return o; };
const W = {};
for (const [id, w] of Object.entries(WEAPONS)) W[id] = { label: w.label, h: w.h.map(fix), v: w.v.map(fix), strings: Object.fromEntries(Object.entries(w.strings).map(([k, a]) => [k, fix(a)])), dir: Object.fromEntries(Object.entries(w.dir).map(([k, a]) => [k, fix(a)])), launch: fix(w.launch), focusH: fix(w.focusH), focusV: fix(w.focusV), riposte: fix(w.riposte) };
// The Godot edition gives straight swords moves from the free animation packs (fitted by tools/godot_bake).
// Only which clip plays, and which stretch of it, changes here: the timings and damage stay as build 20 has them.
const FREE = {
  h: [['Sword_Regular_Combo', 0.02, 0.23, 0.48], ['Sword_Regular_Combo', 0.48, 0.70, 1.0], ['Sword_Regular_Combo', 1.05, 1.53, 2.3]],
  v: [['Sword_Heavy_Combo', 2.1, 2.57, 3.2], ['Sword_Heavy_Combo', 0.1, 0.40, 0.8]],
};
// The katana takes them too (Sudhi, 11 Nov: Aurelian's fighting felt far better than Wuixi's mocap combo); it stays the quickest weapon.
for (const id of ['sword', 'divine', 'mace', 'katana']) {
  W[id].h.forEach((a, i) => { a.anim = FREE.h[i]; });
  W[id].v.forEach((a, i) => { a.anim = FREE.v[i]; });
  W[id].strings.HHH.anim = FREE.h[2];
}
for (const id in W) W[id].dir.HF.anim = ['Sword_Dash', 0.0, 0.30, 1.0];
// ---- Weapons a player can put in any fighter's hands (Godot edition). Each is the sword's rule set with its own pace,
// damage, reach and moves; `guardCost` is how much of the guard meter a blocked hit costs (a shield makes it cheap),
// `guardArc` how far round the body a guard reaches, `guardDmg` how hard this weapon's hits wear a guard down.
const clone = (o) => JSON.parse(JSON.stringify(o));
function variant(base, label, time, dmg, long, extra, moves) {
  const w = clone(W[base]);
  const fix = (a) => { a.windup *= time; a.recover *= time; a.dmg *= dmg; if (!a.kick) a.range += long; if (time > 1) a.stam *= 1.15; };
  [...w.h, ...w.v, ...Object.values(w.strings), ...Object.values(w.dir), w.launch, w.focusH, w.focusV].forEach(fix);
  moves.h.forEach((t, i) => { w.h[i].anim = t; });
  moves.v.forEach((t, i) => { w.v[i].anim = t; });
  w.strings.HHH.anim = moves.h[2];
  if (moves.lunge) w.dir.HF.anim = moves.lunge;
  return Object.assign(w, { label }, extra);
}
for (const w of Object.values(W)) Object.assign(w, { guardCost: 1, guardArc: 1.6, guardDmg: 1, hands: 1, shield: false });
W.sword_shield = variant('sword', 'Sword and shield', 1.06, 1.0, 0, { guardCost: 0.42, guardArc: 2.3, shield: true }, {
  h: [['ss_sword_and_shield_slash', 0.2, 0.60, 1.1], ['ss_sword_and_shield_slash_3', 0.35, 0.80, 1.3], ['ss_sword_and_shield_slash_5', 0.15, 0.57, 1.1]],
  v: [['ss_sword_and_shield_attack_4', 0.05, 0.43, 0.9], ['ss_sword_and_shield_attack_3', 0.3, 0.73, 1.4]],
  lunge: ['ss_sword_and_shield_attack', 0.6, 1.13, 1.9] });
W.greatsword = variant('sword', 'Greatsword', 1.3, 1.4, 0.4, { hands: 2, guardDmg: 1.3 }, {
  h: [['gs_great_sword_slash', 0.15, 0.53, 1.0], ['gs_great_sword_slash_3', 0.25, 0.77, 1.4], ['gs_great_sword_slash_2', 1.2, 1.67, 2.2]],
  v: [['gs_great_sword_attack', 0.05, 0.43, 1.0], ['gs_great_sword_slash_2', 2.1, 2.53, 3.3]] });
W.axe = variant('sword', 'Warhammer', 1.22, 1.3, 0.1, { hands: 2, guardDmg: 1.7 }, {
  h: [['ax_standing_melee_attack_horizontal', 0.5, 0.97, 1.6], ['ax_standing_melee_attack_backhand', 0.55, 1.0, 1.6], ['ax_standing_melee_attack_360_high', 0.5, 1.07, 1.9]],
  v: [['ax_standing_melee_attack_downward', 0.35, 0.83, 1.4], ['ax_standing_melee_combo_attack_ver_3', 0.5, 1.0, 1.5]] });

// Let the animation set the pace: no stretch of a clip is played more than 1.5 times faster than it was made
// (which is what made slashes snap out), nor its follow-through more than 1.5 times faster. Where the rules ask for a quicker
// move than the clip has, the clip is joined later, nearer the blow, instead of being squeezed.
const pace = (a) => {
  const [clip, start, hit, end] = a.anim;
  a.anim = [clip, Math.max(start, hit - a.windup * 1.5), hit, Math.min(end, hit + (a.active + a.recover) * 1.5)];
};
for (const w of Object.values(W)) [...w.h, ...w.v, ...Object.values(w.strings), ...Object.values(w.dir), w.launch, w.focusH, w.focusV, w.riposte].forEach(pace);
const S = {};
for (const [id, s] of Object.entries(SKILLS)) S[id] = { name: s.name, buff: s.buff || 0, atk: s.atk ? fix(s.atk) : null };
const R = ROSTER.slice(0, 3).map((r) => ({ id: r.id, name: r.name, short: r.short, origin: r.origin, weapon: r.weapon, skill: r.skill, blurb: r.blurb, stats: { ...r.stats, weapon: r.weapon, skill: r.skill } }));
fs.writeFileSync(new URL('../../godot/data/rules.json', import.meta.url), JSON.stringify({ weapons: W, skills: S, difficulty: DIFFICULTY, roster: R }, null, 1));
