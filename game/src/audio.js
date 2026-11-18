// audio.js — tiny WebAudio synth for NEON BAY (v8 rebuild).
// All sounds are procedural oscillator beeps; no audio files.

let ctx = null;
let master = 0.5;
let unlocked = false;

function ac() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) {
      return null;
    }
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

export function setMasterVolume(v) {
  master = Math.max(0, Math.min(1, v));
}

function beep(freq, dur, type, vol, slideTo) {
  if (!unlocked) return;
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime((vol === undefined ? 0.2 : vol) * master, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  } catch (e) {
    // Audio is best-effort; never break the game.
  }
}

export function playPickup() {
  beep(660, 0.12, 'sine', 0.25, 990);
}

export function playFail() {
  beep(220, 0.35, 'sawtooth', 0.25, 110);
}

export function playHonk() {
  beep(370, 0.18, 'square', 0.2, 370);
  beep(466, 0.18, 'square', 0.15, 466);
}

export function playShoot() {
  beep(900, 0.07, 'square', 0.18, 220);
}

export function playMissionComplete() {
  beep(523, 0.14, 'sine', 0.25);
  setTimeout(() => beep(659, 0.14, 'sine', 0.25), 130);
  setTimeout(() => beep(784, 0.22, 'sine', 0.25), 260);
}

export function playClick() {
  beep(1200, 0.05, 'sine', 0.15);
}
