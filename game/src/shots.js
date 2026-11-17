// Screenshot scenes for NEON BAY: each one plays the real rules forward from a
// fresh world with a fixed seed, steered by a simple autopilot, so the frame is
// what a real game looks like and the same seed always gives the same frame.
// The page sets window.__shotReady when the scene is staged and drawn.
import { STEP, PLACES, ROAD_CENTERS } from './config.js';
import { nearestRoadCenter } from './city.js';
import { startMission, snapToRoad } from './world.js';

const TAU = Math.PI * 2;

// A road-following route: nearest intersection, then along the grid to the target.
function roadPath(fromX, fromY, toX, toY) {
  const cx = nearestRoadCenter(fromX);
  const cy = nearestRoadCenter(fromY);
  const tx = nearestRoadCenter(toX);
  const ty = nearestRoadCenter(toY);
  const pts = [[cx, cy]];
  if (tx !== cx) pts.push([tx, cy]);
  if (ty !== cy) pts.push([tx, ty]);
  pts.push([toX, toY]);
  return pts;
}

// Stateful driver: follows a road path, brakes for corners, keeps the car on roads.
// If the car is beached against a wall (barely moving for 1.5s), it reverses
// straight out for a second — a car that cannot move cannot steer.
function makeDriver(world, tx, ty) {
  const path = roadPath(world.player.x, world.player.y, tx, ty);
  let wp = 0;
  let lastX = world.player.x;
  let lastY = world.player.y;
  let windowDist = 0;
  let windowSteps = 0;
  let reverseT = 0;
  return () => {
    const p = world.player;
    const car = p.car;
    const cx = car ? car.x : p.x;
    const cy = car ? car.y : p.y;
    while (wp < path.length - 1 && Math.hypot(path[wp][0] - cx, path[wp][1] - cy) < 45) wp += 1;
    const [wx, wy] = path[Math.min(wp, path.length - 1)];
    const ang = car ? car.angle : p.angle;
    const desired = Math.atan2(wy - cy, wx - cx);
    let diff = (desired - ang) % TAU;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    const d = Math.hypot(wx - cx, wy - cy);
    const speed = car ? Math.abs(car.speed) : 0;
    const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
    const baseInput = (move) => ({
      move, run: false, enterPressed: false, punchPressed: false,
      shootHeld: false, reloadPressed: false, switchPressed: false,
      aim: { x: wx, y: wy },
    });
    // Stuck detection (per-step movement while the car should be driving).
    const stepMove = Math.hypot(cx - lastX, cy - lastY);
    lastX = cx;
    lastY = cy;
    if (reverseT > 0) {
      reverseT -= STEP;
      return baseInput({ x: 0, y: 1, active: true });
    }
    windowDist += stepMove;
    windowSteps += 1;
    if (windowSteps >= 90) {
      if (windowDist < 80 && d > 100) reverseT = 1.0;
      windowDist = 0;
      windowSteps = 0;
    }
    // Throttle: drive toward the waypoint; brake early and hard for corners so
    // the car stays on the road instead of cutting across sidewalks (and peds).
    let throttle = -1;
    if (speed > 460) throttle = 0;
    if (d < 60) throttle = 0;
    if (d < 350 && speed > 150) throttle = 1;
    return baseInput({ x: steer, y: throttle, active: throttle !== 0 || steer !== 0 });
  };
}

function walkInput(world, tx, ty) {
  const p = world.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 20) return { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: tx, y: ty } };
  return { move: { x: dx / d, y: dy / d, active: true }, run: true, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: tx, y: ty } };
}

function idleInput() {
  return { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: 0, y: 0 } };
}

function playSteps(world, seconds, inputFn) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.over) break;
    world.step(typeof inputFn === 'function' ? inputFn(world, i) : inputFn);
  }
}

// Put the player in the nearest parked car (the autopilot "steals" it).
function stealNearestCar(world) {
  const p = world.player;
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.wrecked || car.police || car.traffic) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  p.x = best.x - 20;
  p.y = best.y;
  world.step({ move: { x: 0, y: 0, active: false }, run: false, enterPressed: true, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: best.x, y: best.y } });
}

/**
 * Stage `world` for the named scene and return the screen to draw.
 * start: title screen over the city. play: driving through town on mission 1.
 * chase: 3-star police chase downtown. mission: the warehouse shootout, mission 5.
 */
export function stageShot(name, world) {
  world.reset(world.seed);
  if (name === 'chase') {
    startMission(world, 0);
    // Walk to the garage first so the mission is past its opening step, then
    // steal a ride and run — the heat goes on mid-drive for a real chase.
    playSteps(world, 2, (w) => walkInput(w, PLACES.garage.x, PLACES.garage.y));
    stealNearestCar(world);
    playSteps(world, 8, makeDriver(world, PLACES.plaza.x, PLACES.plaza.y));
    if (!world.player.car) stealNearestCar(world);
    world.heat = 55;
    world.stars = 3;
    world.lastCrime = world.time;
    playSteps(world, 4, makeDriver(world, PLACES.bank.x, PLACES.bank.y));
    return { screen: 'play' };
  }
  if (name === 'mission') {
    startMission(world, 4); // Sal's Enforcers — the warehouse shootout.
    const drop = snapToRoad(PLACES.warehouse.x + 260, PLACES.warehouse.y + 120);
    world.player.x = drop.x;
    world.player.y = drop.y;
    world.player.weapon = 'pistol';
    world.player.armor = 100;
    world.mission.stepIndex = 1;
    world.mission.step = world.mission.def.steps[1];
    world.enemies = [];
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * TAU;
      const spot = snapToRoad(
        PLACES.warehouse.x + Math.cos(a) * 130,
        PLACES.warehouse.y + Math.sin(a) * 130,
      );
      world.enemies.push({
        x: spot.x,
        y: spot.y,
        angle: 0, health: i === 0 ? 300 : 80, boss: i === 0,
        shootCd: 0.5 + i * 0.2, dead: false, speed: 150,
      });
    }
    playSteps(world, 4, (w) => {
      const alive = w.enemies.filter((e) => !e.dead);
      if (alive.length === 0) return walkInput(w, PLACES.warehouse.x, PLACES.warehouse.y);
      const target = alive[0];
      return {
        move: { x: 0, y: 0, active: false }, run: false,
        enterPressed: false, punchPressed: false,
        shootHeld: true, reloadPressed: false, switchPressed: false,
        aim: { x: target.x, y: target.y },
      };
    });
    return { screen: 'play' };
  }
  if (name === 'play') {
    startMission(world, 0);
    playSteps(world, 2, (w) => walkInput(w, PLACES.garage.x, PLACES.garage.y));
    stealNearestCar(world);
    playSteps(world, 10, makeDriver(world, PLACES.safehouse.x, PLACES.safehouse.y));
    if (!world.player.car) stealNearestCar(world);
    playSteps(world, 3, makeDriver(world, PLACES.safehouse.x, PLACES.safehouse.y));
    return { screen: 'play' };
  }
  // start: title screen. Let the city idle a moment so peds spread out.
  playSteps(world, 4, idleInput);
  return { screen: 'title' };
}
