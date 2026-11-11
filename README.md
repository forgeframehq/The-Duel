# The Duel

A one-on-one, third-person sword duel for phones. Landscape only. Runs in the browser, no build step.

**Play:** https://forgeframehq.github.io/The-Duel/

## Controls

| Touch | Keyboard | Action |
| --- | --- | --- |
| Left thumb | W A S D | Move |
| Drag right side | Mouse drag | Look |
| SLASH (tap) | J | Horizontal attack; tap again to chain, three hits at most |
| CHOP (tap) | K | Vertical attack: narrower, longer, hits harder |
| SLASH or CHOP (hold) | hold J or K | Charge, then release a glowing strike that normal hits cannot stop |
| PARRY | L | A short stance that turns a charged strike back on the attacker |
| DODGE (tap / hold) | Space | Dodge with a moment of invulnerability / hold to sprint |
| LOCK | Q | Toggle lock-on |

The fight is a triangle, after Naraka: Bladepoint: normal attacks beat a parry, a charged strike beats
normal attacks, and a parry beats a charged strike. Two normal swings that meet clash and both fighters
are pushed back. Hits from behind do 50% more damage. Weapons are defined in `src/weapons.js`; any
fighter can hold any of them.

## Fighters

Eight fighters, each with different health, stamina, power, speed, armour and reach (`src/roster.js`).
The characters, trees and buildings are from Dawn of Dynasties; the rigged models and motion clips
come from that repo's `models` branch and are shrunk for phones by `tools/build_models.mjs`.

## Layout

- `src/sim.js` – the rules. Fixed 60 Hz ticks driven by one command object per fighter; no rendering or input code. This separation is what online play will plug into.
- `src/ai.js` – CPU opponent; produces the same command object a player does.
- `src/roster.js` – the fighters and their stats. `src/select.js` – the character select screen.
- `src/models.js` – loads characters and the shared motion library. `src/fighterView.js` – picks the clip and moment to show for each state, attaches weapons, applies team colour.
- `src/arena.js` – scenery plus the obstacle list used for collision and line of sight.
- `src/main.js` – render loop, camera, HUD, hit-stop, slow motion.
- `src/fx.js`, `src/audio.js`, `src/input.js` – particles and trails, synthesised sound, touch and keyboard.
- `assets/models` – characters and `anims.glb`. `assets/portraits` – select-screen portraits (rendered with `tools/portrait.html`).
- `tools/viewer.html` – poses a character at any moment of any clip, for tuning attack timings.
- `vendor/` – three.js r187 and its GLTF loader.

## Run locally

Any static server works, for example `python3 -m http.server` in this folder.
