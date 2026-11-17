// NEON BAY entrypoint: game loop, screens, input wiring, audio hooks, save/load.
// Loads with no network request: only local ES modules under game/src/.
// Shot mode (?shot=start|play|chase|mission) stages a deterministic scene and
// sets window.__shotReady so the screenshot tool knows the frame is ready.
import { STEP, SAVE_KEY } from './config.js';
import { createWorld, startMission, stepWorld, loadProgress, saveProgress } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';
import {
  ensureAudio, playShot, playPunch, playBlip, playJingle, playCrash,
  setEngine, setSiren, toggleMute,
} from './audio.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas);

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1);

const world = createWorld(seed);
let screen = shotName ? 'shot' : 'title';

// Debug hook for the playtest tool (read-only state snapshot).
window.__gameState = () => ({
  screen,
  worldScreen: world.screen,
  mission: world.mission ? {
    id: world.mission.def.id, step: world.mission.step?.type ?? null,
    stepIndex: world.mission.stepIndex, done: world.mission.done, failed: world.mission.failed,
  } : null,
  player: {
    x: Math.round(world.player.x), y: Math.round(world.player.y),
    health: Math.round(world.player.health), money: world.player.money,
    inCar: !!world.player.car, weapon: world.player.weapon,
  },
  stars: world.stars, heat: Math.round(world.heat),
  counts: { cars: world.cars.length, peds: world.peds.length, cops: world.cops.length, enemies: world.enemies.length, bullets: world.bullets.length },
});
let save = loadProgress();
let cam = { x: world.player.x, y: world.player.y };
let shotScreen = 'title';
let accumulator = 0;
let lastT = performance.now();

if (shotName) {
  const staged = stageShot(shotName, world);
  shotScreen = staged.screen;
  cam = { x: world.player.x, y: world.player.y };
  // Render one frame, then signal readiness. No animation loop in shot mode.
  renderFrame();
  window.__shotReady = true;
}

function currentScreen() {
  if (screen === 'shot') return shotScreen;
  if (screen === 'title') return 'title';
  if (screen === 'paused') return 'paused';
  return world.screen === 'play' ? 'play' : world.screen;
}

function worldInput() {
  const p = world.player;
  const mouse = input.mouse;
  const aimWorld = {
    x: cam.x + (mouse.x - renderer.vw / 2),
    y: cam.y + (mouse.y - renderer.vh / 2),
  };
  return {
    move: input.moveVector,
    run: input.run,
    enterPressed: input.wasPressed('KeyE'),
    punchPressed: input.wasPressed('Space') || (mouse.clicked && p.weapon === 'fists'),
    shootHeld: mouse.down && p.weapon === 'pistol',
    reloadPressed: input.wasPressed('KeyR'),
    switchPressed: input.wasPressed('KeyQ'),
    aim: aimWorld,
  };
}

function handleEvents() {
  for (const e of world.events) {
    if (e === 'shot') playShot();
    else if (e === 'punch' || e === 'punch_hit') playPunch();
    else if (e === 'crash') playCrash();
    else if (e === 'pickup' || e === 'step_done' || e === 'switch' || e === 'reload') playBlip(e === 'step_done' ? 1047 : 880);
    else if (e === 'mission_complete') playJingle();
    else if (e === 'enter_car' || e === 'exit_car') playBlip(660);
  }
}

function retryMission() {
  world.over = false;
  world.screen = 'play';
  world.screenT = 0;
  world.heat = 0;
  world.stars = 0;
  world.player.health = 100;
  world.player.armor = 0;
  world.player.car = null;
  world.player.x = 600;
  world.player.y = 640;
  world.player.mag = world.player.magSize;
  world.cops = [];
  world.enemies = [];
  world.bullets = [];
  // Restart the mission the player was on.
  const idx = world.mission ? world.missionIndex : 0;
  startMission(world, idx);
  cam = { x: world.player.x, y: world.player.y };
}

function quitToTitle() {
  screen = 'title';
  world.over = false;
  world.screen = 'play';
  save = loadProgress();
  world.reset(world.seed);
  cam = { x: world.player.x, y: world.player.y };
}

function renderFrame() {
  const scr = currentScreen();
  renderer.render(world, scr, {
    cam,
    aim: { x: input.mouse.x, y: input.mouse.y },
    save,
  });
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  ensureAudio();

  if (screen === 'title') {
    if (input.wasPressed('Enter')) {
      screen = 'play';
      world.screen = 'play';
      world.reset(world.seed);
      startMission(world, 0);
      cam = { x: world.player.x, y: world.player.y };
    } else if (input.wasPressed('KeyC') && save) {
      screen = 'play';
      world.screen = 'play';
      world.reset(world.seed);
      world.player.money = save.money || 0;
      startMission(world, Math.min(save.mission || 0, 5));
      cam = { x: world.player.x, y: world.player.y };
    }
    // Idle city life behind the title.
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      stepWorld(world, STEP, { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: 0, y: 0 } });
    }
  } else if (screen === 'play') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      screen = 'paused';
    } else if (world.screen === 'wasted' || world.screen === 'busted' || world.screen === 'failed') {
      if (input.wasPressed('Enter')) retryMission();
      else if (input.wasPressed('KeyQ')) quitToTitle();
    } else if (world.screen === 'ending') {
      if (input.wasPressed('Enter')) {
        world.reset(world.seed);
        startMission(world, 0);
        world.screen = 'play';
        cam = { x: world.player.x, y: world.player.y };
      }
    } else {
      accumulator += dt;
      const inp = worldInput();
      while (accumulator >= STEP) {
        accumulator -= STEP;
        stepWorld(world, STEP, inp);
        inp.enterPressed = false;
        inp.punchPressed = false;
        inp.reloadPressed = false;
        inp.switchPressed = false;
      }
      handleEvents();
      // Camera follows the player smoothly.
      cam.x += (world.player.x - cam.x) * Math.min(1, dt * 6);
      cam.y += (world.player.y - cam.y) * Math.min(1, dt * 6);
      // Audio: engine + siren.
      const inCar = !!world.player.car;
      setEngine(inCar ? Math.abs(world.player.car.speed) / 540 : 0, inCar);
      setSiren(world.stars > 0);
    }
  } else if (screen === 'paused') {
    if (input.wasPressed('Enter') || input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      screen = 'play';
    } else if (input.wasPressed('KeyR')) {
      retryMission();
      screen = 'play';
    } else if (input.wasPressed('KeyQ')) {
      quitToTitle();
    }
    setEngine(0, false);
    setSiren(false);
  }

  if (input.wasPressed('KeyM')) toggleMute();

  renderFrame();
  input.endFrame();
  requestAnimationFrame(frame);
}

if (!shotName) {
  requestAnimationFrame(frame);
}
