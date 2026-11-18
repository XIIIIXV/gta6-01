// serve.ts — NEON BAY dev server (v8 rebuild).
// Run with: node serve.ts [--port 8080] [--quiet]
// Serves the game/ directory only; never serves outside the game/ root.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const args = process.argv.slice(2);
let port = 8080;
let quiet = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1], 10) || 8080;
  if (args[i] === '--quiet') quiet = true;
}

const root = join(new URL('.', import.meta.url).pathname, 'game');
const rootReal = normalize(root);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="12" fill="#0a0e1e"/>' +
  '<text x="32" y="46" font-family="sans-serif" font-size="40" font-weight="bold" fill="#ffd700" text-anchor="middle">N</text>' +
  '</svg>';

function log(msg) {
  if (!quiet) console.log('[' + new Date().toISOString() + '] ' + msg);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Length': Buffer.byteLength(FAVICON) });
      if (req.method !== 'HEAD') res.end(FAVICON);
      else res.end();
      log(req.method + ' /favicon.ico 200');
      return;
    }
    if (path === '/') path = '/index.html';
    const filePath = normalize(join(rootReal, path));
    if (!filePath.startsWith(rootReal)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      log(req.method + ' ' + path + ' 403');
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      log(req.method + ' ' + path + ' 404');
      return;
    }
    const st = await stat(filePath);
    if (!st.isFile()) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      log(req.method + ' ' + path + ' 403');
      return;
    }
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
    if (req.method !== 'HEAD') res.end(data);
    else res.end();
    log(req.method + ' ' + path + ' 200');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
    log((req.method || '?') + ' ' + (req.url || '?') + ' 500 ' + (e && e.message ? e.message : e));
  }
});

server.listen(port, () => {
  log('[neon-bay] serving game/ on http://localhost:' + port + '/');
});
