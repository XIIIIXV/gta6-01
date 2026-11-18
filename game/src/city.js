// city.js — procedural Neon Bay city (v8 rebuild).
// Frozen layout numbers from the v8 spec. Buildings are kept out of the map
// edge strips (perimeter) — a car wedged between a building and the map
// clamp caused a seed-106 mission-5 softlock (v6 fix, kept here).

import { CITY, GRAND_TOWER } from './config.js';
import { chance, shuffle } from './random.js';

export function nearestRoadCenter(v) {
  let best = CITY.ROAD_CENTERS[0];
  let bd = Math.abs(v - best);
  for (const c of CITY.ROAD_CENTERS) {
    const d = Math.abs(v - c);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function isOnRoad(x, y) {
  const half = CITY.ROAD_WIDTH / 2;
  return (
    Math.abs(x - nearestRoadCenter(x)) <= half ||
    Math.abs(y - nearestRoadCenter(y)) <= half
  );
}

// Push a circle (x, y, r) out of an axis-aligned building rect {x, y, w, h}.
// Returns the corrected {x, y} when overlapping, else null.
export function pushOutOfBuilding(b, x, y, r) {
  const hw = b.w / 2;
  const hh = b.h / 2;
  const cx = Math.max(b.x - hw, Math.min(x, b.x + hw));
  const cy = Math.max(b.y - hh, Math.min(y, b.y + hh));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    return { x: x + dx * push, y: y + dy * push };
  }
  // Centre inside the rect: push out along the smallest penetration axis.
  const px = hw + r - Math.abs(x - b.x);
  const py = hh + r - Math.abs(y - b.y);
  if (px < py) {
    return { x: b.x + (x >= b.x ? hw + r : -hw - r), y };
  }
  return { x, y: b.y + (y >= b.y ? hh + r : -hh - r) };
}

// True when the segment (x1,y1)-(x2,y2) intersects any building rect.
export function segmentBlocked(buildings, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const b of buildings) {
    const hw = b.w / 2;
    const hh = b.h / 2;
    const minX = b.x - hw;
    const maxX = b.x + hw;
    const minY = b.y - hh;
    const maxY = b.y + hh;
    let tmin = 0;
    let tmax = 1;
    let hit = true;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < minX || x1 > maxX) hit = false;
    } else {
      let t1 = (minX - x1) / dx;
      let t2 = (maxX - x1) / dx;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) hit = false;
    }
    if (hit) {
      if (Math.abs(dy) < 1e-9) {
        if (y1 < minY || y1 > maxY) hit = false;
      } else {
        let t1 = (minY - y1) / dy;
        let t2 = (maxY - y1) / dy;
        if (t1 > t2) {
          const t = t1;
          t1 = t2;
          t2 = t;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) hit = false;
      }
    }
    if (hit) return true;
  }
  return false;
}

const WALL_COLORS = [
  '#4a5a7d', '#5e4a6e', '#6e5a4a', '#3e5a5a', '#5a3e4a',
  '#4a4a5a', '#657080', '#7d6a55', '#44506b', '#5b4a72',
];
const ROOF_COLORS = ['#2a2f45', '#33283a', '#3a2f2a', '#26333a', '#2e2a3a'];
const WINDOW_COLORS = ['#ffd27a', '#8fd0ff', '#ff9ad5', '#ffe9a8', '#9ad5ff'];

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function createCity(rng) {
  const buildings = [];
  const parks = [];
  const fountains = [];
  const trees = [];
  const palms = [];
  const lamps = [];
  const trafficLights = [];
  const hydrants = [];
  const bins = [];
  const planters = [];
  const benches = [];
  const billboards = [];
  const busStops = [];
  const barriers = [];
  const manholes = [];
  const puddles = [];

  // Blocks sit between the roads: 5 x 5 blocks, each 160 x 160, from
  // 220..380, 520..680, 820..980, 1120..1280, 1420..1580 in each axis.
  for (let bx = 0; bx < 5; bx++) {
    for (let by = 0; by < 5; by++) {
      const cx = 300 + bx * 300;
      const cy = 300 + by * 300;
      if (bx === 3 && by === 3) {
        // Grand Tower block.
        buildings.push({
          x: GRAND_TOWER.x,
          y: GRAND_TOWER.y,
          w: GRAND_TOWER.w,
          h: GRAND_TOWER.h,
          height: 260,
          wall: '#3a4a7d',
          roof: '#1c2340',
          neon: true,
          neonColor: '#37e6ff',
          windows: '#8fd0ff',
          tower: true,
        });
        continue;
      }
      if (chance(CITY.BUILDING_FILL, rng)) {
        const w = 90 + rng() * 60;
        const h = 90 + rng() * 60;
        buildings.push({
          x: cx,
          y: cy,
          w,
          h,
          height: 26 + rng() * 150,
          wall: pick(WALL_COLORS, rng),
          roof: pick(ROOF_COLORS, rng),
          neon: chance(0.25, rng),
          neonColor: pick(['#ff2e88', '#37e6ff', '#ffe14a', '#7dff5e'], rng),
          windows: pick(WINDOW_COLORS, rng),
          tower: false,
        });
      } else {
        parks.push({ x: cx, y: cy, w: 160, h: 160 });
        if (chance(0.5, rng)) {
          fountains.push({ x: cx, y: cy, r: 34 });
        }
        // Park trees.
        const n = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          trees.push({
            x: cx - 55 + rng() * 110,
            y: cy - 55 + rng() * 110,
            h: 26 + rng() * 14,
            park: true,
          });
        }
      }
    }
  }

  // Street trees: offset 95 from road centres, along the roads.
  const roadCenters = CITY.ROAD_CENTERS;
  for (let i = 0; i < 26; i++) {
    const vertical = chance(0.5, rng);
    const rc = pick(roadCenters, rng);
    const along = 100 + rng() * 1600;
    if (vertical) {
      trees.push({ x: rc + (chance(0.5, rng) ? 95 : -95), y: along, h: 24 + rng() * 12, park: false });
    } else {
      trees.push({ x: along, y: rc + (chance(0.5, rng) ? 95 : -95), h: 24 + rng() * 12, park: false });
    }
  }

  // 4 palms by the docks (1650, 150).
  for (let i = 0; i < 4; i++) {
    palms.push({ x: 1560 + i * 55, y: 235 + (i % 2) * 30, h: 52 + rng() * 10, lean: (rng() - 0.5) * 0.5 });
  }

  // Street lamps along roads (glow pools at night).
  for (let i = 0; i < 24; i++) {
    const vertical = chance(0.5, rng);
    const rc = pick(roadCenters, rng);
    const along = 120 + rng() * 1560;
    if (vertical) {
      lamps.push({ x: rc + 78, y: along });
    } else {
      lamps.push({ x: along, y: rc + 78 });
    }
  }

  // Traffic lights at intersections (18).
  const intersections = [];
  for (const rx of roadCenters) {
    for (const ry of roadCenters) intersections.push({ x: rx, y: ry });
  }
  shuffle(intersections, rng);
  for (let i = 0; i < 18; i++) {
    const it = intersections[i];
    trafficLights.push({ x: it.x + 78, y: it.y + 78, phase: rng() * 2 });
  }

  // Small props, scattered on sidewalks / road edges.
  function scatter(n, list, mk) {
    for (let i = 0; i < n; i++) {
      const vertical = chance(0.5, rng);
      const rc = pick(roadCenters, rng);
      const along = 120 + rng() * 1560;
      const off = 78 + rng() * 12;
      if (vertical) list.push(mk(rc + (chance(0.5, rng) ? off : -off), along));
      else list.push(mk(along, rc + (chance(0.5, rng) ? off : -off)));
    }
  }
  scatter(10, hydrants, (x, y) => ({ x, y }));
  scatter(14, bins, (x, y) => ({ x, y }));
  scatter(10, planters, (x, y) => ({ x, y }));
  scatter(8, benches, (x, y) => ({ x, y, angle: chance(0.5, rng) ? 0 : Math.PI / 2 }));
  scatter(4, busStops, (x, y) => ({ x, y }));
  scatter(4, barriers, (x, y) => ({ x, y }));
  scatter(16, manholes, (x, y) => ({ x: x + (chance(0.5, rng) ? -40 : 40), y }));
  scatter(12, puddles, (x, y) => ({ x, y, r: 14 + rng() * 14 }));

  // 3 billboards in the edge strips (perimeter, no buildings there).
  billboards.push({ x: 60, y: 900, angle: 0 });
  billboards.push({ x: 1740, y: 600, angle: Math.PI });
  billboards.push({ x: 900, y: 1740, angle: Math.PI / 2 });

  return {
    buildings,
    parks,
    fountains,
    trees,
    palms,
    lamps,
    trafficLights,
    hydrants,
    bins,
    planters,
    benches,
    billboards,
    busStops,
    barriers,
    manholes,
    puddles,
    tower: { x: GRAND_TOWER.x, y: GRAND_TOWER.y, w: GRAND_TOWER.w, h: GRAND_TOWER.h },
  };
}
