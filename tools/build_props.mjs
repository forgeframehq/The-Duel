// Usage: node build_props.mjs <source dir> <out dir> <id> [...]
// Shrinks scenery pieces: textures to webp (base colour 1024, normal 512), meshopt compression.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress, prune, reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
const [src, out, ...ids] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
// Scenery is repeated many times around an arena, so each piece is cut to a few thousand triangles.
const KEEP = { wall_arch: 0.22, tower: 0.18, brazier: 0.2, pillar: 0.35 };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const id of ids) {
  const doc = await io.read(`${src}/${id}.glb`);
  // Keep colour and normal maps; drop the rest to save download size.
  for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setEmissiveTexture(null); m.setOcclusionTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.9); m.setEmissiveFactor([0, 0, 0]); }
  await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: KEEP[id] ?? 0.5, error: 0.012 }), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80, slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80, slots: /normal/ }),
    reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${out}/${id}.glb`, doc);
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
  console.log(id, (fs.statSync(`${out}/${id}.glb`).size / 1024 | 0) + ' KB', tris + ' tris');
}
