// Bundles src/main.js (+ three, lenis) into ../js/scene3d.js.
//   cd scene3d && npm install && npm run build
import { build } from 'esbuild';
import { statSync } from 'fs';

const outfile = '../js/scene3d.js';
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  legalComments: 'eof',
  outfile,
});
console.log(`${outfile}  ${(statSync(outfile).size / 1024).toFixed(0)} KB`);
