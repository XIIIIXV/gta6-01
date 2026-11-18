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

export function playStunt() {
  beep(523, 0.09, 'square', 0.2, 784);
  setTimeout(() => beep(784, 0.12, 'square', 0.2, 1046), 90);
}

// ---------------------------------------------------------------- radio
// Three switchable stations, all procedural WebAudio (no audio files, no
// network). A lookahead step sequencer: 8th notes, bass + lead + hat, two
// tracks per station that rotate every 4 bars. radioUpdate() is called once
// per animation frame from main.js; it schedules any steps due in the next
// 0.12s. Silent until the user has interacted (unlockAudio).

export const RADIO_STATIONS = [
  {
    name: 'WAVE 88.1',
    desc: 'Neon Drive',
    tempo: 112,
    tracks: [
      { title: 'Midnight Run', artist: 'Lumen Kids',
        bass: [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 82.41, 0, 73.42, 0],
        lead: [440, 0, 523.25, 0, 659.25, 0, 523.25, 0, 587.33, 0, 659.25, 0, 783.99, 659.25, 523.25, 0] },
      { title: 'Pink Horizon', artist: 'Lumen Kids',
        bass: [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 82.41, 0, 73.42, 0],
        lead: [880, 0, 783.99, 0, 659.25, 0, 587.33, 0, 523.25, 0, 587.33, 0, 659.25, 0, 523.25, 440] },
    ],
  },
  {
    name: 'FLAMINGO FM',
    desc: 'Vice Funk',
    tempo: 100,
    tracks: [
      { title: 'Flamingo Nights', artist: 'The Palms',
        bass: [82.41, 0, 82.41, 98, 0, 82.41, 0, 110, 123.47, 0, 98, 0, 82.41, 0, 146.83, 110],
        lead: [329.63, 0, 392, 0, 493.88, 0, 392, 0, 329.63, 0, 293.66, 0, 329.63, 392, 493.88, 0] },
      { title: 'Vice Groove', artist: 'The Palms',
        bass: [82.41, 0, 82.41, 98, 0, 82.41, 0, 110, 123.47, 0, 98, 0, 82.41, 0, 146.83, 110],
        lead: [493.88, 0, 440, 0, 392, 0, 329.63, 0, 392, 440, 493.88, 0, 587.33, 493.88, 392, 0] },
    ],
  },
  {
    name: 'VICE ROCK',
    desc: 'Neon Nights',
    tempo: 128,
    tracks: [
      { title: 'Neon Nights', artist: 'Vesper GT',
        bass: [82.41, 82.41, 0, 82.41, 110, 110, 0, 110, 123.47, 123.47, 0, 123.47, 98, 98, 146.83, 0],
        lead: [659.25, 0, 659.25, 0, 783.99, 0, 659.25, 0, 587.33, 0, 587.33, 0, 659.25, 783.99, 880, 0] },
      { title: 'Highway Starlight', artist: 'Vesper GT',
        bass: [82.41, 82.41, 0, 82.41, 110, 110, 0, 110, 123.47, 123.47, 0, 123.47, 98, 98, 146.83, 0],
        lead: [880, 0, 783.99, 0, 659.25, 0, 659.25, 0, 783.99, 0, 880, 0, 987.77, 880, 783.99, 0] },
    ],
  },
];

const radio = { on: true, station: 0, step: 0, bar: 0, nextTime: 0 };

function radioNote(freq, t, dur, type, vol) {
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol * master, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) {
    // Audio is best-effort; never break the game.
  }
}

function radioScheduleStep(st, track, step, t, stepDur) {
  const bass = track.bass[step];
  const lead = track.lead[step];
  if (bass) radioNote(bass, t, stepDur * 0.9, 'sawtooth', 0.10);
  if (lead) radioNote(lead, t, stepDur * 0.9, 'square', 0.05);
  if (step % 2 === 1) radioNote(6000, t, 0.03, 'square', 0.015);
}

export function radioUpdate() {
  if (!radio.on || !unlocked) return;
  const c = ac();
  if (!c) return;
  const st = RADIO_STATIONS[radio.station];
  const stepDur = 60 / st.tempo / 2;
  if (radio.nextTime < c.currentTime) radio.nextTime = c.currentTime + 0.05;
  while (radio.nextTime < c.currentTime + 0.12) {
    const track = st.tracks[Math.floor(radio.bar / 4) % st.tracks.length];
    radioScheduleStep(st, track, radio.step, radio.nextTime, stepDur);
    radio.nextTime += stepDur;
    radio.step = (radio.step + 1) % 16;
    if (radio.step === 0) radio.bar++;
  }
}

export function radioNext() {
  radio.station = (radio.station + 1) % RADIO_STATIONS.length;
  radio.step = 0;
  radio.bar = 0;
  radio.nextTime = 0;
  playClick();
}

export function radioToggle() {
  radio.on = !radio.on;
  if (!radio.on) radio.nextTime = 0;
  playClick();
}

export function radioStation() {
  return RADIO_STATIONS[radio.station];
}

export function radioTrack() {
  const st = RADIO_STATIONS[radio.station];
  return st.tracks[Math.floor(radio.bar / 4) % st.tracks.length];
}

export function radioIsOn() {
  return radio.on;
}
