// NEON BAY — entrypoint (erasable TypeScript, runs under `node main.ts`).
// Guards: game/index.html must exist and game/src must hold .js files.
// Logs a build summary: entry size, each src file size, total, serve command.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const INDEX = join(ROOT, 'game', 'index.html');
const SRC = join(ROOT, 'game', 'src');

function fail(msg: string): never {
  console.error(`[neon-bay] ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(INDEX)) fail('game/index.html is missing (run from the repo root).');
if (!existsSync(SRC)) fail('game/src/ is missing (run from the repo root).');
const srcFiles = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
if (srcFiles.length === 0) fail('game/src/ holds no .js files.');

const entryBytes = statSync(INDEX).size;
let total = entryBytes;
console.log('[neon-bay] NEON BAY — build summary');
console.log(`[neon-bay] entry  game/index.html  ${entryBytes} bytes`);
for (const f of srcFiles) {
  const bytes = statSync(join(SRC, f)).size;
  total += bytes;
  console.log(`[neon-bay] src    game/src/${f}  ${bytes} bytes`);
}
console.log(`[neon-bay] total game/ entry + src: ${total} bytes`);
console.log('[neon-bay] serve: node serve.ts --port 8080  (then open http://localhost:8080/)');
