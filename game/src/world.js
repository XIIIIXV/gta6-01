// world.js — NEON BAY game logic (v8 rebuild).
// Frozen semantics from the v8 spec. Car driving is CAR-RELATIVE; on foot,
// input.move IS a world-space direction. roadPathPoints returns [x, y] ARRAY
// pairs (never objects). createWorld always initialises cops: [].
// v7 fix: wreckCar() fails a mission ONLY while mission 2's deliver step is
// live; completeMission() clears the deliver flag.

import { CITY, PLACES, TUNING, PICKUP_RESPAWN_S, PICKUPS, STEP, TRIAL_ROUTE, FEED_HANDLES } from './config.js';
import { MISSIONS, missionPlace, fmtTime } from './missions.js';
import { makeRng } from './random.js';
import { nearestRoadCenter, isOnRoad, createCity, pushOutOfBuilding, segmentBlocked } from './city.js';

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const CAR_COLORS = ['#4a90d9', '#f5c542', '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c', '#ecf0f1', '#e63946'];

export function snapToRoad(x, y) {
  const nx = nearestRoadCenter(x);
  const ny = nearestRoadCenter(y);
  if (Math.abs(x - nx) <= Math.abs(y - ny)) return { x: nx, y };
  return { x, y: ny };
}

// Pinned algorithm (from the working v3 code). Returns [x, y] ARRAY pairs.
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

export function losClear(world, x1, y1, x2, y2) {
  return !segmentBlocked(world.city.buildings, x1, y1, x2, y2);
}

function makeCar(x, y, angle, color, traffic) {
  return {
    x, y, angle, speed: 0,
    health: TUNING.CAR_HEALTH, wrecked: false, dead: false,
    police: false, traffic: !!traffic, mission: false,
    color, backoffT: 0, stuckT: 0, lastX: x, lastY: y,
    hitCd: 0, scrapeCd: 0, target: null,
    // Round 6: z is the visual jump height (stunt jumps), airT the remaining
    // air time; swat marks a SWAT van (6 stars).
    z: 0, airT: 0, airT0: 0, airPeak: 0, swat: false,
  };
}

// NEONFEED — the GTA 6-style social feed. Newest first, capped at 6 posts.
export function postFeed(world, text) {
  const author = FEED_HANDLES[Math.floor(world.rng() * FEED_HANDLES.length)];
  world.feed.unshift({
    author,
    text,
    t: world.time,
    likes: 3 + Math.floor(world.rng() * 200),
  });
  if (world.feed.length > 6) world.feed.length = 6;
  world.feedFlash = 3;
}

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
    failReason: null,
    gameComplete: false,
    missionIndex: -1,
    mission: null,
    missionCooldown: 0,
    heat: 0,
    stars: 0,
    lastHeatGain: -100,
    deliverActive: false,
    stats: { kills: 0, shotsFired: 0 },
    cops: [],
    cars: [],
    peds: [],
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    shake: 0,
    muzzleT: 0,
    hornT: 0,
    pickups: [],
    // Round 6: police helicopter units, NEONFEED posts, time-trial state,
    // hiding timer, previous wanted level (for feed posts), stunt flash.
    helis: [],
    feed: [],
    feedFlash: 0,
    trial: null,
    hiddenT: 0,
    _prevStars: 0,
    stuntFlash: null,
    phoneOpen: false,
    player: {
      // The player starts at their garage (mission 1's first stop): the
      // opening goto completes on arrival and the garage car is right there.
      x: PLACES.garage.x, y: PLACES.garage.y, angle: -Math.PI / 2,
      health: 100, armor: 0, money: 0,
      car: null, weapon: 'pistol', ammo: 12, mag: 12,
      fireCd: 0, reloadT: 0, walking: false,
    },
    _prevEnter: false,
    _prevPunch: false,
    _prevReload: false,
    _prevSwitch: false,
    _prevTrial: false,
    _copSpawnT: 0,
    _swatSpawnT: 0,
    _bustedT: 0,
  };

  // Parked cars near the places (offset 60 from the road centre so passing
  // traffic, which follows the centre line, never rams them).
  const parked = [
    { place: 'garage', color: '#e63946' },
    { place: 'safehouse', color: '#4a90d9' },
    { place: 'docks', color: '#f5c542' },
    { place: 'club', color: '#9b59b6' },
    { place: 'warehouse', color: '#2ecc71' },
    { place: 'bank', color: '#e67e22' },
    { place: 'plaza', color: '#1abc9c' },
    { place: 'airport', color: '#ecf0f1' },
  ];
  for (const pk of parked) {
    const pl = PLACES[pk.place];
    const pc = makeCar(pl.x + 60, pl.y, rng() * Math.PI * 2, pk.color, false);
    pc.isPlaceCar = true;
    world.cars.push(pc);
  }

  // Ambient traffic on the roads.
  for (let i = 0; i < 8; i++) {
    const rc = CITY.ROAD_CENTERS[Math.floor(rng() * CITY.ROAD_CENTERS.length)];
    const along = 100 + rng() * 1600;
    const vertical = rng() < 0.5;
    const x = vertical ? rc : along;
    const y = vertical ? along : rc;
    const angle = vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    world.cars.push(makeCar(x, y, angle, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], true));
  }

  // Pedestrians on the sidewalks.
  const shirts = [
    { weight: 3, value: '#e8e8e8' },
    { weight: 2, value: '#e63946' },
    { weight: 2, value: '#4a90d9' },
    { weight: 1, value: '#f5c542' },
    { weight: 1, value: '#2ecc71' },
    { weight: 1, value: '#ff9ad5' },
  ];
  for (let i = 0; i < 14; i++) {
    const rc = CITY.ROAD_CENTERS[Math.floor(rng() * CITY.ROAD_CENTERS.length)];
    const along = 100 + rng() * 1600;
    const vertical = rng() < 0.5;
    const off = (rng() < 0.5 ? 1 : -1) * (78 + rng() * 12);
    let total = 0;
    for (const s of shirts) total += s.weight;
    let r = rng() * total;
    let shirt = shirts[0].value;
    for (const s of shirts) {
      r -= s.weight;
      if (r <= 0) { shirt = s.value; break; }
    }
    world.peds.push({
      x: vertical ? rc + off : along,
      y: vertical ? along : rc + off,
      angle: rng() * Math.PI * 2,
      shirt,
      dirT: rng() * 4,
      walking: true,
      walkPhase: rng() * 6,
    });
  }

  for (const pk of PICKUPS) {
    const pl = PLACES[pk.place];
    world.pickups.push({ kind: pk.kind, x: pl.x, y: pl.y, amount: pk.amount, active: true, respawnT: 0 });
  }
  return world;
}

function spawnEnemies(world, step) {
  const place = missionPlace(step);
  const p = world.player;
  const cx = place ? place.x : p.x;
  const cy = place ? place.y : p.y;
  const n = step.kills || 2;
  for (let i = 0; i < n; i++) {
    const a = world.rng() * Math.PI * 2;
    const d = 60 + world.rng() * 110;
    let x = cx + Math.cos(a) * d;
    let y = cy + Math.sin(a) * d;
    x = clamp(x, 40, CITY.SIZE - 40);
    y = clamp(y, 40, CITY.SIZE - 40);
    for (const b of world.city.buildings) {
      const fixed = pushOutOfBuilding(b, x, y, 20);
      if (fixed) { x = fixed.x; y = fixed.y; }
    }
    // Start on a road (see updateEnemies): an enemy spawned in a block
    // interior can never be reached by the road-following walker.
    if (!isOnRoad(x, y)) {
      const s = snapToRoad(x, y);
      x = s.x;
      y = s.y;
    }
    const boss = !!(step.boss && i === n - 1);
    world.enemies.push({
      x, y, angle: world.rng() * Math.PI * 2,
      // 40 HP = one pistol hit (40 dmg); the M5 kill step has 7 enforcers
      // and the autopilot's hit rate is throttled by buildings breaking
      // line of sight, so at 100 HP (3 hits) the player dies before
      // clearing them. Boss 120 = three hits.
      health: boss ? 120 : 40, alive: true, dead: false, boss,
      shootCd: 0.6 + world.rng() * 0.8,
      walking: false, walkPhase: world.rng() * 6,
      shirt: boss ? '#ff2e2e' : '#c0392b',
    });
  }
}

function setupStep(world) {
  const m = world.mission;
  const step = m.step;
  m.holdT = 0;
  m.surviveT = 0;
  if (step.type === 'kill') {
    spawnEnemies(world, step);
  } else if (step.type === 'survive') {
    spawnEnemies(world, { kills: 2, place: null });
  } else if (step.type === 'deliver') {
    world.deliverActive = true;
    // The harness finds the delivery car by c.mission === 'deliver'.
    // Mark the car the player is in; if on foot, the nearest parked car.
    let car = world.player.car;
    if (!car) {
      let bd = Infinity;
      for (const c of world.cars) {
        if (c.wrecked || c.police || c.traffic) continue;
        const d = Math.hypot(c.x - world.player.x, c.y - world.player.y);
        if (d < bd) { bd = d; car = c; }
      }
    }
    if (car) car.mission = 'deliver';
  }
}

export function startMission(world, idx) {
  const def = MISSIONS[idx];
  if (!def) return;
  world.missionIndex = idx;
  world.mission = {
    def, stepIndex: 0, step: def.steps[0],
    kills: 0, timer: 0, done: false, failReason: null,
    holdT: 0, surviveT: 0,
  };
  world.screen = 'play';
  world.over = false;
  world.failReason = null;
  world.deliverActive = false;
  setupStep(world);
}

function advanceStep(world) {
  const m = world.mission;
  if (m.step && m.step.type === 'deliver') {
    world.deliverActive = false;
    for (const c of world.cars) {
      if (c.mission === 'deliver') c.mission = false;
    }
  }
  m.stepIndex++;
  m.kills = 0;
  if (m.stepIndex >= m.def.steps.length) {
    completeMission(world);
    return;
  }
  m.step = m.def.steps[m.stepIndex];
  setupStep(world);
}

export function completeMission(world) {
  const m = world.mission;
  if (!m) return;
  m.done = true;
  world.deliverActive = false;
  world.player.money += m.def.reward;
  world.player.health = 100;
  world.missionCooldown = TUNING.MISSION_COOLDOWN_S;
  postFeed(world, m.def.name + ' — done. Whoever pulled that off is a legend.');
  if (world.missionIndex >= MISSIONS.length - 1) {
    world.gameComplete = true;
    world.screen = 'ending';
  }
}

function failMission(world, reason) {
  const m = world.mission;
  if (m) {
    m.failReason = reason;
    m.done = false;
  }
  world.over = true;
  world.failReason = reason;
}

export function wreckCar(world, car) {
  if (!car || car.wrecked) return;
  car.wrecked = true;
  car.dead = true;
  car.speed = 0;
  if (world.player.car === car) {
    world.player.car = null;
    // v7 fix: only the live deliver step fails on a wrecked delivery car.
    if (world.deliverActive) failMission(world, 'delivery car wrecked');
  }
}

function addHeat(world, n) {
  world.heat = Math.min(TUNING.HEAT_CAP, world.heat + n);
  world.lastHeatGain = world.time;
}

function damagePlayer(world, dmg) {
  const p = world.player;
  const absorbed = Math.min(p.armor, dmg);
  p.armor -= absorbed;
  p.health -= (dmg - absorbed);
  if (p.health <= 0) {
    p.health = 0;
    world.over = true;
    world.failReason = 'wasted';
    if (world.mission) world.mission.failReason = 'wasted';
  }
}

function damageCar(world, car, dmg) {
  if (!car || car.wrecked) return;
  // A place car sitting parked (not the hero car) is indestructible: it is
  // a stealable spare, and ambient bumps (traffic, the hero car passing)
  // must never grind it to scrap — otherwise stealNearestParked eventually
  // finds nothing stealable and the player is stranded on foot (m4 softlock).
  // Once the hero steals it (it IS the hero car) it takes damage normally.
  if (car.isPlaceCar && car !== world.player.car) return;
  car.health -= dmg;
  if (car.health <= 0) {
    car.health = 0;
    wreckCar(world, car);
  }
}

function damageEnemy(world, e, dmg) {
  if (e.dead) return;
  e.health -= dmg;
  if (e.health <= 0) {
    e.alive = false;
    e.dead = true;
    if (world.mission) world.mission.kills++;
    world.stats.kills++;
    const p = world.player;
    p.armor = Math.min(100, p.armor + TUNING.KILL_ARMOR_BONUS);
  }
}

function collideCarWithCity(world, car) {
  let scraped = false;
  let nx = 0;
  let ny = 0;
  // Collision radius 20 (not the car's 26 half-length): a car driving
  // parallel to a wall presents its 13-unit half-width, so a 26-unit circle
  // grazes buildings that sit 10 units off the road edge and the 0.7x
  // scrape slowdown caps the car at ~12 u/s — below the driver's 33 u/s
  // progress threshold, so it reverses forever (m4 goto softlock).
  for (const b of world.city.buildings) {
    const fixed = pushOutOfBuilding(b, car.x, car.y, 20);
    if (fixed) {
      // Push normal (from the building to the car) for the slide below.
      const px = fixed.x - car.x;
      const py = fixed.y - car.y;
      const pl = Math.hypot(px, py);
      if (pl > 0.01) { nx = px / pl; ny = py / pl; }
      car.x = fixed.x;
      car.y = fixed.y;
      scraped = true;
    }
  }
  if (car.x < 20 || car.x > CITY.SIZE - 20 || car.y < 20 || car.y > CITY.SIZE - 20) {
    car.x = clamp(car.x, 20, CITY.SIZE - 20);
    car.y = clamp(car.y, 20, CITY.SIZE - 20);
    scraped = true;
  }
  if (scraped) {
    car.speed *= 0.7;
    // Slide along the wall instead of grinding into it: when the car's
    // forward points INTO the wall (dot < 0), deflect the heading to the
    // tangent that leads toward the nearest road centre. Without this the
    // car sits in a building corner pocket — the driver keeps steering at
    // the waypoint, the car is pushed back every tick, and the run
    // soft-locks (m4 goto). The deflection un-wedges it in one frame.
    if (nx !== 0 || ny !== 0) {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      if (fx * nx + fy * ny < 0) {
        const ncx = nearestRoadCenter(car.x);
        const ncy = nearestRoadCenter(car.y);
        const vx = ncx - car.x;
        const vy = ncy - car.y;
        const t1x = -ny;
        const t1y = nx;
        const t2x = ny;
        const t2y = -nx;
        const d1 = vx * t1x + vy * t1y;
        const d2 = vx * t2x + vy * t2y;
        const t = d1 >= d2 ? [t1x, t1y] : [t2x, t2y];
        car.angle = Math.atan2(t[1], t[0]);
      }
    }
    // A slow scrape (wedged / parking nudge) does no damage — only a fast
    // scrape does. Without this a car wedged against a building bleeds out
    // 2 HP / 0.5s while barely moving and the M2 deliver car wrecks.
    if (car.scrapeCd <= 0 && Math.abs(car.speed) > 60) {
      car.scrapeCd = 0.5;
      damageCar(world, car, TUNING.WALL_SCRAPE_DAMAGE);
      if (car === world.player.car) world.shake = Math.max(world.shake, 12);
    }
  }
}

function updateCarPlayer(world, dt, move, input) {
  const p = world.player;
  const car = p.car;
  const steer = clamp(move.x, -1, 1);
  const throttle = clamp(move.y, -1, 1);
  const spd = car.speed;
  const authority = Math.max(0, 1 - 0.35 * Math.abs(spd) / TUNING.CAR_MAX_SPEED);
  const turn = TUNING.TURN_RATE * steer * clamp(Math.abs(spd) / 80, 0, 1) * authority * (spd < 0 ? -1 : 1);
  car.angle += turn * dt;
  if (throttle < 0) {
    car.speed += -throttle * TUNING.CAR_ACCEL * dt;
  } else if (throttle > 0) {
    if (car.speed > 0) car.speed -= throttle * TUNING.CAR_REVERSE_ACCEL * 2.5 * dt;
    else car.speed -= throttle * TUNING.CAR_REVERSE_ACCEL * dt;
  } else {
    car.speed -= car.speed * TUNING.CAR_DRAG * dt;
  }
  if (Math.abs(steer) > 0.5 && car.speed > 240) {
    car.speed -= (car.speed - 240) * 1.2 * dt;
  }
  car.speed = clamp(car.speed, -TUNING.CAR_MAX_REVERSE, TUNING.CAR_MAX_SPEED);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.walking = false;
  collideCarWithCity(world, car);
  if (input.hornPressed) world.hornT = 0.2;
  if (throttle < -0.5 && Math.abs(car.speed) > 200 && world.rng() < 0.25) {
    spawnPuff(world, car.x - Math.cos(car.angle) * 26, car.y - Math.sin(car.angle) * 26);
  }
  // Stunt jumps (round 6): a fast car hitting a ramp goes airborne. The z
  // arc is visual only — ground movement and steering are untouched, so the
  // autopilot (and the winrate) never notice a jump except for the cash.
  if (car.airT > 0) {
    car.airT -= dt;
    const u = 1 - Math.max(0, car.airT) / car.airT0;
    car.z = 4 * car.airPeak * u * (1 - u);
    if (car.airT <= 0) {
      car.z = 0;
      const reward = TUNING.STUNT_REWARD_BASE + Math.round(car.airT0 * TUNING.STUNT_REWARD_PER_S);
      world.player.money += reward;
      world.stuntFlash = { text: 'STUNT +$' + reward, t: 2 };
      world.stuntSound = true;
      postFeed(world, 'Did anyone see that jump?! INSANE air over the ramp.');
    }
  } else if (Math.abs(car.speed) > TUNING.STUNT_MIN_SPEED) {
    for (const ramp of world.city.ramps) {
      if (Math.hypot(car.x - ramp.x, car.y - ramp.y) < 34) {
        car.airT = TUNING.STUNT_AIR_S;
        car.airT0 = TUNING.STUNT_AIR_S;
        car.airPeak = 40 + Math.abs(car.speed) * 0.05;
        break;
      }
    }
  }
}

function updateOnFoot(world, dt, move) {
  const p = world.player;
  const speed = 200;
  const mx = move.x || 0;
  const my = move.y || 0;
  const len = Math.hypot(mx, my);
  if (len > 0.01) {
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.walking = true;
    p.walkPhase = (p.walkPhase || 0) + dt * 7;
  } else {
    p.walking = false;
  }
  for (const b of world.city.buildings) {
    const fixed = pushOutOfBuilding(b, p.x, p.y, 14);
    if (fixed) { p.x = fixed.x; p.y = fixed.y; }
  }
  p.x = clamp(p.x, 10, CITY.SIZE - 10);
  p.y = clamp(p.y, 10, CITY.SIZE - 10);
}

function spawnPuff(world, x, y) {
  if (world.particles.length > 40) return;
  world.particles.push({
    x, y,
    vx: (world.rng() - 0.5) * 30, vy: (world.rng() - 0.5) * 30,
    life: 0.5, maxLife: 0.5, size: 10 + world.rng() * 8,
  });
}

function updateBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    const step = TUNING.BULLET_SPEED * dt;
    b.x += Math.cos(b.angle) * step;
    b.y += Math.sin(b.angle) * step;
    b.traveled += step;
    let dead = b.traveled >= TUNING.BULLET_RANGE;
    if (!dead) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 22) { damageEnemy(world, e, b.damage); dead = true; break; }
      }
    }
    if (!dead) {
      for (const c of world.cars) {
        if (c.wrecked || c === world.player.car) continue;
        if (Math.hypot(c.x - b.x, c.y - b.y) < 30) { damageCar(world, c, b.damage); dead = true; break; }
      }
    }
    if (!dead) {
      for (const bd of world.city.buildings) {
        if (Math.abs(b.x - bd.x) < bd.w / 2 && Math.abs(b.y - bd.y) < bd.h / 2) { dead = true; break; }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
  for (let i = world.enemyBullets.length - 1; i >= 0; i--) {
    const b = world.enemyBullets[i];
    const step = 600 * dt;
    b.x += Math.cos(b.angle) * step;
    b.y += Math.sin(b.angle) * step;
    b.traveled += step;
    let dead = b.traveled >= TUNING.ENEMY_RANGE;
    const p = world.player;
    if (!dead) {
      // Enemy bullets threaten the player on foot, not the car: a moving
      // car is armoured against small-arms fire (v3 behaviour — otherwise
      // the M6 survive step bleeds the car dry and the player is wasted).
      if (!p.car && Math.hypot(p.x - b.x, p.y - b.y) < 20) {
        damagePlayer(world, b.damage);
        dead = true;
      }
    }
    if (!dead) {
      for (const bd of world.city.buildings) {
        if (Math.abs(b.x - bd.x) < bd.w / 2 && Math.abs(b.y - bd.y) < bd.h / 2) { dead = true; break; }
      }
    }
    if (dead) world.enemyBullets.splice(i, 1);
  }
}

function updateEnemies(world, dt) {
  const p = world.player;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    e.shootCd -= dt;
    // Enemies hold at ~200 units and shoot from there (they used to close
    // to 120, where a 900 u/s bullet arrives in 0.13s — the strafing player
    // cannot dodge and 7 of them focus-fire ~35 HP/s, so the M5 kill step
    // (7 enforcers) is a DPS race the player loses). At 200+ the spread and
    // the strafe actually make shots miss, as the v3 balance intended.
    if (d < 520 && d > 200) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.angle = a;
      const sp = e.boss ? 150 : 140;
      e.x += Math.cos(a) * sp * dt;
      e.y += Math.sin(a) * sp * dt;
      for (const b of world.city.buildings) {
        const fixed = pushOutOfBuilding(b, e.x, e.y, 14);
        if (fixed) { e.x = fixed.x; e.y = fixed.y; }
      }
      e.walking = true;
      e.walkPhase = (e.walkPhase || 0) + dt * 7;
    } else {
      e.walking = false;
    }
    // Keep enemies on the roads whether chasing or holding: an enemy that
    // spawns or slides into a block interior (off-road, behind buildings)
    // can never be reached by the player's road-following walker, so the
    // last enforcer stalls the kill step into a softlock. Snap back to
    // the nearest road.
    if (!isOnRoad(e.x, e.y)) {
      const s = snapToRoad(e.x, e.y);
      e.x = s.x;
      e.y = s.y;
    }
    if (d < TUNING.ENEMY_RANGE && e.shootCd <= 0 && losClear(world, e.x, e.y, p.x, p.y)) {
      e.shootCd = TUNING.ENEMY_SHOOT_CD;
      const a = Math.atan2(p.y - e.y, p.x - e.x) + (world.rng() - 0.5) * 0.5;
      world.enemyBullets.push({
        x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20,
        angle: a, traveled: 0, damage: TUNING.ENEMY_BULLET_DAMAGE,
      });
    }
  }
}

function spawnCop(world) {
  const p = world.player;
  const a = world.rng() * Math.PI * 2;
  const d = 300 + world.rng() * 200;
  const x = clamp(p.x + Math.cos(a) * d, 60, CITY.SIZE - 60);
  const y = clamp(p.y + Math.sin(a) * d, 60, CITY.SIZE - 60);
  const s = snapToRoad(x, y);
  const cop = makeCar(s.x, s.y, Math.atan2(p.y - s.y, p.x - s.x), '#2a4a8f', false);
  cop.police = true;
  cop.speed = 200;
  world.cars.push(cop);
  world.cops.push(cop);
}

// SWAT van (round 6): a black van with a white stripe, tougher and faster
// than a cruiser, same ram damage. Joins the cops array so the normal
// police steering/ram/busted logic drives it.
function spawnSwat(world) {
  const p = world.player;
  const a = world.rng() * Math.PI * 2;
  const d = 350 + world.rng() * 150;
  const x = clamp(p.x + Math.cos(a) * d, 60, CITY.SIZE - 60);
  const y = clamp(p.y + Math.sin(a) * d, 60, CITY.SIZE - 60);
  const s = snapToRoad(x, y);
  const van = makeCar(s.x, s.y, Math.atan2(p.y - s.y, p.x - s.x), '#11131a', false);
  van.police = true;
  van.swat = true;
  van.health = TUNING.SWAT_HEALTH;
  van.speed = 250;
  world.cars.push(van);
  world.cops.push(van);
  postFeed(world, 'SWAT is rolling in, this is crazy.');
}

// Whether any cop has line of sight on the player, or a helicopter is
// overhead (it always sees from above). Used for the hiding mechanic.
function isSpotted(world) {
  const p = world.player;
  for (const h of world.helis) {
    if (Math.hypot(p.x - h.x, p.y - h.y) < TUNING.HELI_LOSE_RANGE) return true;
  }
  for (const cop of world.cops) {
    if (cop.wrecked) continue;
    const d = Math.hypot(p.x - cop.x, p.y - cop.y);
    if (d < TUNING.COP_LOS_RANGE && losClear(world, cop.x, cop.y, p.x, p.y)) return true;
  }
  return false;
}

// Police helicopter (round 6, 4+ stars). Flies above the player with a
// searchlight, slower than the hero car's top speed so it can be outrun.
// It never damages the player — it only keeps the player "spotted", so the
// hiding fast-decay does not apply while it is overhead. If the player
// outruns it past HELI_LOSE_RANGE for HELI_LOSE_S, it gives up and leaves.
function updateHelis(world, dt) {
  if (world.stars >= TUNING.HELI_SPAWN_STARS && world.helis.length === 0) {
    const p = world.player;
    world.helis.push({
      x: p.x - 200, y: p.y - 200, z: TUNING.HELI_HEIGHT,
      angle: 0, rotor: 0, lostT: 0,
    });
    postFeed(world, 'There is a police chopper circling the city.');
  }
  if (world.stars === 0 && world.helis.length > 0) world.helis = [];
  const p = world.player;
  for (let i = world.helis.length - 1; i >= 0; i--) {
    const h = world.helis[i];
    h.rotor += dt * 25;
    // The heli leads the player by ~150 units (in the direction of travel),
    // so it stays inside the chase camera's frame instead of hovering
    // directly overhead (which would be above the top of the screen).
    const dir = p.car ? p.car.angle : p.angle;
    const tx = p.x + Math.cos(dir) * 150;
    const ty = p.y + Math.sin(dir) * 150;
    const dx = tx - h.x;
    const dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    const pd = Math.hypot(p.x - h.x, p.y - h.y);
    if (pd > TUNING.HELI_LOSE_RANGE) {
      h.lostT += dt;
      if (h.lostT > TUNING.HELI_LOSE_S) {
        world.helis.splice(i, 1);
        continue;
      }
    } else {
      h.lostT = 0;
    }
    const sp = Math.min(TUNING.HELI_SPEED, d * 1.5);
    if (d > 1) {
      h.x += (dx / d) * sp * dt;
      h.y += (dy / d) * sp * dt;
    }
    h.angle = Math.atan2(dy, dx);
    h.z = TUNING.HELI_HEIGHT + Math.sin(world.time * 2 + i) * 6;
  }
}

// Time trial (round 6 side activity): tower -> airport against the clock.
// Started with T while in a car; wrecking or leaving the car fails it.
function updateTrial(world, dt) {
  const tr = world.trial;
  if (!tr || !tr.active || tr.done) return;
  tr.time = world.time - tr.startT;
  const p = world.player;
  if (!p.car || p.car.wrecked) {
    tr.active = false;
    tr.failed = true;
    postFeed(world, 'Time trial failed — the car is wrecked.');
    return;
  }
  const place = PLACES[tr.checkpoints[tr.idx]];
  if (place && Math.hypot(p.x - place.x, p.y - place.y) < TUNING.GOTO_RADIUS) {
    tr.idx++;
    if (tr.idx >= tr.checkpoints.length) {
      tr.active = false;
      tr.done = true;
      const reward = tr.time <= TUNING.TRIAL_PAR_S ? TUNING.TRIAL_REWARD_PAR : TUNING.TRIAL_REWARD_FINISH;
      p.money += reward;
      tr.reward = reward;
      postFeed(world, 'Time trial done in ' + fmtTime(tr.time) + ' — +$' + reward + '!');
    }
  }
}

function updatePolice(world, dt) {
  const want = world.stars >= TUNING.POLICE_SPAWN_STARS ? Math.min(2 + world.stars, 4) : 0;
  if (world.cops.length < want) {
    world._copSpawnT -= dt;
    if (world._copSpawnT <= 0) {
      world._copSpawnT = 1.0;
      spawnCop(world);
    }
  }
  // SWAT van (round 6, 6 stars only): one tougher, faster cruiser. Missions
  // never reach 6 stars, so SWAT only shows up on free-roam crime sprees.
  const wantSwat = world.stars >= TUNING.SWAT_SPAWN_STARS ? 1 : 0;
  const swatCount = world.cops.filter((c) => c.swat && !c.wrecked).length;
  if (swatCount < wantSwat) {
    world._swatSpawnT -= dt;
    if (world._swatSpawnT <= 0) {
      world._swatSpawnT = 2.0;
      spawnSwat(world);
    }
  }
  if (world.stars === 0 && world.cops.length > 0) {
    for (const c of world.cops) {
      const i = world.cars.indexOf(c);
      if (i >= 0) world.cars.splice(i, 1);
    }
    world.cops = [];
  }
  const p = world.player;
  for (const cop of world.cops) {
    if (cop.wrecked) continue;
    const d = Math.hypot(p.x - cop.x, p.y - cop.y);
    if (cop.backoffT > 0) {
      cop.backoffT -= dt;
      cop.speed = Math.max(cop.speed - 200 * dt, -120);
    } else {
      const targetAngle = Math.atan2(p.y - cop.y, p.x - cop.x);
      const diff = normAngle(targetAngle - cop.angle);
      const steer = clamp(diff * 2.2, -1, 1);
      const authority = Math.max(0, 1 - 0.3 * Math.abs(cop.speed) / TUNING.CAR_MAX_SPEED);
      cop.angle += TUNING.TURN_RATE * steer * clamp(Math.abs(cop.speed) / 80, 0.15, 1) * authority * dt;
      cop.speed = Math.min(cop.speed + 300 * dt, cop.swat ? TUNING.SWAT_MAX_SPEED : 420);
    }
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    collideCarWithCity(world, cop);
    if (p.car && !p.car.wrecked) {
      const dd = Math.hypot(p.car.x - cop.x, p.car.y - cop.y);
      if (dd < 52) {
        damageCar(world, p.car, TUNING.POLICE_RAM_DAMAGE);
        cop.backoffT = TUNING.POLICE_BACKOFF_S;
        world.shake = Math.max(world.shake, 24);
      }
    } else if (!p.car && d < 50) {
      world._bustedT += dt;
      if (world._bustedT > 1.5) {
        world.over = true;
        world.failReason = 'busted';
        if (world.mission) world.mission.failReason = 'busted';
      }
    } else {
      world._bustedT = 0;
    }
  }
}

function nextIntersection(world, c) {
  const cx = nearestRoadCenter(c.x);
  const cy = nearestRoadCenter(c.y);
  const ix = CITY.ROAD_CENTERS.indexOf(cx);
  const iy = CITY.ROAD_CENTERS.indexOf(cy);
  const opts = [];
  if (Math.abs(c.x - cx) < 10) {
    if (iy > 0) opts.push({ x: cx, y: CITY.ROAD_CENTERS[iy - 1] });
    if (iy < 5) opts.push({ x: cx, y: CITY.ROAD_CENTERS[iy + 1] });
  }
  if (Math.abs(c.y - cy) < 10) {
    if (ix > 0) opts.push({ x: CITY.ROAD_CENTERS[ix - 1], y: cy });
    if (ix < 5) opts.push({ x: CITY.ROAD_CENTERS[ix + 1], y: cy });
  }
  if (opts.length === 0) return { x: cx, y: cy };
  return opts[Math.floor(world.rng() * opts.length)];
}

function updateTraffic(world, dt) {
  for (const c of world.cars) {
    if (!c.traffic || c.wrecked) continue;
    if (!c.target) c.target = nextIntersection(world, c);
    // Right-hand traffic: the car drives in a lane 55 units to the RIGHT of
    // its direction of travel (screen coords, y down: right = (-dy, dx)).
    // The player drives the road centre, so a 55-unit lane keeps traffic
    // clear of the player (collision distance 48) — without this, traffic
    // and the player both follow the centre line and grind head-on, which
    // wrecks the M2 deliver car in seconds.
    const dx = c.target.x - c.x;
    const dy = c.target.y - c.y;
    const d = Math.hypot(dx, dy);
    const nx = d > 0 ? dx / d : 0;
    const ny = d > 0 ? dy / d : 0;
    const lx = c.target.x + (-ny) * 55;
    const ly = c.target.y + nx * 55;
    const ldx = lx - c.x;
    const ldy = ly - c.y;
    const ld = Math.hypot(ldx, ldy);
    if (ld < 30) {
      c.target = nextIntersection(world, c);
      continue;
    }
    const targetAngle = Math.atan2(ldy, ldx);
    const diff = normAngle(targetAngle - c.angle);
    c.angle += clamp(diff * 3, -1, 1) * TUNING.TURN_RATE * dt * 0.7;
    c.speed = ld < 120 ? 100 : 170;
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    if (!isOnRoad(c.x, c.y)) {
      const s = snapToRoad(c.x, c.y);
      c.x = s.x;
      c.y = s.y;
    }
  }
}

function updatePeds(world, dt) {
  for (const ped of world.peds) {
    ped.dirT -= dt;
    if (ped.dirT <= 0) {
      ped.dirT = 2 + world.rng() * 4;
      if (world.rng() < 0.4) ped.angle += (world.rng() - 0.5) * Math.PI;
    }
    ped.x += Math.cos(ped.angle) * 55 * dt;
    ped.y += Math.sin(ped.angle) * 55 * dt;
    for (const b of world.city.buildings) {
      const fixed = pushOutOfBuilding(b, ped.x, ped.y, 12);
      if (fixed) { ped.x = fixed.x; ped.y = fixed.y; ped.angle += Math.PI / 2; }
    }
    ped.x = clamp(ped.x, 20, CITY.SIZE - 20);
    ped.y = clamp(ped.y, 20, CITY.SIZE - 20);
    ped.walkPhase = (ped.walkPhase || 0) + dt * 6;
  }
}

function updatePickups(world, dt) {
  const p = world.player;
  for (const pk of world.pickups) {
    if (!pk.active) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.active = true;
      continue;
    }
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < 44) {
      if (pk.kind === 'health') p.health = Math.min(100, p.health + pk.amount);
      else p.armor = Math.min(100, p.armor + pk.amount);
      pk.active = false;
      pk.respawnT = PICKUP_RESPAWN_S;
    }
  }
}

function collideCars(world, dt) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (a.wrecked || b.wrecked) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 48 && d > 0.01) {
        const push = 48 - d;
        const nx = dx / d;
        const ny = dy / d;
        // The hero car plows through: the other car takes the full push and
        // the slowdown, the hero car is not moved or slowed. Otherwise a
        // traffic car stalled at an intersection becomes a wall the hero
        // car can never push past (m2 deliver softlock) — the two grind in
        // place, both slowed 0.6x every tick, forever.
        if (a === world.player.car) {
          b.x += nx * push;
          b.y += ny * push;
          b.speed *= 0.6;
        } else if (b === world.player.car) {
          a.x -= nx * push;
          a.y -= ny * push;
          a.speed *= 0.6;
        } else {
          const half = push / 2;
          a.x -= nx * half;
          a.y -= ny * half;
          b.x += nx * half;
          b.y += ny * half;
          a.speed *= 0.6;
          b.speed *= 0.6;
        }
        // Damage only when the hero car is involved, and only the OTHER car
        // takes it (the hero car is already exempt). Traffic must never
        // wreck a parked car: parked cars sit 60 units off a place centre,
        // right in a cross-traffic lane, so ambient traffic grinds them to
        // scrap and stealNearestParked eventually finds nothing stealable —
        // the player is stranded on foot and the run soft-locks.
        if (b === world.player.car && a.hitCd <= 0) { damageCar(world, a, TUNING.CAR_CAR_DAMAGE); a.hitCd = 0.5; }
        if (a === world.player.car && b.hitCd <= 0) { damageCar(world, b, TUNING.CAR_CAR_DAMAGE); b.hitCd = 0.5; }
      }
    }
  }
  for (const c of cars) {
    if (c.hitCd > 0) c.hitCd -= dt;
    if (c.scrapeCd > 0) c.scrapeCd -= dt;
  }
}

function checkMissionStep(world, dt) {
  const m = world.mission;
  if (!m || m.done) return;
  const step = m.step;
  const p = world.player;
  m.timer += dt;
  switch (step.type) {
    case 'goto': {
      const dest = missionPlace(step);
      if (!dest) { advanceStep(world); break; }
      const d = Math.hypot(p.x - dest.x, p.y - dest.y);
      if (d < TUNING.GOTO_RADIUS && (!step.needCar || p.car)) advanceStep(world);
      break;
    }
    case 'steal_car':
      if (p.car) advanceStep(world);
      break;
    case 'deliver': {
      const dest = missionPlace(step);
      if (p.car && dest && Math.hypot(p.x - dest.x, p.y - dest.y) < TUNING.GOTO_RADIUS) advanceStep(world);
      break;
    }
    case 'kill':
      if (m.kills >= step.kills) advanceStep(world);
      break;
    case 'hold': {
      const dest = missionPlace(step);
      if (dest && Math.hypot(p.x - dest.x, p.y - dest.y) < TUNING.HOLD_RADIUS) {
        m.holdT += dt;
        addHeat(world, 10 * dt);
        if (m.holdT >= step.holdS) advanceStep(world);
      }
      // No decay when the player is pushed out of the radius: police rams
      // shove the car in and out of the 80-unit circle, and a 1:1 decay
      // means the 8s hold never completes — the car is rammed to scrap
      // while the player is busted on foot. Progress pauses, it is kept.
      break;
    }
    case 'escape':
      if (world.stars === 0) advanceStep(world);
      break;
    case 'survive':
      m.surviveT += dt;
      if (m.surviveT >= step.surviveS) advanceStep(world);
      break;
    default:
      advanceStep(world);
      break;
  }
}

export function stepWorld(world, dt, input) {
  dt = Math.min(dt || STEP, 0.1);
  input = input || {};
  const move = input.move || { x: 0, y: 0 };
  const aim = input.aim || { x: 0, y: 0 };
  world.time += dt;

  const enterEdge = !!input.enterPressed && !world._prevEnter;
  const punchEdge = !!input.punchPressed && !world._prevPunch;
  const reloadEdge = !!input.reloadPressed && !world._prevReload;
  const trialEdge = !!input.trialPressed && !world._prevTrial;
  world._prevEnter = !!input.enterPressed;
  world._prevPunch = !!input.punchPressed;
  world._prevReload = !!input.reloadPressed;
  world._prevSwitch = !!input.switchPressed;
  world._prevTrial = !!input.trialPressed;

  // Time trial start (round 6): T while in a car, no trial running.
  if (trialEdge && world.screen === 'play' && !world.over && world.player.car && (!world.trial || !world.trial.active)) {
    world.trial = {
      active: true, done: false, failed: false,
      startT: world.time, time: 0,
      checkpoints: TRIAL_ROUTE.checkpoints, idx: 0, reward: 0,
    };
    postFeed(world, 'Time trial started — tower to airport, beat the clock!');
  }

  if (!world.over) {
    const p = world.player;
    if (p.car && !p.car.wrecked) {
      updateCarPlayer(world, dt, move, input);
    } else {
      p.car = null;
      updateOnFoot(world, dt, move, input);
    }

    if (enterEdge) {
      if (p.car) {
        const car = p.car;
        p.car = null;
        p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
        p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
        p.angle = car.angle;
      } else {
        let best = null;
        let bd = 70;
        for (const c of world.cars) {
          if (c.wrecked) continue;
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < bd) { bd = d; best = c; }
        }
        if (best) {
          p.car = best;
          // Stealing any car is a crime (+20 heat): a cold steal gets the
          // player wanted (1 star). A getaway steal — already wanted —
          // adds no new heat (the player is already hot).
          if (world.stars === 0) {
            addHeat(world, TUNING.STEAL_HEAT);
            postFeed(world, 'Someone just jacked a car outside the garage!!');
          }
          p.x = best.x;
          p.y = best.y;
          p.angle = best.angle;
        }
      }
    }

    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) p.ammo = p.mag;
    }
    if (reloadEdge && p.ammo < p.mag && p.reloadT <= 0) p.reloadT = TUNING.PISTOL_RELOAD_S;
    if (input.shootHeld && p.fireCd <= 0 && p.reloadT <= 0) {
      if (p.ammo > 0) {
        p.ammo--;
        p.fireCd = TUNING.PISTOL_FIRE_CD;
        world.stats.shotsFired++;
        const a = Math.atan2(aim.y - p.y, aim.x - p.x);
        world.bullets.push({
          x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24,
          angle: a, traveled: 0, damage: TUNING.PISTOL_DAMAGE,
        });
        world.muzzleT = 0.06;
      } else {
        p.reloadT = TUNING.PISTOL_RELOAD_S;
      }
    }

    if (punchEdge) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 48) damageEnemy(world, e, 30);
      }
    }

    updateBullets(world, dt);
    updateEnemies(world, dt);
    updatePolice(world, dt);
    updateHelis(world, dt);
    updatePickups(world, dt);
    collideCars(world, dt);

    // Hiding (round 6): when no cop has line of sight for HIDDEN_LOSE_S the
    // player is hidden and heat decays twice as fast. A helicopter overhead
    // always spots the player, so hiding only works below 4 stars. The
    // baseline decay (3/s after 5s quiet) is unchanged when spotted.
    if (world.stars > 0) {
      if (isSpotted(world)) world.hiddenT = 0;
      else world.hiddenT += dt;
    } else {
      world.hiddenT = 0;
    }
    if (world.time - world.lastHeatGain > TUNING.HEAT_QUIET_S) {
      const rate = world.hiddenT > TUNING.HIDDEN_LOSE_S ? TUNING.HIDDEN_DECAY : TUNING.HEAT_DECAY;
      world.heat = Math.max(0, world.heat - rate * dt);
    }
    world.stars = Math.min(TUNING.STARS_MAX, Math.floor(world.heat / 20));
    if (world.stars > world._prevStars) {
      const msgs = {
        1: 'Cops are looking for someone near the garage.',
        2: 'Police chase on the strip, stay inside!',
        3: 'Half the department is out tonight.',
        4: 'There is a HELICOPTER over the city!',
        5: 'Five stars. The whole city is watching.',
        6: 'SIX STARS. The city is on lockdown!!',
      };
      postFeed(world, msgs[world.stars] || 'Wanted level up.');
    } else if (world.stars === 0 && world._prevStars > 0) {
      postFeed(world, 'They lost him. How??');
    }
    world._prevStars = world.stars;

    checkMissionStep(world, dt);
    updateTrial(world, dt);
  }

  updateTraffic(world, dt);
  updatePeds(world, dt);
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }
  if (world.missionCooldown > 0) world.missionCooldown -= dt;
  // Auto-start the next mission after the cooldown: the harness never calls
  // startMission again — without this, a completed mission soft-locks the
  // run (progress key frozen) after the 3s banner.
  if (
    world.mission && world.mission.done && world.missionCooldown <= 0 &&
    !world.gameComplete && world.missionIndex < MISSIONS.length - 1 && !world.over
  ) {
    startMission(world, world.missionIndex + 1);
  }
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 60);
  if (world.muzzleT > 0) world.muzzleT -= dt;
  if (world.hornT > 0) world.hornT -= dt;
  if (world.feedFlash > 0) world.feedFlash -= dt;
  if (world.stuntFlash) {
    world.stuntFlash.t -= dt;
    if (world.stuntFlash.t <= 0) world.stuntFlash = null;
  }
}
