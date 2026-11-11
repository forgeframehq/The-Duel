# The Duel — handover (11 Nov 2026, build 19)

Read this first in a new chat. It replaces the long conversation that built the game so far.

## 1. What this is

**The Duel** is a landscape-only, third-person 1v1 weapon-fighting game for Android, made by Sudhi (ForgeFrame studio). It runs in the browser (Three.js) and is wrapped as an APK.

- Repo: `forgeframehq/The-Duel` (branch `main`)
- Play it: https://forgeframehq.github.io/The-Duel/ (title screen shows the build number)
- Inspiration: **Naraka: Bladepoint** combat ("we are gonna absolutely completely do that naraka battle system"), a YouTube short of painted knights (@Toasted_Cursed, music "Hide (Slow)" by Dorian Concept), and a ChatGPT mock-up of a ruined castle courtyard.
- Goals: fights look epic and smooth; visually stunning and premium; **reusability** (one skeleton, animations bought once, any fighter can hold any weapon, cheap new characters); ForgeFrame branding with Dawn of Dynasties aesthetics.
- Later: skins, upgrades, multiplayer.

## 2. How to work with Sudhi

- Non-coder, works from an Android phone, tests by playing. Explain in plain words, no jargon.
- Hands-on and iterative: ship a change, he plays it, he reacts.
- **Standing rules**
  - **He plays the APK, not the web page** (said 11 Nov). Every build he is meant to play gets an APK: put `[release]` in the commit message. The app version follows the build number (build 18 = `The-Duel-1.0.18.apk`, tag `v1.0.18`). Tags cannot be pushed from a Claude session (403), so `[release]` is the only way.
  - Build only when he says to; between builds, collect his requests on the list in section 8.
  - Bump `BUILD` in `src/main.js` **and** `?v=` on the script tag in `index.html` on every update, and tell him which build number to look for. He has given feedback on stale cached builds before.
  - Music alternates battle tracks with smooth cross-fades and must not overpower sound effects.
  - No shields. Removed for good ("like Naraka").
  - **Run the visual check only when he asks for it** (it takes over five minutes and he found the wait too long).
- **API keys:** he pasted a Meshy key and an ElevenLabs key into the old chat and allowed their use. They are **not** stored anywhere in the repo and must never be. In a new chat, ask him for them again if needed, use them only as environment variables (`MESHY_KEY`), and remind him to rotate both since they sat in a chat log.

## 3. Where things stand

**Build 19 was released on 11 Nov as an APK (v1.0.19), about an hour after build 18. He has not reported playing either yet.** Build 19 adds the third fighter and the new map, made with his Meshy key under his instruction "don't hold back on vertices, make it look absolutely beautiful like the Naraka screenshot" and "file size is completely fine, Dawn of Dynasties was 300 MB":

- **Wuixi the Crimson Fang** (The Red Lotus; title and faction are Claude's suggestion, not yet confirmed by him). Meshy image-to-3D from `tools/fighters/wuixi.png` at 150,000 triangles, rigged on the shared skeleton, shipped unshrunk with 2048 px textures (`assets/models/wuixi.glb`, 5 MB). Fast, light armour. Weapon **katana** (built in code in `fighterView.js`: curved blade, gold guard, crimson-wrapped grip, tassel; quicker and slightly weaker than the sword). Special **Crimson Flash** (dash-cut, 10 s cooldown).
- **Whispering Meadow**, the new default arena (`src/meadow.js`): rolling ground with a winding dirt path, about 46,000 tufts of grass that sway in the wind and bend away from the fighters, wildflowers, pebbles, Meshy trees, mossy boulders, a pavilion and farmhouses, three rows of misty hills, blue sky with drifting clouds, soft daylight. Boulders and two trees are cover. Each arena now carries its own light (`look`), including sky reflections on metal.
- **Graphics setting** on the title screen (Low / Medium / High / Ultra, `src/quality.js`): sharpness, shadows, grass amount, tree detail. Default High. The game reloads when it is changed. If a fight runs under about 35 frames a second for six seconds it suggests lowering it, once.
- New tools: `tools/build_hd.mjs` (packs Meshy models at full detail), `tools/dev/look.mjs` (pictures of any model from four sides), `tools/dev/portraits.mjs` (select-screen portraits).
- **Weight:** the meadow at High draws about 1.8 million triangles a frame including shadows (courtyard: about 0.27 million). Fine on a strong phone; unknown on his. This is the first thing to ask about.
- A Meshy katana model was generated (30 credits) but came out wrong (cord wrapped round the blade), so the katana is built in code instead.

**Build 18 (v1.0.18)** came just before. It is the first step of his feedback on build 17: the fighting basics, on the existing arenas. The rest of his requests are still on the list in section 8.

What build 18 changed:

- **Two attack buttons, Horizontal and Vertical**, replace Attack and Launch. The flick arrows are gone.
- **Strings** (three presses, the order picks the finisher): H-H-H Tempest (wide sweep), V-V-V Earthsplitter (slam, knocks them flat), H-H-V Rising Fang (launcher, then air hits), V-V-H Reaper's Arc (spin that throws them back). Up to two quick taps queue up during a swing; a press made while reeling is remembered for 0.28 s.
- **Hold either button** for the blue charged strike (H wide, V slam). Dodge cancels it.
- **A vertical attack hits a rival on the ground**, once per knockdown.
- **Parry disarms:** it still only beats a blue charged strike, but now the rival's weapon flies out and lies in a gold ring; they cannot attack or parry until they walk over it (or 7 s pass), and the automatic counter still lands. A charging fighter has a blue glow, and the Parry button pulses blue as the cue. Parry window lengthened to 0.7 s.
- **Specials can be fired while reeling** from a hit.
- **See-through ring buttons with icons, no words.** The Special's ring fills as it recharges. Three marks by the buttons show the string in progress and, after two presses, name what each button would finish with. Finisher names pop up where they land. The pause screen has a move list.
- **Arena choice** on the fighter select screen (Castle Courtyard, Open Field), with pictures. Replaces the how-to lines there.
- **Battle music much quieter** (0.26 to 0.085; menu 0.15). He said it was too loud.
- **Frame cap:** 60 a second, falling to 30 under load (the Dawn of Dynasties heat fix).
- Classic camera a little closer (5.2 to 4.3) and it rises when squeezed against a wall so the fighter is not cut off.
- Layout faults from the visual check fixed; result screen says "Aurelian against Varek".
- Rival AI plays the strings, hits downed fighters, runs for its weapon when disarmed and presses a disarmed player.

Tested: `tools/dev/strings.mjs` (24 rule checks pass), `tools/dev/simtest.mjs` (difficulties rank correctly), a headless fight with screenshots, and the visual check (clean). **Not tested on a phone.** No new animations were bought (no Meshy key in this chat), so the finishers reuse clips: Earthsplitter uses the ground slam, Reaper's Arc the hammer swing.

**First thing to do in the new chat:** ask how build 18 plays on his phone from the APK: do the two buttons and strings feel right, can he land a parry now, is the music level right, is it smoother and cooler.

Also open with him: he asked (11 Nov) whether the game should have **metal-inspired theme, menu and intro music**. Claude's view given: yes for battle and intro, with the menu theme a slower, heavier version of the same riff. He makes the music in Suno; prompts to be written when he says go.

## 4. Game design as built

- Best of 3 rounds (first to 2), 99-second rounds, rival skill Easy / Normal / Hard.
- Triangle: normal attacks beat parry; charged (blue, armoured) beats normal attacks; parry beats charged and disarms.
- Buttons: Horizontal, Vertical, Dodge, Parry, Special, Lock. Strings and rules as listed in section 3.
- Also: stamina and "winded", whiff recovery, weapon clash, backstab ×1.5, dodge roll with invulnerability (hold Dodge = sprint), lock-on, pillars as cover.
- Fighters supply the body (health, armour, speed, stamina); weapons supply the moves. Weapons: Sword, Divine sword, Katana, Mace, Spear (all reuse the sword animations).
- Roster (`src/roster.js`): **Aurelian the Sun-Crowned** (The Gilded Order, divine sword, Sunburst), **Varek the Oathbreaker** (The Fallen, sword, Oathbreaker's Rush), **Wuixi the Crimson Fang** (The Red Lotus, katana, Crimson Flash), 8 Dawn of Dynasties fighters, and "Test Dummy" (the first plate knight). Aurelian and Varek are the two launch fighters.
- Arenas, chosen on the select screen: **Whispering Meadow** (default), Castle Courtyard (wall ring, towers, braziers, pillars, banners, puddles, leaves) and the old Open Field. `?arena=meadow|courtyard|field` also works.
- Four cameras (classic, shoulder, wide, side), cycled with the camera button.
- Audio: 20 ElevenLabs sound effects in `assets/sfx/`, Suno music in `assets/music/` (menu, battle1, battle2, victory, defeat).

## 5. Code map

No build step: plain ES modules, Three.js r187 vendored in `vendor/`.

| File | Role |
|---|---|
| `src/sim.js` | All combat rules, fixed 60 Hz tick, pure (no rendering). One command object per fighter: `{ mx, mz, faceYaw, h, v, hHold, vHold, parry, dodge, skill, sprint }`. Built this way so multiplayer can be added later. |
| `src/weapons.js` | Per-weapon moves: `h`, `v`, `strings` (finishers by button order), `launch`, `focusH`, `focusV`, `riposte`. `STRINGS` is the move list. `anim` is `[clip, start, impact, end]`. |
| `src/skills.js` | Specials: `sunburst`, `rush`, `wind`. |
| `src/ai.js` | Rival AI; outputs the same command object. Difficulty table at top. |
| `src/input.js` | Touch joystick, camera drag, Attack button gestures, keyboard (WASD, J horizontal, K vertical, L parry, I special, Space dodge, Q lock, C camera, Esc pause). |
| `src/fighterView.js` | Model, weapon mesh on `RightHand`, animation per state, team cloth recolour. |
| `src/models.js` | Loads characters and the shared animation library; pins hips. |
| `src/main.js` | Render loop, cameras, HUD, effects, music hooks, `BUILD`, `window.__duel` debug object. |
| `src/meadow.js`, `src/courtyard.js`, `src/arena.js` | Arenas. Each returns `{ group, obstacles, spawns, R, update, look }`. |
| `src/quality.js` | Graphics levels. |
| `src/select.js`, `src/roster.js` | Character select and fighter data. |
| `src/audio.js`, `src/fx.js` | Sound/music and particles/trails/shake. |
| `android/`, `.github/workflows/android.yml` | Capacitor 7 project; workflow builds an APK on `[release]` in a commit message or a `v*` tag. |
| `tools/` | `visual_check.mjs` (section 7), `new_fighter.py`, `new_prop.py` (Meshy pipeline), `build_models.mjs`, `build_props.mjs`, `portrait.html`, `viewer.html`. |
| `tools/dev/` | `strings.mjs` (rule checks), `simtest.mjs` (rival against rival), `shots.mjs` (pictures of a real fight; `bare` makes the arena pictures). These three run as they are. `juggle.mjs`, `g10.mjs`, `portraits.mjs`, `run.sh` are older, use the old controls and old paths, and need adjusting. `tools/dev/fonts/` holds the game's fonts for the test browser. |

## 6. Character and animation pipeline (Meshy)

- One shared **standard Meshy humanoid rig** (24 bones). Never use Smart Rig; it makes a different skeleton.
- Bodies are generated in A-pose with empty hands; weapons are built in code and attached to `RightHand`.
- `tools/new_fighter.py` takes a text prompt or concept image → Meshy body → rig. Resumable. Key from `MESHY_KEY`.
- Animations: `POST /openapi/v1/animations {rig_task_id, action_ids}`, 3 credits each; catalogue at https://api.meshy.ai/web/public/animations/resources.
- `tools/build_models.mjs` shrinks models (simplify, WebP textures, meshopt) and with `--anims` rebuilds `assets/models/anims.glb` from the sources listed in its KEEP list.
- **Full-size sources** (rigs and animation packs `combat3_anim.glb`, `combat4_anim.glb`, props) live on the repo's **`models` branch**. Meshy download links expire, so that branch is the only copy.
- Credit costs: text-to-3D 20 + 10, image-to-3D 30, rig 5, animation 3, remesh (a lighter copy of a finished model) 5. **Balance: 72** after build 19 (Wuixi 35, katana 30, tree, boulders, pavilion and hut 30 each, three lighter copies 15).
- From build 19, new fighters are generated with `MESHY_POLY=150000` and packed with `tools/build_hd.mjs fighter` (no triangles removed). `new_prop.py` takes `PROP_STYLE` to replace the castle-stone style line. meshopt's simplifier barely reduces Meshy models (too many texture seams); for a lighter copy use Meshy's remesh (`POST /v1/remesh {input_task_id, target_polycount}`).

## 7. Testing notes

- **Visual check:** `node tools/visual_check.mjs` (add `--no-fight` for menus only, or a size such as `915x412`). Same idea as the Dawn of Dynasties `tools/visual_check.py`. It walks the title, fighter select (every fighter), fight, pause and result screens at five phone sizes, saves a picture of each to `build/visual/<size>/`, outlines problems in red (words spilling out of or cut off by their box, things off screen, overlaps) and small text or buttons in dashed yellow, and writes `build/visual/report.md`. Takes about five minutes with the fight. It runs the game on the old grass field (`?arena=field`) because the courtyard is too slow in the test browser, so it checks screen layout, not how the arena looks.
- Headless Chrome with software rendering runs the courtyard at about 2 fps. Use `page.evaluate(() => el.click())`, keyboard input, device scale 1 and long waits; `tap` times out.
- The sandbox cannot reach github.io or Google Fonts, so the live site can't be checked from there. The build number on the title screen is how Sudhi confirms he has the new version.
- The courtyard is roughly twice as heavy as the field (about 266k triangles). Phone frame rate has not been measured.

## 8. Open list

### Next build list (collecting; build when Sudhi says go)

**His feedback on build 18 (11 Nov, 12:43, sent while build 19 was being made; he had not seen build 19):**

- "The game screen was still this, not what we planned": he expected the **Naraka-style hero select screen** (item 13) and got the old card grid. This is now the top request.
- "Game play was better, but fighting could be a lot better."
- **Parry should also work on normal attacks, as a deflection, without throwing the weapon away.** Reading proposed to him, awaiting his answer: a parry deflects normal hits (no damage, attacker knocked off balance for a moment, no disarm) and still disarms on a blue charged strike.
- "Can we get the smoothness and fighting of **the stickman fighting game**": he did not say which game. Ask for its name or a video before changing anything, then study how it moves (likely points: faster recoveries, moves that cancel into each other, longer blending between animations, more hit-pause and knock-back).

Done in build 18: the arrows, the two-button strings, the disarming parry, see-through icon buttons, arena choice, quieter music, the frame cap, and the layout faults. Still open from that feedback:

1. **Smoothness:** he said build 17 was "smooth but not smooth as we wanted". Build 18 adds the frame cap; ask whether it is frame rate or the moves themselves that feel off.
2. **Step two of the fighting system** (agreed as later): jump and air attacks; stick direction plus a button for extra moves; each weapon's own string list; a Training mode against a dummy; proper new animations for the finishers (about 3 Meshy credits each).
3. Not confirmed by him: pause / music / camera icons float mid-screen; he played build 17 in an in-app browser (he will use the APK from now on).

**C. Premium look and menus (his requests, 11 Nov)**

13. **Hero select like Naraka's hero screen** (he sent a screenshot): small portrait tiles in a grid on the left with silhouettes for fighters still to come, the chosen fighter standing large in 3D in the middle against a moody backdrop, name and short description on the right with their special and stats. Make our own design in that layout, not a copy of their art.
14. **Front menu:** game modes, settings and so on on the intro screen. Flow: title → choose game mode → choose fighter → fight. Modes and settings still to be agreed with him. He also wants map choice 'like Street Fighter': build 18 has a simple two-arena picker; a proper stage-select screen belongs here.
15. **New map in the style of the Naraka Mobile screenshot: done in build 19** (Whispering Meadow). Waiting for his reaction. Ideas not yet done: thatched huts closer in, a stream, fences, more tree kinds, grass that hides less of the fighters' legs if he finds it too tall.
16. **Colour:** the meadow has natural greens, haze and layered hills (done). The courtyard still has its orange light and flat purple cut-out mountains; re-grade it or retire it once he has seen the meadow.
17. **Closer camera:** the reference camera sits close behind the fighter, who fills about a third of the screen height. Ours is far back and the rival is tiny.

**D. Less boxy, quality first (his requests, 11 Nov)**

His rule: **looks come first; he does not care how big the game is.** Phones that can't cope turn the settings down. So build for the best look and make everything heavy switchable.

18. **Scenery:** replace block-built walls, towers and pillars with sculpted Meshy models; real textures with surface bumps on stone and ground; grass tufts, bushes, ivy, rubble, uneven ground, swaying trees; layered misty hills instead of cut-out mountains.
19. **Lighting:** distance haze, glow around fires and sun, soft contact shadows, colour grade.
20. **Characters less boxy:** Wuixi is the new standard (150,000 triangles, 2048 px textures, unshrunk). **Aurelian and Varek still ship at half detail with 1024 px textures**; re-pack them from the full-size sources on the `models` branch with `tools/build_hd.mjs fighter`, or regenerate them at 150,000 triangles (35 credits each) if the sources are too coarse. The eight Dawn of Dynasties fighters likewise.
21. **Graphics settings:** the level switch is done in build 19 (title screen). Still to add in a proper settings menu: music and sound volume sliders, a button-opacity slider, a frame-rate choice (30 / 60).
22. **Heat and battery guard, as in Dawn of Dynasties: done in build 18** (frame cap). Background: that game made phones hot until commit `ebecec8` ("Cooler phones", 4 Nov): a 60 fps cap that drops to 30 when the phone struggles, plus removing a costly per-frame effect; it also pauses all work when the app is left (`js/game.js`, "Frame cap"). The Duel now has the same cap and already paused when the app is left. Still at up to 2x sharpness with shadows on, which the graphics settings should control.

**E. Wuixi follow-ups**

23. Wuixi is in the game (build 19). Open: confirm her title and faction with him; her hair, ribbons and skirt are stiff (no bones for them on the shared skeleton; add sway in code); proper katana strings and animations of her own; his original artwork `tools/fighters/wuixi_art.png` could be her menu art.

### Backlog (waiting on Sudhi's go-ahead)

1. Real specials for the eight Dawn of Dynasties fighters (currently all Second Wind).
2. Varek's two-handed greatsword (needs two-handed clips, e.g. Meshy action 149 Two-handed Parry).
3. Weapon picker on the select screen.
4. Jump, crouch and true Naraka-style air moves; hero ultimates.
5. Bloom and colour grading, plus a graphics-quality setting for slower phones.
6. HUD restyle to match the ChatGPT mock-up.
7. Cobblestone and wall textures from ChatGPT (prompts were given; images not yet received). Dropping `assets/scenery/cobble.jpg` in replaces the procedural floor automatically.
8. More Suno battle tracks, volume sliders, and a Suno prompt in the "Hide (Slow)" mood once he describes what he wants.
9. Proper spear and mace animations.
10. Later: skins, upgrades, multiplayer, signed release build.
11. Housekeeping: rotate both API keys; optionally delete old `app-debug.apk` releases.
