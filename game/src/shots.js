// shots.js — staged screenshot scenes for NEON BAY (v8 rebuild).
// setupShot(world, name) stages one of the four scenes; shotFromUrl()
// reads ?shot= (and ?seed=) from the URL.

import { PLACES } from './config.js';
import { MISSIONS } from './missions.js';
import { startMission } from './world.js';

function nearestCarTo(world, x, y) {
  let best = null;
  let bd = Infinity;
  for (const c of world.cars) {
    if (c.wrecked || c.police || c.traffic) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = c; }
  }
  return best || world.cars[0];
}

export function setupShot(world, name) {
  world.shotName = name;
  const p = world.player;
  if (name === 'start') {
    world.screen = 'title';
    return;
  }
  if (name === 'play') {
    world.screen = 'play';
    const car = nearestCarTo(world, PLACES.plaza.x, PLACES.plaza.y);
    car.color = '#e63946';
    car.x = PLACES.plaza.x + 60;
    car.y = PLACES.plaza.y;
    car.angle = 0;
    car.speed = 220;
    car.health = 100;
    car.wrecked = false;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // v7 fix: clear any ped within 400 units of the hero car.
    world.peds = world.peds.filter((ped) => Math.hypot(ped.x - car.x, ped.y - car.y) > 400);
    return;
  }
  if (name === 'chase') {
    world.screen = 'play';
    const car = nearestCarTo(world, PLACES.bank.x, PLACES.bank.y);
    car.color = '#f5c542';
    car.x = PLACES.bank.x + 60;
    car.y = PLACES.bank.y;
    car.angle = 0;
    car.speed = 320;
    car.health = 100;
    car.wrecked = false;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    world.heat = 70;
    world.stars = 3;
    world.lastHeatGain = world.time;
    // Three police cruisers flanking/ahead so the chase camera sees them.
    const spots = [
      { dx: -90, dy: 0 },
      { dx: -120, dy: -70 },
      { dx: 80, dy: 0 },
    ];
    for (const s of spots) {
      const cruiser = {
        x: car.x + s.dx, y: car.y + s.dy, angle: 0, speed: 320,
        health: 100, wrecked: false, police: true, traffic: false, mission: false,
        color: '#1a1a2e', backoffT: 0, stuckT: 0,
        lastX: car.x + s.dx, lastY: car.y + s.dy,
        hitCd: 0, scrapeCd: 0, target: null,
      };
      world.cars.push(cruiser);
      world.cops.push(cruiser);
    }
    return;
  }
  if (name === 'mission') {
    startMission(world, 1);
    const def = MISSIONS[1];
    world.mission.stepIndex = 1;
    world.mission.step = def.steps[1];
    world.deliverActive = true;
    const car = nearestCarTo(world, PLACES.docks.x, PLACES.docks.y);
    car.x = PLACES.docks.x + 60;
    car.y = PLACES.docks.y;
    car.angle = Math.PI;
    car.speed = 0;
    car.health = 100;
    car.wrecked = false;
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    return;
  }
  world.screen = 'title';
}

export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot') || 'start';
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  return { name, seed };
}
