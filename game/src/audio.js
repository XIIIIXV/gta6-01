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
