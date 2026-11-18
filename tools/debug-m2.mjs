// v5 rebuild — Three.js 3D, verified under recording 01a1ec5a-fd3e-7487-9558-a6fe091d3690
// v4 rebuild — Three.js 3D, verified under recording 01a1ec2e-e25c-729b-9c2a-93fbc8ceda32
// Debug the mission-2 delivery: log car health, timer, heat, position per second.
import { createWorld, startMission, stepWorld } from '../game/src/world.js';
import { PLACES, STEP } from '../game/src/config.js';
import { nearestRoadCenter } from '../game/src/city.js';

const TAU = Math.PI * 2;
const world = createWorld(1);
world.screen = 'play';

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
function makeDriver(w, tx, ty) {
  const path = roadPath(w.player.x, w.player.y, tx, ty);
  let wp = 0;
  let lastX = w.player.x;
  let lastY = w.player.y;
  let windowDist = 0;
  let windowSteps = 0;
  let reverseT = 0;
  return () => {
    const p = w.player;
    const car = p.car;
    const cx = car ? car.x : p.x;
    const cy = car ? car.y : p.y;
    while (wp < path.length - 1 && Math.hypot(path[wp][0] - cx, path[wp][1] - cy) < 70) wp += 1;
    const [wx, wy] = path[Math.min(wp, path.length - 1)];
    const ang = car ? car.angle : p.angle;
    const desired = Math.atan2(wy - cy, wx - cx);
    let diff = (desired - ang) % TAU;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    const d = Math.hypot(wx - cx, wy - cy);
    const speed = car ? Math.abs(car.speed) : 0;
    const steer = diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0;
    const baseInput = (move) => ({ move, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: wx, y: wy } });
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
      if (windowDist < 40 && d > 100) reverseT = 1.0;
      windowDist = 0;
      windowSteps = 0;
    }
    let throttle = -1;
    if (speed > 460) throttle = 0;
    if (d < 60) throttle = 0;
    if (d < 300 && speed > 260) throttle = 1;
    return baseInput({ x: steer, y: throttle, active: throttle !== 0 || steer !== 0 });
  };
}
const idle = () => ({ move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: 0, y: 0 } });

function stealNearestParked(w) {
  let best = null;
  let bestD = Infinity;
  for (const car of w.cars) {
    if (car.wrecked || car.police || car.traffic) continue;
    const d = Math.hypot(car.x - w.player.x, car.y - w.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  w.player.x = best.x - 20;
  w.player.y = best.y;
  stepWorld(w, STEP, { ...idle(), enterPressed: true, aim: { x: best.x, y: best.y } });
  return !!w.player.car;
}
function driveTo(w, place, seconds) {
  let drive = makeDriver(w, place.x, place.y);
  const startStep = w.mission?.stepIndex;
  const n = Math.floor(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (w.over) break;
    if (w.mission && w.mission.stepIndex !== startStep) break;
    if (!w.player.car) {
      if (!stealNearestParked(w)) break;
      drive = makeDriver(w, place.x, place.y);
    }
    stepWorld(w, STEP, drive());
    if (w.mission?.done) break;
  }
}

startMission(world, 0);
for (let i = 0; i < 60; i += 1) stepWorld(world, STEP, idle());
stealNearestParked(world);
driveTo(world, PLACES.safehouse, 120);
for (let i = 0; i < 240; i += 1) stepWorld(world, STEP, idle());
console.log('after m1: missionIndex=', world.missionIndex, 'heat=', Math.round(world.heat), 'stars=', world.stars, 'carHealth=', world.player.car?.health);
driveTo(world, PLACES.docks, 120);
console.log('at docks: step=', world.mission.stepIndex, 'player=', Math.round(world.player.x), Math.round(world.player.y));
const deliverCar = world.cars.find((c) => c.mission === 'deliver' && !c.wrecked);
console.log('deliver car:', deliverCar ? `(${Math.round(deliverCar.x)},${Math.round(deliverCar.y)}) hp=${deliverCar.health}` : 'NONE');
if (deliverCar) {
  if (world.player.car) stepWorld(world, STEP, { ...idle(), enterPressed: true });
  world.player.x = deliverCar.x - 20;
  world.player.y = deliverCar.y;
  stepWorld(world, STEP, { ...idle(), enterPressed: true, aim: { x: deliverCar.x, y: deliverCar.y } });
  console.log('in deliver car:', world.player.car === deliverCar, 'timer=', world.mission.timer, 'heat=', Math.round(world.heat), 'stars=', world.stars);
  const drive = makeDriver(world, PLACES.club.x, PLACES.club.y);
  for (let s = 0; s < 100; s += 1) {
    for (let i = 0; i < 60; i += 1) {
      if (world.over) break;
      if (world.mission?.stepIndex !== 1) break;
      stepWorld(world, STEP, drive());
    }
    console.log(`t=${s + 1}s timer=${Math.round(world.mission?.timer ?? -1)} carHP=${Math.round(world.player.car?.health ?? -1)} deliverHP=${Math.round(deliverCar.health)} pos=(${Math.round(world.player.x)},${Math.round(world.player.y)}) speed=${Math.round(Math.abs(world.player.car?.speed ?? 0))} stars=${world.stars} over=${world.over} screen=${world.screen} fail=${world.mission?.failReason ?? ''} police=${world.cars.filter((c) => c.police && !c.wrecked).length}`);
    if (world.over || world.mission?.stepIndex !== 1) break;
  }
}
