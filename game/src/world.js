// NEON BAY — world simulation (v3 rebuild).
// The whole game state lives here and steps at 60 Hz with no DOM, no audio
// and no network, so the Node harnesses (winrate / simtest) drive the exact
// same code the browser plays. Pure simulation: rendering and sound live
// in render.js / audio.js, driven by main.js.

import { STEP, CITY, PLACES, TUNING, PICKUPS, PICKUP_RESPAWN_S } from './config.js';
import { makeRng, weightedPick } from './random.js';
import { createCity, nearestRoadCenter, pushOutOfBuilding, segmentBlocked } from './city.js';
import { MISSIONS, missionPlace } from './missions.js';

const TAU = Math.PI * 2;

// Pedestrian shirt colours (weighted: brights are rarer).
const SHIRT_COLORS = [
  ['#e8e8e8', 30], ['#3a6fd8', 20], ['#d83a3a', 12], ['#3ad83a', 12],
  ['#ffd166', 10], ['#ff2d95', 8], ['#00e5ff', 8],
];
// Parked / traffic car colours.
const CAR_COLORS = ['#c94f4f', '#4f7ec9', '#c9a44f', '#5fbf6a', '#8a5fc9', '#c9c9c9', '#3a3f4a'];

// ------------------------------------------------------------------ helpers

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** The point on a road nearest to (x, y) (snaps to the closest road line). */
export function snapToRoad(x, y) {
  const cx = nearestRoadCenter(x);
  const cy = nearestRoadCenter(y);
  if (Math.abs(x - cx) < Math.abs(y - cy)) return { x: cx, y };
  return { x, y: cy };
}

/** Road-following waypoints from (x1, y1) to (x2, y2), via intersections. */
export function roadPathPoints(x1, y1, x2, y2) {
  const cx = nearestRoadCenter(x1);
  const cy = nearestRoadCenter(y1);
  const tx = nearestRoadCenter(x2);
  const ty = nearestRoadCenter(y2);
  const pts = [[cx, cy]];
  if (tx !== cx) pts.push([tx, cy]);
  if (ty !== cy) pts.push([tx, ty]);
  pts.push([x2, y2]);
  return pts;
}

/** True when no building blocks the segment (x1,y1)-(x2,y2). */
export function losClear(world, x1, y1, x2, y2) {
  return !segmentBlocked(world.city.buildings, x1, y1, x2, y2);
}

// ------------------------------------------------------------------ creation

function makeCar(world, x, y, opts = {}) {
  const car = {
    x, y,
    angle: opts.angle ?? 0,
    speed: 0,
    health: TUNING.CAR_HEALTH,
    wrecked: false,
    police: !!opts.police,
    traffic: !!opts.traffic,
    mission: opts.mission || null,
    color: opts.color || world.rng.pick(CAR_COLORS),
    // Police behaviour.
    backoffT: 0,
    stuckT: 0,
    lastX: x,
    lastY: y,
    // Traffic behaviour.
    roadAxis: opts.roadAxis || 'x',
    roadCoord: opts.roadCoord ?? y,
    dir: opts.dir || 1,
    lane: opts.lane || 0,
    // Collision grace.
    hitCd: 0,
    // Road-following path (police).
    path: null,
    pathI: 0,
    pathT: 0,
  };
  return car;
}

/** A parked car on a road near (x, y) (used for the garage guarantee). */
function spawnParkedNear(world, x, y) {
  const spot = snapToRoad(x, y);
  const car = makeCar(world, spot.x + 18, spot.y, { angle: 0 });
  world.cars.push(car);
  return car;
}

/** Create a fresh world from a seed. The player starts at the garage. */
export function createWorld(seed) {
  const rng = makeRng(seed);
  const city = createCity(rng);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    screen: 'title',
    over: false,
    player: {
      x: PLACES.garage.x,
      y: PLACES.garage.y,
      angle: -Math.PI / 2,
      health: 100,
      armor: 0,
      money: 0,
      weapon: 'pistol',
      mag: TUNING.PISTOL_MAG,
      car: null,
      fireCd: 0,
      reloadT: 0,
      punchCd: 0,
      arrestT: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    bullets: [],
    pickups: PICKUPS.map((p) => ({ ...p, active: true, respawnT: 0 })),
    heat: 0,
    stars: 0,
    lastCrime: -999,
    missionIndex: -1,
    mission: null,
    stats: { kills: 0, shotsFired: 0 },
    runSummary: { missionTimes: {}, totalTime: null, runStartIndex: 0 },
    summary: null,
    events: [],
    copSpawnT: 0,
  };

  // Parked cars: ~20 on roads, one guaranteed by the garage.
  spawnParkedNear(world, PLACES.garage.x + 60, PLACES.garage.y + 40);
  for (let i = 0; i < 19; i += 1) {
    const rx = rng.range(120, CITY.SIZE - 120);
    const ry = rng.range(120, CITY.SIZE - 120);
    const spot = snapToRoad(rx, ry);
    // Keep parked cars off the exact mission places.
    let nearPlace = false;
    for (const p of Object.values(PLACES)) {
      if (dist(spot.x, spot.y, p.x, p.y) < 90) { nearPlace = true; break; }
    }
    if (nearPlace) continue;
    world.cars.push(makeCar(world, spot.x + (rng.next() < 0.5 ? 18 : -18), spot.y, {
      angle: rng.next() < 0.5 ? 0 : Math.PI,
    }));
  }

  // Traffic: 8 cars cruising the roads.
  for (let i = 0; i < 8; i += 1) {
    const axis = rng.next() < 0.5 ? 'x' : 'y';
    const coord = nearestRoadCenter(rng.range(150, CITY.SIZE - 150));
    const along = rng.range(150, CITY.SIZE - 150);
    const lane = rng.next() < 0.5 ? -20 : 20;
    const car = makeCar(world, axis === 'x' ? along : coord + lane, axis === 'x' ? coord + lane : along, {
      traffic: true,
      angle: axis === 'x' ? (rng.next() < 0.5 ? 0 : Math.PI) : (rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      roadAxis: axis,
      roadCoord: coord,
      dir: rng.next() < 0.5 ? 1 : -1,
      lane,
    });
    car.speed = 120;
    world.cars.push(car);
  }

  // Pedestrians: 24 ambling near roads.
  for (let i = 0; i < 24; i += 1) {
    const spot = snapToRoad(rng.range(100, CITY.SIZE - 100), rng.range(100, CITY.SIZE - 100));
    world.peds.push({
      x: spot.x + rng.range(-30, 30),
      y: spot.y + rng.range(-30, 30),
      angle: rng.next() * TAU,
      speed: 40 + rng.next() * 30,
      shirt: weightedPick(SHIRT_COLORS, rng),
      turnT: rng.range(1, 4),
    });
  }

  return world;
}

// ------------------------------------------------------------------ missions

/** Spawn the enemies for a kill step, in a ring around the step's place. */
function spawnKillEnemies(world, step) {
  const place = missionPlace(step);
  if (!place) return;
  const n = step.count || 3;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    const spot = snapToRoad(place.x + Math.cos(a) * 130, place.y + Math.sin(a) * 130);
    world.enemies.push({
      x: spot.x,
      y: spot.y,
      angle: 0,
      health: step.boss && i === 0 ? 300 : 80,
      boss: !!(step.boss && i === 0),
      shootCd: 0.5 + i * 0.2,
      dead: false,
      speed: 150,
    });
  }
}

/** Set up whatever the current step needs when it begins. */
function enterStep(world) {
  const step = world.mission.step;
  if (!step) return;
  if (step.type === 'kill') {
    world.player.armor = Math.min(100, world.player.armor + TUNING.KILL_ARMOR_BONUS);
    spawnKillEnemies(world, step);
  } else if (step.type === 'deliver') {
    // The getaway car: parked at the pickup spot, free to take (no heat).
    const from = missionPlace(world.mission.def.steps[world.mission.stepIndex - 1]) || { x: world.player.x, y: world.player.y };
    const spot = snapToRoad(from.x, from.y);
    // Face the car toward its destination so the driver does not have to
    // U-turn out of a corner (a U-turn at the docks swings into the block
    // and wedges the car). The destination is the deliver step's place.
    const dest = missionPlace(step);
    const angle = dest ? Math.atan2(dest.y - spot.y, dest.x - spot.x) : 0;
    const car = makeCar(world, spot.x, spot.y, { mission: 'deliver', color: '#ffd166', angle });
    world.cars.push(car);
    world.mission.deliverCar = car;
  } else if (step.type === 'survive') {
    world.mission.timer = step.seconds || 45;
  } else if (step.type === 'hold') {
    world.mission.holdT = 0;
  }
}

/** Start mission `idx` (0-based). */
export function startMission(world, idx) {
  const def = MISSIONS[idx];
  if (!def) return;
  if (world.runSummary.runStartIndex === 0 && world.missionIndex < 0) {
    world.runSummary.runStartIndex = idx;
  }
  world.missionIndex = idx;
  world.mission = {
    def,
    stepIndex: 0,
    step: def.steps[0],
    kills: 0,
    timer: 0,
    holdT: 0,
    done: false,
    failReason: '',
    startedAt: world.time,
    cooldownT: 0,
    deliverCar: null,
  };
  // The Long Goodbye starts hot: the whole city is after you.
  if (def.id === 6) {
    world.heat = 55;
    world.lastCrime = world.time;
    updateStars(world);
  }
  enterStep(world);
}

// ------------------------------------------------------------------ damage

function damagePlayer(world, dmg) {
  const p = world.player;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, dmg);
    p.armor -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) p.health -= dmg;
  if (p.health <= 0) {
    p.health = 0;
    world.over = true;
    world.screen = 'wasted';
    world.events.push('fail');
  }
}

function damageCar(world, car, dmg) {
  if (car.wrecked) return;
  car.health -= dmg;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
    if (world.player.car === car) {
      // Ejected onto the street.
      world.player.car = null;
      world.player.x = car.x - 24;
      world.player.y = car.y;
    }
    if (car.mission === 'deliver' && world.mission && world.mission.deliverCar === car) {
      // Only the CURRENT mission's delivery car can fail the run. A
      // delivery car from an earlier, completed mission is just a parked
      // car now — wrecking it must not fail a later mission.
      failMission(world, 'delivery car wrecked');
    }
  }
}

function damageEnemy(world, e, dmg) {
  if (e.dead) return;
  e.health -= dmg;
  if (e.health <= 0) {
    e.health = 0;
    e.dead = true;
    world.stats.kills += 1;
    if (world.mission && world.mission.step && world.mission.step.type === 'kill') {
      world.mission.kills += 1;
    }
  }
}

function addHeat(world, n) {
  world.heat = Math.min(100, world.heat + n);
  world.lastCrime = world.time;
  updateStars(world);
}

function updateStars(world) {
  const h = world.heat;
  const stars = h < 10 ? 0 : h < 25 ? 1 : h < 40 ? 2 : h < 60 ? 3 : h < 80 ? 4 : 5;
  if (stars !== world.stars) {
    world.stars = stars;
    if (stars === 0) {
      // The heat is off: every cop and cruiser stands down.
      world.cars = world.cars.filter((c) => !c.police);
      world.cops = [];
    }
  }
}

// ------------------------------------------------------------------ player

function tryEnterCar(world) {
  const p = world.player;
  if (p.car) {
    // Exit the car onto the street.
    const car = p.car;
    p.car = null;
    p.x = car.x - 24;
    p.y = car.y;
    return;
  }
  let best = null;
  let bestD = 44;
  for (const car of world.cars) {
    if (car.wrecked || car.police || car.traffic) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return;
  p.car = best;
  // The getaway (delivery) car is free to take; any other steal is a crime.
  if (best.mission !== 'deliver') addHeat(world, TUNING.STEAL_HEAT);
}

function fireBullet(world, x, y, tx, ty, damage, from) {
  const a = Math.atan2(ty - y, tx - x);
  world.bullets.push({
    x, y,
    vx: Math.cos(a) * TUNING.BULLET_SPEED,
    vy: Math.sin(a) * TUNING.BULLET_SPEED,
    damage,
    from,
    life: TUNING.BULLET_RANGE / TUNING.BULLET_SPEED,
  });
}

function playerShoot(world, input) {
  const p = world.player;
  if (p.weapon !== 'pistol') return;
  if (p.reloadT > 0) return;
  if (p.fireCd > 0) return;
  if (p.mag <= 0) {
    p.reloadT = TUNING.PISTOL_RELOAD_S;
    return;
  }
  p.fireCd = TUNING.PISTOL_FIRE_CD;
  p.mag -= 1;
  world.stats.shotsFired += 1;
  const ox = p.car ? p.car.x : p.x;
  const oy = p.car ? p.car.y : p.y;
  fireBullet(world, ox, oy, input.aim.x, input.aim.y, TUNING.PISTOL_DAMAGE, 'player');
  world.events.push('shoot');
}

function playerPunch(world, input) {
  const p = world.player;
  const reach = 46;
  const aimA = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
  const hit = (tx, ty) => {
    const d = dist(p.x, p.y, tx, ty);
    if (d > reach) return false;
    return Math.abs(angDiff(p.angle, Math.atan2(ty - p.y, tx - p.x))) < 1.1;
  };
  for (const e of world.enemies) {
    if (!e.dead && hit(e.x, e.y)) damageEnemy(world, e, 25);
  }
  for (const c of world.cops) {
    if (!c.dead && hit(c.x, c.y)) {
      c.health -= 25;
      if (c.health <= 0) c.dead = true;
      addHeat(world, 10);
    }
  }
  for (const ped of world.peds) {
    if (hit(ped.x, ped.y)) {
      addHeat(world, 10);
      // The ped flees.
      ped.fleeT = 3;
    }
  }
}

function updatePlayer(world, dt, input) {
  const p = world.player;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.mag = TUNING.PISTOL_MAG;
      p.reloadT = 0;
    }
  }
  // Face the aim point (twin-stick: movement and facing are independent).
  p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);

  if (input.enterPressed) tryEnterCar(world);

  if (input.switchPressed) {
    p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
  }
  if (input.reloadPressed && p.weapon === 'pistol' && p.mag < TUNING.PISTOL_MAG && p.reloadT <= 0) {
    p.reloadT = TUNING.PISTOL_RELOAD_S;
  }
  if (input.hornPressed && p.car) world.events.push('honk');

  if (p.car) {
    updatePlayerCar(world, dt, input);
    // Drive-by shooting is allowed from the car.
    if (input.shootHeld) playerShoot(world, input);
    return;
  }

  // On foot.
  if (input.punchPressed && p.punchCd <= 0) {
    p.punchCd = 0.45;
    playerPunch(world, input);
  }
  if (input.shootHeld) playerShoot(world, input);

  const speed = input.run ? 230 : 140;
  if (input.move.active) {
    p.x += input.move.x * speed * dt;
    p.y += input.move.y * speed * dt;
  }
  p.x = clamp(p.x, 12, CITY.SIZE - 12);
  p.y = clamp(p.y, 12, CITY.SIZE - 12);
  // Slide out of buildings.
  for (const b of world.city.buildings) {
    const out = pushOutOfBuilding(b, p.x, p.y, 10);
    if (out) {
      p.x = out.x;
      p.y = out.y;
    }
  }
}

// Lane-keeping: pull a car toward the centreline of the road it is on.
// The harness driver steers by angle only (it has a ~7-degree deadband),
// so a car drifts laterally off the centreline and its U-turn circle then
// clips a block building and wedges. A strong spring toward the centreline
// keeps the car on the asphalt without fighting the driver's direction.
function keepCarOnRoad(car, dt) {
  const half = CITY.ROAD_WIDTH / 2;
  const cx = nearestRoadCenter(car.x);
  const cy = nearestRoadCenter(car.y);
  const onH = Math.abs(car.y - cy) < half;
  const onV = Math.abs(car.x - cx) < half;
  const k = Math.min(1, 10 * dt);
  if (onH && !onV) {
    car.y += (cy - car.y) * k;
  } else if (onV && !onH) {
    car.x += (cx - car.x) * k;
  } else if (onH && onV) {
    // At an intersection: centre on the nearer axis only.
    if (Math.abs(car.y - cy) < Math.abs(car.x - cx)) car.y += (cy - car.y) * k;
    else car.x += (cx - car.x) * k;
  }
}

function updatePlayerCar(world, dt, input) {
  const p = world.player;
  const car = p.car;
  if (!car || car.wrecked) {
    p.car = null;
    return;
  }
  const steer = input.move.x;
  const throttle = input.move.y; // -1 forward, +1 reverse/brake.
  if (throttle < 0) {
    car.speed = Math.min(TUNING.CAR_MAX_SPEED, car.speed + TUNING.CAR_ACCEL * dt);
  } else if (throttle > 0) {
    if (car.speed > 0) {
      car.speed = Math.max(0, car.speed - TUNING.CAR_REVERSE_ACCEL * 2 * dt);
    } else {
      car.speed = Math.max(-TUNING.CAR_MAX_REVERSE, car.speed - TUNING.CAR_REVERSE_ACCEL * dt);
    }
  } else {
    car.speed -= car.speed * TUNING.CAR_DRAG * dt;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  // Sharp turns bleed speed: a car cannot hold top speed while turning
  // hard. This is a hard cap (stability control): at full steer the car
  // holds ~60, whose turning radius (~19) keeps a U-turn inside the road
  // instead of swinging into a block.
  const turnCap = TUNING.CAR_MAX_SPEED - Math.abs(steer) * TUNING.TURN_SPEED_DROP;
  if (car.speed > turnCap) car.speed = turnCap;
  const steerFactor = Math.max(TUNING.STEER_FLOOR, Math.min(1, 1.2 - Math.abs(car.speed) / 400));
  if (car.speed !== 0) {
    car.angle += steer * TUNING.TURN_RATE * steerFactor * dt * Math.sign(car.speed);
    // Keep the angle bounded so external drivers' angle-difference math
    // (which normalizes by one turn) stays well-behaved.
    if (car.angle > Math.PI) car.angle -= TAU;
    else if (car.angle < -Math.PI) car.angle += TAU;
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 16, CITY.SIZE - 16);
  car.y = clamp(car.y, 16, CITY.SIZE - 16);
  collideCarWithBuildings(world, car, dt);
  keepCarOnRoad(car, dt);
  // The player's position is the car's while driving (drivers path from it).
  p.x = car.x;
  p.y = car.y;
}

// ------------------------------------------------------------------ cars

function collideCarWithBuildings(world, car, dt) {
  if (car.wrecked) return;
  car.hitCd = Math.max(0, car.hitCd - dt);
  for (const b of world.city.buildings) {
    const out = pushOutOfBuilding(b, car.x, car.y, 15);
    if (!out) continue;
    const wasSpeed = Math.abs(car.speed);
    car.x = out.x;
    car.y = out.y;
    car.speed *= 0.55;
    if (wasSpeed > 120 && car.hitCd <= 0) {
      car.hitCd = 0.5;
      damageCar(world, car, TUNING.WALL_SCRAPE_DAMAGE);
    }
  }
}

function collideCars(world, dt) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.wrecked || b.wrecked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 30 || d === 0) continue;
      // Separate.
      const push = (30 - d) / 2 / d;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 80 && a.hitCd <= 0 && b.hitCd <= 0) {
        a.hitCd = 0.5;
        b.hitCd = 0.5;
        damageCar(world, a, TUNING.CAR_CAR_DAMAGE);
        damageCar(world, b, TUNING.CAR_CAR_DAMAGE);
      }
    }
  }
}

function updateTrafficCar(world, car, dt) {
  if (car.wrecked) return;
  // Cruise along its road; at the city edge, turn onto a cross street.
  const speed = 120;
  car.speed = speed;
  if (car.roadAxis === 'x') {
    car.x += car.dir * speed * dt;
    car.y = car.roadCoord + car.lane;
    car.angle = car.dir > 0 ? 0 : Math.PI;
    if (car.x < 140 || car.x > CITY.SIZE - 140) {
      car.dir *= -1;
      // Occasionally turn onto a cross street instead of reversing.
      if (world.rng.next() < 0.5) {
        car.roadAxis = 'y';
        car.roadCoord = nearestRoadCenter(car.x);
        car.x = car.roadCoord + car.lane;
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  } else {
    car.y += car.dir * speed * dt;
    car.x = car.roadCoord + car.lane;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (car.y < 140 || car.y > CITY.SIZE - 140) {
      car.dir *= -1;
      if (world.rng.next() < 0.5) {
        car.roadAxis = 'x';
        car.roadCoord = nearestRoadCenter(car.y);
        car.y = car.roadCoord + car.lane;
        car.angle = car.dir > 0 ? 0 : Math.PI;
      }
    }
  }
  collideCarWithBuildings(world, car, dt);
}

// Drive a car toward a target along the roads (police pursuit).
function driveCarTo(world, car, tx, ty, dt, topSpeed) {
  if (!car.path || world.time - car.pathT > 1.5) {
    car.path = roadPathPoints(car.x, car.y, tx, ty);
    car.pathI = 0;
    car.pathT = world.time;
  }
  while (car.pathI < car.path.length - 1 && dist(car.x, car.y, car.path[car.pathI][0], car.path[car.pathI][1]) < 70) {
    car.pathI += 1;
  }
  const wp = car.path[Math.min(car.pathI, car.path.length - 1)];
  const desired = angleTo(car.x, car.y, wp[0], wp[1]);
  const diff = angDiff(car.angle, desired);
  const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
  const d = dist(car.x, car.y, wp[0], wp[1]);
  const isFinal = car.pathI >= car.path.length - 1;
  let throttle = -1;
  if (Math.abs(car.speed) > topSpeed) throttle = 0;
  if (isFinal && d < 50) throttle = 0;
  // Steering + throttle (same signs as the player's car input).
  if (throttle < 0) {
    car.speed = Math.min(topSpeed, car.speed + TUNING.CAR_ACCEL * dt);
  } else if (throttle > 0) {
    car.speed = Math.max(0, car.speed - TUNING.CAR_REVERSE_ACCEL * 2 * dt);
  } else {
    car.speed -= car.speed * TUNING.CAR_DRAG * dt;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  // Sharp turns bleed speed (same rule as the player's car).
  const turnCap = topSpeed - Math.abs(steer) * TUNING.TURN_SPEED_DROP;
  if (car.speed > turnCap) car.speed = turnCap;
  const steerFactor = Math.max(TUNING.STEER_FLOOR, Math.min(1, 1.2 - Math.abs(car.speed) / 400));
  if (car.speed !== 0) {
    car.angle += steer * TUNING.TURN_RATE * steerFactor * dt * Math.sign(car.speed);
    // Keep the angle bounded so external drivers' angle-difference math
    // (which normalizes by one turn) stays well-behaved.
    if (car.angle > Math.PI) car.angle -= TAU;
    else if (car.angle < -Math.PI) car.angle += TAU;
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 16, CITY.SIZE - 16);
  car.y = clamp(car.y, 16, CITY.SIZE - 16);
  collideCarWithBuildings(world, car, dt);
  keepCarOnRoad(car, dt);
}

function updatePoliceCar(world, car, dt) {
  if (car.wrecked) return;
  car.backoffT = Math.max(0, car.backoffT - dt);
  const p = world.player;
  const d = dist(car.x, car.y, p.x, p.y);
  // Ram the player's car when close and not backing off.
  if (p.car && d < 36 && car.backoffT <= 0) {
    car.backoffT = TUNING.POLICE_BACKOFF_S;
    damageCar(world, p.car, TUNING.POLICE_RAM_DAMAGE);
    car.speed = -60; // bounce back off the ram.
    return;
  }
  // Chase: fast when far, ease off when right on top of the player.
  const topSpeed = d > 300 ? 480 : 380;
  driveCarTo(world, car, p.x, p.y, dt, topSpeed);
  // Stuck recovery: if barely moved in 2.5s, reverse and spin.
  const moved = dist(car.x, car.y, car.lastX, car.lastY);
  car.stuckT += dt;
  if (car.stuckT > 2.5) {
    car.stuckT = 0;
    car.lastX = car.x;
    car.lastY = car.y;
    if (moved < 25) {
      car.speed = -140;
      car.angle += 1.9;
    }
  } else if (moved > 5) {
    car.lastX = car.x;
    car.lastY = car.y;
    car.stuckT = 0;
  }
}

function spawnPolice(world) {
  const desired = Math.min(5, Math.max(0, world.stars));
  const have = world.cars.filter((c) => c.police && !c.wrecked).length;
  if (have >= desired || world.stars < TUNING.POLICE_SPAWN_STARS) return;
  if (world.time - world.copSpawnT < 1) return;
  world.copSpawnT = world.time;
  const p = world.player;
  for (let tries = 0; tries < 6; tries += 1) {
    const a = world.rng.next() * TAU;
    const r = 420 + world.rng.next() * 160;
    const spot = snapToRoad(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    if (spot.x < 60 || spot.x > CITY.SIZE - 60 || spot.y < 60 || spot.y > CITY.SIZE - 60) continue;
    if (dist(spot.x, spot.y, p.x, p.y) < 300) continue;
    const car = makeCar(world, spot.x, spot.y, { police: true, color: '#1a1a2e', angle: 0 });
    world.cars.push(car);
    return;
  }
}

function updateCops(world, dt) {
  const p = world.player;
  // On-foot cops only hunt a player who is on foot at 3+ stars.
  if (world.stars >= 3 && !p.car) {
    const want = 2;
    const alive = world.cops.filter((c) => !c.dead).length;
    if (alive < want && world.time - world.copSpawnT > 2) {
      world.copSpawnT = world.time;
      const spot = snapToRoad(p.x + (world.rng.next() < 0.5 ? -260 : 260), p.y);
      world.cops.push({
        x: spot.x, y: spot.y, angle: 0, health: 60,
        shootCd: 1, dead: false, speed: 170, arrestT: 0,
      });
    }
  }
  for (const c of world.cops) {
    if (c.dead) continue;
    c.shootCd = Math.max(0, c.shootCd - dt);
    const d = dist(c.x, c.y, p.x, p.y);
    if (p.car || world.stars < 3) {
      // No arrest while the player is driving; cops give up and leave.
      c.dead = true;
      continue;
    }
    // Chase on foot along the roads.
    const path = roadPathPoints(c.x, c.y, p.x, p.y);
    const wp = path[Math.min(1, path.length - 1)];
    const a = angleTo(c.x, c.y, wp[0], wp[1]);
    c.angle = a;
    if (d > 34) {
      c.x += Math.cos(a) * c.speed * dt;
      c.y += Math.sin(a) * c.speed * dt;
      c.arrestT = 0;
    } else {
      // Close enough to make the arrest: 2.5s of contact and you're busted.
      c.arrestT += dt;
      if (c.arrestT > 2.5) {
        world.over = true;
        world.screen = 'busted';
        world.events.push('fail');
        return;
      }
    }
    // Shoot when in range with line of sight.
    if (d < 320 && d > 40 && c.shootCd <= 0 && losClear(world, c.x, c.y, p.x, p.y)) {
      c.shootCd = TUNING.ENEMY_SHOOT_CD;
      const spread = (world.rng.next() - 0.5) * 0.16;
      const aa = angleTo(c.x, c.y, p.x, p.y) + spread;
      world.bullets.push({
        x: c.x, y: c.y,
        vx: Math.cos(aa) * TUNING.BULLET_SPEED,
        vy: Math.sin(aa) * TUNING.BULLET_SPEED,
        damage: TUNING.ENEMY_BULLET_DAMAGE,
        from: 'cop',
        life: TUNING.BULLET_RANGE / TUNING.BULLET_SPEED,
      });
    }
    // Stay out of buildings.
    for (const b of world.city.buildings) {
      const out = pushOutOfBuilding(b, c.x, c.y, 10);
      if (out) {
        c.x = out.x;
        c.y = out.y;
      }
    }
  }
  world.cops = world.cops.filter((c) => !c.dead);
}

// ------------------------------------------------------------------ enemies

function updateEnemies(world, dt) {
  const p = world.player;
  for (const e of world.enemies) {
    if (e.dead) continue;
    e.shootCd = Math.max(0, (e.shootCd ?? 0) - dt);
    const d = dist(e.x, e.y, p.x, p.y);
    const speed = e.speed ?? 150;
    if (d > 26) {
      // Walk the road grid toward the player.
      const path = roadPathPoints(e.x, e.y, p.x, p.y);
      const wp = path[Math.min(1, path.length - 1)];
      const a = angleTo(e.x, e.y, wp[0], wp[1]);
      e.angle = a;
      e.x += Math.cos(a) * speed * dt;
      e.y += Math.sin(a) * speed * dt;
    }
    // Shoot with line of sight.
    if (d < TUNING.ENEMY_RANGE && e.shootCd <= 0 && losClear(world, e.x, e.y, p.x, p.y)) {
      e.shootCd = TUNING.ENEMY_SHOOT_CD;
      const spread = (world.rng.next() - 0.5) * 0.14;
      const aa = angleTo(e.x, e.y, p.x, p.y) + spread;
      world.bullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(aa) * TUNING.BULLET_SPEED,
        vy: Math.sin(aa) * TUNING.BULLET_SPEED,
        damage: TUNING.ENEMY_BULLET_DAMAGE,
        from: 'enemy',
        life: TUNING.BULLET_RANGE / TUNING.BULLET_SPEED,
      });
    }
    for (const b of world.city.buildings) {
      const out = pushOutOfBuilding(b, e.x, e.y, 10);
      if (out) {
        e.x = out.x;
        e.y = out.y;
      }
    }
  }
}

// ------------------------------------------------------------------ peds

function updatePeds(world, dt) {
  for (const ped of world.peds) {
    ped.turnT -= dt;
    if (ped.turnT <= 0) {
      ped.turnT = 1 + world.rng.next() * 3;
      // chance() ped turns: mostly keep walking, sometimes turn or stop.
      const r = world.rng.next();
      if (r < 0.25) ped.angle += (world.rng.next() - 0.5) * 2.4;
      else if (r < 0.32) ped.angle += Math.PI;
    }
    const speed = ped.fleeT > 0 ? 260 : ped.speed;
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      const a = angleTo(world.player.x, world.player.y, ped.x, ped.y);
      ped.angle = a;
    }
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.x = clamp(ped.x, 12, CITY.SIZE - 12);
    ped.y = clamp(ped.y, 12, CITY.SIZE - 12);
    for (const b of world.city.buildings) {
      const out = pushOutOfBuilding(b, ped.x, ped.y, 8);
      if (out) {
        ped.x = out.x;
        ped.y = out.y;
        ped.angle += Math.PI / 2;
      }
    }
  }
}

// ------------------------------------------------------------------ bullets

function updateBullets(world, dt) {
  const p = world.player;
  const kept = [];
  for (const b of world.bullets) {
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || nx < 0 || nx > CITY.SIZE || ny < 0 || ny > CITY.SIZE;
    if (!dead && segmentBlocked(world.city.buildings, b.x, b.y, nx, ny)) dead = true;
    if (!dead) {
      b.x = nx;
      b.y = ny;
      if (b.from === 'player') {
        // Hit an enemy, a cop, or any car that is not the player's.
        let hit = false;
        for (const e of world.enemies) {
          if (!e.dead && dist(b.x, b.y, e.x, e.y) < 18) {
            damageEnemy(world, e, b.damage);
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const c of world.cops) {
            if (!c.dead && dist(b.x, b.y, c.x, c.y) < 16) {
              c.health -= b.damage;
              if (c.health <= 0) c.dead = true;
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const car of world.cars) {
            if (car.wrecked || car === p.car) continue;
            if (dist(b.x, b.y, car.x, car.y) < 17) {
              damageCar(world, car, b.damage);
              hit = true;
              break;
            }
          }
        }
        if (hit) dead = true;
      } else {
        // Enemy / cop bullet: the player's car shields them, else it hits them.
        if (p.car && !p.car.wrecked && dist(b.x, b.y, p.car.x, p.car.y) < 17) {
          damageCar(world, p.car, b.damage);
          dead = true;
        } else if (!p.car && dist(b.x, b.y, p.x, p.y) < 13) {
          damagePlayer(world, b.damage);
          dead = true;
        }
      }
    }
    if (!dead) kept.push(b);
  }
  world.bullets = kept;
}

// ------------------------------------------------------------------ pickups

function updatePickups(world, dt) {
  const p = world.player;
  for (const pk of world.pickups) {
    if (!pk.active) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.active = true;
      continue;
    }
    const d = dist(p.x, p.y, pk.x, pk.y);
    if (d < 34) {
      if (pk.kind === 'health') p.health = Math.min(100, p.health + pk.amount);
      else p.armor = Math.min(100, p.armor + pk.amount);
      pk.active = false;
      pk.respawnT = PICKUP_RESPAWN_S;
      world.events.push('pickup');
    }
  }
}

// ------------------------------------------------------------------ wanted

function updateWanted(world, dt) {
  if (world.time - world.lastCrime > TUNING.HEAT_QUIET_S && world.heat > 0) {
    world.heat = Math.max(0, world.heat - TUNING.HEAT_DECAY * dt);
    updateStars(world);
  }
  spawnPolice(world);
}

// ------------------------------------------------------------------ missions

function failMission(world, reason) {
  const m = world.mission;
  if (m) m.failReason = reason;
  world.over = true;
  world.screen = 'failed';
  world.events.push('fail');
}

function completeMission(world) {
  const m = world.mission;
  const def = m.def;
  m.done = true;
  m.cooldownT = TUNING.MISSION_COOLDOWN_S;
  world.player.money += def.reward;
  // Mission complete heals the player.
  world.player.health = 100;
  const time = world.time - m.startedAt;
  world.runSummary.missionTimes[def.id] = time;
  world.summary = {
    id: def.id,
    name: def.name,
    time,
    par: def.par,
    cash: def.reward,
    beatPar: time <= def.par,
  };
  world.events.push('missionComplete');
}

function finishMission(world) {
  const next = world.missionIndex + 1;
  if (next >= MISSIONS.length) {
    // The Long Goodbye is done: the ending screen.
    let total = 0;
    for (const id of Object.keys(world.runSummary.missionTimes)) {
      total += world.runSummary.missionTimes[id];
    }
    world.runSummary.totalTime = world.runSummary.runStartIndex === 0 ? total : null;
    world.summary = null;
    world.screen = 'ending';
    world.over = true;
    return;
  }
  world.summary = null;
  startMission(world, next);
}

function advanceStep(world) {
  const m = world.mission;
  m.stepIndex += 1;
  if (m.stepIndex >= m.def.steps.length) {
    completeMission(world);
    return;
  }
  m.step = m.def.steps[m.stepIndex];
  enterStep(world);
}

function updateMission(world, dt) {
  const m = world.mission;
  if (!m || world.over) return;
  if (m.done) {
    m.cooldownT -= dt;
    if (m.cooldownT <= 0) finishMission(world);
    return;
  }
  const step = m.step;
  if (!step) return;
  const p = world.player;

  if (step.type === 'goto') {
    const place = missionPlace(step);
    if (place && dist(p.x, p.y, place.x, place.y) < TUNING.GOTO_RADIUS && (!step.needCar || p.car)) {
      advanceStep(world);
    }
  } else if (step.type === 'steal_car') {
    if (p.car) advanceStep(world);
  } else if (step.type === 'deliver') {
    const car = m.deliverCar;
    if (!car || car.wrecked) {
      if (!world.over) failMission(world, 'delivery car wrecked');
    } else if (p.car === car) {
      const dest = missionPlace(step);
      if (dest && dist(car.x, car.y, dest.x, dest.y) < TUNING.GOTO_RADIUS) advanceStep(world);
    }
  } else if (step.type === 'kill') {
    if (m.kills >= (step.count || 0)) advanceStep(world);
  } else if (step.type === 'hold') {
    const place = missionPlace(step);
    if (place && dist(p.x, p.y, place.x, place.y) < TUNING.HOLD_RADIUS) {
      if (!m.heatAdded) {
        m.heatAdded = true;
        addHeat(world, 40); // the robbery puts the heat on.
      }
      m.holdT += dt;
      if (m.holdT >= (step.seconds || 8)) advanceStep(world);
    } else {
      m.holdT = Math.max(0, m.holdT - dt * 2);
    }
  } else if (step.type === 'escape') {
    if (world.stars === 0) advanceStep(world);
  } else if (step.type === 'survive') {
    m.timer -= dt;
    if (m.timer <= 0) advanceStep(world);
  }
}

// ------------------------------------------------------------------ step

/**
 * Advance the world one fixed step. `input` is the shape input.js produces
 * (and the harnesses build by hand). A no-op once the world is over.
 */
export function stepWorld(world, dt, input) {
  if (world.over) return;
  // Keep the per-step event list fresh for the frame that reads it.
  world.events.length = 0;
  world.time += dt;

  updatePlayer(world, dt, input);

  for (const car of world.cars) {
    if (car.wrecked) continue;
    car.hitCd = Math.max(0, car.hitCd - dt);
    if (car.traffic) updateTrafficCar(world, car, dt);
    else if (car.police) updatePoliceCar(world, car, dt);
  }
  collideCars(world, dt);

  updateCops(world, dt);
  if (world.over) return;
  updateEnemies(world, dt);
  updatePeds(world, dt);
  updateBullets(world, dt);
  if (world.over) return;
  updatePickups(world, dt);
  updateWanted(world, dt);
  updateMission(world, dt);
}
