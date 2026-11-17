// NEON BAY — WebAudio sound effects (v3 rebuild).
// All sounds are synthesized (no audio files): short oscillator blips for
// pickups, failure, horn, gunfire and UI. Lazily creates the AudioContext on
// first use (browsers require a user gesture), and stays silent in Node.

let ctx = null;
let master = null;
let volume = 0.5;

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function blip(freq, dur, type = 'sine', vol = 0.5, slideTo = null) {
  const ac = ensureCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Master volume 0..1. */
export function setMasterVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
}

/** Bright two-note pickup chime. */
export function playPickup() {
  blip(880, 0.12, 'sine', 0.5);
  setTimeout(() => blip(1320, 0.18, 'sine', 0.5), 70);
}

/** Low failure buzz. */
export function playFail() {
  blip(220, 0.35, 'sawtooth', 0.35, 110);
}

/** Car horn: two short square honks. */
export function playHonk() {
  blip(370, 0.14, 'square', 0.25);
  setTimeout(() => blip(370, 0.14, 'square', 0.25), 160);
}

/** Gunshot crack. */
export function playShoot() {
  blip(180, 0.09, 'square', 0.3, 60);
}

/** Mission-complete fanfare (three rising notes). */
export function playMissionComplete() {
  blip(523, 0.14, 'triangle', 0.45);
  setTimeout(() => blip(659, 0.14, 'triangle', 0.45), 120);
  setTimeout(() => blip(784, 0.28, 'triangle', 0.5), 240);
}

/** Short UI click. */
export function playClick() {
  blip(1200, 0.05, 'sine', 0.3);
}

/** Unlock the audio context (call from a user gesture). */
export function unlockAudio() {
  ensureCtx();
}
