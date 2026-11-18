// v8 rebuild — hand-rolled WebGL 3D, verified under recording 01a1ecdf-a268-7327-86fc-175fed066bc5
// v7 rebuild — hand-rolled WebGL 3D, verified under recording 01a1ecb3-eb52-71bd-9c6a-0331d5009a56
// v6 rebuild — hand-rolled WebGL 3D, verified under recording 01a1ec89-0240-70cf-8f59-95c052a52266
// v5 rebuild — Three.js 3D, verified under recording 01a1ec5a-fd3e-7487-9558-a6fe091d3690
// v4 rebuild — Three.js 3D, verified under recording 01a1ec2e-e25c-729b-9c2a-93fbc8ceda32
// Replicate the simtest mission-5 hunter verbatim, with per-second logging.
import { createWorld, startMission, stepWorld, snapToRoad, roadPathPoints, losClear } from '../game/src/world.js';
import { PLACES, STEP } from '../game/src/config.js';

const TAU = Math.PI * 2;
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
  const spot = snapToRoad(PLACES.warehouse.x + Math.cos(a) * 130, PLACES.warehouse.y + Math.sin(a) * 130);
  world.enemies.push({ x: spot.x, y: spot.y, angle: 0, health: i === 0 ? 300 : 80, boss: i === 0, shootCd: 0.5 + i * 0.2, dead: false, speed: 150 });
}

const idle = () => ({ move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: 0, y: 0 } });
let prev = null;
let path = null;
let wp = 0;
function hunter(w) {
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
  return { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: true, reloadPressed: false, switchPressed: false, aim: { x: aimX, y: aimY } };
}

for (let s = 0; s < 20; s += 1) {
  for (let i = 0; i < 60; i += 1) {
    if (world.over) break;
    stepWorld(world, STEP, hunter(world));
  }
  const alive = world.enemies.filter((e) => !e.dead);
  console.log(`t=${s + 1}s hp=${Math.round(world.player.health)} armor=${Math.round(world.player.armor)} kills=${world.mission.kills} shots=${world.stats.shotsFired} alive=${alive.length} over=${world.over} player=(${Math.round(world.player.x)},${Math.round(world.player.y)})`);
  if (world.over) break;
}
