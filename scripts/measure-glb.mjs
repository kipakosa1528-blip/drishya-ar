// Usage: node scripts/measure-glb.mjs <file.glb> [...more]
// Prints real-world bounding box (metres) of each GLB's default scene,
// so we can verify 1:1 scale before a model ever reaches AR.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of process.argv.slice(2)) {
  try {
    const doc = await io.read(file);
    const root = doc.getRoot();
    const scene = root.getDefaultScene() || root.listScenes()[0];
    const { min, max } = getBounds(scene);
    const size = max.map((v, i) => v - min[i]);
    const cm = (v) => (v * 100).toFixed(1) + ' cm';
    console.log(`\n=== ${file}`);
    console.log(`  W (X): ${cm(size[0])}   H (Y): ${cm(size[1])}   D (Z): ${cm(size[2])}`);
    console.log(`  min Y (floor contact): ${cm(min[1])}   center X/Z: ${cm((min[0] + max[0]) / 2)} / ${cm((min[2] + max[2]) / 2)}`);
    console.log(`  materials: ${root.listMaterials().map((m) => m.getName() || '(unnamed)').join(', ')}`);
    console.log(`  meshes: ${root.listMeshes().length}  textures: ${root.listTextures().length}  animations: ${root.listAnimations().length}`);
  } catch (e) {
    console.log(`\n=== ${file}\n  ERROR: ${e.message}`);
  }
}
