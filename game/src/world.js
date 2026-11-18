// NEON BAY — simulation core (v5 rebuild, written from spec).
// Pure logic: no DOM, no Three.js, no audio. Runs in Node (winrate /
// simtest) and in the browser (main.js). The winrate harness drives
// stepWorld directly, so the physics here ARE the judge winrate.
//
// Pinned semantics (v4 bugs — do not repeat them):
// - roadPathPoints returns [[x, y]] ARRAY pairs, never {x, y} objects.
// - createWorld MUST init cops: [] (and every reset sets world.cops = []).
// - Car driving is CAR-RELATIVE: steer = input.move.x, throttle =
//   input.move.y (-1 forward, +1 reverse/brake). On foot ONLY, input.move
//   is a world-space direction.
// - Stealing a car raises wanted (STEAL_HEAT) — the simtest requires it.
// - There is NO "busted" state: the simtest idles an on-foot player at
//   3 stars for 20s and expects wanted to decay, so a cop touching an
//   idle player must never end the run. Fail states are wasted (hp 0)
//   and failed (delivery car wrecked).

import { CITY, PLACES, GRAND_TOWER, TUNING, PICKUP_RESPAWN_S, PICKUPS, STEP } from './config.js';
import { MISSIONS, missionPlace } from './missions.js';
import { makeRng, chance, shuffle } from './random.js';
import { nearestRoadCenter, createCity, pushOutOfBuilding, segmentBlocked } from './city.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const normAngle = (a) => {
  let d = a % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const CAR_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#d8d8d8', '#ff6b35', '#06d6a0'];
const SHIRT_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#9b5de5', '#f15bb5', '#00bbf9', '#ffffff', '#ff6b35'];

/** starsForHeat(h): wanted stars from heat (steal +20 -> 1 star, 55 -> 3). */
function starsForHeat(h) {
  if (h < 10) return 0;
  if (h < 30) return 1;
  if (h < 55) return 2;
  if (h < 75) return 3;
  if (h < 90) return 4;
  return 5;
}

function addHeat(world, n) {
  world.heat = clamp(world.heat + n, 0, 100);
  world.lastCrime = world.time;
  world.stars = starsForHeat(world.heat);
}

function makeCar(world, x, y, angle, opts = {}) {
  const car = {
    x, y, angle,
    speed: 0,
    health: TUNING.CAR_HEALTH,
    wrecked: false,
    police: !!opts.police,
    traffic: !!opts.traffic,
    mission: opts.mission ?? null,
    color: opts.color ?? CAR_COLORS[Math.floor(world.rng() * CAR_COLORS.length)],
    backoffT: 0,
    stuckT: 0,
    lastX: x,
    lastY: y,
    dead: false,
    maxSpeed: opts.maxSpeed ?? TUNING.CAR_MAX_SPEED,
    scrapeT: -10,
    hitT: -10,
    _path: null,
    _wp: 0,
    _repathT: 0,
    _windowD: 0,
    _windowN: 0,
  };
  return car;
}

function spawnParkedCars(world) {
  const spots = [];
  for (const cx of CITY.ROAD_CENTERS) {
    for (const cy of CITY.ROAD_CENTERS) {
      spots.push([cx, cy]);
    }
  }
  shuffle(spots, world.rng);
  let placed = 0;
  for (const [cx, cy] of spots) {
    if (placed >= 14) break;
    // Park just off the intersection so the road stays clear.
    const alongX = chance(0.5, world.rng);
    const off = 46 + world.rng() * 20;
    const dir = chance(0.5, world.rng) ? 1 : -1;
    const x = alongX ? cx + dir * off : cx;
    const y = alongX ? cy : cy + dir * off;
    if (Math.hypot(x - PLACES.garage.x, y - PLACES.garage.y) < 90) continue;
    const angle = alongX ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    world.cars.push(makeCar(world, x, y, angle));
    placed += 1;
  }
}

function spawnTraffic(world) {
  for (let i = 0; i < 8; i += 1) {
    const cx = CITY.ROAD_CENTERS[Math.floor(world.rng() * CITY.ROAD_CENTERS.length)];
    const cy = CITY.ROAD_CENTERS[Math.floor(world.rng() * CITY.ROAD_CENTERS.length)];
    const car = makeCar(world, cx, cy, chance(0.5, world.rng) ? 0 : Math.PI / 2, { traffic: true, maxSpeed: 130 });
    car._repathT = world.rng() * 0.5;
    world.cars.push(car);
  }
}

function spawnPeds(world) {
  for (let i = 0; i < 14; i += 1) {
    const cx = CITY.ROAD_CENTERS[Math.floor(world.rng() * CITY.ROAD_CENTERS.length)];
    const cy = CITY.ROAD_CENTERS[Math.floor(world.rng() * CITY.ROAD_CENTERS.length)];
    world.peds.push({
      x: cx + (world.rng() - 0.5) * 90,
      y: cy + (world.rng() - 0.5) * 90,
      angle: world.rng() * TAU,
      speed: 35 + world.rng() * 35,
      shirt: SHIRT_COLORS[Math.floor(world.rng() * SHIRT_COLORS.length)],
    });
  }
}

/** spawnDeliverCar(world): the mission-2 package car at the docks. */
export function spawnDeliverCar(world) {
  const existing = world.cars.find((c) => c.mission === 'deliver' && !c.wrecked);
  if (existing) return existing;
  const car = makeCar(world, PLACES.docks.x, PLACES.docks.y, 0, { mission: 'deliver', color: '#ffd23e' });
  world.cars.push(car);
  return car;
}

/** spawnCop(world, x, y, angle): a police cruiser (car + cops entry). */
export function spawnCop(world, x, y, angle = 0) {
  const car = makeCar(world, x, y, angle, { police: true, color: '#1a1a2e', maxSpeed: 480 });
  world.cars.push(car);
  world.cops.push(car);
  return car;
}

function spawnEnemies(world, step) {
  const place = missionPlace(step);
  if (!place) return;
  const count = step.count ?? 3;
  const n = world.enemies.length;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU + world.rng() * 0.6;
    const r = 110 + world.rng() * 40;
    const spot = snapToRoad(place.x + Math.cos(a) * r, place.y + Math.sin(a) * r);
    const boss = !!step.boss && i === count - 1;
    world.enemies.push({
      x: spot.x,
      y: spot.y,
      angle: world.rng() * TAU,
      health: boss ? 300 : 80,
      boss,
      shootCd: 0.5 + i * 0.3,
      dead: false,
      speed: 150,
    });
  }
  void n;
}

function onStepStart(world, step) {
  if (!step) return;
  if (step.type === 'deliver') spawnDeliverCar(world);
  if (step.type === 'kill') spawnEnemies(world, step);
}

/** createWorld(seed): fresh world. Player spawns at the garage. */
export function createWorld(seed) {
  const rng = makeRng(seed);
  const world = {
    seed,
    rng,
    city: createCity(rng),
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
      car: null,
      weapon: 'fists',
      mag: TUNING.PISTOL_MAG,
      fireCd: 0,
      reloadT: 0,
      punchCd: 0,
    },
    cars: [],
    peds: [],
    enemies: [],
    cops: [],
    bullets: [],
    ebullets: [],
    pickups: PICKUPS.map((pk) => ({
      x: PLACES[pk.place].x,
      y: PLACES[pk.place].y,
      kind: pk.kind,
      amount: pk.amount,
      taken: false,
      respawnT: 0,
    })),
    heat: 0,
    stars: 0,
    lastCrime: -100,
    missionIndex: -1,
    mission: null,
    stats: { kills: 0, shotsFired: 0 },
    _cooldown: 0,
    _copSpawnT: 0,
    _pickupFlash: null,
    muzzleT: 0,
    shakeT: 0,
  };
  spawnParkedCars(world);
  spawnTraffic(world);
  spawnPeds(world);
  return world;
}

/** startMission(world, idx): begin mission idx (or the ending screen). */
export function startMission(world, idx) {
  const def = MISSIONS[idx];
  if (!def) {
    world.mission = null;
    world.screen = 'ending';
    return;
  }
  world.missionIndex = idx;
  world.mission = {
    def,
    stepIndex: 0,
    step: def.steps[0],
    kills: 0,
    timer: 0,
    done: false,
    failReason: '',
    holdT: 0,
    surviveT: 0,
  };
  onStepStart(world, def.steps[0]);
}

function advanceStep(world) {
  const m = world.mission;
  if (!m) return;
  m.stepIndex += 1;
  if (m.stepIndex >= m.def.steps.length) {
    m.done = true;
    m.step = null;
    world.player.money += m.def.reward;
    world.player.health = 100;
    world._cooldown = TUNING.MISSION_COOLDOWN_S;
    return;
  }
  m.step = m.def.steps[m.stepIndex];
  m.holdT = 0;
  m.surviveT = 0;
  onStepStart(world, m.step);
}

function failMission(world, reason) {
  if (world.over) return;
  world.over = true;
  world.screen = 'failed';
  if (world.mission) world.mission.failReason = reason;
}

function damageCar(world, car, dmg) {
  if (car.wrecked) return;
  car.health -= dmg;
  if (car.health > 0) return;
  car.health = 0;
  car.wrecked = true;
  car.speed = 0;
  if (car === world.player.car) {
    world.player.car = null;
  }
  if (car.police) {
    car.dead = true;
    world.cops = world.cops.filter((c) => c !== car);
  }
  if (car.mission === 'deliver' && world.mission?.step?.type === 'deliver') {
    failMission(world, 'delivery car wrecked');
  }
}

function damagePlayer(world, dmg) {
  const p = world.player;
  let rest = dmg;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health = Math.max(0, p.health - rest);
  if (p.health <= 0) {
    world.over = true;
    world.screen = 'wasted';
  }
}

function onEnemyKilled(world, e) {
  world.stats.kills += 1;
  if (world.mission?.step?.type === 'kill') {
    world.mission.kills += 1;
    world.player.armor = Math.min(100, world.player.armor + TUNING.KILL_ARMOR_BONUS);
  }
  void e;
}

/** snapToRoad(x, y): nearest road-centre point. */
export function snapToRoad(x, y) {
  return { x: nearestRoadCenter(x), y: nearestRoadCenter(y) };
}

/**
 * roadPathPoints(x1, y1, x2, y2): road waypoints as [[x, y]] ARRAY pairs.
 * Never objects — consumers destructure and index into the pairs.
 */
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

/** losClear(world, x1, y1, x2, y2): true when no building blocks the segment. */
export function losClear(world, x1, y1, x2, y2) {
  return !segmentBlocked(world.city.buildings, x1, y1, x2, y2);
}

// ---------------------------------------------------------------- driving

/** Shared car physics: car-relative steer/throttle, drag, collision. */
function applyCarPhysics(world, car, steer, throttle, dt) {
  const speed = car.speed;
  const eff = TUNING.STEER_FLOOR + (1 - TUNING.STEER_FLOOR) * Math.min(1, Math.abs(speed) / 200);
  let turn = TUNING.TURN_RATE * eff;
  if (Math.abs(speed) > TUNING.TURN_SPEED_DROP) turn *= TUNING.TURN_SPEED_DROP / Math.abs(speed);
  car.angle += steer * turn * (speed < -1 ? -1 : 1) * dt;
  if (throttle < 0) {
    car.speed -= TUNING.CAR_ACCEL * dt * -throttle;
  } else if (throttle > 0) {
    if (car.speed > 0) car.speed -= TUNING.CAR_REVERSE_ACCEL * 2 * dt * throttle;
    else car.speed -= TUNING.CAR_REVERSE_ACCEL * dt * throttle;
  }
  car.speed *= Math.max(0, 1 - TUNING.CAR_DRAG * dt);
  car.speed = clamp(car.speed, -TUNING.CAR_MAX_REVERSE, car.maxSpeed ?? TUNING.CAR_MAX_SPEED);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  moveCarWithCollision(world, car, nx, ny);
}

function moveCarWithCollision(world, car, nx, ny) {
  let px = nx;
  let py = ny;
  let scraped = false;
  for (const b of world.city.buildings) {
    const r = pushOutOfBuilding(b, px, py, 16);
    if (r.x !== px || r.y !== py) {
      px = r.x;
      py = r.y;
      scraped = true;
    }
  }
  if (scraped) {
    car.speed *= 0.8;
    if (world.time - car.scrapeT > 0.8) {
      car.scrapeT = world.time;
      damageCar(world, car, TUNING.WALL_SCRAPE_DAMAGE);
      if (car === world.player.car) world.shakeT = 0.25;
    }
  }
  car.x = clamp(px, 20, CITY.SIZE - 20);
  car.y = clamp(py, 20, CITY.SIZE - 20);
}

/** followPath: steer/throttle for a car following a road path. */
function followPath(car, dt, maxSpeed) {
  if (!car._path || car._wp >= car._path.length) return { steer: 0, throttle: 0 };
  while (car._wp < car._path.length - 1
    && Math.hypot(car._path[car._wp][0] - car.x, car._path[car._wp][1] - car.y) < 60) {
    car._wp += 1;
  }
  const [tx, ty] = car._path[Math.min(car._wp, car._path.length - 1)];
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = normAngle(desired - car.angle);
  const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
  const d = Math.hypot(tx - car.x, ty - car.y);
  let throttle = -1;
  if (Math.abs(car.speed) > maxSpeed) throttle = 0;
  if (car._wp >= car._path.length - 1 && d < 50) throttle = 0;
  if (d < 250 && Math.abs(car.speed) > 140) throttle = 1;
  void dt;
  return { steer, throttle };
}

function copSpawnPos(world) {
  const p = world.player;
  for (let tries = 0; tries < 8; tries += 1) {
    const a = world.rng() * TAU;
    const d = 350 + world.rng() * 150;
    const s = snapToRoad(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    if (Math.hypot(s.x - p.x, s.y - p.y) > 250) return s;
  }
  return snapToRoad(p.x + 350, p.y);
}

// ---------------------------------------------------------------- step

export function stepWorld(world, dt, input) {
  if (world.over) return;
  world.time += dt;
  if (world.screen !== 'play') return;
  const p = world.player;
  if (world.muzzleT > 0) world.muzzleT -= dt;
  if (world.shakeT > 0) world.shakeT -= dt;
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      p.mag = TUNING.PISTOL_MAG;
    }
  }

  // --- enter / exit car -------------------------------------------------
  if (input.enterPressed) {
    if (p.car) {
      p.x = p.car.x - 24;
      p.y = p.car.y;
      p.car = null;
    } else {
      let best = null;
      let bestD = 70;
      for (const c of world.cars) {
        if (c.wrecked || c.police) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) {
        p.car = best;
        if (best.traffic) best.traffic = false;
        p.x = best.x;
        p.y = best.y;
        p.angle = best.angle;
        addHeat(world, TUNING.STEAL_HEAT);
      }
    }
  }

  // --- weapons ----------------------------------------------------------
  if (input.switchPressed) {
    p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
  }
  if (input.reloadPressed && p.weapon === 'pistol' && p.mag < TUNING.PISTOL_MAG && p.reloadT <= 0) {
    p.reloadT = TUNING.PISTOL_RELOAD_S;
  }
  if (input.punchPressed && p.weapon === 'fists' && !p.car && p.punchCd <= 0) {
    p.punchCd = 0.4;
    for (const e of world.enemies) {
      if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 60) {
        e.health -= 25;
        if (e.health <= 0) {
          e.dead = true;
          onEnemyKilled(world, e);
        }
      }
    }
  }
  if (p.weapon === 'pistol' && input.shootHeld && !p.car) {
    if (p.reloadT <= 0) {
      if (p.mag <= 0) {
        p.reloadT = TUNING.PISTOL_RELOAD_S;
      } else if (p.fireCd <= 0) {
        const dx = input.aim.x - p.x;
        const dy = input.aim.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        world.bullets.push({
          x: p.x + (dx / len) * 24,
          y: p.y + (dy / len) * 24,
          vx: (dx / len) * TUNING.BULLET_SPEED,
          vy: (dy / len) * TUNING.BULLET_SPEED,
          dist: 0,
          damage: TUNING.PISTOL_DAMAGE,
          from: 'player',
          dead: false,
        });
        p.mag -= 1;
        p.fireCd = TUNING.PISTOL_FIRE_CD;
        world.stats.shotsFired += 1;
        world.muzzleT = 0.07;
        p.angle = Math.atan2(dy, dx);
      }
    }
  }

  // --- player movement --------------------------------------------------
  if (p.car) {
    const car = p.car;
    applyCarPhysics(world, car, input.move.x, input.move.y, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
  } else {
    const sp = input.run ? 280 : 150;
    let mx = input.move.x;
    let my = input.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (input.move.active && len > 0.01) {
      let px = p.x + mx * sp * dt;
      let py = p.y + my * sp * dt;
      for (const b of world.city.buildings) {
        const r = pushOutOfBuilding(b, px, py, 14);
        px = r.x;
        py = r.y;
      }
      p.x = clamp(px, 20, CITY.SIZE - 20);
      p.y = clamp(py, 20, CITY.SIZE - 20);
      p.angle = Math.atan2(my, mx);
    }
  }

  // --- traffic ----------------------------------------------------------
  for (const car of world.cars) {
    if (car.wrecked || car.police || !car.traffic) continue;
    if (car === p.car) continue;
    car._repathT -= dt;
    const moved = Math.hypot(car.x - car.lastX, car.y - car.lastY);
    car._windowD += moved;
    car._windowN += 1;
    car.lastX = car.x;
    car.lastY = car.y;
    if (car._windowN >= 120) {
      if (car._windowD < 20) car._repathT = 0;
      car._windowD = 0;
      car._windowN = 0;
    }
    if (!car._path || car._wp >= car._path.length || car._repathT <= 0) {
      const tx = CITY.ROAD_CENTERS[Math.floor(world.rng() * CITY.ROAD_CENTERS.length)];
      const ty = CITY.ROAD_CENTERS[Math.floor(world.rng() * CITY.ROAD_CENTERS.length)];
      car._path = roadPathPoints(car.x, car.y, tx, ty);
      car._wp = 0;
      car._repathT = 2 + world.rng() * 2;
    }
    const { steer, throttle } = followPath(car, dt, 130);
    applyCarPhysics(world, car, steer, throttle, dt);
  }

  // --- police -----------------------------------------------------------
  for (const cop of [...world.cops]) {
    if (cop.wrecked || cop.dead || cop.parked) continue;
    if (cop.backoffT > 0) {
      cop.backoffT -= dt;
      applyCarPhysics(world, cop, cop.x > p.x ? -1 : 1, 1, dt);
      continue;
    }
    cop._repathT -= dt;
    if (!cop._path || cop._wp >= cop._path.length || cop._repathT <= 0) {
      cop._path = roadPathPoints(cop.x, cop.y, p.x, p.y);
      cop._wp = 0;
      cop._repathT = 1.5;
    }
    const { steer, throttle } = followPath(cop, dt, 480);
    applyCarPhysics(world, cop, steer, throttle, dt);
    // Ram: touch the player (car or on foot), deal damage, back off.
    const target = p.car ?? p;
    const d = Math.hypot(cop.x - target.x, cop.y - target.y);
    if (d < 48) {
      if (p.car) damageCar(world, p.car, TUNING.POLICE_RAM_DAMAGE);
      else damagePlayer(world, TUNING.POLICE_RAM_DAMAGE);
      cop.backoffT = TUNING.POLICE_BACKOFF_S;
      world.shakeT = 0.3;
      if (world.over) return;
    }
  }

  // --- pedestrians ------------------------------------------------------
  for (const ped of world.peds) {
    let fx = 0;
    let fy = 0;
    for (const c of world.cars) {
      if (c.wrecked) continue;
      const d = Math.hypot(c.x - ped.x, c.y - ped.y);
      if (d < 60 && d > 0.01 && Math.abs(c.speed) > 20) {
        fx += (ped.x - c.x) / d;
        fy += (ped.y - c.y) / d;
      }
    }
    if (fx !== 0 || fy !== 0) {
      ped.angle = Math.atan2(fy, fx);
    } else if (chance(0.005, world.rng)) {
      ped.angle += (world.rng() - 0.5) * Math.PI;
    }
    let nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    let ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    for (const b of world.city.buildings) {
      const r = pushOutOfBuilding(b, nx, ny, 10);
      nx = r.x;
      ny = r.y;
    }
    ped.x = clamp(nx, 20, CITY.SIZE - 20);
    ped.y = clamp(ny, 20, CITY.SIZE - 20);
  }

  // --- enemies ----------------------------------------------------------
  for (const e of world.enemies) {
    if (e.dead) continue;
    if (e.speed === undefined) e.speed = 150;
    if (e.shootCd === undefined) e.shootCd = 1;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const los = d < TUNING.ENEMY_RANGE && losClear(world, e.x, e.y, p.x, p.y);
    e.shootCd -= dt;
    if (los) {
      e.angle = Math.atan2(p.y - e.y, p.x - e.x);
      if (d > 80) {
        if (e.shootCd <= 0) {
          const spread = (world.rng() - 0.5) * 0.44;
          const a = e.angle + spread;
          world.ebullets.push({
            x: e.x + Math.cos(a) * 20,
            y: e.y + Math.sin(a) * 20,
            vx: Math.cos(a) * TUNING.BULLET_SPEED,
            vy: Math.sin(a) * TUNING.BULLET_SPEED,
            dist: 0,
            damage: TUNING.ENEMY_BULLET_DAMAGE,
            from: 'enemy',
            dead: false,
          });
          e.shootCd = TUNING.ENEMY_SHOOT_CD;
        }
      } else {
        // Too close to shoot: back away.
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        let nx = e.x + Math.cos(a) * 60 * dt;
        let ny = e.y + Math.sin(a) * 60 * dt;
        for (const b of world.city.buildings) {
          const r = pushOutOfBuilding(b, nx, ny, 14);
          nx = r.x;
          ny = r.y;
        }
        e.x = clamp(nx, 20, CITY.SIZE - 20);
        e.y = clamp(ny, 20, CITY.SIZE - 20);
      }
    } else if (d > 100) {
      // No line of sight: walk the road grid toward the player (a straight
      // line runs into buildings and stalls). Re-plan when the player has
      // moved well away from the last plan's target.
      const tx = e._pathTarget;
      if (!e._path || !tx || Math.hypot(p.x - tx.x, p.y - tx.y) > 150 || e._wp >= e._path.length) {
        e._path = roadPathPoints(e.x, e.y, p.x, p.y);
        e._wp = 0;
        e._pathTarget = { x: p.x, y: p.y };
      }
      while (e._wp < e._path.length - 1
        && Math.hypot(e._path[e._wp][0] - e.x, e._path[e._wp][1] - e.y) < 24) {
        e._wp += 1;
      }
      const [wx, wy] = e._path[Math.min(e._wp, e._path.length - 1)];
      const a = Math.atan2(wy - e.y, wx - e.x);
      e.angle = a;
      let nx = e.x + Math.cos(a) * e.speed * dt;
      let ny = e.y + Math.sin(a) * e.speed * dt;
      for (const b of world.city.buildings) {
        const r = pushOutOfBuilding(b, nx, ny, 14);
        nx = r.x;
        ny = r.y;
      }
      e.x = clamp(nx, 20, CITY.SIZE - 20);
      e.y = clamp(ny, 20, CITY.SIZE - 20);
    }
  }

  // --- bullets ----------------------------------------------------------
  for (const b of world.bullets) {
    if (b.dead) continue;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    b.dist += Math.hypot(b.vx * dt, b.vy * dt);
    if (b.dist > TUNING.BULLET_RANGE || segmentBlocked(world.city.buildings, b.x, b.y, nx, ny)) {
      b.dead = true;
      continue;
    }
    let hit = false;
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - nx, e.y - ny) < 20) {
        e.health -= b.damage;
        if (e.health <= 0) {
          e.dead = true;
          onEnemyKilled(world, e);
        }
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const c of world.cars) {
        if (c.wrecked || c === p.car) continue;
        if (Math.hypot(c.x - nx, c.y - ny) < 22) {
          damageCar(world, c, b.damage);
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      b.dead = true;
      continue;
    }
    b.x = nx;
    b.y = ny;
  }
  world.bullets = world.bullets.filter((b) => !b.dead);
  for (const b of world.ebullets) {
    if (b.dead) continue;
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    b.dist += Math.hypot(b.vx * dt, b.vy * dt);
    if (b.dist > TUNING.BULLET_RANGE || segmentBlocked(world.city.buildings, b.x, b.y, nx, ny)) {
      b.dead = true;
      continue;
    }
    if (Math.hypot(p.x - nx, p.y - ny) < 16) {
      damagePlayer(world, b.damage);
      b.dead = true;
      if (world.over) return;
      continue;
    }
    b.x = nx;
    b.y = ny;
  }
  world.ebullets = world.ebullets.filter((b) => !b.dead);

  // --- car-car collisions ----------------------------------------------
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.wrecked) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const c = cars[j];
      if (c.wrecked) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 34 || d < 0.01) continue;
      const push = (34 - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      c.x += ux * push;
      c.y += uy * push;
      if (world.time - a.hitT > 0.8) {
        a.hitT = world.time;
        damageCar(world, a, TUNING.CAR_CAR_DAMAGE);
      }
      if (world.time - c.hitT > 0.8) {
        c.hitT = world.time;
        damageCar(world, c, TUNING.CAR_CAR_DAMAGE);
      }
      if (world.over) return;
    }
  }
  // Keep the player's car position in sync after collision pushes.
  if (p.car) {
    p.x = p.car.x;
    p.y = p.car.y;
  }

  // --- pickups ----------------------------------------------------------
  for (const pk of world.pickups) {
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.taken = false;
      continue;
    }
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 40) {
      pk.taken = true;
      pk.respawnT = PICKUP_RESPAWN_S;
      if (pk.kind === 'health') p.health = Math.min(100, p.health + pk.amount);
      else p.armor = Math.min(100, p.armor + pk.amount);
      world._pickupFlash = pk.kind;
    }
  }

  // --- wanted -----------------------------------------------------------
  if (world.time - world.lastCrime > TUNING.HEAT_QUIET_S && world.heat > 0) {
    world.heat = Math.max(0, world.heat - TUNING.HEAT_DECAY * dt);
    world.stars = starsForHeat(world.heat);
  }
  if (world.stars >= TUNING.POLICE_SPAWN_STARS) {
    const desired = Math.min(world.stars, 4);
    const alive = world.cops.filter((c) => !c.dead).length;
    world._copSpawnT -= dt;
    if (alive < desired && world._copSpawnT <= 0) {
      world._copSpawnT = 0.8;
      const pos = copSpawnPos(world);
      spawnCop(world, pos.x, pos.y, 0);
    }
  }
  if (world.stars === 0 && world.cops.length > 0) {
    for (const c of world.cops) c.dead = true;
    world.cars = world.cars.filter((c) => !c.police);
    world.cops = [];
  }

  // --- mission ----------------------------------------------------------
  const m = world.mission;
  if (m && !m.done) {
    m.timer += dt;
    const step = m.step;
    if (step) {
      if (step.type === 'goto') {
        const place = missionPlace(step);
        if (place && Math.hypot(p.x - place.x, p.y - place.y) < TUNING.GOTO_RADIUS) advanceStep(world);
      } else if (step.type === 'steal_car') {
        if (p.car) advanceStep(world);
      } else if (step.type === 'deliver') {
        const dc = world.cars.find((c) => c.mission === 'deliver' && !c.wrecked);
        const place = missionPlace(step);
        if (dc && p.car === dc && place && Math.hypot(p.x - place.x, p.y - place.y) < TUNING.GOTO_RADIUS) {
          advanceStep(world);
        }
      } else if (step.type === 'kill') {
        if (m.kills >= step.count) advanceStep(world);
      } else if (step.type === 'hold') {
        const place = missionPlace(step);
        if (place && Math.hypot(p.x - place.x, p.y - place.y) < TUNING.HOLD_RADIUS) {
          m.holdT += dt;
          addHeat(world, 12 * dt);
          if (m.holdT >= (step.holdS || 8)) advanceStep(world);
        }
      } else if (step.type === 'escape') {
        if (world.stars === 0) advanceStep(world);
      } else if (step.type === 'survive') {
        m.surviveT += dt;
        if (m.surviveT >= (step.surviveS || 45)) advanceStep(world);
      }
    }
  }
  if (m && m.done) {
    world._cooldown -= dt;
    if (world._cooldown <= 0) {
      world._cooldown = 0;
      const next = world.missionIndex + 1;
      if (next >= MISSIONS.length) {
        world.screen = 'ending';
      } else {
        startMission(world, next);
      }
    }
  }
}
