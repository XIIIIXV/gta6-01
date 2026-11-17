// NEON BAY world: state, physics, traffic/pedestrian/police AI, combat, the
// wanted system, and the mission engine. Fixed-step (STEP) updates; deterministic
// from a seed so screenshot scenes replay exactly.
import { STEP, WORLD_SIZE, ROAD_CENTERS, ROAD_WIDTH, CAR_COLORS, PLACES, BEST_TIMES_KEY, PICKUP_RESPAWN_S } from './config.js';
import { generateCity, nearestRoadCenter } from './city.js';
import { mulberry32, pick, range, rangeInt, weightedPick, chance } from './random.js';
import { MISSIONS, missionPlace } from './missions.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function starsForHeat(heat) {
  if (heat >= 88) return 5;
  if (heat >= 70) return 4;
  if (heat >= 50) return 3;
  if (heat >= 30) return 2;
  if (heat >= 12) return 1;
  return 0;
}

export function createWorld(seed = 1) {
  const rng = mulberry32(seed);
  const city = generateCity(seed);
  const world = {
    seed,
    rng,
    city,
    time: 0,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    heat: 0,
    stars: 0,
    lastCrime: -99,
    missionIndex: 0,
    mission: null, // { def, stepIndex, timer, holdProgress, kills, failed, done, banner }
    message: null, // { text, t }
    stats: { kills: 0, carsStolen: 0, shotsFired: 0 },
    events: [],
    screen: 'title', // title | play | paused | wasted | busted | failed | complete | ending
    screenT: 0,
    over: false,
    // Mission summary + best-time tracking (display only — never feeds back
    // into mission timers, police, or win/lose logic).
    runSummary: null, // { missionId, title, elapsed, best, isNewBest, reward, totalTime, bestTotal, isNewBestTotal, isFinal }
    totalTime: 0, // seconds of completed missions in this run
    runBegan: false,
    runStartIndex: 0, // mission index the run started at (0 = full run)
  };
  resetWorld(world, seed);
  // Convenience methods the screenshot staging and tests use.
  world.reset = (s) => resetWorld(world, s ?? world.seed);
  world.step = (input) => stepWorld(world, STEP, input);
  return world;
}

function makeCar(world, x, y, angle, opts = {}) {
  const car = {
    x, y, angle, speed: 0,
    color: opts.color ?? pick(world.rng, CAR_COLORS),
    traffic: !!opts.traffic,
    police: !!opts.police,
    mission: opts.mission ?? null,
    health: 120,
    wrecked: false,
    axis: opts.axis ?? 'x',
    dir: opts.dir ?? (world.rng() < 0.5 ? 1 : -1),
    lane: opts.lane ?? (world.rng() < 0.5 ? -24 : 24),
    cruise: range(world.rng, 120, 185),
    turnCd: 0,
    stuckT: 0,
    reverseT: 0,
    id: world.cars.length + Math.floor(world.rng() * 100000),
  };
  world.cars.push(car);
  return car;
}

function makePed(world, x, y) {
  // The draws below stay in the original order (angle, speed, road, side,
  // direction, skin, shirt) — the world's RNG is one shared stream, and
  // reordering them would move every ped, car, and cop that spawns after.
  const angle = world.rng() * TAU;
  const speed = range(world.rng, 40, 70);
  const road = pick(world.rng, ROAD_CENTERS);
  const horizontal = world.rng() < 0.5;
  const dir = world.rng() < 0.5 ? 1 : -1;
  const color = pick(world.rng, ['#e8c39e', '#c98d64', '#8a5a3b', '#5a3b28', '#f2d5b8']);
  // Shirt colours are weighted: reds, blues and greens are the everyday
  // crowd, purple and white are the rare ones — the street reads as a crowd,
  // not a uniform. One draw, same spot the old uniform pick occupied.
  const shirt = weightedPick(world.rng, [
    ['#e33f2f', 3], ['#2f7fe3', 3], ['#37b24d', 3], ['#f2c230', 2],
    ['#20c997', 2], ['#8b5cf6', 1], ['#e8e8e8', 1],
  ]);
  const ped = {
    x, y, angle, speed, road, horizontal, dir,
    flee: 0, fleeX: 0, fleeY: 0,
    dead: false, deadT: 0,
    color,
    shirt,
  };
  world.peds.push(ped);
  return ped;
}

export function resetWorld(world, seed) {
  world.rng = mulberry32(seed);
  world.city = generateCity(seed);
  world.time = 0;
  world.cars = [];
  world.peds = [];
  world.cops = [];
  world.enemies = [];
  world.bullets = [];
  world.particles = [];
  world.pickups = [];
  world.heat = 0;
  world.stars = 0;
  world.lastCrime = -99;
  world.mission = null;
  world.message = null;
  world.stats = { kills: 0, carsStolen: 0, shotsFired: 0 };
  world.events = [];
  world.over = false;
  world.runSummary = null;
  world.totalTime = 0;
  world.runBegan = false;
  world.runStartIndex = 0;
  world.player = {
    x: PLACES.garage.x, y: PLACES.garage.y + 40, angle: -Math.PI / 2,
    health: 100, armor: 0, money: 0,
    weapon: 'fists', mag: 12, magSize: 12, reloadT: 0, shootCd: 0, punchCd: 0,
    car: null, speed: 0, hurtT: 0, bustT: 0,
  };
  // Traffic.
  for (let i = 0; i < 16; i += 1) {
    const horizontal = world.rng() < 0.5;
    const road = pick(world.rng, ROAD_CENTERS);
    const along = range(world.rng, 100, WORLD_SIZE - 100);
    makeCar(world,
      horizontal ? along : road + (world.rng() < 0.5 ? -24 : 24),
      horizontal ? road + (world.rng() < 0.5 ? -24 : 24) : along,
      horizontal ? (world.rng() < 0.5 ? 0 : Math.PI) : (world.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      { traffic: true, axis: horizontal ? 'x' : 'y' });
  }
  // Parked cars to steal.
  for (let i = 0; i < 10; i += 1) {
    const road = pick(world.rng, ROAD_CENTERS);
    const along = range(world.rng, 150, WORLD_SIZE - 150);
    const horizontal = world.rng() < 0.5;
    makeCar(world,
      horizontal ? along : road + (world.rng() < 0.5 ? 62 : -62),
      horizontal ? road + (world.rng() < 0.5 ? 62 : -62) : along,
      horizontal ? (world.rng() < 0.5 ? 0 : Math.PI) : (world.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      {});
  }
  // Pedestrians.
  for (let i = 0; i < 36; i += 1) {
    const road = pick(world.rng, ROAD_CENTERS);
    const along = range(world.rng, 80, WORLD_SIZE - 80);
    if (world.rng() < 0.5) makePed(world, along, road + (world.rng() < 0.5 ? 62 : -62));
    else makePed(world, road + (world.rng() < 0.5 ? 62 : -62), along);
  }
  // Pickups: health at the hospital, cash and armor around town. Two extra
  // spots (plaza health, docks armor) so a long drive always passes a pickup
  // — more resources on the map only ever helps the player, never hurts.
  const pickupSpots = [
    { kind: 'health', x: PLACES.hospital.x, y: PLACES.hospital.y + 60 },
    { kind: 'health', x: 2200, y: 1000 },
    { kind: 'armor', x: 1000, y: 1400 },
    { kind: 'cash', x: 1800, y: 2200 },
    { kind: 'cash', x: 2600, y: 1800 },
    { kind: 'cash', x: 600, y: 1800 },
    { kind: 'health', x: 3000, y: 2200 },
    { kind: 'armor', x: 1400, y: 600 },
    { kind: 'health', x: PLACES.plaza.x, y: PLACES.plaza.y + 60 },
    { kind: 'armor', x: PLACES.docks.x, y: PLACES.docks.y - 60 },
  ];
  for (const p of pickupSpots) world.pickups.push({ ...p, taken: false, respawnT: 0 });
}

// ---- collisions ------------------------------------------------------------
function resolveCircle(world, e, r) {
  // Stay on land: the harbor water rings the city at the edges.
  e.x = clamp(e.x, 104 + r, WORLD_SIZE - 104 - r);
  e.y = clamp(e.y, 104 + r, WORLD_SIZE - 104 - r);
  for (const b of world.city.buildings) {
    const nx = clamp(e.x, b.x, b.x + b.w);
    const ny = clamp(e.y, b.y, b.y + b.h);
    let dx = e.x - nx;
    let dy = e.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (r - d) / d;
      e.x += dx * push;
      e.y += dy * push;
    } else {
      // Center inside the building: push out along the smallest penetration axis.
      const left = e.x - b.x;
      const right = b.x + b.w - e.x;
      const top = e.y - b.y;
      const bottom = b.y + b.h - e.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) e.x = b.x - r;
      else if (m === right) e.x = b.x + b.w + r;
      else if (m === top) e.y = b.y - r;
      else e.y = b.y + b.h + r;
    }
  }
}

function pointInBuilding(world, x, y) {
  for (const b of world.city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// Snap a point onto the nearest road so spawned characters never start inside
// a building (their bullets would die on the wall before leaving it).
export function snapToRoad(x, y) {
  const rx = nearestRoadCenter(x);
  const ry = nearestRoadCenter(y);
  if (Math.abs(x - rx) <= Math.abs(y - ry)) return { x: rx, y };
  return { x, y: ry };
}

// A road-following route: nearest intersection, then along the grid to the target.
export function roadPathPoints(fromX, fromY, toX, toY) {
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

// Line of sight: true when no building blocks the segment (sampled every 12px).
export function losClear(world, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 12));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (pointInBuilding(world, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

// Move a walker (enemy / foot cop) toward a target: direct chase when there is
// line of sight, otherwise along the road grid so it walks around blocks
// instead of pushing forever against a building wall.
function moveWalker(world, w, tx, ty, speed, dt, shootRange, closeIn = false) {
  const d = dist(w.x, w.y, tx, ty);
  if (d < shootRange && losClear(world, w.x, w.y, tx, ty)) {
    w.path = null;
    w.angle = Math.atan2(ty - w.y, tx - w.x);
    if (closeIn) {
      // Cops close in to bust range instead of holding a shooting distance.
      if (d > 40) {
        w.x += Math.cos(w.angle) * speed * dt;
        w.y += Math.sin(w.angle) * speed * dt;
      }
    } else if (d > 230) {
      w.x += Math.cos(w.angle) * speed * dt;
      w.y += Math.sin(w.angle) * speed * dt;
    } else if (d < 130) {
      w.x -= Math.cos(w.angle) * speed * 0.5 * dt;
      w.y -= Math.sin(w.angle) * speed * 0.5 * dt;
    }
    return true; // has line of sight
  }
  // No line of sight: follow the road grid.
  if (!w.path || w.pathT <= 0) {
    w.path = roadPathPoints(w.x, w.y, tx, ty);
    w.wp = 0;
    w.pathT = 3;
  }
  w.pathT -= dt;
  while (w.wp < w.path.length - 1 && dist(w.x, w.y, w.path[w.wp][0], w.path[w.wp][1]) < 24) w.wp += 1;
  const [wx, wy] = w.path[Math.min(w.wp, w.path.length - 1)];
  const a = Math.atan2(wy - w.y, wx - w.x);
  w.angle = a;
  w.x += Math.cos(a) * speed * dt;
  w.y += Math.sin(a) * speed * dt;
  return false;
}

// ---- crimes / wanted -------------------------------------------------------
function addCrime(world, amount) {
  world.heat = clamp(world.heat + amount, 0, 100);
  world.lastCrime = world.time;
  world.stars = starsForHeat(world.heat);
}

function damagePlayer(world, amount) {
  const p = world.player;
  if (p.hurtT > 0) return;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest * 0.6);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health -= rest;
  p.hurtT = 0.25;
  if (p.health <= 0) {
    p.health = 0;
    world.screen = 'wasted';
    world.screenT = 0;
    world.over = true;
    if (world.mission) world.mission.failed = true;
  }
}

function addParticles(world, x, y, n, color, speed = 120, life = 0.5) {
  for (let i = 0; i < n; i += 1) {
    const a = world.rng() * TAU;
    const s = range(world.rng, speed * 0.3, speed);
    world.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: range(world.rng, life * 0.5, life), maxLife: life, color, size: range(world.rng, 2, 5),
    });
  }
}

// ---- combat ----------------------------------------------------------------
function fireBullet(world, x, y, angle, from, damage, speed = 900) {
  world.bullets.push({
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    from, damage, life: 0.9,
  });
}

function hurtPed(world, ped, damage, fromPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deadT = 0;
  addParticles(world, ped.x, ped.y, 10, '#a02020', 140, 0.6);
  if (fromPlayer) {
    addCrime(world, 15);
    world.stats.kills += 1;
    world.message = { text: 'Pedestrian down — the cops noticed that.', t: 2.5 };
  }
  // Nearby peds flee.
  for (const q of world.peds) {
    if (!q.dead && dist(q.x, q.y, ped.x, ped.y) < 300) {
      q.flee = 3;
      q.fleeX = ped.x;
      q.fleeY = ped.y;
    }
  }
}

function hurtEnemy(world, en, damage) {
  en.health -= damage;
  addParticles(world, en.x, en.y, 6, '#a02020', 120, 0.4);
  if (en.health <= 0 && !en.dead) {
    en.dead = true;
    world.stats.kills += 1;
    world.player.money += 25;
    if (world.mission?.step?.type === 'kill') world.mission.kills += 1;
    addParticles(world, en.x, en.y, 16, '#a02020', 180, 0.7);
    world.events.push('kill');
  }
}

function hurtCop(world, cop, damage) {
  cop.health -= damage;
  addParticles(world, cop.x, cop.y, 6, '#2030a0', 120, 0.4);
  if (cop.health <= 0 && !cop.dead) {
    cop.dead = true;
    addCrime(world, 25);
    world.stats.kills += 1;
    addParticles(world, cop.x, cop.y, 16, '#2030a0', 180, 0.7);
  }
}

// ---- missions --------------------------------------------------------------
export function startMission(world, index) {
  const def = MISSIONS[index];
  if (!def) {
    world.screen = 'ending';
    world.screenT = 0;
    world.mission = null;
    return;
  }
  world.missionIndex = index;
  world.mission = {
    def, stepIndex: 0, timer: 0, holdProgress: 0, kills: 0,
    failed: false, done: false, banner: def.title, bannerT: 3.5,
    step: def.steps[0], startedAt: world.time,
  };
  // First mission of this run: remember where the run started, so a
  // continued run (past Mission 1) never sets a misleading best total time.
  if (!world.runBegan) {
    world.runBegan = true;
    world.runStartIndex = index;
  }
  enterStep(world);
  world.message = { text: `${def.title} — ${def.brief}`, t: 5 };
}

function enterStep(world) {
  const m = world.mission;
  const step = m.step;
  m.timer = step.time ?? step.seconds ?? 0;
  m.holdProgress = 0;
  m.kills = 0;
  if (step.type === 'deliver') {
    // A fresh car for the delivery, parked on the road by the player.
    const p = world.player;
    const onHorizontalRoad = Math.abs(p.y - nearestRoadCenter(p.y)) <= Math.abs(p.x - nearestRoadCenter(p.x));
    const spot = onHorizontalRoad
      ? { x: p.x + 90, y: nearestRoadCenter(p.y) }
      : { x: nearestRoadCenter(p.x), y: p.y + 90 };
    const car = makeCar(world, spot.x, spot.y, p.angle, { mission: 'deliver', color: '#f2c230' });
    car.health = 250;
    world.message = { text: 'Delivery car is ready — get in and drive!', t: 3 };
  }
  if (step.type === 'kill') {
    const place = missionPlace(step);
    const n = step.count;
    // Gear up for the gunfight: a vest and a full mag. Walking into an
    // ambush at 0 armor with a half-empty pistol is a death sentence, and the
    // job briefing already warns the player to expect trouble.
    world.player.armor = Math.min(100, world.player.armor + 50);
    world.player.mag = world.player.magSize;
    world.message = { text: 'Gear up — armor +50, mag topped up.', t: 3 };
    for (let i = 0; i < n; i += 1) {
      const a = world.rng() * TAU;
      const r = range(world.rng, 90, 220);
      const spot = snapToRoad(
        clamp(place.x + Math.cos(a) * r, 30, WORLD_SIZE - 30),
        clamp(place.y + Math.sin(a) * r, 30, WORLD_SIZE - 30),
      );
      world.enemies.push({
        x: spot.x,
        y: spot.y,
        angle: 0, health: step.boss && i === 0 ? 300 : 80,
        boss: step.boss && i === 0, shootCd: range(world.rng, 0.5, 1.5),
        dead: false, speed: step.boss && i === 0 ? 130 : 150,
      });
    }
  }
  if (step.type === 'escape') addCrime(world, 60 - world.heat > 0 ? 60 - world.heat : 0);
  if (step.type === 'survive') addCrime(world, 80 - world.heat > 0 ? 80 - world.heat : 0);
}

function advanceStep(world) {
  const m = world.mission;
  m.stepIndex += 1;
  if (m.stepIndex >= m.def.steps.length) {
    // Mission complete.
    world.player.money += m.def.reward;
    // A clean start for the next job: the car is patched up, the player
    // patches up too, the heat cools a little, and the foot cops give up —
    // like the breather between GTA missions. Without this, a player who
    // finishes a job at 10 HP is executed by leftover cops during the
    // 3-second banner, which is not a fair loss.
    if (world.player.car) world.player.car.health = 120;
    world.player.health = Math.min(100, world.player.health + 50);
    world.cops = [];
    world.heat = Math.max(0, world.heat - 25);
    world.stars = starsForHeat(world.heat);
    world.events.push('mission_complete');
    world.message = { text: `Mission complete! +$${m.def.reward}`, t: 4 };
    saveProgress(world);
    // Mission summary + best times (display only — no effect on the mission
    // engine, timers, police, or win/lose logic).
    world.runSummary = recordMissionSummary(world, m);
    m.done = true;
    m.banner = 'MISSION COMPLETE';
    m.bannerT = 3;
    world.mission = { ...m, step: null, done: true, banner: 'MISSION COMPLETE', bannerT: 3, cooldown: 3 };
    return;
  }
  m.step = m.def.steps[m.stepIndex];
  enterStep(world);
}

function failMission(world, reason) {
  const m = world.mission;
  if (!m || m.failed) return;
  m.failed = true;
  m.failReason = reason;
  world.screen = 'failed';
  world.screenT = 0;
  world.over = true;
}

export function saveProgress(world) {
  try {
    localStorage.setItem('neonbay-save-v1', JSON.stringify({
      mission: world.missionIndex + 1, money: world.player.money, savedAt: Date.now(),
    }));
  } catch { /* storage unavailable — the game still plays */ }
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem('neonbay-save-v1');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// Best times (localStorage, display only). Per-mission bests keyed by mission
// id, plus a "total" best for a full run (started at Mission 1). A continued
// run (started past Mission 1) still records per-mission bests, but its total
// is never compared against the full-run best total.
export function loadBestTimes() {
  try {
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch { return {}; }
}

function saveBestTimes(obj) {
  try { localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(obj)); } catch { /* no storage */ }
}

function recordMissionSummary(world, m) {
  const startedAt = (typeof m.startedAt === 'number') ? m.startedAt : world.time;
  const elapsed = Math.max(0, world.time - startedAt);
  world.totalTime = (world.totalTime || 0) + elapsed;
  const bests = loadBestTimes();
  const key = String(m.def.id);
  let isNewBest = false;
  if (bests[key] == null || elapsed < bests[key]) {
    bests[key] = elapsed;
    isNewBest = true;
  }
  const isFinal = m.def.id === MISSIONS.length;
  let bestTotal = bests.total ?? null;
  let isNewBestTotal = false;
  if (isFinal && world.runStartIndex === 0) {
    if (bestTotal == null || world.totalTime < bestTotal) {
      bests.total = world.totalTime;
      bestTotal = world.totalTime;
      isNewBestTotal = true;
    }
  }
  if (isNewBest || isNewBestTotal) saveBestTimes(bests);
  // Par time (display only): the mission's target time, and whether this run
  // beat it. Never feeds back into timers, police, or win/lose logic.
  const par = m.def.par ?? null;
  const beatPar = par != null && elapsed <= par;
  return {
    missionId: m.def.id,
    title: m.def.title,
    elapsed,
    best: bests[key],
    isNewBest,
    reward: m.def.reward,
    totalTime: world.totalTime,
    bestTotal,
    isNewBestTotal,
    isFinal,
    par,
    beatPar,
  };
}

// ---- main step -------------------------------------------------------------
export function stepWorld(world, dt, input) {
  world.events = [];
  world.time += dt;
  const p = world.player;

  // Mission-complete cooldown: start the next mission after the banner.
  if (world.mission?.done) {
    world.mission.cooldown -= dt;
    if (world.mission.cooldown <= 0) {
      const next = world.missionIndex + 1;
      if (next >= MISSIONS.length) {
        world.screen = 'ending';
        world.screenT = 0;
        world.mission = null;
      } else {
        startMission(world, next);
      }
    }
  }
  if (world.mission?.bannerT > 0) world.mission.bannerT -= dt;
  if (world.message) {
    world.message.t -= dt;
    if (world.message.t <= 0) world.message = null;
  }
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.shootCd > 0) p.shootCd -= dt;
  if (p.punchCd > 0) p.punchCd -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.mag = p.magSize; world.events.push('reload'); }
  }

  // Wanted decay.
  if (world.time - world.lastCrime > 6 && world.heat > 0) {
    world.heat = Math.max(0, world.heat - 4 * dt);
    world.stars = starsForHeat(world.heat);
  }

  // ---- player --------------------------------------------------------------
  if (!world.over) {
    if (p.car) {
      stepPlayerCar(world, dt, input);
    } else {
      stepPlayerOnFoot(world, dt, input);
    }
  }

  // ---- traffic -------------------------------------------------------------
  for (const car of world.cars) {
    if (car.traffic && !car.wrecked) stepTrafficCar(world, dt, car);
    else if (car.police && !car.wrecked) stepPoliceCar(world, dt, car);
  }
  // Car-car collisions (player car included).
  for (let i = 0; i < world.cars.length; i += 1) {
    for (let j = i + 1; j < world.cars.length; j += 1) {
      const a = world.cars[i];
      const b = world.cars[j];
      if (a.wrecked && b.wrecked) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < 44 && d > 0.01) {
        const push = (44 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 180) {
          world.events.push('crash');
          // A hard shunt dents both cars (4), it does not total them.
          a.health -= 4; b.health -= 4;
          addParticles(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#f2c230', 160, 0.4);
        }
        a.speed *= 0.85; b.speed *= 0.85;
        if (a.health <= 0) wreckCar(world, a);
        if (b.health <= 0) wreckCar(world, b);
      }
    }
  }
  // Player car vs peds.
  if (p.car && !p.car.wrecked && Math.abs(p.car.speed) > 120) {
    for (const ped of world.peds) {
      if (ped.dead) continue;
      if (dist(ped.x, ped.y, p.car.x, p.car.y) < 34) hurtPed(world, ped, 100, true);
    }
  }

  // ---- pedestrians ---------------------------------------------------------
  for (const ped of world.peds) {
    if (ped.dead) { ped.deadT += dt; continue; }
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.x += Math.cos(a) * 170 * dt;
      ped.y += Math.sin(a) * 170 * dt;
      ped.angle = a;
    } else {
      // Walk along the sidewalk, turn around at the block ends.
      if (ped.horizontal) {
        ped.x += ped.dir * ped.speed * dt;
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
        if (ped.x < 90 || ped.x > WORLD_SIZE - 90) ped.dir *= -1;
        if (Math.abs(ped.x - nearestRoadCenter(ped.x)) < 60 && chance(world.rng, 0.002)) ped.dir *= -1;
      } else {
        ped.y += ped.dir * ped.speed * dt;
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (ped.y < 90 || ped.y > WORLD_SIZE - 90) ped.dir *= -1;
        if (Math.abs(ped.y - nearestRoadCenter(ped.y)) < 60 && chance(world.rng, 0.002)) ped.dir *= -1;
      }
    }
    resolveCircle(world, ped, 10);
  }
  // Respawn peds that wandered off or died a while ago.
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    if (world.peds[i].dead && world.peds[i].deadT > 20) world.peds.splice(i, 1);
  }
  while (world.peds.length < 30) {
    const road = pick(world.rng, ROAD_CENTERS);
    const along = range(world.rng, 300, WORLD_SIZE - 300);
    // Spawn away from the player so they pop in off-screen.
    if (dist(along, road, p.x, p.y) < 700) continue;
    if (world.rng() < 0.5) makePed(world, along, road + 62);
    else makePed(world, road + 62, along);
  }

  // ---- police --------------------------------------------------------------
  maintainPolice(world, dt);
  for (const cop of world.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const hasLos = moveWalker(world, cop, p.x, p.y, 215, dt, 380, true);
    resolveCircle(world, cop, 10);
    cop.shootCd -= dt;
    if (hasLos && d < 380 && cop.shootCd <= 0 && !world.over) {
      cop.shootCd = range(world.rng, 1.1, 1.7);
      const a = Math.atan2(p.y - cop.y, p.x - cop.x);
      fireBullet(world, cop.x, cop.y, a + range(world.rng, -0.14, 0.14), 'cop', 7, 560);
      world.events.push('enemy_shot');
    }
    // Busted: a cop stands next to you on foot while wanted.
    if (!p.car && d < 32 && world.stars >= 1) {
      p.bustT += dt;
      if (p.bustT > 1.5) {
        world.screen = 'busted';
        world.screenT = 0;
        world.over = true;
        if (world.mission) world.mission.failed = true;
      }
    } else {
      p.bustT = Math.max(0, p.bustT - dt);
    }
  }
  world.cops = world.cops.filter((c) => !c.dead || c.deadT < 5);
  for (const c of world.cops) if (c.dead) c.deadT = (c.deadT ?? 0) + dt;

  // ---- enemies -------------------------------------------------------------
  for (const en of world.enemies) {
    if (en.dead) continue;
    const d = dist(en.x, en.y, p.x, p.y);
    const hasLos = moveWalker(world, en, p.x, p.y, en.speed, dt, 430);
    resolveCircle(world, en, 11);
    en.shootCd -= dt;
    if (hasLos && d < 430 && en.shootCd <= 0 && !world.over) {
      en.shootCd = en.boss ? range(world.rng, 0.7, 1.1) : range(world.rng, 1.1, 1.9);
      const a = Math.atan2(p.y - en.y, p.x - en.x);
      // Enemies are dangerous in numbers, not individually: a single shot
      // stings (6 / 9 for the boss) instead of shredding, so a fair gunfight
      // is winnable without perfect cover.
      fireBullet(world, en.x, en.y, a + range(world.rng, -0.13, 0.13), 'enemy', en.boss ? 9 : 6, 560);
      world.events.push('enemy_shot');
    }
  }

  // ---- bullets -------------------------------------------------------------
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD_SIZE || b.y > WORLD_SIZE;
    if (!dead && pointInBuilding(world, b.x, b.y)) {
      addParticles(world, b.x, b.y, 4, '#c9c9c9', 100, 0.3);
      dead = true;
    }
    if (!dead) {
      if (b.from === 'player') {
        for (const ped of world.peds) {
          if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 14) { hurtPed(world, ped, 100, true); dead = true; break; }
        }
        if (!dead) for (const en of world.enemies) {
          if (!en.dead && dist(b.x, b.y, en.x, en.y) < 15) { hurtEnemy(world, en, b.damage); dead = true; break; }
        }
        if (!dead) for (const cop of world.cops) {
          if (!cop.dead && dist(b.x, b.y, cop.x, cop.y) < 14) { hurtCop(world, cop, b.damage); dead = true; break; }
        }
        if (!dead) for (const car of world.cars) {
          if (!car.wrecked && car !== p.car && dist(b.x, b.y, car.x, car.y) < 26) {
            car.health -= 12;
            addParticles(world, b.x, b.y, 5, '#f2c230', 120, 0.3);
            if (car.health <= 0) wreckCar(world, car);
            dead = true; break;
          }
        }
      } else if (!world.over) {
        if (p.car) {
          if (dist(b.x, b.y, p.car.x, p.car.y) < 26) {
            p.car.health -= b.damage;
            if (p.car.health <= 0) wreckCar(world, p.car);
            dead = true;
          }
        } else if (dist(b.x, b.y, p.x, p.y) < 13) {
          damagePlayer(world, b.damage);
          dead = true;
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }

  // ---- particles -----------------------------------------------------------
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const pt = world.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }

  // ---- pickups -------------------------------------------------------------
  for (const pk of world.pickups) {
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.taken = false;
      continue;
    }
    if (!p.car && dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      pk.respawnT = PICKUP_RESPAWN_S;
      if (pk.kind === 'health') { p.health = Math.min(100, p.health + 50); world.message = { text: 'Health +50', t: 2 }; }
      if (pk.kind === 'armor') { p.armor = Math.min(100, p.armor + 50); world.message = { text: 'Armor +50', t: 2 }; }
      if (pk.kind === 'cash') { p.money += 75; world.message = { text: 'Found $75', t: 2 }; }
      world.events.push('pickup');
    }
  }

  // ---- mission logic -------------------------------------------------------
  stepMission(world, dt);

  // Health regen after a quiet spell.
  if (world.time - world.lastCrime > 8 && p.health > 0 && p.health < 100) {
    p.health = Math.min(100, p.health + 3 * dt);
  }
}

function wreckCar(world, car) {
  if (car.wrecked) return;
  car.wrecked = true;
  car.speed = 0;
  addParticles(world, car.x, car.y, 20, '#555', 200, 0.9);
  world.events.push('crash');
  const p = world.player;
  if (p.car === car) {
    p.car = null;
    p.x = car.x + 40;
    p.y = car.y;
    damagePlayer(world, 10);
    world.message = { text: 'Your car is wrecked!', t: 2.5 };
  }
  if (car.mission === 'deliver' && world.mission?.step?.type === 'deliver') {
    failMission(world, 'The delivery car was destroyed.');
  }
}

function stepPlayerOnFoot(world, dt, input) {
  const p = world.player;
  const mv = input.move;
  const speed = input.run ? 300 : 200;
  if (mv.active) {
    p.x += mv.x * speed * dt;
    p.y += mv.y * speed * dt;
    p.angle = Math.atan2(mv.y, mv.x);
  }
  resolveCircle(world, p, 12);
  // Face the mouse when armed with the pistol.
  if (p.weapon === 'pistol' && input.aim) {
    p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
  }
  // Enter a car.
  if (input.enterPressed) {
    let best = null;
    let bestD = 60;
    for (const car of world.cars) {
      if (car.wrecked) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      p.car = best;
      best.traffic = false;
      // During a getaway (escape / survive) the wanted level is set by the
      // mission, not by each new crime: stealing a fresh getaway car must not
      // re-arm the heat and spiral the stars back up while the player is
      // trying to lose the cops.
      const inGetaway = world.mission?.step?.type === 'escape' || world.mission?.step?.type === 'survive';
      if (best.police) {
        if (!inGetaway) addCrime(world, 20);
        world.message = { text: 'You stole a police cruiser!', t: 2.5 };
      } else if (!best.mission) {
        if (!inGetaway) addCrime(world, 12);
        world.stats.carsStolen += 1;
        world.message = { text: 'Car stolen — that\'s a crime, Jax.', t: 2.5 };
      }
      best.police = false;
      p.speed = 0;
      world.events.push('enter_car');
      if (world.mission?.step?.type === 'steal_car') advanceStep(world);
    }
  }
  // Punch.
  if (input.punchPressed && p.punchCd <= 0) {
    p.punchCd = 0.35;
    world.events.push('punch');
    const reach = 48;
    const ax = Math.cos(p.angle);
    const ay = Math.sin(p.angle);
    const tryHit = (e, r, fn) => {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < reach + r && (dx * ax + dy * ay) / (d || 1) > 0.3) { fn(e); return true; }
      return false;
    };
    let hit = false;
    for (const ped of world.peds) if (!ped.dead && tryHit(ped, 10, (e) => hurtPed(world, e, 100, true))) { hit = true; break; }
    if (!hit) for (const en of world.enemies) if (!en.dead && tryHit(en, 11, (e) => hurtEnemy(world, e, 25))) { hit = true; break; }
    if (!hit) for (const cop of world.cops) if (!cop.dead && tryHit(cop, 10, (e) => hurtCop(world, e, 25))) { hit = true; break; }
    if (hit) world.events.push('punch_hit');
  }
  // Shoot.
  if (p.weapon === 'pistol' && input.shootHeld && p.shootCd <= 0 && p.reloadT <= 0) {
    if (p.mag > 0) {
      p.shootCd = 0.22;
      p.mag -= 1;
      world.stats.shotsFired += 1;
      const a = input.aim ? Math.atan2(input.aim.y - p.y, input.aim.x - p.x) : p.angle;
      // The pistol hits hard enough that a regular enforcer goes down in two
      // clean shots — a gunfight should be won by landing shots, not by
      // emptying three mags into one target.
      fireBullet(world, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a + range(world.rng, -0.02, 0.02), 'player', 40);
      world.events.push('shot');
      addParticles(world, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 3, '#ffd43b', 200, 0.15);
      // Witnesses: a nearby ped or cop sees the shot. During a mission the
      // job itself is the crime — the wanted level comes from the mission
      // design, not from every trigger pull — so free-roam shots only.
      let witnessed = false;
      for (const ped of world.peds) if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) < 400) { witnessed = true; break; }
      if (!witnessed) for (const cop of world.cops) if (!cop.dead && dist(cop.x, cop.y, p.x, p.y) < 500) { witnessed = true; break; }
      const inMission = world.mission && !world.mission.done && world.mission.step;
      if (witnessed && !inMission) addCrime(world, 3);
      if (p.mag === 0) p.reloadT = 1.1;
    }
  }
  if (input.reloadPressed && p.mag < p.magSize && p.reloadT <= 0) p.reloadT = 1.1;
  if (input.switchPressed) {
    p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
    world.events.push('switch');
  }
}

function stepPlayerCar(world, dt, input) {
  const p = world.player;
  const car = p.car;
  const mv = input.move;
  const forward = mv.y < 0 ? 1 : mv.y > 0 ? -0.55 : 0; // W = forward, S = reverse/brake
  const accel = 780;
  if (forward !== 0) car.speed += forward * accel * dt;
  else car.speed *= Math.max(0, 1 - 1.6 * dt); // coast
  car.speed = clamp(car.speed, -220, 540);
  const steer = mv.x;
  // Steering stays responsive even at low speed (floor 0.4): a car wedged
  // against a wall at 20px/s could otherwise never turn its wheels enough to
  // back out, and would sit rocking in place forever. The floor keeps the
  // car maneuverable in tight spots without making it twitchy at speed.
  const steerFactor = Math.max(0.4, clamp(Math.abs(car.speed) / 160, 0, 1));
  car.angle += steer * 3.2 * steerFactor * dt * Math.sign(car.speed || 1);
  const beforeX = car.x;
  const beforeY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  resolveCircle(world, car, 22);
  const moved = dist(beforeX, beforeY, car.x, car.y);
  const expected = Math.abs(car.speed) * dt;
  if (expected > 4 && moved < expected * 0.35) {
    // Hit a wall hard. A scrape costs a little paint (2), and only at real
    // speed — a car grinding along a wall at low speed should not melt.
    if (Math.abs(car.speed) > 380) {
      car.health -= 2;
      world.events.push('crash');
      addParticles(world, car.x, car.y, 8, '#f2c230', 160, 0.4);
      if (car.health <= 0) wreckCar(world, car);
    }
    car.speed *= 0.55;
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  // Tire smoke when drifting hard.
  if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 300 && world.rng() < 0.4) {
    addParticles(world, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, '#888888', 30, 0.6);
  }
  // Exit the car.
  if (input.enterPressed) {
    const carRef = car;
    p.car = null;
    carRef.speed = 0;
    p.x = carRef.x + Math.cos(carRef.angle + Math.PI / 2) * 34;
    p.y = carRef.y + Math.sin(carRef.angle + Math.PI / 2) * 34;
    resolveCircle(world, p, 12);
    world.events.push('exit_car');
  }
}

function stepTrafficCar(world, dt, car) {
  car.turnCd -= dt;
  const speed = car.cruise;
  // Brake if a car is directly ahead.
  let blocked = false;
  const ax = car.axis === 'x' ? 1 : 0;
  for (const other of world.cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = ax ? dx * car.dir : dy * car.dir;
    const side = ax ? Math.abs(dy) : Math.abs(dx);
    if (along > 0 && along < 80 && side < 30) { blocked = true; break; }
  }
  const target = blocked ? 0 : speed;
  car.speed += clamp(target - car.speed, -500 * dt, 300 * dt);
  if (car.axis === 'x') car.x += car.dir * car.speed * dt;
  else car.y += car.dir * car.speed * dt;
  car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  // At an intersection, sometimes turn.
  const cross = car.axis === 'x' ? nearestRoadCenter(car.y) : nearestRoadCenter(car.x);
  const perp = car.axis === 'x' ? car.y : car.x;
  if (Math.abs(perp - cross) < 26 && car.turnCd <= 0 && world.rng() < 0.35) {
    car.turnCd = 2;
    if (car.axis === 'x') {
      car.axis = 'y';
      car.y = cross;
      car.dir = world.rng() < 0.5 ? 1 : -1;
      car.x = nearestRoadCenter(car.x) + (world.rng() < 0.5 ? -24 : 24);
    } else {
      car.axis = 'x';
      car.x = cross;
      car.dir = world.rng() < 0.5 ? 1 : -1;
      car.y = nearestRoadCenter(car.y) + (world.rng() < 0.5 ? -24 : 24);
    }
  }
  car.x = clamp(car.x, 40, WORLD_SIZE - 40);
  car.y = clamp(car.y, 40, WORLD_SIZE - 40);
}

function stepPoliceCar(world, dt, car) {
  const p = world.player;
  const target = p.car ?? p;
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  const diff = angDiff(car.angle, desired);
  const maxTurn = 3.4 * dt;
  car.angle += clamp(diff, -maxTurn, maxTurn);
  const maxSpeed = 360 + world.stars * 22;
  if (car.backoffT > 0) {
    // Just rammed: back off for a beat instead of grinding the player's car.
    car.backoffT -= dt;
    car.speed = Math.max(car.speed - 600 * dt, -160);
  } else if (car.reverseT > 0) {
    car.reverseT -= dt;
    car.speed = Math.max(car.speed - 600 * dt, -160);
  } else {
    car.speed = Math.min(car.speed + 620 * dt, maxSpeed);
  }
  const beforeX = car.x;
  const beforeY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  resolveCircle(world, car, 22);
  const moved = dist(beforeX, beforeY, car.x, car.y);
  if (Math.abs(car.speed) > 60 && moved < Math.abs(car.speed) * dt * 0.3) {
    car.stuckT += dt;
    if (car.stuckT > 1.2) {
      car.reverseT = 0.8;
      car.stuckT = 0;
    }
  } else {
    car.stuckT = 0;
  }
  // Ram the player's car, then back off — no grinding it to scrap. The ram is
  // pressure, not a wrecking ball: a getaway that ends because the car got
  // rammed to pieces in seconds is not a fair chase, and every wreck forces
  // a fresh steal (+heat), which spirals the wanted level up instead of down.
  if (p.car && car.backoffT <= 0 && dist(car.x, car.y, p.car.x, p.car.y) < 46) {
    p.car.health -= 2;
    car.backoffT = 3.0;
    if (p.car.health <= 0) wreckCar(world, p.car);
  }
}

function maintainPolice(world, dt) {
  const p = world.player;
  const wantCars = world.stars === 0 ? 0 : Math.min(5, world.stars);
  const policeCars = world.cars.filter((c) => c.police && !c.wrecked);
  if (policeCars.length < wantCars) {
    // Spawn on a road 650-900 away from the player.
    for (let tries = 0; tries < 12; tries += 1) {
      const a = world.rng() * TAU;
      const r = range(world.rng, 650, 900);
      const x = clamp(p.x + Math.cos(a) * r, 60, WORLD_SIZE - 60);
      const y = clamp(p.y + Math.sin(a) * r, 60, WORLD_SIZE - 60);
      const roadX = nearestRoadCenter(x);
      const roadY = nearestRoadCenter(y);
      const sx = Math.abs(x - roadX) < Math.abs(y - roadY) ? roadX : x;
      const sy = Math.abs(x - roadX) < Math.abs(y - roadY) ? y : roadY;
      if (dist(sx, sy, p.x, p.y) < 500) continue;
      const car = makeCar(world, sx, sy, Math.atan2(p.y - sy, p.x - sx), { police: true, color: '#1c2733' });
      car.health = 120;
      break;
    }
  }
  if (policeCars.length > wantCars) {
    if (wantCars === 0) {
      // Wanted level is zero: the cops give up and leave. Leaving them
      // around lets them keep ramming — and physically pinning — a player who
      // already lost them, which is not a fair chase.
      for (const c of policeCars) world.cars.splice(world.cars.indexOf(c), 1);
      return;
    }
    // Remove the farthest one.
    let far = null;
    let farD = 0;
    for (const c of policeCars) {
      const d = dist(c.x, c.y, p.x, p.y);
      if (d > farD) { farD = d; far = c; }
    }
    if (far && farD > 900) world.cars.splice(world.cars.indexOf(far), 1);
  }
  // Foot cops at 2+ stars.
  const wantCops = world.stars >= 2 ? Math.min(4, world.stars - 1) : 0;
  const liveCops = world.cops.filter((c) => !c.dead);
  if (liveCops.length < wantCops) {
    for (let tries = 0; tries < 8; tries += 1) {
      const a = world.rng() * TAU;
      const r = range(world.rng, 280, 420);
      const x = clamp(p.x + Math.cos(a) * r, 40, WORLD_SIZE - 40);
      const y = clamp(p.y + Math.sin(a) * r, 40, WORLD_SIZE - 40);
      if (pointInBuilding(world, x, y)) continue;
      world.cops.push({ x, y, angle: 0, health: 50, shootCd: 1, dead: false, deadT: 0 });
      break;
    }
  }
}

function stepMission(world, dt) {
  const m = world.mission;
  if (!m || m.done || m.failed || !m.step || world.over) return;
  const p = world.player;
  const step = m.step;
  const place = missionPlace(step);
  if (step.type === 'goto') {
    if (place && dist(p.x, p.y, place.x, place.y) < 80) {
      if (step.needCar && !p.car) {
        world.message = { text: 'You need to be in a car for this.', t: 2 };
      } else {
        world.events.push('step_done');
        advanceStep(world);
      }
    }
  } else if (step.type === 'deliver') {
    m.timer -= dt;
    const car = world.cars.find((c) => c.mission === 'deliver' && !c.wrecked);
    if (!car) return; // wreckCar already failed the mission
    if (place && p.car === car && dist(p.x, p.y, place.x, place.y) < 80) {
      world.events.push('step_done');
      advanceStep(world);
    } else if (m.timer <= 0) {
      failMission(world, 'Out of time — the package went cold.');
    }
  } else if (step.type === 'kill') {
    if (m.kills >= step.count) {
      world.events.push('step_done');
      advanceStep(world);
    }
  } else if (step.type === 'hold') {
    if (place && dist(p.x, p.y, place.x, place.y) < 70) {
      m.holdProgress += dt;
      if (m.holdProgress >= step.seconds) {
        world.events.push('step_done');
        advanceStep(world);
      }
    }
  } else if (step.type === 'escape') {
    if (world.stars === 0) {
      world.events.push('step_done');
      advanceStep(world);
    }
  } else if (step.type === 'survive') {
    m.timer -= dt;
    if (m.timer <= 0) {
      world.events.push('step_done');
      advanceStep(world);
    }
  }
}
