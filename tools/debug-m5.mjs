// v5 rebuild — Three.js 3D, verified under recording 01a1ec5a-fd3e-7487-9558-a6fe091d3690
// v4 rebuild — Three.js 3D, verified under recording 01a1ec2e-e25c-729b-9c2a-93fbc8ceda32
// Debug the mission-5 fight: log per-second state to find why the player dies
// without a kill.
import { createWorld, startMission, stepWorld, snapToRoad, losClear } from '../game/src/world.js';
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
console.log('player at', world.player.x, world.player.y);
console.log('enemies:', world.enemies.map((e) => `(${Math.round(e.x)},${Math.round(e.y)}) hp=${e.health}`).join(' '));

const idle = () => ({ move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: false, reloadPressed: false, switchPressed: false, aim: { x: 0, y: 0 } });
let prev = null;
for (let s = 0; s < 12; s += 1) {
  for (let i = 0; i < 60; i += 1) {
    if (world.over) break;
    const alive = world.enemies.filter((e) => !e.dead);
    let input = idle();
    if (alive.length > 0) {
      const target = alive[0];
      const d = Math.hypot(target.x - world.player.x, target.y - world.player.y);
      let aimX = target.x;
      let aimY = target.y;
      if (prev && prev.id === target) {
        const flight = d / 900;
        aimX = target.x + (target.x - prev.x) * flight * 60;
        aimY = target.y + (target.y - prev.y) * flight * 60;
      }
      prev = { id: target, x: target.x, y: target.y };
      input = { move: { x: 0, y: 0, active: false }, run: false, enterPressed: false, punchPressed: false, shootHeld: true, reloadPressed: false, switchPressed: false, aim: { x: aimX, y: aimY } };
    }
    stepWorld(world, STEP, input);
  }
  const alive = world.enemies.filter((e) => !e.dead);
  const nearest = alive.length ? Math.min(...alive.map((e) => Math.hypot(e.x - world.player.x, e.y - world.player.y))) : -1;
  const los = alive.length ? losClear(world, world.player.x, world.player.y, alive[0].x, alive[0].y) : false;
  console.log(`t=${s + 1}s hp=${Math.round(world.player.health)} armor=${Math.round(world.player.armor)} kills=${world.mission.kills} shots=${world.stats.shotsFired} alive=${alive.length} nearest=${Math.round(nearest)} los0=${los} over=${world.over} player=(${Math.round(world.player.x)},${Math.round(world.player.y)})`);
  if (world.over) break;
}
console.log('enemy states:', world.enemies.map((e) => `hp=${Math.round(e.health)} dead=${e.dead} pos=(${Math.round(e.x)},${Math.round(e.y)})`).join(' | '));
