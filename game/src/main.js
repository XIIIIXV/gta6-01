// NEON BAY — entry point (v5 rebuild, written from spec).
// Boots the world, owns the game loop (requestAnimationFrame + fixed STEP
// accumulator: pollInput -> stepWorld -> render), handles screens, shot
// staging, auto-pause, audio unlock, best-time tracking and the
// window.__shotReady flag the screenshot tool waits for.

import { createWorld, startMission, stepWorld } from './world.js';
import { STEP, CONTROLS_HELP } from './config.js';
import {
  createRenderer, loadBestTime, saveBestTime, saveMissionBest, loadMissionBest,
} from './render.js';
import { createInput, attachInput, isDown, pollInput } from './input.js';
import {
  setMasterVolume, playPickup, playFail, playHonk, playShoot,
  playMissionComplete, playClick, unlockAudio,
} from './audio.js';
import { setupShot, shotFromUrl } from './shots.js';

void CONTROLS_HELP;

const gameCanvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const loadingDiv = document.getElementById('loading');

const { name: shotName, seed: urlSeed } = shotFromUrl();
const seed = urlSeed || Math.floor(Math.random() * 1e9);

let world = createWorld(seed);
let renderer = null;
const inputState = createInput();
const input = {
  move: { x: 0, y: 0, active: false },
  run: false,
  enterPressed: false,
  punchPressed: false,
  shootHeld: false,
  reloadPressed: false,
  switchPressed: false,
  aim: { x: 0, y: 0 },
};

let prevDone = false;
let prevMissionIndex = -1;
let prevScreen = 'title';
let prevShots = 0;
let runTime = 0;
let summaryUntil = 0;
let hornCd = 0;

function freshWorld() {
  world = createWorld(seed);
  if (shotName) {
    setupShot(world, shotName);
  } else {
    world.screen = 'title';
  }
  prevDone = false;
  prevMissionIndex = -1;
  prevScreen = world.screen;
  prevShots = 0;
  runTime = 0;
  summaryUntil = 0;
  if (renderer) {
    renderer.ui.summary = null;
    renderer.ui.gameSummary = null;
    renderer.ui.banner = null;
    renderer.ui.paused = false;
  }
}

function startGame() {
  world.screen = 'play';
  startMission(world, 0);
  prevMissionIndex = 0;
  prevDone = false;
  runTime = 0;
  if (renderer) {
    renderer.ui.banner = `MISSION 1: ${world.mission.def.name}`;
    renderer.ui.bannerT = 3;
  }
  playClick();
}

function handleEnter() {
  if (world.screen === 'title') {
    startGame();
  } else if (world.screen === 'ending' || world.screen === 'wasted' || world.screen === 'failed') {
    freshWorld();
    startGame();
  }
}

function handleSignals() {
  // Pickup sound + flash.
  if (world._pickupFlash) {
    playPickup();
    if (renderer) {
      renderer.ui.flash = { kind: world._pickupFlash };
      renderer.ui.flashT = 1.5;
    }
    world._pickupFlash = null;
  }
  // Pistol sound.
  if (world.stats.shotsFired !== prevShots) {
    if (world.stats.shotsFired > prevShots) playShoot();
    prevShots = world.stats.shotsFired;
  }
  // Mission completed.
  const m = world.mission;
  if (m && m.done && !prevDone) {
    prevDone = true;
    playMissionComplete();
    const prevBest = loadMissionBest(m.def.name);
    const isNewBest = saveMissionBest(m.def.name, m.timer);
    if (renderer) {
      renderer.ui.summary = {
        name: m.def.name,
        time: m.timer,
        best: loadMissionBest(m.def.name) ?? m.timer,
        cash: m.def.reward,
        isNewBest,
        beatPar: m.timer < m.def.par,
      };
      summaryUntil = world.time + 4;
    }
    void prevBest;
  }
  if (m && !m.done) prevDone = false;
  // New mission banner.
  if (world.missionIndex !== prevMissionIndex && m && !m.done) {
    prevMissionIndex = world.missionIndex;
    if (renderer) {
      renderer.ui.banner = `MISSION ${m.def.id}: ${m.def.name}`;
      renderer.ui.bannerT = 3;
    }
  }
  if (renderer?.ui.summary && world.time > summaryUntil && summaryUntil > 0) {
    renderer.ui.summary = null;
    summaryUntil = 0;
  }
  // Game complete.
  if (world.screen === 'ending' && prevScreen !== 'ending') {
    const isNewBest = saveBestTime(runTime);
    if (renderer) {
      renderer.ui.gameSummary = {
        total: runTime,
        best: loadBestTime().total ?? runTime,
        money: world.player.money,
        kills: world.stats.kills,
        isNewBest,
      };
    }
  }
  // Wasted / failed.
  if ((world.screen === 'wasted' || world.screen === 'failed') && prevScreen !== world.screen) {
    playFail();
  }
  prevScreen = world.screen;
}

function boot() {
  if (shotName) {
    setupShot(world, shotName);
  }
  renderer = createRenderer(gameCanvas, hudCanvas, world);
  renderer.resize(window.innerWidth, window.innerHeight);
  attachInput(inputState, gameCanvas);
  setMasterVolume(0.5);

  window.addEventListener('resize', () => {
    renderer.resize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('keydown', () => unlockAudio());
  window.addEventListener('mousedown', () => unlockAudio());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.screen === 'play' && renderer) {
      renderer.ui.paused = true;
    }
  });
  if (loadingDiv) loadingDiv.remove();

  // Debug / test hook: the playtest reads this when present.
  window.__gameState = () => ({
    screen: world.screen,
    missionIndex: world.missionIndex,
    mission: world.mission ? {
      name: world.mission.def.name,
      step: world.mission.step?.type ?? null,
      stepIndex: world.mission.stepIndex,
      timer: world.mission.timer,
      done: world.mission.done,
    } : null,
    health: world.player.health,
    armor: world.player.armor,
    money: world.player.money,
    stars: world.stars,
    heat: Math.round(world.heat),
    x: Math.round(world.player.x),
    y: Math.round(world.player.y),
    inCar: !!world.player.car,
    over: world.over,
    fallback: renderer.isFallback(),
  });

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (hornCd > 0) hornCd -= dt;

    // Edge-triggered menu keys (consumed here, not by pollInput).
    if (inputState.pressed.has('Enter')) {
      inputState.pressed.delete('Enter');
      handleEnter();
    }
    if (inputState.pressed.has('KeyP')) {
      inputState.pressed.delete('KeyP');
      if (world.screen === 'play' && renderer) {
        renderer.ui.paused = !renderer.ui.paused;
        playClick();
      }
    }
    if (inputState.pressed.has('KeyH')) {
      inputState.pressed.delete('KeyH');
      if (hornCd <= 0 && world.player.car) {
        playHonk();
        hornCd = 0.4;
      }
    }
    void isDown;

    if (renderer.ui.paused) {
      renderer.render(world, 0);
      if (!window.__shotReady) window.__shotReady = true;
      return;
    }

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      pollInput(inputState, input);
      const w = renderer.screenToWorld(input.aim.x, input.aim.y);
      input.aim.x = w.x;
      input.aim.y = w.y;
      if (world.screen === 'play') runTime += STEP;
      stepWorld(world, STEP, input);
      acc -= STEP;
      steps += 1;
    }
    if (steps === 5) acc = 0;

    handleSignals();
    renderer.render(world, dt);
    if (!window.__shotReady) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

boot();
