// NEON BAY — deterministic RNG (v5 rebuild, written from spec under recording).
// Small seeded PRNG helpers shared by the city generator, traffic, peds and
// enemy placement. Pure functions, no DOM, safe to import from Node or browser.

/** mulberry32: a tiny fast seeded PRNG. Returns a function yielding [0, 1). */
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

/** makeRng(seed): the world's RNG. Accepts a number or a string seed. */
export function makeRng(seed) {
  if (typeof seed === 'string') {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return mulberry32(h >>> 0);
  }
  return mulberry32(Number(seed) || 1);
}

/** shuffle(arr, rng): Fisher-Yates, returns the same array shuffled in place. */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * weightedPick(entries, rng): pick one entry by weight.
 * entries: [{ value, weight }, ...] (or [value, weight] pairs).
 */
export function weightedPick(entries, rng) {
  let total = 0;
  for (const e of entries) total += Array.isArray(e) ? e[1] : e.weight;
  let roll = rng() * total;
  for (const e of entries) {
    const w = Array.isArray(e) ? e[1] : e.weight;
    roll -= w;
    if (roll <= 0) return Array.isArray(e) ? e[0] : e.value;
  }
  const last = entries[entries.length - 1];
  return Array.isArray(last) ? last[0] : last.value;
}

/** chance(p, rng): true with probability p (0..1). */
export function chance(p, rng) {
  return rng() < p;
}
