// models.js — loads the rigged characters and the shared motion library.
// Every character uses the same 24-bone skeleton, so any clip plays on any of them.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from '../vendor/utils/SkeletonUtils.js';

const BASE = new URL('../assets/models/', import.meta.url).href;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

function load(file) {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(BASE + file));
  return cache.get(file);
}

// Clips whose hips may travel (falls); everything else is pinned in place because the rules own position.
const FREE_ROOT = new Set(['Dead', 'Shot_and_Fall_Backward', 'Shot_and_Fall_Forward']);
let clipsPromise = null;

export function loadClips() {
  if (!clipsPromise) {
    clipsPromise = load('anims.glb').then((gltf) => {
      const clips = new Map();
      for (const clip of gltf.animations) {
        const tracks = [];
        for (const t of clip.tracks) {
          const dot = t.name.lastIndexOf('.');
          // The library holds one copy of the skeleton per source file; the loader numbers the duplicates.
          const bone = t.name.slice(0, dot).replace(/_\d+$/, ''), prop = t.name.slice(dot);
          if (bone === 'Armature') continue;
          if (prop === '.scale') continue;
          if (prop === '.position') {
            if (bone !== 'Hips') continue; // limb lengths come from each character, not the clip
            // Pin the hips over the feet (falls keep their travel, measured from where they start).
            const v = t.values, x0 = v[0], z0 = v[2], free = FREE_ROOT.has(clip.name);
            for (let i = 0; i < v.length; i += 3) { v[i] = free ? v[i] - x0 : 0; v[i + 2] = free ? v[i + 2] - z0 : 0; }
          }
          t.name = bone + prop;
          tracks.push(t);
        }
        clip.tracks = tracks;
        clips.set(clip.name, clip);
      }
      return clips;
    });
  }
  return clipsPromise;
}

export async function loadCharacter(model) {
  const gltf = await load(model + '.glb');
  const root = cloneSkinned(gltf.scene);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.metalness = Math.min(o.material.metalness, 0.3); o.material.roughness = Math.max(o.material.roughness, 0.7);
    }
  });
  return root;
}

export function preload(models) { return Promise.all([loadClips(), ...models.map((m) => load(m + '.glb'))]); }
