// roster.js — the fighters you can pick. Models come from Dawn of Dynasties.
// `stats` feeds straight into the rules (sim.js); this is also where upgrades will plug in later.
export const ROSTER = [
  // The first fighter of The Duel. Made from a concept image (tools/fighters/sun_warlord.png) with tools/new_fighter.py,
  // on the shared skeleton. Weapons are attached by the game, so `weapon` picks which ones.
  { id: 'sun_warlord', name: 'Aurelian the Sun-Crowned', origin: 'The Gilded Order', weapon: 'divine',
    blurb: 'A warlord in white and gold who has never lost in the arena. He carries Dawnbreaker, a blade said to hold the first light of morning. Every blow lands like judgement, but all that plate makes him the slowest man on the sand.',
    stats: { maxHp: 112, maxStam: 85, power: 1.3, armor: 0.2, speed: 3.8, reach: 0.1 } },
  // Aurelian's rival. Made from tools/fighters/varek.png. He is meant to carry a two-handed greatsword;
  // until that weapon type exists he fights with a plain sword.
  { id: 'varek', name: 'Varek the Oathbreaker', origin: 'The Fallen', weapon: 'sword',
    blurb: 'Once a knight of the Gilded Order who fought at Aurelian\'s side, cast out for breaking his vow. His armour has blackened and his colours hang in rags. Quicker and harder to tire than the man he once followed, and less forgiving of his own mistakes.',
    stats: { maxHp: 100, maxStam: 110, power: 1.2, armor: 0.12, speed: 4.5, reach: 0 } },
  { id: 'franks_knight', name: 'Frankish Knight', origin: 'Franks', weapon: 'sword',
    blurb: 'Mail and a straight sword. No weakness, no tricks.',
    stats: { maxHp: 100, maxStam: 100, power: 1.0, armor: 0.1, speed: 4.4, reach: 0 } },
  { id: 'byzantines_knight', name: 'Cataphract', origin: 'Byzantines', weapon: 'sword',
    blurb: 'Heavy armour soaks up punishment, but he is slow to close the distance.',
    stats: { maxHp: 120, maxStam: 90, power: 1.0, armor: 0.2, speed: 3.9, reach: 0 } },
  { id: 'chinese_knight', name: 'Imperial Guard', origin: 'Chinese', weapon: 'sword',
    blurb: 'Quick on his feet and hard to pin down. Lightly protected.',
    stats: { maxHp: 90, maxStam: 110, power: 1.0, armor: 0.05, speed: 5.0, reach: 0 } },
  { id: 'franks_militia', name: 'Man-at-Arms', origin: 'Franks', weapon: 'sword',
    blurb: 'Never seems to tire. Keeps swinging long after others must rest.',
    stats: { maxHp: 95, maxStam: 135, power: 0.95, armor: 0.05, speed: 4.5, reach: 0 } },
  { id: 'byzantines_spearman', name: 'Skoutatos', origin: 'Byzantines', weapon: 'spear',
    blurb: 'A long spear strikes first. Get inside its reach and he struggles.',
    stats: { maxHp: 90, maxStam: 100, power: 0.95, armor: 0.1, speed: 4.3, reach: 0.6 } },
  { id: 'chinese_spearman', name: 'Qiang Spearman', origin: 'Chinese', weapon: 'spear',
    blurb: 'Reach and speed together. Fragile if he is caught.',
    stats: { maxHp: 82, maxStam: 105, power: 0.95, armor: 0, speed: 4.8, reach: 0.6 } },
  { id: 'chinese_militia', name: 'Dao Swordsman', origin: 'Chinese', weapon: 'sword',
    blurb: 'Hits harder than anyone his size. Wears almost no armour.',
    stats: { maxHp: 90, maxStam: 100, power: 1.18, armor: 0, speed: 4.6, reach: 0 } },
  { id: 'franks_king', name: 'The King', origin: 'Franks', weapon: 'sword',
    blurb: 'Every blow is a royal decree. Tires quickly and moves like a monarch.',
    stats: { maxHp: 110, maxStam: 82, power: 1.28, armor: 0.1, speed: 4.0, reach: 0 } },
  // The first body made with the Meshy pipeline, kept for trying things out. `cloth` says which colour the game re-dyes per team.
  { id: 'plate_knight', name: 'Test Dummy', origin: 'The Training Yard', weapon: 'sword', cloth: 'red',
    blurb: 'A suit of plate that stands where it is told and takes what it is given. Good for practice.',
    stats: { maxHp: 115, maxStam: 90, power: 1.1, armor: 0.22, speed: 4.0, reach: 0 } },
];

export const byId = (id) => ROSTER.find((r) => r.id === id) || ROSTER[0];

// How each stat is shown on the select screen: [label, key, min, max]
export const STAT_BARS = [
  ['Health', 'maxHp', 70, 125], ['Stamina', 'maxStam', 70, 140], ['Power', 'power', 0.85, 1.3],
  ['Speed', 'speed', 3.6, 5.1], ['Armour', 'armor', -0.04, 0.22], ['Reach', 'reach', -0.15, 0.7],
];
