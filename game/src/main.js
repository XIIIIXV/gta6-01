// main.js — NEON BAY entrypoint.
// Boots the canvas, wires keyboard/mouse input, runs the fixed-step loop,
// and renders the world. All simulation lives in world.js; this file only
// connects the browser to it.

import { createWorld, startMission, stepWorld } from './world.js';
import { createInput, attachInput, pollInput } from './input.js';
import { render, loadBestTime, saveBestTime } from './render.js';
import { setupShot, shotFromUrl } from './shots.js';
import { CITY, STEP } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let world = createWorld((Math.random() * 1e9) | 0);
let bestTime = loadBestTime();
let bestSavedForRun = false;

const input = createInput();
attachInput(input, canvas);

// Screenshot mode (?shot=start|play|chase|mission) — used by tools/shots.mjs.
const shot = shotFromUrl();
if (shot) {
  setupShot(world, shot);
  // Freeze the world for a clean capture (no simulation advance).
  world.frozen = true;
  // Hide the loading veil at once (no fade): the shots harness screenshots
  // as soon as __shotReady is set, and the veil would otherwise cover the
  // canvas in every capture.
  const veil = document.getElementById('loading');
  if (veil) veil.style.display = 'none';
}

// Expose a small state summary for the playtest / debugging.
window.__gameState = () => ({
  screen: world.screen,
  missionIndex: world.missionIndex,
  mission: world.mission ? world.mission.def.name : null,
  stars: world.stars,
  money: world.player.money,
  health: world.player.health,
  player: { x: Math.round(world.player.x), y: Math.round(world.player.y), inCar: !!world.player.car },
  over: world.over,
});

// Camera follows the player, clamped to the city.
const view = { camX: 0, camY: 0, zoom: 1, w: canvas.width, h: canvas.height };
function updateCamera() {
  view.w = canvas.width;
  view.h = canvas.height;
  view.zoom = Math.max(0.55, Math.min(1, Math.min(view.w, view.h) / 900));
  const vw = view.w / view.zoom;
  const vh = view.h / view.zoom;
  view.camX = Math.max(0, Math.min(CITY.SIZE - vw, world.player.x - vw / 2));
  view.camY = Math.max(0, Math.min(CITY.SIZE - vh, world.player.y - vh / 2));
}

function restart() {
  world = createWorld((Math.random() * 1e9) | 0);
  bestSavedForRun = false;
  world.screen = 'play';
  startMission(world, 0);
}

let last = performance.now();
let acc = 0;
let fpsFrames = 0;
let fpsTime = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!world.frozen) {
    acc += dt;
    let guard = 0;
    // Map screen pixels to world coordinates for mouse aim.
    const toWorld = (sx, sy) => ({ x: view.camX + sx / view.zoom, y: view.camY + sy / view.zoom });
    while (acc >= STEP && guard < 5) {
      stepWorld(world, STEP, pollInput(input, toWorld));
      acc -= STEP;
      guard += 1;
    }
    if (guard >= 5) acc = 0;
  }
  // Save the best total time once, when a full run ends.
  if (world.screen === 'ending' && !bestSavedForRun && world.runSummary.totalTime !== null) {
    bestSavedForRun = true;
    if (saveBestTime(world.runSummary.totalTime)) {
      bestTime = world.runSummary.totalTime;
    }
  }
  updateCamera();
  render(ctx, world, view, now, bestTime);
  // Signal the shots harness that the scene is ready to capture.
  if (shot && !window.__shotReady) {
    window.__shotReady = true;
  }
  fpsFrames += 1;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    const fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    const el = document.getElementById('fps');
    if (el) el.textContent = `${fps} FPS`;
  }
  requestAnimationFrame(frame);
}

// ENTER starts / restarts. M mutes.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    if (world.screen === 'title') {
      world.screen = 'play';
      startMission(world, 0);
    } else if (world.screen === 'ending' || world.screen === 'wasted' || world.screen === 'busted' || world.screen === 'failed') {
      restart();
    }
  }
  if (e.code === 'KeyM') {
    import('./audio.js').then(({ setMasterVolume }) => {
      world.muted = !world.muted;
      setMasterVolume(world.muted ? 0 : 0.5);
    });
  }
});

requestAnimationFrame(frame);
