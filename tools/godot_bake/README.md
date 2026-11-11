# Fitting free animations onto the fighters

`bake.gd` turns animations made for other skeletons (Quaternius Universal Animation Library, MoCap Online's free sword
pack, Kevin Iglesias' Human Melee Animations FREE) into clips for the fighters' shared 24-bone skeleton, and writes
`out/extra_anims.res`, which is copied to `godot/anims/`.

To run it again: make a folder with this `project.godot`, `bake.gd` and `jobs.json`; put the source files in
`src/q`, `src/mco` and `src/kev` (file names with `@` replaced by `_`), a fighter in `tgt/wuixi.glb`; then

    godot --headless --path . --import
    godot --headless --path . --script res://bake.gd

The source packs are not in the repo (Sudhi attached them to the chat on 11 Nov 2026). Each baked clip carries three notes
the game reads: `blade` (how a gripped sword leaves the fist), `speed` and `peaks` (the moments the sword hand moves fastest,
which is where to set an attack's moment of impact).
