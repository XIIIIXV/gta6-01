// shots.js — screenshot scene setup for NEON BAY.
// The shots harness loads the game with ?shot=start|play|chase|mission
// and screenshots it. This module puts the world into the matching state
// so each capture shows the game at its best. Pure setup, no rendering.

import { startMission } from './world.js';
import { PLACES } from './config.js';

// Place the player in a parked car near a place, facing along the road.
function putPlayerInCar(world, place, angle) {
  const p = world.player;
  let best = null;
  let bd = Infinity;
  for (const car of world.cars) {
    if (car.wrecked || car.police || car.traffic) continue;
    const d = Math.hypot(car.x - place.x, car.y - place.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return false;
  best.x = place.x;
  best.y = place.y;
  best.angle = angle;
  best.speed = 0;
  best.health = 100;
  p.x = place.x;
  p.y = place.y;
  p.angle = angle;
  p.car = best;
  return true;
}

export function setupShot(world, name) {
  if (name === 'start') {
    world.screen = 'title';
    return;
  }
  world.screen = 'play';
  if (name === 'play') {
    // Driving through the city near the plaza.
    putPlayerInCar(world, { x: PLACES.plaza.x, y: PLACES.plaza.y }, Math.PI);
    if (world.player.car) world.player.car.speed = 220;
  } else if (name === 'chase') {
    // 3-star chase: player in a car, police cruisers on the tail.
    putPlayerInCar(world, { x: PLACES.bank.x, y: PLACES.bank.y }, Math.PI / 2);
    if (world.player.car) world.player.car.speed = 320;
    world.heat = 70;
    world.stars = 3;
    // Park three police cruisers behind the player.
    for (let i = 0; i < 3; i += 1) {
      world.cars.push({
        x: world.player.x - 120 - i * 90,
        y: world.player.y - 50 + i * 50,
        angle: Math.PI / 2,
        speed: 300,
        health: 100,
        wrecked: false,
        police: true,
        traffic: false,
        mission: null,
        color: '#1a1a2e',
        backoffT: 0,
        stuckT: 0,
        lastX: world.player.x,
        lastY: world.player.y,
      });
    }
  } else if (name === 'mission') {
    // Mid-mission: mission 2 (delivery) active, marker visible at the club.
    startMission(world, 1);
    world.mission.stepIndex = 1;
    world.mission.step = world.mission.def.steps[1];
    putPlayerInCar(world, { x: PLACES.docks.x, y: PLACES.docks.y }, Math.PI);
    if (world.player.car) world.player.car.speed = 180;
  }
}

// Read the shot name from the page URL (?shot=...), if present.
export function shotFromUrl() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get('shot');
  } catch {
    return null;
  }
}
