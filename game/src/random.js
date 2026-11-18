// random.js — deterministic RNG helpers for NEON BAY (v8 rebuild).
// Written from the v8 spec. mulberry32 is a small, fast, seedable PRNG.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  return mulberry32(seed);
}

// Fisher-Yates shuffle, in place, using the provided rng.
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// entries: [{ weight, value }] (weight defaults to 1). Returns a value.
export function weightedPick(entries, rng) {
  let total = 0;
  for (const e of entries) total += e.weight === undefined ? 1 : e.weight;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight === undefined ? 1 : e.weight;
    if (r <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}

// True with probability p (0..1).
export function chance(p, rng) {
  return rng() < p;
}
