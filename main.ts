// main.ts — NEON BAY entrypoint (repo root).
// Guards the build (game/index.html must exist) and logs a build summary.
// Run with: node main.ts
// This is the entrypoint the kit checks; the playable game itself is the
// plain-JS module game/src/main.js, loaded by game/index.html.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..'));
const GAME_DIR = join(ROOT, 'game');
const INDEX = join(GAME_DIR, 'index.html');

function fail(msg) {
  console.error(`[neon-bay] ERROR: ${msg}`);
  process.exit(1);
}

function main() {
  // Guard: the entry HTML must exist, or nothing can load.
  if (!existsSync(INDEX)) {
    fail(`game/index.html is missing (expected at ${INDEX}). Run the build first.`);
  }
  const srcDir = join(GAME_DIR, 'src');
  if (!existsSync(srcDir)) fail(`game/src/ is missing (expected at ${srcDir}).`);

  // Build summary: every counted source file + its size.
  const files = readdirSync(srcDir)
    .filter((f) => f.endsWith('.js'))
    .sort();
  if (files.length === 0) fail('game/src/ has no .js files.');
  let total = 0;
  console.log('[neon-bay] build summary');
  console.log(`[neon-bay] entry: game/index.html (${statSync(INDEX).size} B)`);
  for (const f of files) {
    const size = statSync(join(srcDir, f)).size;
    total += size;
    console.log(`[neon-bay]   src/${f}  ${size} B`);
  }
  console.log(`[neon-bay] ${files.length} source files, ${total} B total`);
  console.log('[neon-bay] serve with: node serve.ts --port 8080');
  console.log('[neon-bay] then open http://localhost:8080/');
}

main();
