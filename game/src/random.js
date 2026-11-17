// NEON BAY — seeded random helpers (v3 rebuild, written under recording 01a1eabc).
// Deterministic RNG so a world built from a seed plays the same way every
// time (the winrate harness replays seeds 1..200 and expects stable results).

/** mulberry32: a small fast seeded PRNG. Returns a function yielding [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A handy RNG bundle built on mulberry32. */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** Integer in [0, n). */
    int(n) {
      return Math.floor(next() * n);
    },
    /** Float in [a, b). */
    range(a, b) {
      return a + next() * (b - a);
    },
    /** Random element of an array. */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
  };
}

/** Fisher–Yates shuffle. Returns a new shuffled array, input untouched. */
export function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Pick one entry by weight. `entries` is [[value, weight], ...]; weights need
 * not sum to 1. Returns the value.
 */
export function weightedPick(entries, rng) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng.next() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** True with probability p, using the given rng (defaults to Math.random). */
export function chance(p, rng) {
  if (rng) return rng.next() < p;
  return Math.random() < p;
}
