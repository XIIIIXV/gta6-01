// serve.ts — NEON BAY dev server.
// Serves the game/ directory (game/index.html at /) with an access log,
// HEAD support, and a --quiet flag.
// Run with: node serve.ts [--port 8080] [--quiet]
// Node 24 runs this .ts file directly (type stripping).

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// Document root is game/ (so / resolves to game/index.html and the
// relative ./src/main.js in the page resolves to game/src/main.js).
const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', 'game'));

const args = process.argv.slice(2);
let port = 8080;
let quiet = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[i + 1]);
  if (args[i] === '--quiet') quiet = true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function logLine(req, status, size) {
  if (quiet) return;
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url} -> ${status} (${size} B)`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  // Favicon: a tiny inline neon "N" so browsers don't 404.
  if (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#070b18"/><text x="16" y="23" font-size="20" font-family="sans-serif" font-weight="bold" fill="#ff2d95" text-anchor="middle">N</text></svg>';
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-length': Buffer.byteLength(svg) });
    res.end(svg);
    logLine(req, 200, Buffer.byteLength(svg));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  // Never serve outside the repo root.
  const filePath = resolve(join(ROOT, normalize(rel).replace(/^(\.\.[\/\\])+/, '')));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    logLine(req, 403, 9);
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    logLine(req, 404, 9);
    return;
  }
  const data = readFileSync(filePath);
  const type = MIME[extname(filePath)] ?? 'application/octet-stream';
  const headers = { 'content-type': type, 'content-length': data.length };
  // HEAD: headers only, no body.
  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    logLine(req, 200, data.length);
    return;
  }
  res.writeHead(200, headers);
  res.end(data);
  logLine(req, 200, data.length);
});

server.listen(port, () => {
  console.log(`[neon-bay] serving ${ROOT} on http://localhost:${port}/`);
});
