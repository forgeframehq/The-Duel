# The Duel — handover (11 Nov 2026, build 17)

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
  - **No APK until he says so.** Never put `[release]` in a commit message or push a `v*` tag unless asked. (Last APK: v1.0.4, which is far behind the web build.)
  - APK files are named `The-Duel-<version>.apk`.
  - Bump `BUILD` in `src/main.js` **and** `?v=` on the script tag in `index.html` on every update, and tell him which build number to look for. He has given feedback on stale cached builds before.
  - Music alternates battle tracks with smooth cross-fades and must not overpower sound effects.
  - No shields. Removed for good ("like Naraka").
  - Run `node tools/visual_check.mjs` before every build and fix what it marks in red.
- **API keys:** he pasted a Meshy key and an ElevenLabs key into the old chat and allowed their use. They are **not** stored anywhere in the repo and must never be. In a new chat, ask him for them again if needed, use them only as environment variables (`MESHY_KEY`), and remind him to rotate both since they sat in a chat log.

## 3. Where things stand

Build 17 was pushed on 11 Nov. It answers his earlier feedback ("Chop/slash makes not much sense, look at what Naraka does; each character needs a special; parry basically did nothing").

What build 17 contains:

- **One Attack button** (Naraka Mobile style): tap = three-hit combo; hold = blue charged strike (from standstill: wide slash; mid-combo: ground slam); flick up = launcher, left = parry, right = dodge. Separate Launch, Parry, Dodge, Special and Lock buttons too.
- **Launcher and air combos:** uppercut puts the rival in the air, up to 3 air hits, last one slams, then knock-down and get-up.
- **Parry:** only stops blue charged strikes; success staggers the rival and auto-counters. Cues: "!" over a charging rival, gold flash in parry stance, hint toast on a wrong parry.
- **Specials** (cooldown, unparryable, dodgeable): Aurelian = Sunburst (blast around him); Varek = Oathbreaker's Rush (dash-stab); everyone else = Second Wind (damage buff, placeholder).
- Victory animation for the round winner; rival AI uses all of the above.

**Sudhi's phone test of build 17 (11 Nov, Aurelian vs Test Dummy, courtyard):**

- "It was smooth but not smooth as we wanted." Not yet clear whether he means frame rate or how the fighting moves look.
- "I don't understand what those arrows are" (the flick arrows on the Attack button).
- "Parry still didn't do anything for me." Second time he has said this.
- Words spill out of the box on Aurelian's description on the fighter select screen.
- He wants the game to look premium: a Naraka-style hero select, a proper front menu with game modes and settings, and a natural-looking map with a closer camera (details in section 8).
- He said: **do not make the next build yet.** Collect items on the build 18 list (section 8) until he says go.

After that test, the visual check tool was added (`tools/visual_check.mjs`, section 7). The game itself is unchanged and still build 17.

**First thing to do in the new chat:** keep gathering feedback for build 18; do not build until he says so.

## 4. Game design as built

- Best of 3 rounds (first to 2), 99-second rounds, rival skill Easy / Normal / Hard.
- Triangle: normal attacks beat parry; charged (blue, armoured) beats normal attacks; parry beats charged.
- Also: stamina and "winded", whiff recovery, weapon clash, backstab ×1.5, dodge roll with invulnerability (hold Dodge = sprint), lock-on, pillars as cover.
- Fighters supply the body (health, armour, speed, stamina); weapons supply the moves. Weapons: Sword, Divine sword, Mace, Spear (spear and mace reuse sword animations).
- Roster (`src/roster.js`): **Aurelian the Sun-Crowned** (The Gilded Order, divine sword, Sunburst), **Varek the Oathbreaker** (The Fallen, sword, Oathbreaker's Rush), 8 Dawn of Dynasties fighters, and "Test Dummy" (the first plate knight). Aurelian and Varek are the two launch fighters.
- Arena: ruined castle courtyard (wall ring, towers, braziers, pillars, banners, puddles, leaves). Old grass field still available with `?arena=field`.
- Four cameras (classic, shoulder, wide, side), cycled with the camera button.
- Audio: 20 ElevenLabs sound effects in `assets/sfx/`, Suno music in `assets/music/` (menu, battle1, battle2, victory, defeat).

## 5. Code map

No build step: plain ES modules, Three.js r187 vendored in `vendor/`.

| File | Role |
|---|---|
| `src/sim.js` | All combat rules, fixed 60 Hz tick, pure (no rendering). One command object per fighter: `{ mx, mz, faceYaw, atk, atkHold, up, parry, dodge, skill, sprint }`. Built this way so multiplayer can be added later. |
| `src/weapons.js` | Per-weapon moves: `combo`, `launch`, `focusH`, `focusV`, `riposte`. `anim` is `[clip, start, impact, end]`. |
| `src/skills.js` | Specials: `sunburst`, `rush`, `wind`. |
| `src/ai.js` | Rival AI; outputs the same command object. Difficulty table at top. |
| `src/input.js` | Touch joystick, camera drag, Attack button gestures, keyboard (WASD, J attack, K launch, L parry, I special, Space dodge, Q lock, C camera). |
| `src/fighterView.js` | Model, weapon mesh on `RightHand`, animation per state, team cloth recolour. |
| `src/models.js` | Loads characters and the shared animation library; pins hips. |
| `src/main.js` | Render loop, cameras, HUD, effects, music hooks, `BUILD`, `window.__duel` debug object. |
| `src/courtyard.js`, `src/arena.js` | Arenas. |
| `src/select.js`, `src/roster.js` | Character select and fighter data. |
| `src/audio.js`, `src/fx.js` | Sound/music and particles/trails/shake. |
| `android/`, `.github/workflows/android.yml` | Capacitor 7 project; workflow builds an APK on `[release]` in a commit message or a `v*` tag. |
| `tools/` | `visual_check.mjs` (section 7), `new_fighter.py`, `new_prop.py` (Meshy pipeline), `build_models.mjs`, `build_props.mjs`, `portrait.html`, `viewer.html`. |
| `tools/dev/` | Test scripts saved from the old session (`simtest.mjs`, `juggle.mjs`, `g10.mjs`, `portraits.mjs`, `run.sh`). Paths inside them point at the old machine and need adjusting; they need `playwright` available. `tools/dev/fonts/` holds the game's fonts for the test browser. |

## 6. Character and animation pipeline (Meshy)

- One shared **standard Meshy humanoid rig** (24 bones). Never use Smart Rig; it makes a different skeleton.
- Bodies are generated in A-pose with empty hands; weapons are built in code and attached to `RightHand`.
- `tools/new_fighter.py` takes a text prompt or concept image → Meshy body → rig. Resumable. Key from `MESHY_KEY`.
- Animations: `POST /openapi/v1/animations {rig_task_id, action_ids}`, 3 credits each; catalogue at https://api.meshy.ai/web/public/animations/resources.
- `tools/build_models.mjs` shrinks models (simplify, WebP textures, meshopt) and with `--anims` rebuilds `assets/models/anims.glb` from the sources listed in its KEEP list.
- **Full-size sources** (rigs and animation packs `combat3_anim.glb`, `combat4_anim.glb`, props) live on the repo's **`models` branch**. Meshy download links expire, so that branch is the only copy.
- Credit costs: text-to-3D 20 + 10, image-to-3D 30, rig 5, animation 3. **Balance: 272.**

## 7. Testing notes

- **Visual check:** `node tools/visual_check.mjs` (add `--no-fight` for menus only, or a size such as `915x412`). Same idea as the Dawn of Dynasties `tools/visual_check.py`. It walks the title, fighter select (every fighter), fight, pause and result screens at five phone sizes, saves a picture of each to `build/visual/<size>/`, outlines problems in red (words spilling out of or cut off by their box, things off screen, overlaps) and small text or buttons in dashed yellow, and writes `build/visual/report.md`. Takes about five minutes with the fight. It runs the game on the old grass field (`?arena=field`) because the courtyard is too slow in the test browser, so it checks screen layout, not how the arena looks.
- Headless Chrome with software rendering runs the courtyard at about 2 fps. Use `page.evaluate(() => el.click())`, keyboard input, device scale 1 and long waits; `tap` times out.
- The sandbox cannot reach github.io or Google Fonts, so the live site can't be checked from there. The build number on the title screen is how Sudhi confirms he has the new version.
- The courtyard is roughly twice as heavy as the field (about 266k triangles). Phone frame rate has not been measured.

## 8. Open list

### Build 18 list (collecting; do not build until Sudhi says go)

**A. From his build 17 phone test**

1. **Smoothness:** smooth, but not as smooth as he wants. Find out whether it is frame rate (courtyard weight, graphics-quality setting) or the fighting moves themselves (animation blending, hit reactions), then fix that.
2. **Attack button arrows:** he did not understand them. Either explain them (a short first-fight how-to, labels) or remove the flicks and rely on the separate buttons.
3. **Parry:** still "didn't do anything" for him. Rethink it so pressing Parry always visibly does something, rather than only working on blue charged strikes. Agree the new design with him first.

**B. Layout faults found by the visual check (build 17)**

4. Fighter select: Aurelian's faction / weapon / special line spills out of the top of the description box on every normal phone size (17 px), and touches the You / Rival buttons on small phones. Varek's does the same by 3 px.
5. Result screen: the "Aurelian the Sun-Crowned against Varek the Oathbreaker" line wraps onto two lines and runs into "VICTORY", and "VICTORY" sits on the "2 – 0" score. Every size.
6. Rival tab: the "?" on the Random card sits under the RIVAL tag.
7. Tablet: "Varek the Oathbreaker" is cut off on his card; the round label touches the timer.
8. Small text on phones (under 9 px): fighter-card names, YOU / RIVAL tags, stat labels, the how-to-play lines, the faction line, ROUND label, LOCK label, and the special's name on its button (5.4 px).
9. Small buttons: pause / music / camera (32 px), You / Rival tabs (29 px tall), Music: On (20 px tall), Change fighters (29 px tall).

Seen in his screenshot, not confirmed by him:

10. His fighter is cut off at the bottom of the screen in the classic camera.
11. Pause / music / camera icons are faint and float mid-screen.
12. He played in an in-app browser with a large top bar rather than full screen.

**C. Premium look and menus (his requests, 11 Nov)**

13. **Hero select like Naraka's hero screen** (he sent a screenshot): small portrait tiles in a grid on the left with silhouettes for fighters still to come, the chosen fighter standing large in 3D in the middle against a moody backdrop, name and short description on the right with their special and stats. Make our own design in that layout, not a copy of their art.
14. **Front menu:** game modes, settings and so on on the intro screen. Flow: title → choose game mode → choose fighter → fight. Modes and settings still to be agreed with him.
15. **New map in the style of the Naraka Mobile screenshot he sent:** open grassland with tall grass, a worn dirt path, thatched huts and trees, soft natural daylight. He asked for an "exact copy"; build an original map with that look rather than copying theirs.
16. **Colour:** our courtyard is orange-brown with flat purple cut-out mountains; the reference is natural greens with soft light and haze. Re-grade our colours and lighting toward that, and replace the flat mountains with believable distant hills.
17. **Closer camera:** the reference camera sits close behind the fighter, who fills about a third of the screen height. Ours is far back and the rival is tiny.

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
