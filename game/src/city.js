// NEON BAY — city layout: roads, buildings, parks, landmarks (v3 rebuild).
// The city is a 300-unit road grid over an 1800x1800 map. Buildings live
// inside the blocks between roads (never on a road), with a margin from the
// kerb so a car turning a corner does not wedge into a wall.

import { CITY } from './config.js';
import { shuffle } from './random.js';

const { ROAD_SPACING, ROAD_OFFSET, ROAD_WIDTH } = CITY;

/** The centreline coordinate of the road nearest to v (roads at 150 + 300k). */
export function nearestRoadCenter(v) {
  const c = ROAD_OFFSET + ROAD_SPACING * Math.round((v - ROAD_OFFSET) / ROAD_SPACING);
  return Math.max(ROAD_OFFSET, Math.min(CITY.SIZE - ROAD_OFFSET, c));
}

/** Whether a point is on a road surface (within half the road width). */
export function isOnRoad(x, y) {
  const dx = Math.abs(x - nearestRoadCenter(x));
  const dy = Math.abs(y - nearestRoadCenter(y));
  return dx <= ROAD_WIDTH / 2 || dy <= ROAD_WIDTH / 2;
}

// Roof colours, shuffled per block so no two neighbouring blocks match.
const ROOF_PALETTE = ['#2b2d5c', '#3a2b4f', '#24384a', '#4a2b3d', '#2e4a3a', '#413a2b'];

/**
 * Build the city from a seeded rng. Returns { buildings, fountains, parks }.
 * buildings: {x, y, w, h, roof, neon} (x,y = top-left). ~91 buildings, total
 * area capped at ~55% of each block. A few blocks are parks; ~50% of parks
 * get a fountain. The Grand Tower sits in its own block at the centre.
 */
export function createCity(rng) {
  const buildings = [];
  const fountains = [];
  const parks = [];
  const halfRoad = ROAD_WIDTH / 2;
  const margin = 14; // kerb margin: buildings never touch the road.

  // Interior blocks: between road i and road i+1, for i in 0..4 (5x5 = 25).
  const parkBlocks = new Set();
  while (parkBlocks.size < 6) parkBlocks.add(rng.int(25));

  for (let bi = 0; bi < 25; bi += 1) {
    const bx = bi % 5;
    const by = Math.floor(bi / 5);
    const x0 = ROAD_OFFSET + ROAD_SPACING * bx + halfRoad + margin;
    const x1 = ROAD_OFFSET + ROAD_SPACING * (bx + 1) - halfRoad - margin;
    const y0 = ROAD_OFFSET + ROAD_SPACING * by + halfRoad + margin;
    const y1 = ROAD_OFFSET + ROAD_SPACING * (by + 1) - halfRoad - margin;
    const blockW = x1 - x0;
    const blockH = y1 - y0;
    const blockArea = blockW * blockH;

    if (parkBlocks.has(bi)) {
      parks.push({ x: x0, y: y0, w: blockW, h: blockH });
      // ~50% of parks get a fountain.
      if (rng.next() < 0.5) {
        fountains.push({
          x: x0 + blockW / 2,
          y: y0 + blockH / 2,
          r: 22 + rng.next() * 10,
        });
      }
      continue;
    }

    // Per-block shuffled roof palette (decoration RNG on its own stream so
    // the layout stays stable).
    const roofs = shuffle(ROOF_PALETTE, rng);
    const count = 3 + rng.int(2); // 3-4 buildings per block.
    let usedArea = 0;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < 40) {
      guard += 1;
      const w = 42 + rng.next() * 48;
      const h = 34 + rng.next() * 40;
      if (usedArea + w * h > CITY.BUILDING_FILL * blockArea) continue;
      const x = x0 + rng.next() * Math.max(1, blockW - w);
      const y = y0 + rng.next() * Math.max(1, blockH - h);
      // Keep buildings apart (no overlap).
      let overlaps = false;
      for (const b of buildings) {
        if (b.x < x + w + 10 && b.x + b.w + 10 > x && b.y < y + h + 10 && b.y + b.h + 10 > y) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      buildings.push({
        x, y, w, h,
        roof: roofs[placed % roofs.length],
        // Neon sign strips on ~25% of buildings.
        neon: rng.next() < 0.25,
      });
      usedArea += w * h;
      placed += 1;
    }
  }

  // Grand Tower landmark: a tall block in the centre block (1200, 1200).
  buildings.push({
    x: 1200 - 60, y: 1200 - 60, w: 120, h: 120,
    roof: '#1a1440', neon: true, tower: true,
  });

  return { buildings, fountains, parks };
}

/**
 * Circle-vs-building overlap: given a circle (x, y, r) and a building rect,
 * return the smallest push-out {x, y} that clears it, or null if no overlap.
 */
export function pushOutOfBuilding(b, x, y, r) {
  const cx = Math.max(b.x, Math.min(x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(y, b.y + b.h));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) {
    // Centre inside the building: push out along the smallest axis.
    const left = x - b.x;
    const right = b.x + b.w - x;
    const top = y - b.y;
    const bottom = b.y + b.h - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: b.x - r, y };
    if (m === right) return { x: b.x + b.w + r, y };
    if (m === top) return { x, y: b.y - r };
    return { x, y: b.y + b.h + r };
  }
  const d = Math.sqrt(d2);
  const push = (r - d) / d;
  return { x: x + dx * push, y: y + dy * push };
}

/** Line-of-sight test: true when no building blocks the segment. */
export function segmentBlocked(buildings, x1, y1, x2, y2) {
  for (const b of buildings) {
    if (segmentHitsRect(x1, y1, x2, y2, b)) return true;
  }
  return false;
}

function segmentHitsRect(x1, y1, x2, y2, b) {
  // Slab test for an axis-aligned rectangle.
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < b.x || x1 > b.x + b.w) return false;
  } else {
    let t1 = (b.x - x1) / dx;
    let t2 = (b.x + b.w - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 < b.y || y1 > b.y + b.h) return false;
  } else {
    let t1 = (b.y - y1) / dy;
    let t2 = (b.y + b.h - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
