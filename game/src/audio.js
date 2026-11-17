// Synthesized sound for NEON BAY — Web Audio only, no audio files, no network.
// Everything starts on the first user gesture (browsers require it).
let ctx = null;
let master = null;
let muted = false;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export function isMuted() { return muted; }

// Master volume 0..1 (clamped). The mute toggle keeps using 0.5 as its
// "on" level; this is for any future volume control to share the same path.
export function setMasterVolume(v) {
  const level = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = muted ? 0 : level * 0.5;
  return level;
}

function noiseBuffer(duration) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function playShot() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.14);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3200, t);
  filter.frequency.exponentialRampToValueAtTime(300, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + 0.15);
}

export function playPunch() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.08);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

export function playBlip(freq = 880) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + 0.2);
}

export function playJingle() {
  if (!ctx || muted) return;
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playBlip(f), i * 110);
  });
}

// Bright two-note chime when the player grabs a pickup (health / armor /
// cash). Distinct from the plain blip so a pickup reads as a reward, not a
// menu click.
export function playPickup() {
  if (!ctx || muted) return;
  playBlip(988);
  setTimeout(() => playBlip(1319), 90);
}

// Low descending tone for a failed run (wasted / busted / mission failed).
// Two notes, no jingle — the run is over.
export function playFail() {
  if (!ctx || muted) return;
  playBlip(311);
  setTimeout(() => playBlip(233), 160);
}

// Car horn: two short square-wave toots, the classic GTA "get out of the
// way". Sound only — it never moves a ped or a car.
export function playHonk() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  for (const [start, dur] of [[0, 0.16], [0.22, 0.16]]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 370;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 466;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t + start);
    gain.gain.setValueAtTime(0.12, t + start + dur - 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(master);
    osc.start(t + start);
    osc.stop(t + start + dur);
    osc2.start(t + start);
    osc2.stop(t + start + dur);
  }
}

export function playCrash() {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.25);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

// Continuous engine hum while driving; call every frame with speed 0..1.
export function setEngine(speed01, on) {
  if (!ctx) return;
  if (on && !engineOsc) {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }
  if (!engineOsc) return;
  if (!on) {
    engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    return;
  }
  engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.05);
  engineGain.gain.setTargetAtTime(muted ? 0 : 0.05 + speed01 * 0.05, ctx.currentTime, 0.05);
}

// Two-tone police siren while wanted; call every frame with wanted > 0.
export function setSiren(on) {
  if (!ctx) return;
  if (on && !sirenOsc) {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 750;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    let high = false;
    sirenTimer = setInterval(() => {
      if (!sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
    }, 450);
  }
  if (!sirenOsc) return;
  sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.1);
  if (!on && sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
}
