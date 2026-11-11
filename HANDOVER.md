# The Duel — handover (11 Nov 2026, build 17)

Read this first in a new chat. It replaces the long conversation that built the game so far.

## 1. What this is

**The Duel** is a landscape-only, third-person 1v1 weapon-fighting game for Android, made by Sudhi (ForgeFrame studio). It runs in the browser (Three.js) and is wrapped as an APK.

- Repo: `forgeframehq/The-Duel` (branch `main`; last commit `97b43e9` + this handover)
- Play it: https://forgeframehq.github.io/The-Duel/ (title screen shows the build number)
- Inspiration: **Naraka: Bladepoint** combat ("we are gonna absolutely completely do that naraka battle system"), a YouTube short of painted knights (@Toasted_Cursed, music "Hide (Slow)" by Dorian Concept), and a ChatGPT mock-up of a ruined castle courtyard.
- Goals: fights look epic and smooth; visually stunning; **reusability** (one skeleton, animations bought once, any fighter can hold any weapon, cheap new characters); ForgeFrame branding with Dawn of Dynasties aesthetics.
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
- **API keys:** he pasted a Meshy key and an ElevenLabs key into the old chat and allowed their use. They are **not** stored anywhere in the repo and must never be. In a new chat, ask him for them again if needed, use them only as environment variables (`MESHY_KEY`), and remind him to rotate both since they sat in a chat log.

## 3. Where things stand

Build 17 was pushed on 11 Nov and **has not been played by Sudhi yet**. It answers his last feedback ("Chop/slash makes not much sense, look at what Naraka does; each character needs a special; parry basically did nothing").

What build 17 contains:

- **One Attack button** (Naraka Mobile style): tap = three-hit combo; hold = blue charged strike (from standstill: wide slash; mid-combo: ground slam); flick up = launcher, left = parry, right = dodge. Separate Launch, Parry, Dodge, Special and Lock buttons too.
- **Launcher and air combos:** uppercut puts the rival in the air, up to 3 air hits, last one slams, then knock-down and get-up.
- **Parry:** only stops blue charged strikes; success staggers the rival and auto-counters. Cues: "!" over a charging rival, gold flash in parry stance, hint toast on a wrong parry.
- **Specials** (cooldown, unparryable, dodgeable): Aurelian = Sunburst (blast around him); Varek = Oathbreaker's Rush (dash-stab); everyone else = Second Wind (damage buff, placeholder).
- Victory animation for the round winner; rival AI uses all of the above.

Tested: syntax checks, computer-vs-computer matches (difficulties rank correctly), headless-browser run with no errors. **Never tested on a real phone**: flick distance, charge timing and frame rate are unknown there.

**First thing to do in the new chat:** ask how build 17 feels on his phone (flicks, parry timing, frame rate in the courtyard) and tune from that.

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
| `tools/` | `new_fighter.py`, `new_prop.py` (Meshy pipeline), `build_models.mjs`, `build_props.mjs`, `portrait.html`, `viewer.html`. |
| `tools/dev/` | Test scripts saved from the old session (`simtest.mjs`, `juggle.mjs`, `g10.mjs`, `portraits.mjs`, `run.sh`). Paths inside them point at the old machine and need adjusting; they need `playwright` available. |

## 6. Character and animation pipeline (Meshy)

- One shared **standard Meshy humanoid rig** (24 bones). Never use Smart Rig; it makes a different skeleton.
- Bodies are generated in A-pose with empty hands; weapons are built in code and attached to `RightHand`.
- `tools/new_fighter.py` takes a text prompt or concept image → Meshy body → rig. Resumable. Key from `MESHY_KEY`.
- Animations: `POST /openapi/v1/animations {rig_task_id, action_ids}`, 3 credits each; catalogue at https://api.meshy.ai/web/public/animations/resources.
- `tools/build_models.mjs` shrinks models (simplify, WebP textures, meshopt) and with `--anims` rebuilds `assets/models/anims.glb` from the sources listed in its KEEP list.
- **Full-size sources** (rigs and animation packs `combat3_anim.glb`, `combat4_anim.glb`, props) live on the repo's **`models` branch**. Meshy download links expire, so that branch is the only copy.
- Credit costs: text-to-3D 20 + 10, image-to-3D 30, rig 5, animation 3. **Balance: 272.**

## 7. Testing notes

- Headless Chrome with software rendering runs the courtyard at about 2 fps. Use `page.evaluate(() => el.click())`, keyboard input, device scale 1 and long waits; `tap` times out.
- The sandbox cannot reach github.io, so the live site can't be checked from there. The build number on the title screen is how Sudhi confirms he has the new version.
- The courtyard is roughly twice as heavy as the field (about 266k triangles). Phone frame rate has not been measured.

## 8. Open list

Waiting on Sudhi's feedback or go-ahead:

1. Tune build 17 from his phone test (flicks, parry window, charge time, frame rate).
2. Real specials for the eight Dawn of Dynasties fighters (currently all Second Wind).
3. Varek's two-handed greatsword (needs two-handed clips, e.g. Meshy action 149 Two-handed Parry).
4. Weapon picker on the select screen.
5. Jump, crouch and true Naraka-style air moves; hero ultimates.
6. Bloom and colour grading, plus a graphics-quality setting for slower phones.
7. HUD restyle to match the ChatGPT mock-up.
8. Cobblestone and wall textures from ChatGPT (prompts were given; images not yet received). Dropping `assets/scenery/cobble.jpg` in replaces the procedural floor automatically.
9. More Suno battle tracks, volume sliders, and a Suno prompt in the "Hide (Slow)" mood once he describes what he wants.
10. Proper spear and mace animations.
11. Later: skins, upgrades, multiplayer, signed release build.
12. Housekeeping: rotate both API keys; optionally delete old `app-debug.apk` releases.
