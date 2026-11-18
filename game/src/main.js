// main.js — NEON BAY boot + game loop (v8 rebuild).
// Owns requestAnimationFrame, the fixed STEP accumulator, pollInput ->
// stepWorld -> render, screens, auto-pause, audio unlock, and
// window.__shotReady (set after the first rendered frame — the shots tool
// waits for this flag).

import { STEP } from './config.js';
import { createWorld, startMission, stepWorld } from './world.js';
import {
  createRenderer, loadBestTime, saveBestTime, saveMissionBest, saveTrialBest,
} from './render.js';
import { createInput, attachInput, pollInput } from './input.js';
import {
  unlockAudio, playPickup, playFail, playHonk, playShoot,
  playMissionComplete, playClick, setMasterVolume,
  radioNext, radioToggle, radioUpdate, playStunt,
} from './audio.js';
import { setupShot, shotFromUrl } from './shots.js';
import { loadSave, saveGame, clearSave } from './save.js';
import { MISSIONS } from './missions.js';

const gameCanvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const loadingDiv = document.getElementById('loading');

const shot = shotFromUrl();
let world = createWorld(shot.seed);
const renderer = createRenderer(gameCanvas, hudCanvas, world);
const inputState = createInput();
attachInput(inputState, gameCanvas);

const input = {
  move: { x: 0, y: 0, active: false },
  run: false,
  enterPressed: false,
  punchPressed: false,
  shootHeld: false,
  reloadPressed: false,
  switchPressed: false,
  hornPressed: false,
  radioPressed: false,
  radioTogglePressed: false,
  trialPressed: false,
  phonePressed: false,
  aim: { x: 0, y: 0 },
};

let paused = false;
let shotReady = false;
let prevMissionDone = false;
let prevMissionIndex = -1;
let prevShotsFired = 0;
let prevOver = false;
let prevPickupsActive = 2;
let prevTrialDone = false;
let lastNow = 0;
let acc = 0;
let lastW = 0;
let lastH = 0;

setMasterVolume(0.5);
if (loadingDiv) loadingDiv.remove();

if (shot.name && shot.name !== 'start') {
  setupShot(world, shot.name);
} else {
  setupShot(world, 'start');
}

function startRun() {
  world = createWorld(shot.seed);
  world.totalTime = 0;
  prevMissionDone = false;
  prevMissionIndex = -1;
  prevShotsFired = 0;
  prevOver = false;
  prevPickupsActive = 2;
  prevTrialDone = false;
  clearSave();
  startMission(world, 0);
  playClick();
}

// Round 6: continue a saved run (C on the title screen).
function continueRun() {
  const save = loadSave();
  if (!save || save.missionIndex >= MISSIONS.length) { startRun(); return; }
  world = createWorld(shot.seed);
  world.totalTime = save.totalTime || 0;
  prevMissionDone = false;
  prevMissionIndex = -1;
  prevShotsFired = 0;
  prevOver = false;
  prevPickupsActive = 2;
  prevTrialDone = false;
  world.player.money = save.money || 0;
  world.stats.kills = save.kills || 0;
  startMission(world, save.missionIndex);
  playClick();
}

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'Enter') {
    if (world.screen === 'title') {
      startRun();
    } else if (world.over) {
      startRun();
    } else if (world.screen === 'ending') {
      startRun();
    }
  } else if (e.code === 'KeyC' && world.screen === 'title') {
    continueRun();
  }
});
window.addEventListener('pointerdown', () => unlockAudio(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) paused = true;
  else paused = false;
});

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastNow) lastNow = now;
  let dt = (now - lastNow) / 1000;
  lastNow = now;
  if (dt > 0.25) dt = 0.25;

  const isShotScene = !!(shot.name && shot.name !== 'start');
  if (!paused && !inputState.paused) {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 8) {
      pollInput(inputState, input);
      // Aim: screen coords -> world coords.
      const wpt = renderer.screenToWorld(input.aim.x, input.aim.y);
      input.aim.x = wpt.x;
      input.aim.y = wpt.y;
      if (world.screen === 'play' && !world.over) {
        stepWorld(world, STEP, input);
        // Round 6: radio + phone are UI-level, handled here (the edge fields
        // are set by this iteration's pollInput, so check them immediately).
        if (input.radioPressed) radioNext();
        if (input.radioTogglePressed) radioToggle();
        if (input.phonePressed) world.phoneOpen = !world.phoneOpen;
        if (world.stuntSound) { world.stuntSound = false; playStunt(); }
      } else if (world.screen === 'title') {
        // Title orbit: advance time so the camera drifts.
        world.time += STEP;
      }
      acc -= STEP;
      guard++;
    }
    if (acc >= STEP) acc = 0;

    // Event sounds + best-time bookkeeping.
    if (world.stats.shotsFired > prevShotsFired) playShoot();
    prevShotsFired = world.stats.shotsFired;
    if (world.hornT > 0) playHonk();
    const activePickups = world.pickups.filter((pk) => pk.active).length;
    if (activePickups < prevPickupsActive) playPickup();
    prevPickupsActive = activePickups;
    const m = world.mission;
    if (m && m.done && !prevMissionDone) {
      playMissionComplete();
      saveMissionBest(m.def.name, m.timer);
      world.totalTime = (world.totalTime || 0) + m.timer;
      if (world.gameComplete) saveBestTime(world.totalTime);
      renderer.refreshBest();
      // Round 6: auto-save the next mission; clear the save on completion.
      if (world.gameComplete) clearSave();
      else saveGame(world);
    }
    prevMissionDone = !!(m && m.done);
    prevMissionIndex = world.missionIndex;
    const tr = world.trial;
    if (tr && tr.done && !prevTrialDone) saveTrialBest(tr.time);
    prevTrialDone = !!(tr && tr.done);
    if (world.over && !prevOver) playFail();
    prevOver = world.over;
  }
  radioUpdate();

  if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    try {
      renderer.resize(lastW, lastH);
    } catch (e) {
      // Resize is best-effort.
    }
  }
  renderer.render(world, dt);
  if (!shotReady) {
    shotReady = true;
    window.__shotReady = true;
  }
}

renderer.resize(window.innerWidth, window.innerHeight);
requestAnimationFrame(frame);
