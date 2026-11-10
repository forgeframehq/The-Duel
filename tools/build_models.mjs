// Shrinks the rigged Meshy characters from the rts-game `models` branch for phones, and packs
// the motion clips into one small library. Usage: node build_models.mjs <source dir> <out dir>
// Needs: @gltf-transform/core, /extensions, /functions, sharp, meshoptimizer.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress, prune, resample, reorder, quantize, meshopt, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [src, out] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const CHARACTERS = ['franks_knight', 'byzantines_knight', 'chinese_knight', 'franks_militia', 'byzantines_spearman', 'franks_king', 'chinese_militia', 'chinese_spearman'];
for (const name of CHARACTERS) {
  const doc = await io.read(`${src}/${name}_rig.glb`);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(
    dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.0015 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
    prune(), reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(`${out}/${name}.glb`, doc);
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  console.log(name, (fs.statSync(`${out}/${name}.glb`).size / 1024 | 0) + ' KB', tris + ' tris');
}

// One library of motion clips, skeleton only.
const KEEP = ['Combat_Stance', 'Idle_02', 'Run_02', 'Casual_Walk', 'ForwardLeft_Run_Fight', 'Spear_Walk', 'Right_Hand_Sword_Slash', 'Double_Combo_Attack',
  'Triple_Combo_Attack', 'Thrust_Slash', 'Charged_Ground_Slam', 'Heavy_Hammer_Swing', 'Block2', 'Sword_Parry', 'Hit_Reaction_1', 'Hit_Reaction',
  'Dead', 'Shot_and_Fall_Backward', 'Shot_and_Fall_Forward'];
const lib = await io.read(`${src}/villager_m_anim.glb`);
const seen = new Set();
const strip = (doc) => {
  const r = doc.getRoot();
  for (const a of r.listAnimations()) { if (!KEEP.includes(a.getName()) || seen.has(a.getName())) a.dispose(); else seen.add(a.getName()); }
  for (const n of r.listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const list of [r.listSkins(), r.listMeshes(), r.listMaterials(), r.listTextures()]) for (const x of list) x.dispose();
};
strip(lib);
for (const f of ['villager_m_anim2', 'combat2_anim', 'combat_anim']) {
  const d = await io.read(`${src}/${f}.glb`); strip(d);
  mergeDocuments(lib, d);
}
await lib.transform(unpartition(), prune({ keepLeaves: true }), resample({ tolerance: 0.0005 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(`${out}/anims.glb`, lib);
console.log('anims', (fs.statSync(`${out}/anims.glb`).size / 1024 | 0) + ' KB', lib.getRoot().listAnimations().map((a) => a.getName()).join(' '));
