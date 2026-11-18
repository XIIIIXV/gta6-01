// NEON BAY — tiny WebAudio bleeps (v5 rebuild, written from spec).
// All sounds are synthesized with oscillators; no audio assets, no network.
// Everything is guarded: in a headless / muted context every call is a no-op.

let ctx = null;
let master = null;
let volume = 0.5;

/** unlockAudio(): create/resume the AudioContext on first user interaction. */
export function unlockAudio() {
  try {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    if (!ctx) {
      ctx = new window.AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // Audio is cosmetic; never let it break the game.
  }
}

/** setMasterVolume(v): 0..1 master gain. */
export function setMasterVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

function blip(freq, dur, type = 'sine', gain = 0.15, slideTo = null) {
  if (!ctx || !master || ctx.state !== 'running') return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch {
    // Ignore audio failures.
  }
}

/** playPickup(): bright two-note chime for health/armor pickups. */
export function playPickup() {
  blip(660, 0.09, 'sine', 0.16);
  setTimeout(() => blip(990, 0.12, 'sine', 0.14), 70);
}

/** playFail(): low buzz for mission failure / wasted. */
export function playFail() {
  blip(160, 0.35, 'sawtooth', 0.12, 70);
}

/** playHonk(): short car horn (two detuned squares). */
export function playHonk() {
  blip(370, 0.18, 'square', 0.07);
  blip(466, 0.18, 'square', 0.06);
}

/** playShoot(): short noise-ish crack for the pistol. */
export function playShoot() {
  blip(900, 0.06, 'square', 0.09, 220);
}

/** playMissionComplete(): rising three-note jingle. */
export function playMissionComplete() {
  blip(523, 0.1, 'sine', 0.16);
  setTimeout(() => blip(659, 0.1, 'sine', 0.16), 90);
  setTimeout(() => blip(784, 0.18, 'sine', 0.16), 180);
}

/** playClick(): UI click for menus. */
export function playClick() {
  blip(440, 0.05, 'sine', 0.1);
}
