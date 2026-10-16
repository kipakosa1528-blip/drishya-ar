// Pull the frame's stone colour texture out of the web GLB, so the flat CSS cards
// on the landing page can wear the same moulding as the 3D frame.
//   node scripts/extract-frame-stone.mjs   ->   assets/frame-stone.webp
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(ROOT, 'assets/models/web/appu_frame.glb'));
const mat = doc.getRoot().listMaterials().find((m) => m.getName().startsWith('CityStreetAsphalt'));
const tex = mat.getBaseColorTexture();
const img = Buffer.from(tex.getImage());
const meta = await sharp(img).metadata();
const out = path.join(ROOT, 'assets/frame-stone.webp');
await sharp(img).resize(512, 512).webp({ quality: 78 }).toFile(out);
console.log(`extracted ${tex.getName()} (${meta.width}x${meta.height}) -> ${out}`);
