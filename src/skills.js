// skills.js — each fighter's special. One button, on a cooldown. Specials cannot be parried;
// they can be dodged, and they can be fired while reeling from a hit. `armed` ones need the weapon in hand. `atk` uses the same shape as a weapon attack (see weapons.js).
export const SKILLS = {
  // Aurelian: a burst of light all around him that throws the enemy back.
  sunburst: {
    name: 'Sunburst', cooldown: 14,
    atk: { name: 'sunburst', focus: true, heavy: true, skill: true, anim: ['Charged_Spell_Cast', 0.45, 1.73, 2.5], windup: 0.45, active: 0.12, recover: 0.5,
      dmg: 18, stam: 0, range: 4.6, arc: 3.2, lunge: 0, stagger: 0.9, knock: 11 },
  },
  // Varek: a long armoured rush that carries him across the yard and through the enemy's guard.
  rush: {
    name: "Oathbreaker's Rush", cooldown: 12,
    atk: { name: 'rush', focus: true, heavy: true, skill: true, dash: true, armed: true, anim: ['Thrust_Slash', 0.3, 0.73, 1.1], windup: 0.32, active: 0.22, recover: 0.45,
      dmg: 22, stam: 0, range: 2.7, arc: 0.9, lunge: 21, stagger: 0.8, knock: 8 },
  },
  // Wuixi: gone from where she stood and through the enemy in a single drawn cut. Quick to come back.
  flash: {
    name: 'Crimson Flash', cooldown: 10,
    atk: { name: 'flash', focus: true, heavy: true, skill: true, dash: true, armed: true, anim: ['Charged_Slash', 0.9, 1.17, 2.0], windup: 0.2, active: 0.2, recover: 0.4,
      dmg: 17, stam: 0, range: 2.8, arc: 1.2, lunge: 27, stagger: 0.7, knock: 6 },
  },
  // Everyone else: catch your breath and hit harder for a few seconds.
  wind: { name: 'Second Wind', cooldown: 16, buff: 6 },
};

export const skillOf = (id) => SKILLS[id] || SKILLS.wind;
