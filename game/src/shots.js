// NEON BAY — staged screenshot scenes (v5 rebuild, written from spec).
// setupShot(world, name) stages one of the four shots.json scenes;
// shotFromUrl() reads ?shot= / ?seed= from the page URL.

import { PLACES } from './config.js';
import { startMission } from './world.js';
import { spawnCop, spawnDeliverCar } from './world.js';

/**
 * setupShot(world, name): stage a scene. The game loop keeps stepping the
 * world afterwards, so a shot stages a live moment, not a frozen frame.
 * - 'start': title screen over the 3D city.
 * - 'play': player driving in a car near the plaza at speed 220.
 * - 'chase': 3-star chase, player in a car near the bank at speed 320,
 *   heat 70, stars 3, three police cruisers parked behind the player.
 * - 'mission': mission 2, deliver step active, player in the delivery car
 *   at the docks.
 */
export function setupShot(world, name) {
  const p = world.player;
  if (name === 'start') {
    world.screen = 'title';
    return;
  }
  if (name === 'play') {
    world.screen = 'play';
    const car = nearestParked(world, PLACES.plaza.x, PLACES.plaza.y);
    if (car) {
      p.car = car;
      car.traffic = false;
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      car.x = PLACES.plaza.x - 60;
      car.y = PLACES.plaza.y;
      car.angle = Math.PI / 2;
      car.speed = 220;
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
    }
    return;
  }
  if (name === 'chase') {
    world.screen = 'play';
    const car = nearestParked(world, PLACES.bank.x, PLACES.bank.y);
    if (car) {
      p.car = car;
      car.traffic = false;
      car.x = PLACES.bank.x - 40;
      car.y = PLACES.bank.y;
      car.angle = -Math.PI / 2;
      car.speed = 320;
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      world.heat = 70;
      world.stars = 3;
      world.lastCrime = world.time;
      // Three cruisers parked behind the player (same shape as world cars).
      // Close behind and flanking: the chase camera sits 178px behind the
      // player, so anything trailing by >~100px falls below the frame. The
      // cruisers chase (not parked), so they stay on the player's bumper.
      const back = { x: -Math.cos(car.angle), y: -Math.sin(car.angle) };
      const side = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
      const spots = [
        { d: 35, s: -75 },
        { d: 50, s: 75 },
        { d: 65, s: -40 },
      ];
      for (const spot of spots) {
        const cx = car.x + back.x * spot.d + side.x * spot.s;
        const cy = car.y + back.y * spot.d + side.y * spot.s;
        const cop = spawnCop(world, cx, cy, car.angle);
        // Match the player's speed so the cruisers keep up: starting from
        // 0 they lag ~150px behind within a second (the player outruns
        // them) and end up right at/behind the camera, out of frame.
        cop.speed = 320;
        cop._path = null;
      }
    }
    return;
  }
  if (name === 'mission') {
    world.screen = 'play';
    startMission(world, 1);
    world.mission.stepIndex = 1;
    world.mission.step = world.mission.def.steps[1];
    const dc = spawnDeliverCar(world);
    p.car = dc;
    dc.traffic = false;
    p.x = dc.x;
    p.y = dc.y;
    p.angle = dc.angle;
    return;
  }
  // Unknown shot name: fall back to the title screen.
  world.screen = 'title';
}

function nearestParked(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.wrecked || car.police || car.traffic) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/**
 * shotFromUrl(): { name, seed } from ?shot= / ?seed= (seed defaults to 1).
 * name is null when the URL carries no ?shot=.
 */
export function shotFromUrl() {
  if (typeof window === 'undefined') return { name: null, seed: 1 };
  const params = new URLSearchParams(window.location.search);
  const name = params.get('shot');
  const seed = Number(params.get('seed') ?? 1) || 1;
  return { name, seed };
}
