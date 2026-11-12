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
