// NEON BAY — dev server (erasable TypeScript, runs under `node serve.ts`).
// Serves the game/ directory only (never outside the root). Access log with
// timestamps (suppressed by --quiet), HEAD support, --port flag.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';

const args = process.argv.slice(2);
let port = 8080;
let quiet = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--port' && args[i + 1]) {
    port = Number(args[i + 1]);
    i += 1;
  } else if (args[i] === '--quiet') {
    quiet = true;
  }
}

const ROOT = join(new URL('.', import.meta.url).pathname, 'game');
const MIME: Record<string, string> = {
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

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0a0a18"/><text x="16" y="23" font-size="20" font-family="sans-serif" font-weight="bold" fill="#22eeff" text-anchor="middle">N</text></svg>`;

function logLine(status: number, method: string, url: string): void {
  if (quiet) return;
  console.log(`[${new Date().toISOString()}] ${status} ${method} ${url}`);
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  const rawUrl = req.url ?? '/';
  const url = decodeURIComponent(rawUrl.split('?')[0] ?? '/');

  if (url === '/favicon.ico') {
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'content-length': Buffer.byteLength(FAVICON) });
    if (method !== 'HEAD') res.end(FAVICON);
    else res.end();
    logLine(200, method, rawUrl);
    return;
  }

  const rel = normalize(url === '/' ? 'index.html' : url.replace(/^\//, ''));
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('403 forbidden');
    logLine(403, method, rawUrl);
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 not found');
    logLine(404, method, rawUrl);
    return;
  }
  const body = readFileSync(file);
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'content-length': body.length });
  if (method !== 'HEAD') res.end(body);
  else res.end();
  logLine(200, method, rawUrl);
});

server.listen(port, () => {
  if (!quiet) console.log(`[neon-bay] serving game/ on http://localhost:${port}/`);
});
