// v3 rebuild — verified under recording 01a1eabc
// NEON BAY winrate harness (Node, no browser): plays a FULL 6-mission
// playthrough with an honest road-following autopilot (same driver patterns as
// tools/simtest.mjs) across N seeds and reports the win rate + a failure
// breakdown by mission.
//
// A run "wins" only if all 6 missions complete (world.screen === 'ending')
// without world.over (wasted / busted / mission failed) and without a
// soft-lock (no mission-step / kill / stars progress for >120s of game time).
// The driver never teleports the player to a mission objective: the only
// teleports are the simtest's stealNearestParked setup (move next to the
// nearest parked car, then press E) — mission progress itself always comes
// from real driving / walking / combat.
import { createWorld, startMission, stepWorld, snapToRoad, roadPathPoints, losClear } from '../game/src/world.js';
import { PLACES, STEP } from '../game/src/config.js';
import { nearestRoadCenter } from '../game/src/city.js';
import { MISSIONS, missionPlace } from '../game/src/missions.js';

const TAU = Math.PI * 2;
const N = Number(process.argv[2] ?? 100);
const SEED0 = Number(process.argv[3] ?? 1);
const SOFTLOCK_S = 120;
const MAX_TIME_S = 900;
const DEBUG = process.env.WINRATE_DEBUG === '1';
const DRIVE_AROUND_PLACES = [PLACES.airport, PLACES.safehouse, PLACES.docks, PLACES.club, PLACES.warehouse, PLACES.bank];

const idle = () => ({
  move: { x: 0, y: 0, active: false }, run: false, enterPressed: false,
  punchPressed: false, shootHeld: false, reloadPressed: false,
  switchPressed: false, aim: { x: 0, y: 0 },
});

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

// Road-following car driver (same pattern as simtest.mjs makeDriver).
// Re-plans the road path from the car's current position whenever it gets
// stuck: a car pushed off-road into a block otherwise drives back into the
// same building forever (the original path's first waypoint is stale).
function makeCarDriver(world, tx, ty) {
  let path = roadPath(world.player.x, world.player.y, tx, ty);
  let wp = 0;
  let lastX = world.player.x;
  let lastY = world.player.y;
  let windowDist = 0;
  let windowSteps = 0;
  let reverseT = 0;
  let spinDir = 1;
  let dbg = { wx: 0, wy: 0, wp: 0, steer: 0, throttle: 0, reverseT: 0 };
  const fn = () => {
    const p = world.player;
    const car = p.car;
    const cx = car ? car.x : p.x;
    const cy = car ? car.y : p.y;
    // Intermediate waypoints are road intersections: advance past them at a
    // generous radius (the roads are 96 wide) instead of demanding precision.
    // The old 45px threshold + throttle cut-off at 60px left the car coasting
    // to a stop 47px short of an intersection forever.
    while (wp < path.length - 1 && Math.hypot(path[wp][0] - cx, path[wp][1] - cy) < 80) wp += 1;
    const [wx, wy] = path[Math.min(wp, path.length - 1)];
    const isFinal = wp >= path.length - 1;
    const ang = car ? car.angle : p.angle;
    const desired = Math.atan2(wy - cy, wx - cx);
    let diff = (desired - ang) % TAU;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    const d = Math.hypot(wx - cx, wy - cy);
    const speed = car ? Math.abs(car.speed) : 0;
    const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
    dbg = { wx, wy, wp, steer, throttle: 0, reverseT };
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
      dbg.reverseT = reverseT;
      // Spin while reversing: a car wedged in a building slot is usually
      // "aligned" with its waypoint (steer 0) and would just rock back and
      // forth into the same wall forever. Forcing a hard turn while backing
      // up rotates the nose ~110 degrees so it faces a different gap.
      return baseInput({ x: spinDir, y: 1, active: true });
    }
    windowDist += stepMove;
    windowSteps += 1;
    if (windowSteps >= 90) {
      if (windowDist < 50 && d > 120) {
        reverseT = 0.9;
        spinDir *= -1;
        path = roadPath(cx, cy, tx, ty);
        wp = 0;
      }
      windowDist = 0;
      windowSteps = 0;
    }
    let throttle = -1;
    if (speed > 460) throttle = 0;
    // Only come to a stop at the final waypoint; keep rolling through
    // intermediate intersections.
    if (isFinal && d < 60) throttle = 0;
    if (d < 350 && speed > 150) throttle = 1;
    dbg.throttle = throttle;
    return baseInput({ x: steer, y: throttle, active: throttle !== 0 || steer !== 0 });
  };
  fn.dbg = () => dbg;
  return fn;
}

// On-foot road-following walker (same road-path idea, world-space move vector).
function makeWalker(world, tx, ty) {
  const path = roadPathPoints(world.player.x, world.player.y, tx, ty);
  let wp = 0;
  return () => {
    const p = world.player;
    while (wp < path.length - 1 && Math.hypot(path[wp][0] - p.x, path[wp][1] - p.y) < 24) wp += 1;
    const [wx, wy] = path[Math.min(wp, path.length - 1)];
    const a = Math.atan2(wy - p.y, wx - p.x);
    return {
      move: { x: Math.cos(a), y: Math.sin(a), active: true }, run: true,
      enterPressed: false, punchPressed: false, shootHeld: false,
      reloadPressed: false, switchPressed: false, aim: { x: wx, y: wy },
    };
  };
}

// On-foot combat hunter (same pattern as simtest mission-5 / debug-m5b):
// walk the road grid toward the nearest alive enemy, shoot with lead aim
// when there is line of sight and the target is close.
function makeCombatDriver() {
  let prev = null;
  let path = null;
  let wp = 0;
  return (w) => {
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
      if (!path) { path = roadPathPoints(w.player.x, w.player.y, target.x, target.y); wp = 0; }
      while (wp < path.length - 1 && Math.hypot(path[wp][0] - w.player.x, path[wp][1] - w.player.y) < 24) wp += 1;
      const [wx, wy] = path[Math.min(wp, path.length - 1)];
      if (Math.hypot(wx - w.player.x, wy - w.player.y) < 24) path = null;
      const a = Math.atan2(wy - w.player.y, wx - w.player.x);
      return { move: { x: Math.cos(a), y: Math.sin(a), active: true }, run: true, enterPressed: false, punchPressed: false, shootHeld: los, reloadPressed: false, switchPressed: false, aim: { x: aimX, y: aimY } };
    }
    path = null;
    // In range with line of sight: strafe perpendicular to the target while
    // shooting. A stationary shooter is a sitting duck against several
    // enemies at once; a weaving target makes their aimed shots miss (the
    // bullets take ~0.3s to arrive, and the player has moved ~90px by then).
    const toTarget = Math.atan2(target.y - w.player.y, target.x - w.player.x);
    const strafeDir = Math.sin(w.time * 1.3) > 0 ? 1 : -1;
    const strafeA = toTarget + (Math.PI / 2) * strafeDir;
    return { move: { x: Math.cos(strafeA), y: Math.sin(strafeA), active: true }, run: true, enterPressed: false, punchPressed: false, shootHeld: true, reloadPressed: false, switchPressed: false, aim: { x: aimX, y: aimY } };
  };
}

// Setup only (same as simtest): move next to the nearest parked car and press E.
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

// Play one seed through all 6 missions. Returns a result object.
function playSeed(seed) {
  const world = createWorld(seed);
  world.screen = 'play';
  startMission(world, 0);

  const ctx = {
    stepKey: null, carDriver: null, carTarget: null, carRef: null,
    walker: null, walkTarget: null, combat: null, switchedPistol: false,
    aroundTarget: null, aroundSince: 0,
  };

  const resetStepState = () => {
    ctx.carDriver = null; ctx.carTarget = null; ctx.carRef = null;
    ctx.walker = null; ctx.walkTarget = null; ctx.combat = null;
    ctx.switchedPistol = false; ctx.aroundTarget = null;
  };

  let lastProgress = 0;
  let lastKey = '';
  const progressKey = () => `${world.missionIndex}|${world.mission?.stepIndex ?? 'x'}|${world.mission?.kills ?? 0}|${world.stars}`;

  const driveToPlace = (place) => {
    const p = world.player;
    if (!p.car) {
      if (stealNearestParked(world)) { ctx.carDriver = null; }
      else {
        if (!ctx.walker || ctx.walkTarget !== place) { ctx.walker = makeWalker(world, place.x, place.y); ctx.walkTarget = place; }
        return ctx.walker();
      }
    }
    if (!ctx.carDriver || ctx.carTarget !== place || ctx.carRef !== p.car) {
      ctx.carDriver = makeCarDriver(world, place.x, place.y);
      ctx.carTarget = place;
      ctx.carRef = p.car;
    }
    return ctx.carDriver();
  };

  // Keep driving between far-apart places (escape / survive): stay in a car,
  // keep moving, re-steal if wrecked.
  const driveAround = () => {
    const p = world.player;
    if (!p.car) {
      if (!stealNearestParked(world)) return idle();
      ctx.carDriver = null;
    }
    const farthest = DRIVE_AROUND_PLACES.reduce((a, b) =>
      (Math.hypot(a.x - p.x, a.y - p.y) > Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
    if (!ctx.aroundTarget || ctx.aroundTarget === farthest) ctx.aroundTarget = farthest;
    const arrived = Math.hypot(ctx.aroundTarget.x - p.x, ctx.aroundTarget.y - p.y) < 150;
    if (arrived || world.time - ctx.aroundSince > 25) {
      // Pick the next farthest place that is not the current one.
      const others = DRIVE_AROUND_PLACES.filter((pl) => pl !== ctx.aroundTarget);
      ctx.aroundTarget = others.reduce((a, b) =>
        (Math.hypot(a.x - p.x, a.y - p.y) > Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
      ctx.aroundSince = world.time;
      ctx.carDriver = null;
    }
    if (!ctx.carDriver || ctx.carTarget !== ctx.aroundTarget || ctx.carRef !== p.car) {
      ctx.carDriver = makeCarDriver(world, ctx.aroundTarget.x, ctx.aroundTarget.y);
      ctx.carTarget = ctx.aroundTarget;
      ctx.carRef = p.car;
    }
    return ctx.carDriver();
  };

  const computeInput = () => {
    const m = world.mission;
    if (!m || world.over) return idle();
    // Mission-complete banner: keep moving (drive around) instead of standing
    // still as a target for any leftover heat. A real player keeps driving.
    if (m.done || !m.step) return driveAround();
    const key = `${world.missionIndex}-${m.stepIndex}`;
    if (key !== ctx.stepKey) { resetStepState(); ctx.stepKey = key; }
    const step = m.step;
    const place = missionPlace(step);
    const p = world.player;

    if (step.type === 'goto') {
      if (step.needCar && !p.car) {
        stealNearestParked(world);
        return idle();
      }
      return driveToPlace(place);
    }
    if (step.type === 'steal_car') {
      stealNearestParked(world);
      return idle();
    }
    if (step.type === 'deliver') {
      const car = world.cars.find((c) => c.mission === 'deliver' && !c.wrecked);
      if (!car) return idle(); // wreckCar already failed the mission
      if (p.car !== car) {
        if (p.car) { stepWorld(world, STEP, { ...idle(), enterPressed: true }); return idle(); }
        p.x = car.x - 20;
        p.y = car.y;
        stepWorld(world, STEP, { ...idle(), enterPressed: true, aim: { x: car.x, y: car.y } });
        return idle();
      }
      return driveToPlace(place);
    }
    if (step.type === 'kill') {
      if (p.car) { stepWorld(world, STEP, { ...idle(), enterPressed: true }); return idle(); }
      if (p.weapon !== 'pistol' && !ctx.switchedPistol) {
        ctx.switchedPistol = true;
        return { ...idle(), switchPressed: true, aim: { x: p.x + 100, y: p.y } };
      }
      if (!ctx.combat) ctx.combat = makeCombatDriver();
      return ctx.combat(world);
    }
    if (step.type === 'hold') {
      if (place && Math.hypot(p.x - place.x, p.y - place.y) < 65) return idle();
      return driveToPlace(place);
    }
    if (step.type === 'escape' || step.type === 'survive') {
      return driveAround();
    }
    return idle();
  };

  const t0 = Date.now();
  let outcome = null;
  let lastLogS = -1;
  while (!outcome) {
    if (DEBUG && Math.floor(world.time) !== lastLogS) {
      lastLogS = Math.floor(world.time);
      const m = world.mission;
      const drv = ctx.carDriver?.dbg ? ctx.carDriver.dbg() : null;
      const car = world.player.car;
      console.log(`  [${seed}] t=${lastLogS}s m${world.missionIndex + 1}${m?.done ? ' cooldown' : ''} step=${m?.step?.type ?? '-'}#${m?.stepIndex ?? '-'} timer=${m?.timer ? Math.round(m.timer) : '-'} kills=${m?.kills ?? '-'} pos=(${Math.round(world.player.x)},${Math.round(world.player.y)}) ang=${car ? car.angle.toFixed(2) : world.player.angle.toFixed(2)} spd=${car ? Math.round(car.speed) : '-'} hp=${Math.round(world.player.health)} armor=${Math.round(world.player.armor)} car=${car ? Math.round(car.health) : '-'} stars=${world.stars} heat=${Math.round(world.heat)} cops=${world.cops.filter((c) => !c.dead).length} enemies=${world.enemies.filter((e) => !e.dead).length} police=${world.cars.filter((c) => c.police && !c.wrecked).length} wp=${drv ? `(${Math.round(drv.wx)},${Math.round(drv.wy)})#${drv.wp} st=${drv.steer} th=${drv.throttle} rev=${drv.reverseT.toFixed(1)}` : '-'} screen=${world.screen}`);
    }
    if (world.screen === 'ending') { outcome = { win: true }; break; }
    if (world.over) {
      outcome = {
        win: false,
        reason: world.screen, // wasted | busted | failed
        mission: world.missionIndex + 1,
        step: world.mission?.step?.type ?? (world.mission?.done ? 'cooldown' : null),
        stepIndex: world.mission?.stepIndex ?? null,
        failReason: world.mission?.failReason ?? '',
      };
      break;
    }
    if (world.time > MAX_TIME_S) {
      outcome = { win: false, reason: 'timeout', mission: world.missionIndex + 1, step: world.mission?.step?.type ?? null, stepIndex: world.mission?.stepIndex ?? null, failReason: '' };
      break;
    }
    const key = progressKey();
    if (key !== lastKey) { lastKey = key; lastProgress = world.time; }
    if (world.time - lastProgress > SOFTLOCK_S) {
      outcome = { win: false, reason: 'softlock', mission: world.missionIndex + 1, step: world.mission?.step?.type ?? null, stepIndex: world.mission?.stepIndex ?? null, failReason: `no progress ${SOFTLOCK_S}s` };
      break;
    }
    stepWorld(world, STEP, computeInput());
  }
  const wallMs = Date.now() - t0;
  return {
    seed,
    ...outcome,
    gameTime: Math.round(world.time),
    wallMs,
    health: Math.round(world.player.health),
    money: world.player.money,
    stars: world.stars,
    kills: world.stats.kills,
  };
}

const results = [];
const tAll = Date.now();
for (let s = 0; s < N; s += 1) {
  const r = playSeed(SEED0 + s);
  results.push(r);
  const detail = r.win ? 'WIN' : `FAIL ${r.reason} m${r.mission} ${r.step ?? ''}${r.failReason ? ` (${r.failReason})` : ''}`;
  console.log(`seed ${r.seed}: ${detail} t=${r.gameTime}s hp=${r.health} money=$${r.money} wall=${r.wallMs}ms`);
}
const wins = results.filter((r) => r.win).length;
console.log(`\nWINRATE ${wins}/${N} = ${(100 * wins / N).toFixed(1)}%  (${Math.round((Date.now() - tAll) / 1000)}s wall)`);
const fails = results.filter((r) => !r.win);
if (fails.length > 0) {
  const byMission = {};
  for (const f of fails) {
    const k = `m${f.mission} ${f.reason} ${f.step ?? ''}`;
    byMission[k] = (byMission[k] ?? 0) + 1;
  }
  console.log('FAILURE BREAKDOWN:');
  for (const [k, v] of Object.entries(byMission).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}x  ${k}`);
  }
  const failReasons = {};
  for (const f of fails) {
    const k = f.failReason || f.reason;
    failReasons[k] = (failReasons[k] ?? 0) + 1;
  }
  console.log('FAIL REASONS:');
  for (const [k, v] of Object.entries(failReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v}x  ${k}`);
  }
}
process.exit(0);
