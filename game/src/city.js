// City generation for NEON BAY: a road grid, buildings per block, parks and lots.
// Deterministic from a seed; buildings are AABBs the physics code collides against.
import { ROAD_CENTERS, ROAD_PITCH, ROAD_WIDTH, WORLD_SIZE } from './config.js';
import { mulberry32, pick, range, rangeInt, shuffle } from './random.js';

const ROOFS = ['#4a3f6b', '#5b4a68', '#37415c', '#6b4a3f', '#3f5c4a', '#5c3f4a', '#41566b', '#6b5c3f'];
const WALLS = ['#7a6a8a', '#8a7a6a', '#6a7a8a', '#8a6a7a', '#6a8a7a', '#7a7a6a'];
// Neon sign colors for the occasional lit-up storefront roof.
const NEON = ['#ff2d78', '#00e5ff', '#ffd60a', '#7cff4d', '#ff8a00', '#b26bff'];

export function generateCity(seed) {
  const rng = mulberry32(seed);
  // A second stream, seeded from the same seed, for decoration only (roof
  // palettes, neon signs, fountains). The layout stream above must stay
  // byte-identical to the original — every draw it makes places a building,
  // a park, or a lot, and shifting it would move the whole city (and the
  // autopilot routes the winrate was tuned on). Decoration reads from `deco`
  // and never from `rng`, so the layout cannot move.
  const deco = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const buildings = [];
  const parks = [];
  const lots = [];
  const halfRoad = ROAD_WIDTH / 2;
  // Blocks sit between road centers: block (i, j) spans between centers i and i+1.
  for (let i = 0; i < ROAD_CENTERS.length - 1; i += 1) {
    for (let j = 0; j < ROAD_CENTERS.length - 1; j += 1) {
      const x0 = ROAD_CENTERS[i] + halfRoad + 26;
      const x1 = ROAD_CENTERS[i + 1] - halfRoad - 26;
      const y0 = ROAD_CENTERS[j] + halfRoad + 26;
      const y1 = ROAD_CENTERS[j + 1] - halfRoad - 26;
      const roll = rng();
      if (roll < 0.14) {
        // Half the parks get a fountain — a blue disc the renderer draws in
        // the middle of the green. Drawn from the decoration stream, so the
        // park's own trees/seed (layout stream) never move.
        const fountain = deco() < 0.5
          ? { x: x0 + (x1 - x0) * (0.3 + deco() * 0.4), y: y0 + (y1 - y0) * (0.3 + deco() * 0.4), r: 22 + deco() * 10 }
          : null;
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees: rangeInt(rng, 6, 12), seed: rangeInt(rng, 1, 99999), fountain });
        continue;
      }
      if (roll < 0.22) {
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      // 1-3 buildings per block, laid out in a row or a 2x2 grid. Buildings
      // are capped at ~55% of their cell so a clear lane (55-70px) always
      // runs through every block: a car pushed off the road must always be
      // able to drive back out, or a single wide building turns the block
      // into a dead-end slot the car can never escape.
      const count = rng() < 0.5 ? 1 : rng() < 0.7 ? 2 : 4;
      const bw = (x1 - x0) / (count === 4 ? 2 : count) - 14;
      const bh = (y1 - y0) / (count === 4 ? 2 : 1) - 14;
      // Shuffle the roof palette per block so neighbours never share a roof
      // colour (building k takes roofs[k]), and give about one building in
      // four a neon sign strip. Both come from the decoration stream; the
      // layout stream still spends exactly one draw on the roof, as the
      // original pick(rng, ROOFS) did, so the buildings never move.
      const roofs = shuffle(deco, ROOFS);
      for (let k = 0; k < count; k += 1) {
        const col = count === 4 ? k % 2 : k;
        const row = count === 4 ? Math.floor(k / 2) : 0;
        const w = range(rng, bw * 0.45, bw * 0.55);
        const h = range(rng, bh * 0.45, bh * 0.55);
        const x = x0 + col * ((x1 - x0) / (count === 4 ? 2 : count)) + 7 + (bw - w) / 2;
        const y = y0 + row * ((y1 - y0) / (count === 4 ? 2 : 1)) + 7 + (bh - h) / 2;
        rng(); // layout-stream draw the original roof pick spent; keeps every later building where it was
        buildings.push({
          x, y, w, h,
          roof: roofs[k % roofs.length],
          wall: pick(rng, WALLS),
          height: rangeInt(rng, 1, 3),
          seed: rangeInt(rng, 1, 99999),
          neon: deco() < 0.25 ? pick(deco, NEON) : null,
        });
      }
    }
  }
  return { buildings, parks, lots, size: WORLD_SIZE, pitch: ROAD_PITCH };
}

// Is a point on a road (including the sidewalk strip)?
export function onRoad(x, y) {
  for (const c of ROAD_CENTERS) {
    if (Math.abs(x - c) <= ROAD_WIDTH / 2 + 24) return true;
    if (Math.abs(y - c) <= ROAD_WIDTH / 2 + 24) return true;
  }
  return false;
}

// Nearest road center on one axis.
export function nearestRoadCenter(v) {
  let best = ROAD_CENTERS[0];
  for (const c of ROAD_CENTERS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}
