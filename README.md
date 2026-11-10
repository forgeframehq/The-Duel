# The Duel

A one-on-one, third-person sword duel for phones. Landscape only. Runs in the browser, no build step.

**Play:** https://forgeframehq.github.io/The-Duel/

## Controls

| Touch | Keyboard | Action |
| --- | --- | --- |
| Left thumb | W A S D | Move |
| Drag right side | Mouse drag | Look |
| ATTACK | J | Light attack, tap again to chain a three-hit combo |
| HEAVY | K | Slow, glowing heavy attack that crushes a guard |
| BLOCK (hold) | L or Shift | Raise shield. Block just before a hit lands to parry |
| DODGE (tap / hold) | Space | Dodge with a moment of invulnerability / hold to sprint |
| LOCK | Q | Toggle lock-on |

Hits from behind do 50% more damage, so cover is worth using.

## Layout

- `src/sim.js` – the rules. Fixed 60 Hz ticks driven by one command object per fighter; no rendering or input code. This separation is what online play will plug into.
- `src/ai.js` – CPU opponent; produces the same command object a player does.
- `src/fighterView.js` – placeholder knights and their poses. To be replaced by rigged GLB characters.
- `src/arena.js` – scenery plus the obstacle list used for collision and line of sight.
- `src/main.js` – render loop, camera, HUD, hit-stop, slow motion.
- `src/fx.js`, `src/audio.js`, `src/input.js` – particles and trails, synthesised sound, touch and keyboard.
- `vendor/` – three.js r187.

## Run locally

Any static server works, for example `python3 -m http.server` in this folder.
