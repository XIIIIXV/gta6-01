// v5 rebuild — Three.js 3D, verified under recording 01a1ec5a-fd3e-7487-9558-a6fe091d3690
// v4 rebuild — Three.js 3D, verified under recording 01a1ec2e-e25c-729b-9c2a-93fbc8ceda32
// v3 rebuild — verified under recording 01a1eabc
// Capture NEON BAY's screenshots with a headless Chromium: serve game/, open each
// ?shot= scene from shots.json, wait for the game's own __shotReady flag, and save a
// JPEG to screenshots/. Also reports console errors and failed requests, so a broken
// scene cannot slip through as a screenshot.
import { spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const REPO = '/home/hatch/workspace/makefun-bounties/gta6-01';
const SHOTS = JSON.parse(readFileSync(`${REPO}/shots.json`, 'utf8'));
const EXECUTABLE = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';

const server = spawn('node', ['serve.ts', '--port', '8082'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve) => {
  const timer = setTimeout(resolve, 3000);
  server.stdout.on('data', () => { clearTimeout(timer); resolve(); });
});

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
const results = [];
for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const failed = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('requestfailed', (req) => failed.push(`${req.url()} ${req.failure()?.errorText ?? ''}`));
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  const url = `http://localhost:8082/${shot.query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
  } catch {
    errors.push('TIMEOUT waiting for __shotReady');
  }
  const out = `${REPO}/screenshots/${shot.name}`;
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
  const size = statSync(out).size;
  results.push({ name: shot.name, url, size, errors, failed, external: requests.filter((u) => !u.startsWith('http://localhost:8082/')) });
  console.log(`${shot.name}: ${size} bytes, errors=${errors.length}, failed=${failed.length}, external=${results.at(-1).external.length}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);
  for (const f of failed) console.log(`  FAILED REQ: ${f}`);
  await page.close();
}
await browser.close();
server.kill();
writeFileSync(new URL('./shots-report.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('done');
