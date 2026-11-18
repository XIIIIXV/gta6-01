// NEON BAY — procedural city (v5 rebuild, written from spec).
// A 3.2 km^2 neon grid city: roads on a 300px lattice, buildings filling
// ~55% of the blocks between roads, parks and fountains in the rest.
// The same data drives both the logic (collisions, line of sight) and the
// 3D renderer, so what you see is what you drive through.

import { CITY, GRAND_TOWER } from './config.js';
import { chance, shuffle } from './random.js';

/** nearestRoadCenter(v): the closest road-centre coordinate to v. */
export function nearestRoadCenter(v) {
  let best = CITY.ROAD_CENTERS[0];
  let bestD = Math.abs(v - best);
  for (const c of CITY.ROAD_CENTERS) {
    const d = Math.abs(v - c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** isOnRoad(x, y): true when the point is on a road (within half a road width of a centre line). */
export function isOnRoad(x, y) {
  const half = CITY.ROAD_WIDTH / 2;
  for (const c of CITY.ROAD_CENTERS) {
    if (Math.abs(x - c) <= half || Math.abs(y - c) <= half) return true;
  }
  return false;
}

/** Roof palette: per-block shuffled neon-era colours. */
const ROOF_PALETTE = ['#2b2d42', '#3a2e4f', '#233a4a', '#402a3a', '#2e4038', '#46352a'];

/**
 * createCity(rng): build the city.
 * Returns { buildings, parks, fountains, tower }.
 * buildings: { x, y, w, h, height, roof, neon, tower? } (x/y = centre).
 * parks: { x, y, w, h } blocks left open as parks.
 * fountains: { x, y, r } animated water discs in ~50% of parks.
 */
export function createCity(rng) {
  const buildings = [];
  const parks = [];
  const fountains = [];
  const centers = CITY.ROAD_CENTERS;
  const halfRoad = CITY.ROAD_WIDTH / 2;
  // Block interiors sit between neighbouring road edges.
  const blocks = [];
  for (let i = 0; i < centers.length - 1; i += 1) {
    for (let j = 0; j < centers.length - 1; j += 1) {
      const x0 = centers[i] + halfRoad;
      const x1 = centers[i + 1] - halfRoad;
      const y0 = centers[j] + halfRoad;
      const y1 = centers[j + 1] - halfRoad;
      blocks.push({ x0, x1, y0, y1 });
    }
  }
  shuffle(blocks, rng);
  for (const b of blocks) {
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    // Keep the Grand Tower's block clear for the landmark itself.
    if (Math.abs(cx - GRAND_TOWER.x) < w && Math.abs(cy - GRAND_TOWER.y) < h) {
      parks.push({ x: cx, y: cy, w, h });
      continue;
    }
    if (chance(CITY.BUILDING_FILL, rng)) {
      // Shrink the footprint a little inside the block so streets stay clear.
      const bw = w * (0.55 + rng() * 0.35);
      const bh = h * (0.55 + rng() * 0.35);
      const bx = cx + (rng() - 0.5) * (w - bw) * 0.5;
      const by = cy + (rng() - 0.5) * (h - bh) * 0.5;
      buildings.push({
        x: bx,
        y: by,
        w: bw,
        h: bh,
        height: 40 + rng() * 110,
        roof: ROOF_PALETTE[Math.floor(rng() * ROOF_PALETTE.length)],
        neon: chance(0.25, rng),
      });
    } else {
      parks.push({ x: cx, y: cy, w, h });
      if (chance(0.5, rng)) {
        fountains.push({ x: cx, y: cy, r: 18 + rng() * 14 });
      }
    }
  }
  // The Grand Tower: much taller than anything else, dead centre.
  buildings.push({
    x: GRAND_TOWER.x,
    y: GRAND_TOWER.y,
    w: GRAND_TOWER.w,
    h: GRAND_TOWER.h,
    height: 320,
    roof: '#1a1a2e',
    neon: true,
    tower: true,
  });
  return { buildings, parks, fountains, tower: { ...GRAND_TOWER } };
}

/**
 * pushOutOfBuilding(b, x, y, r): push a circle (x, y, radius r) out of the
 * axis-aligned rect b ({x, y, w, h} centre-based). Returns the corrected
 * {x, y} (unchanged when there is no overlap).
 */
export function pushOutOfBuilding(b, x, y, r) {
  const halfW = b.w / 2;
  const halfH = b.h / 2;
  const dx = x - b.x;
  const dy = y - b.y;
  const px = halfW + r - Math.abs(dx);
  const py = halfH + r - Math.abs(dy);
  if (px <= 0 || py <= 0) return { x, y };
  if (px < py) {
    return { x: b.x + (dx >= 0 ? halfW + r : -(halfW + r)), y };
  }
  return { x, y: b.y + (dy >= 0 ? halfH + r : -(halfH + r)) };
}

/** Segment vs axis-aligned rect test (slab method). */
function segmentHitsRect(x1, y1, x2, y2, b) {
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minY = b.y - b.h / 2;
  const maxY = b.y + b.h / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < minX || x1 > maxX) return false;
  } else {
    let t1 = (minX - x1) / dx;
    let t2 = (maxX - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < minY || y1 > maxY) return false;
  } else {
    let t1 = (minY - y1) / dy;
    let t2 = (maxY - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/**
 * segmentBlocked(buildings, x1, y1, x2, y2): true when the segment crosses
 * any building rect (used for line of sight).
 */
export function segmentBlocked(buildings, x1, y1, x2, y2) {
  for (const b of buildings) {
    if (segmentHitsRect(x1, y1, x2, y2, b)) return true;
  }
  return false;
}
