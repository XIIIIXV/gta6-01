// City generation for NEON BAY: a road grid, buildings per block, parks and lots.
// Deterministic from a seed; buildings are AABBs the physics code collides against.
import { ROAD_CENTERS, ROAD_PITCH, ROAD_WIDTH, WORLD_SIZE } from './config.js';
import { mulberry32, pick, range, rangeInt } from './random.js';

const ROOFS = ['#4a3f6b', '#5b4a68', '#37415c', '#6b4a3f', '#3f5c4a', '#5c3f4a', '#41566b', '#6b5c3f'];
const WALLS = ['#7a6a8a', '#8a7a6a', '#6a7a8a', '#8a6a7a', '#6a8a7a', '#7a7a6a'];

export function generateCity(seed) {
  const rng = mulberry32(seed);
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
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees: rangeInt(rng, 6, 12), seed: rangeInt(rng, 1, 99999) });
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
      for (let k = 0; k < count; k += 1) {
        const col = count === 4 ? k % 2 : k;
        const row = count === 4 ? Math.floor(k / 2) : 0;
        const w = range(rng, bw * 0.45, bw * 0.55);
        const h = range(rng, bh * 0.45, bh * 0.55);
        const x = x0 + col * ((x1 - x0) / (count === 4 ? 2 : count)) + 7 + (bw - w) / 2;
        const y = y0 + row * ((y1 - y0) / (count === 4 ? 2 : 1)) + 7 + (bh - h) / 2;
        buildings.push({
          x, y, w, h,
          roof: pick(rng, ROOFS),
          wall: pick(rng, WALLS),
          height: rangeInt(rng, 1, 3),
          seed: rangeInt(rng, 1, 99999),
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
