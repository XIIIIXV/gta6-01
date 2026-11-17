// NEON BAY — a gta6-01 entry (Node 22, standard library only). The game is this
// directory's game/ folder: plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request). This program
// hands it in: it copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. It writes the same bytes every run: copying files and summarizing them takes
// nothing from the clock or the network.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly (instead of copying an empty directory) when the entrypoint is
// missing — a silent empty /output would only surface at the judge.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error(`game/index.html not found beside ${here} — nothing to hand in`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all, or a path under
// game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A one-line summary of what was handed in, so a local run shows the same
// shape the judge will see (file count, bytes, screenshots) at a glance.
function walkSize(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = walkSize(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}
const game = walkSize(join(out, 'game'));
const shots = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).map((n) => `${n} ${statSync(join(out, 'screenshots', n)).size}B`).join(', ')
  : '(none)';
console.log(`NEON BAY -> ${out}: game ${game.files} files, ${game.bytes} bytes; screenshots: ${shots}; dossier.json written`);
