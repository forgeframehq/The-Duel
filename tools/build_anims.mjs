// Packs extra motion clips bought from Meshy into one small library (skeleton and motion only, no body).
//   node build_anims.mjs <out.glb> <file.glb>=<Clip_Name> [...]
// Each source file is a rigged character with one animation (what POST /openapi/v1/animations returns).
// The game loads assets/models/anims.glb (the original library) and anims2.glb (these) together.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, resample, meshopt, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
const [out, ...items] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
let lib = null;
for (const item of items) {
  const [file, name] = item.split('=');
  const doc = await io.read(file), r = doc.getRoot();
  const anims = r.listAnimations();
  anims.slice(1).forEach((a) => a.dispose()); anims[0].setName(name);
  for (const n of r.listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const list of [r.listSkins(), r.listMeshes(), r.listMaterials(), r.listTextures()]) for (const x of list) x.dispose();
  if (!lib) lib = doc; else mergeDocuments(lib, doc);
}
await lib.transform(unpartition(), prune({ keepLeaves: true }), resample({ tolerance: 0.0005 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, lib);
console.log((fs.statSync(out).size / 1024 | 0) + ' KB', lib.getRoot().listAnimations().map((a) => a.getName()).join(' '));
