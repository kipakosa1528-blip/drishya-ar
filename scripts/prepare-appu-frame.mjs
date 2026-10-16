// Web variant of the Appu tabletop frame for the scroll-driven landing page.
//   node scripts/prepare-appu-frame.mjs [source.glb]
// Reads the full Blender export and writes assets/models/web/appu_frame.glb:
//   1. bakes a yaw so the photo faces +Z and the frame width runs along X,
//   2. moves the pivot to bottom-centre (min Y = 0),
//   3. keeps your authored materials and textures (re-encoded as WebP, photo 2048px, rest 1024px),
//   4. prunes everything unused.
// The AR model (assets/models/appu_photoframe.glb) is NOT touched.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, getBounds, prune, textureCompress } from '@gltf-transform/functions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || 'C:/Users/Saugat Shakya/Documents/blends/appu/appu_photoframe.glb';
const OUT_DIR = path.join(ROOT, 'assets/models/web');
const OUT = path.join(OUT_DIR, 'appu_frame.glb');
fs.mkdirSync(OUT_DIR, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];

// ── 1. Orientation: find which way the photo plane faces in world space ─────
function worldNormalOfPhoto() {
  const node = root.listNodes().find((n) => n.getMesh()?.getName() === 'Photo');
  const prim = node.getMesh().listPrimitives()[0];
  const n = prim.getAttribute('NORMAL').getElement(0, []);
  const m = node.getWorldMatrix();
  // Rotation-only transform of the normal (uniform scale on this node).
  const v = [
    m[0] * n[0] + m[4] * n[1] + m[8] * n[2],
    m[1] * n[0] + m[5] * n[1] + m[9] * n[2],
    m[2] * n[0] + m[6] * n[1] + m[10] * n[2],
  ];
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
}
const nrm = worldNormalOfPhoto();
console.log('photo normal (world):', nrm.map((x) => +x.toFixed(3)).join(', '));
// Yaw about Y that rotates the normal's XZ projection onto +Z.
const yaw = Math.atan2(nrm[0], nrm[2]) * -1;
const wrapper = doc.createNode('web_orient').setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
scene.addChild(wrapper);
console.log('baked yaw:', ((yaw * 180) / Math.PI).toFixed(1), 'deg');

// Materials are kept exactly as authored in Blender (real textures, real glass).
await doc.transform(
  center({ pivot: 'below' }),
  dedup(),
  prune({ keepAttributes: true }),
  // The printed photo keeps full detail; the tiled frame textures are viewed small, 1024px is plenty.
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 86, pattern: /^original$/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85, pattern: /^(?!original$)/ }),
);

await io.write(OUT, doc);
const { min, max } = getBounds(doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]);
const cm = max.map((v, i) => +((v - min[i]) * 100).toFixed(1));
console.log(`W ${cm[0]}  H ${cm[1]}  D ${cm[2]} cm  floorY ${(min[1] * 100).toFixed(2)} cm`);
console.log(`materials: ${doc.getRoot().listMaterials().map((m) => m.getName()).join(', ')}`);
console.log(`textures: ${doc.getRoot().listTextures().length}  ->  ${OUT}  ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
