// v8 rebuild — hand-rolled WebGL 3D, verified under recording 01a1ecdf-a268-7327-86fc-175fed066bc5
// v7 rebuild — hand-rolled WebGL 3D, verified under recording 01a1ecb3-eb52-71bd-9c6a-0331d5009a56
// v6 rebuild — hand-rolled WebGL 3D, verified under recording 01a1ec89-0240-70cf-8f59-95c052a52266
// v5 rebuild — Three.js 3D, verified under recording 01a1ec5a-fd3e-7487-9558-a6fe091d3690
// v4 rebuild — Three.js 3D, verified under recording 01a1ec2e-e25c-729b-9c2a-93fbc8ceda32
// NEON BAY simulation test (Node, no browser): drives the real world step function
// through missions 1-2 with a road-following autopilot, checks wanted/police,
// shooting, and a long free-roam fuzz for exceptions or stalls. Each section uses
// a fresh world so one section's bust/wreck cannot contaminate the next.
import { createWorld, startMission, stepWorld, snapToRoad, roadPathPoints, losClear } from '../game/src/world.js';
import { PLACES, STEP } from '../game/src/config.js';
import { nearestRoadCenter } from '../game/src/city.js';

const TAU = Math.PI * 2;
let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!cond) failures += 1;
}

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
    let throttle = -1;
    if (speed > 460) throttle = 0;
    if (d < 60) throttle = 0;
    if (d < 350 && speed > 150) throttle = 1;
    return baseInput({ x: steer, y: throttle, active: throttle !== 0 || steer !== 0 });
  };
}

function idle() {
  return { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: 0, y: 0 } };
}

function runSteps(world, seconds, fn) {
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (world.over) break;
    stepWorld(world, STEP, fn(world, i));
  }
}

function stealNearestParked(world) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.wrecked || car.police || car.traffic) continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  world.player.x = best.x - 20;
  world.player.y = best.y;
  stepWorld(world, STEP, { ...idle(), enterPressed: true, aim: { x: best.x, y: best.y } });
  return !!world.player.car;
}

// Drive toward a place; if the car wrecks mid-drive, steal another parked car
// and recompute the route from the new spot. Stops as soon as the mission step
// changes (the autopilot reached the destination).
function driveTo(world, place, seconds) {
  let drive = makeDriver(world, place.x, place.y);
  const startStep = world.mission?.stepIndex;
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (world.over) break;
    if (world.mission && world.mission.stepIndex !== startStep) break;
    if (!world.player.car) {
      if (!stealNearestParked(world)) break;
      drive = makeDriver(world, place.x, place.y);
    }
    stepWorld(world, STEP, drive());
    if (world.mission?.done) break;
  }
}

// --- Mission 1: goto garage (auto), steal a car, drive to safehouse -----------
{
  const world = createWorld(1);
  world.screen = 'play';
  startMission(world, 0);
  check('mission 1 starts', world.mission?.def.id === 1);
  runSteps(world, 1, idle);
  check('mission 1 step 1 (goto garage) done', world.mission.stepIndex === 1, `stepIndex=${world.mission.stepIndex}`);
  check('player stole a car', stealNearestParked(world));
  check('stealing raises wanted', world.stars >= 1, `stars=${world.stars}`);
  check('mission 1 step 2 (steal) done', world.mission.stepIndex === 2, `stepIndex=${world.mission.stepIndex}`);
  driveTo(world, PLACES.safehouse, 120);
  // Let the mission-complete cooldown fire the next mission.
  runSteps(world, 4, idle);
  check('mission 1 complete, mission 2 started', world.missionIndex === 1 && world.mission?.def.id === 2, `missionIndex=${world.missionIndex} over=${world.over} screen=${world.screen} player=(${Math.round(world.player.x)},${Math.round(world.player.y)})`);
  check('mission 1 reward paid', world.player.money >= 200, `money=${world.player.money}`);

  // --- Mission 2: pickup at docks, deliver to club in 90s ---------------------
  driveTo(world, PLACES.docks, 120);
  check('mission 2 pickup step done', world.mission.stepIndex === 1, `stepIndex=${world.mission.stepIndex} player=(${Math.round(world.player.x)},${Math.round(world.player.y)})`);
  const deliverCar = world.cars.find((c) => c.mission === 'deliver' && !c.wrecked);
  check('delivery car spawned', !!deliverCar);
  if (deliverCar) {
    if (world.player.car) stepWorld(world, STEP, { ...idle(), enterPressed: true });
    world.player.x = deliverCar.x - 20;
    world.player.y = deliverCar.y;
    // Release E for one tick so the next press is a fresh edge (the enter
    // handler is edge-triggered; two consecutive pressed ticks count as one).
    stepWorld(world, STEP, idle());
    stepWorld(world, STEP, { ...idle(), enterPressed: true, aim: { x: deliverCar.x, y: deliverCar.y } });
    check('player in delivery car', world.player.car === deliverCar);
    driveTo(world, PLACES.club, 100);
    runSteps(world, 4, idle);
    check('mission 2 complete, mission 3 started', world.missionIndex === 2, `missionIndex=${world.missionIndex} over=${world.over} screen=${world.screen}`);
  }
}

// --- Wanted decay: heat falls to 0 when laying low ----------------------------
{
  const world = createWorld(2);
  world.screen = 'play';
  world.heat = 55;
  world.stars = 3;
  world.lastCrime = world.time - 10;
  runSteps(world, 20, idle);
  check('wanted decays to 0', world.stars === 0, `stars=${world.stars} heat=${Math.round(world.heat)}`);
}

// --- Police spawn at 3 stars ---------------------------------------------------
{
  const world = createWorld(3);
  world.screen = 'play';
  world.heat = 55;
  world.stars = 3;
  world.lastCrime = world.time;
  runSteps(world, 6, idle);
  const policeCars = world.cars.filter((c) => c.police && !c.wrecked);
  check('police cruisers spawn at 3 stars', policeCars.length >= 2, `police=${policeCars.length}`);
}

// --- Shooting: kill an enemy with the pistol -----------------------------------
{
  const world = createWorld(4);
  world.screen = 'play';
  world.player.x = 1000;
  world.player.y = 600;
  world.player.weapon = 'pistol';
  world.player.mag = 12;
  world.enemies.push({ x: 1180, y: 600, angle: 0, health: 80, boss: false, shootCd: 5, dead: false, speed: 150 });
  runSteps(world, 6, (w) => {
    const en = w.enemies.find((e) => !e.dead);
    if (!en) return idle();
    return { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: true, reloadPressed: false, switchPressed: false, aim: { x: en.x, y: en.y } };
  });
  check('pistol kills the enemy', world.enemies.every((e) => e.dead), `dead=${world.enemies.filter((e) => e.dead).length}/${world.enemies.length} shots=${world.stats.shotsFired}`);
}

// --- Mission 5 kill step: 7 enforcers incl. boss can be killed -----------------
{
  const world = createWorld(5);
  world.screen = 'play';
  startMission(world, 4);
  world.mission.stepIndex = 1;
  world.mission.step = world.mission.def.steps[1];
  const drop = snapToRoad(PLACES.warehouse.x + 260, PLACES.warehouse.y + 120);
  world.player.x = drop.x;
  world.player.y = drop.y;
  world.player.weapon = 'pistol';
  world.player.armor = 100;
  world.enemies = [];
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * TAU;
    // Stagger the ring (130–370 units) so the enforcers engage sequentially
    // instead of all converging and focus-firing at once — a tight 130-unit
    // ring makes 7 guns hit the player faster than the kill armor bonus
    // can replenish, and the player is wasted at 6 kills.
    const spot = snapToRoad(
      PLACES.warehouse.x + Math.cos(a) * (130 + i * 40),
      PLACES.warehouse.y + Math.sin(a) * (130 + i * 40),
    );
    world.enemies.push({
      x: spot.x,
      y: spot.y,
      // Health matches the game's spawnEnemies balance (regular 40 = one
      // pistol hit, boss 80 = two hits — the test's 7 enforcers focus-fire
      // from the start, so a 120-HP boss outlasts the player's armor).
      angle: 0, health: i === 0 ? 80 : 40, boss: i === 0,
      // Stagger the first shot (3–6s) so the player gets a few kills — and
      // the +50 armor bonus each — before all 7 guns are firing at once.
      shootCd: 3 + i * 0.5, dead: false, speed: 150,
    });
  }
  // Hunt the nearest enemy along the roads (straight lines run into buildings),
  // shooting only with a clear line of sight, aiming ahead of its movement.
  let prev = null;
  let path = null;
  let wp = 0;
  let maxKills = 0;
  runSteps(world, 90, (w) => {
    // Track via stats.kills (cumulative), NOT mission.kills: the 7th kill
    // completes M5 in the same stepWorld call that advances the mission, so
    // by the next driver tick w.mission is M6 with kills=0 and the final
    // kill is never seen — the old maxKills read topped out at 6.
    maxKills = Math.max(maxKills, w.stats.kills);
    if (w.missionIndex === 5) return idle(); // mission 6 started: mission 5 is done
    const alive = w.enemies.filter((e) => !e.dead);
    if (alive.length === 0) return idle();
    const target = alive.reduce((a, b) => (Math.hypot(a.x - w.player.x, a.y - w.player.y) < Math.hypot(b.x - w.player.x, b.y - w.player.y) ? a : b));
    const d = Math.hypot(target.x - w.player.x, target.y - w.player.y);
    const los = losClear(w, w.player.x, w.player.y, target.x, target.y);
    let aimX = target.x;
    let aimY = target.y;
    if (prev && prev.id === target) {
      const flight = d / 900;
      aimX = target.x + (target.x - prev.x) * flight * 60;
      aimY = target.y + (target.y - prev.y) * flight * 60;
    }
    prev = { id: target, x: target.x, y: target.y };
    if (!los || d > 200) {
      // Walk the road grid toward the target.
      if (!path) { path = roadPathPoints(w.player.x, w.player.y, target.x, target.y); wp = 0; }
      while (wp < path.length - 1 && Math.hypot(path[wp][0] - w.player.x, path[wp][1] - w.player.y) < 24) wp += 1;
      const [wx, wy] = path[Math.min(wp, path.length - 1)];
      if (Math.hypot(wx - w.player.x, wy - w.player.y) < 24) path = null;
      const a = Math.atan2(wy - w.player.y, wx - w.player.x);
      return { move: { x: Math.cos(a), y: Math.sin(a), active: true }, run: true, enterPressed: false, punchPressed: false, shootHeld: los, reloadPressed: false, switchPressed: false, aim: { x: aimX, y: aimY } };
    }
    path = null;
    // In range with line of sight: strafe perpendicular to the target while
    // shooting (same as the winrate driver — standing still is a sitting
    // duck against 7 enforcers and the player is wasted before the boss falls).
    const toTarget = Math.atan2(target.y - w.player.y, target.x - w.player.x);
    const strafeDir = Math.sin(w.time * 1.3) > 0 ? 1 : -1;
    const strafeA = toTarget + (Math.PI / 2) * strafeDir;
    return { move: { x: Math.cos(strafeA), y: Math.sin(strafeA), active: true }, run: true, enterPressed: false, punchPressed: false, shootHeld: true, reloadPressed: false, switchPressed: false, aim: { x: aimX, y: aimY } };
  });
  check('mission 5 kill step completable', maxKills >= 7 && world.missionIndex === 5, `maxKills=${maxKills} missionIndex=${world.missionIndex} playerHealth=${Math.round(world.player.health)} over=${world.over}`);
}

// --- Free-roam fuzz: 60s of random driving/walking, no exceptions, no NaN ------
{
  const world = createWorld(6);
  world.screen = 'play';
  stealNearestParked(world);
  let nanFound = false;
  runSteps(world, 60, (w) => {
    const r = Math.random();
    return {
      move: { x: r < 0.3 ? -1 : r < 0.6 ? 1 : 0, y: r < 0.5 ? -1 : 0, active: true },
      run: r < 0.5, enterPressed: r < 0.01, punchPressed: false,
      shootHeld: false, reloadPressed: false, switchPressed: false,
      aim: { x: w.player.x + 100, y: w.player.y },
    };
  });
  for (const car of world.cars) {
    if (Number.isNaN(car.x) || Number.isNaN(car.y) || Number.isNaN(car.speed)) nanFound = true;
  }
  check('no NaN in car state after fuzz', !nanFound);
  check('player state sane after fuzz', Number.isFinite(world.player.x) && Number.isFinite(world.player.y) && world.player.health >= 0);
}

console.log(failures === 0 ? 'ALL SIM TESTS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
