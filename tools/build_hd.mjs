// Packs Meshy models for the game at full detail (build 19 on): no triangles are thrown away unless asked,
// colour textures stay at 2048 px. Only the file format is tightened (WebP textures, meshopt compression).
//   node build_hd.mjs fighter <source dir> <out dir> <id> [...]        <id>_rig.glb -> <id>.glb, animations stripped
//   node build_hd.mjs prop <source dir> <out dir> <id>[:keep[:error]] [...]   <id>.glb; keep is the share of triangles to keep (default 1),
//                                                                           error how far the shape may drift to get there (default 0.002; 0.05 for far-off copies)
// Needs: @gltf-transform/core, /extensions, /functions, sharp, meshoptimizer.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, textureCompress, prune, reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
const [kind, src, out, ...ids] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(out, { recursive: true });
for (const item of ids) {
  const [id, keep = '1', error = '0.002'] = item.split(':');
  const doc = await io.read(`${src}/${id}${kind === 'fighter' ? '_rig' : ''}.glb`);
  if (kind === 'fighter') for (const a of doc.getRoot().listAnimations()) a.dispose();
  // Scenery keeps colour and surface-detail maps; the shininess maps add little outdoors.
  else for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setEmissiveTexture(null); m.setOcclusionTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.9); }
  const steps = [dedup(), weld()];
  if (+keep < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: +keep, error: +error }));
  steps.push(prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 88, slots: /baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85, slots: /normal|metallicRoughness/ }),
    reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  await io.write(`${out}/${id}.glb`, doc);
  let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  const tex = doc.getRoot().listTextures().map((t) => (t.getSize() || []).join('x')).join(' ');
  console.log(id, (fs.statSync(`${out}/${id}.glb`).size / 1024 | 0) + ' KB', tris + ' tris', 'textures', tex);
}
