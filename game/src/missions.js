// NEON BAY — mission definitions (v5 rebuild, written from spec).
// Six story missions. Step types the world understands:
// goto, steal_car, deliver, kill, hold, escape, survive.

import { PLACES } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'Back in Town',
    par: 90,
    reward: 250,
    tip: 'Get back on your feet: steal a car and reach the safehouse.',
    steps: [
      { type: 'goto', place: 'garage' },
      { type: 'steal_car' },
      { type: 'goto', place: 'safehouse', needCar: true },
    ],
  },
  {
    id: 2,
    name: 'The Package',
    par: 150,
    reward: 400,
    tip: 'Pick up the package at the docks and deliver it to the club. Do not wreck the car.',
    steps: [
      { type: 'goto', place: 'docks' },
      { type: 'deliver', place: 'club' },
    ],
  },
  {
    id: 3,
    name: 'Crew Call',
    par: 180,
    reward: 500,
    tip: 'Meet the crew at the warehouse and clear out the 3 lookouts.',
    steps: [
      { type: 'goto', place: 'warehouse' },
      { type: 'kill', place: 'warehouse', count: 3 },
      { type: 'goto', place: 'safehouse', needCar: true },
    ],
  },
  {
    id: 4,
    name: 'Bank of Neon Bay',
    par: 180,
    reward: 600,
    tip: 'Hit the bank, hold it for 8 seconds, then lose the heat and get home.',
    steps: [
      { type: 'goto', place: 'bank', needCar: true },
      { type: 'hold', place: 'bank', holdS: 8 },
      { type: 'escape' },
      { type: 'goto', place: 'safehouse', needCar: true },
    ],
  },
  {
    id: 5,
    name: "Sal's Enforcers",
    par: 240,
    reward: 800,
    tip: 'Clear the warehouse. The last one is Sal himself.',
    steps: [
      { type: 'goto', place: 'warehouse' },
      { type: 'kill', place: 'warehouse', count: 7, boss: true },
    ],
  },
  {
    id: 6,
    name: 'The Long Goodbye',
    par: 150,
    reward: 1000,
    tip: 'Survive 45 seconds. Then leave Neon Bay for good.',
    steps: [
      { type: 'survive', surviveS: 45 },
    ],
  },
];

/**
 * missionPlace(step): the PLACES entry a step points at (same object
 * reference every call), or null for steps with no destination
 * (steal_car, escape, survive).
 */
export function missionPlace(step) {
  if (!step || !step.place) return null;
  return PLACES[step.place] ?? null;
}

/** fmtTime(s): seconds -> "M:SS.t" (e.g. 90 -> "1:30.0"). */
export function fmtTime(s) {
  if (s === null || s === undefined || !Number.isFinite(s)) return '--:--.-';
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const sec = total - m * 60;
  const whole = Math.floor(sec);
  const tenth = Math.floor((sec - whole) * 10);
  return `${m}:${String(whole).padStart(2, '0')}.${tenth}`;
}
