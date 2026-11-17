// NEON BAY — an original open-world crime game for the make.fun gta6-01 bounty.
// Everything here is original: no Rockstar assets, names, or story elements.
// Plain static files, no network request, desktop browser, keyboard + mouse.

// Seeded RNG (mulberry32) so the city and the screenshot scenes are deterministic.
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

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Fisher-Yates shuffle: returns a new array in random order (the input is
// left untouched, so a palette or list can be reshuffled per block/round).
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pick one entry with probability proportional to its weight. Entries are
// [value, weight] pairs; a weight of 0 never wins. Useful for variety where
// some options should be common and others rare (ped shirts, car colors).
export function weightedPick(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries[0]?.[0];
  let roll = rng() * total;
  for (const [value, w] of entries) {
    roll -= Math.max(0, w);
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// True with probability p (0..1). Reads better than `rng() < p` at a call
// site, and keeps the odds in one place.
export function chance(rng, p) {
  return rng() < p;
}
