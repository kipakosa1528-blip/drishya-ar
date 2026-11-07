// Furniture AR asset pipeline.
//   node scripts/prepare-furniture.mjs
// For every product in assets/catalog.json:
//   1. uniformly scales the model so its real-world dimension matches the catalog (true 1:1),
//   2. moves the pivot to bottom-centre (min Y = 0) so it sits ON the floor in every AR viewer,
//   3. resizes textures for mobile, dedups/prunes, writes assets/models/furniture/<id>.glb,
//   4. prints a size report and fails (exit 1) if any product is off by > 1 cm.
// Also builds tintable fabric texture sets in assets/textures/ (greyscale albedo,
// packed ORM, GL normal) so a single colour factor can recolour any fabric.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, getBounds, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/models/furniture');
const TEX_OUT = path.join(ROOT, 'assets/textures');
const TEX_SRC = path.join(ROOT, 'assets/models/src/tex');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TEX_OUT, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/catalog.json'), 'utf8'));

// ── Fabric texture sets (CC0, ambientCG) ────────────────────────────────────
const FABRICS = {
  'fabric-linen': 'Fabric030',
  'fabric-boucle': 'Fabric062',
  'fabric-velvet': 'Fabric026',
  leather: 'Leather037',
};

async function buildFabric(id, src) {
  const base = path.join(TEX_SRC, src, `${src}_1K-JPG`);
  const size = 512;
  // Albedo: desaturate and normalise mean brightness to ~0.82 so the swatch
  // colour (baseColorFactor) fully controls hue while weave detail remains.
  const grey = sharp(`${base}_Color.jpg`).resize(size, size).greyscale();
  const { channels } = await grey.clone().stats();
  const gain = 210 / Math.max(1, channels[0].mean);
  await grey.linear(gain, 0).jpeg({ quality: 85 }).toFile(path.join(TEX_OUT, `${id}_albedo.jpg`));
  await sharp(`${base}_NormalGL.jpg`).resize(size, size).jpeg({ quality: 90 })
    .toFile(path.join(TEX_OUT, `${id}_normal.jpg`));
  // glTF metallicRoughness: G = roughness, B = metallic (0). R = 255 (unused).
  const rough = await sharp(`${base}_Roughness.jpg`).resize(size, size).greyscale().raw().toBuffer();
  const orm = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) { orm[i * 3] = 255; orm[i * 3 + 1] = rough[i]; orm[i * 3 + 2] = 0; }
  await sharp(orm, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 90 })
    .toFile(path.join(TEX_OUT, `${id}_rm.jpg`));
  console.log(`  texture set: ${id} <- ${src}`);
}

// ── A4 calibration sheet (generated geometry, exact millimetres) ────────────
function buildA4() {
  const doc = new Document();
  const buf = doc.createBuffer();
  const w = 0.297, d = 0.21, h = 0.002;
  const x = w / 2, z = d / 2;
  // Box with flat normals: 6 faces x 4 verts.
  const faces = [
    [[0, 1, 0], [[-x, h, -z], [-x, h, z], [x, h, z], [x, h, -z]]],
    [[0, -1, 0], [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]]],
    [[1, 0, 0], [[x, 0, -z], [x, h, -z], [x, h, z], [x, 0, z]]],
    [[-1, 0, 0], [[-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]]],
    [[0, 0, 1], [[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]]],
    [[0, 0, -1], [[-x, 0, -z], [-x, h, -z], [x, h, -z], [x, 0, -z]]],
  ];
  const pos = [], nor = [], idx = [];
  faces.forEach(([n, vs], f) => {
    vs.forEach((v) => { pos.push(...v); nor.push(...n); });
    const o = f * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buf))
    .setMaterial(doc.createMaterial('A4_Paper').setBaseColorFactor([0.9, 0.12, 0.12, 1]).setRoughnessFactor(0.9));
  const node = doc.createNode('A4').setMesh(doc.createMesh('A4').addPrimitive(prim));
  doc.createScene('Scene').addChild(node);
  return doc;
}

// ── Model processing ────────────────────────────────────────────────────────
function sizeOf(scene) {
  const { min, max } = getBounds(scene);
  return { min, max, size: max.map((v, i) => v - min[i]) };
}

async function processProduct(p) {
  let doc;
  if (p.generated === 'a4') {
    doc = buildA4();
  } else {
    doc = await io.read(path.resolve(ROOT, p.source));
    const root = doc.getRoot();
    const scene = root.getDefaultScene() || root.listScenes()[0];
    // Uniform scale to the real-world dimension.
    const { size } = sizeOf(scene);
    const axisIndex = { x: 0, y: 1, z: 2 }[p.realSize.axis];
    const current = p.realSize.axis === 'longest' ? Math.max(...size) : size[axisIndex];
    const s = (p.realSize.cm / 100) / current;
    const wrapper = doc.createNode('scale_1to1').setScale([s, s, s]);
    for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
    scene.addChild(wrapper);
    // Keep only one scene (default) so every viewer renders the same thing.
    for (const sc of root.listScenes()) if (sc !== scene) sc.dispose();
    root.setDefaultScene(scene);
  }

  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];

  // Drop UV sets that no texture references (sketchfab exports often carry 2-3 unused).
  const usedUV = new Set([0]);
  for (const mat of root.listMaterials()) {
    for (const info of [mat.getBaseColorTextureInfo(), mat.getNormalTextureInfo(), mat.getMetallicRoughnessTextureInfo(),
      mat.getOcclusionTextureInfo(), mat.getEmissiveTextureInfo()]) if (info) usedUV.add(info.getTexCoord());
  }
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    for (const sem of prim.listSemantics()) {
      const m = sem.match(/^TEXCOORD_(\d+)$/);
      if (m && !usedUV.has(+m[1])) prim.setAttribute(sem, null);
    }
  }

  await doc.transform(
    center({ pivot: 'below' }), // bottom-centre at origin => min Y = 0, sits on floor
    dedup(),
    ...(p.simplify ? [weld(), simplify({ simplifier: MeshoptSimplifier, ratio: p.simplify, error: p.simplifyError ?? 0.002 })] : []),
    prune({ keepAttributes: true }),
    ...(p.maxTexture ? [textureCompress({
      encoder: sharp, resize: [p.maxTexture, p.maxTexture], ...(p.jpeg ? { targetFormat: 'jpeg', quality: 88 } : {}),
    })] : []),
  );

  const out = path.join(OUT_DIR, `${p.id}.glb`);
  await io.write(out, doc);
  const { min, size } = sizeOf(scene);
  const cm = size.map((v) => +(v * 100).toFixed(1));
  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  let ok = Math.abs(min[1]) < 0.001;
  if (p.expected) {
    const e = [p.expected.w, p.expected.h, p.expected.d];
    ok = ok && e.every((v, i) => Math.abs(v - cm[i]) <= 1);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.id.padEnd(7)} W ${cm[0]}  H ${cm[1]}  D ${cm[2]} cm  floorY ${(min[1] * 100).toFixed(2)} cm  ${mb} MB`);
  return { id: p.id, ok, w: cm[0], h: cm[1], d: cm[2] };
}

console.log('Fabric textures:');
for (const [id, src] of Object.entries(FABRICS)) await buildFabric(id, src);

console.log('\nModels:');
const only = process.argv[2];
const results = [];
for (const p of catalog.products) {
  if (only && p.id !== only) continue;
  results.push(await processProduct(p));
}
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(results, null, 2));
if (results.some((r) => !r.ok)) { console.error('\nSome products failed the 1:1 check.'); process.exit(1); }
console.log('\nAll products pass the 1:1 / floor-contact check.');
