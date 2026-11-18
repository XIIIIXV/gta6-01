// main.ts — NEON BAY entrypoint (v8 rebuild).
// Run with: node main.ts
// Guards that the game files exist, then logs a build summary.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const indexPath = join(root, 'game', 'index.html');
const srcDir = join(root, 'game', 'src');

if (!existsSync(indexPath)) {
  console.error('[neon-bay] ERROR: game/index.html is missing');
  process.exit(1);
}
if (!existsSync(srcDir)) {
  console.error('[neon-bay] ERROR: game/src/ is missing');
  process.exit(1);
}

const files = readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
if (files.length === 0) {
  console.error('[neon-bay] ERROR: game/src/ has no .js files');
  process.exit(1);
}

console.log('[neon-bay] NEON BAY build summary');
console.log('[neon-bay] entry: game/index.html (' + statSync(indexPath).size + ' bytes)');
let total = statSync(indexPath).size;
for (const f of files) {
  const size = statSync(join(srcDir, f)).size;
  total += size;
  console.log('[neon-bay]   game/src/' + f + ' — ' + size + ' bytes');
}
console.log('[neon-bay] total: ' + total + ' bytes across ' + (files.length + 1) + ' files');
console.log('[neon-bay] renderer: hand-rolled WebGL (game/src/gl.js + render.js), no external libraries');
console.log('[neon-bay] serve: node serve.ts --port 8080  (then open http://localhost:8080/)');
