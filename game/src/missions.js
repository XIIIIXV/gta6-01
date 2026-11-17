// NEON BAY — story missions (v3 rebuild).
// Six missions, each with a PAR time (seconds) shown in the summary screen.
// Step types the world understands: goto, steal_car, deliver, kill, hold,
// escape, survive. `place` names a key of PLACES (config.js).

import { PLACES } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'Back in Town',
    par: 90,
    reward: 250,
    tip: 'Get back on your feet: steal a car and reach the safehouse.',
    steps: [
      { type: 'goto', place: 'garage', tip: 'Head to the garage.' },
      { type: 'steal_car', tip: 'Steal a parked car (E).' },
      { type: 'goto', place: 'safehouse', needCar: true, tip: 'Drive to the safehouse.' },
    ],
  },
  {
    id: 2,
    name: 'The Package',
    par: 150,
    reward: 400,
    tip: 'Pick up the package at the docks and deliver it to Club Neon.',
    steps: [
      { type: 'goto', place: 'docks', tip: 'Go to the docks to pick up the package.' },
      { type: 'deliver', place: 'club', tip: 'Deliver the package to Club Neon. Do not wreck the car!' },
    ],
  },
  {
    id: 3,
    name: 'Crew Call',
    par: 180,
    reward: 500,
    tip: 'Rally the crew at the warehouse — clear out the lookouts first.',
    steps: [
      { type: 'goto', place: 'warehouse', tip: 'Meet the crew at the warehouse.' },
      { type: 'kill', place: 'warehouse', count: 3, tip: 'Take out the 3 lookouts.' },
      { type: 'goto', place: 'safehouse', needCar: true, tip: 'Get back to the safehouse.' },
    ],
  },
  {
    id: 4,
    name: 'Bank of Neon Bay',
    par: 180,
    reward: 600,
    tip: 'Hit the bank, hold the lobby, then lose the heat.',
    steps: [
      { type: 'goto', place: 'bank', needCar: true, tip: 'Drive to the Bank of Neon Bay.' },
      { type: 'hold', place: 'bank', seconds: 8, tip: 'Hold the lobby while the safe opens…' },
      { type: 'escape', tip: 'Lose the cops — get your wanted level to zero.' },
      { type: 'goto', place: 'safehouse', needCar: true, tip: 'Lay low at the safehouse.' },
    ],
  },
  {
    id: 5,
    name: "Sal's Enforcers",
    par: 240,
    reward: 800,
    tip: "Sal sent his enforcers to the warehouse. All seven of them.",
    steps: [
      { type: 'goto', place: 'warehouse', tip: 'Get to the warehouse.' },
      { type: 'kill', place: 'warehouse', count: 7, boss: true, tip: 'Take out all 7 enforcers — including Sal.' },
    ],
  },
  {
    id: 6,
    name: 'The Long Goodbye',
    par: 150,
    reward: 1000,
    tip: 'The whole city is after you. Survive 45 seconds, then vanish.',
    steps: [
      { type: 'survive', seconds: 45, tip: 'Survive! Keep moving and stay alive.' },
    ],
  },
];

/**
 * The world position a step points at (for goto/deliver/hold/kill), or null
 * for steps with no destination (steal_car, escape, survive).
 * Returns the PLACES entry itself (same object reference every call) so
 * callers that compare targets by reference (the winrate driver) keep a
 * stable target instead of rebuilding their driver every frame.
 */
export function missionPlace(step) {
  if (!step || !step.place) return null;
  return PLACES[step.place] ?? null;
}

/** Format seconds as m:ss. */
export function fmtTime(s) {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
