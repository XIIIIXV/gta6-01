// missions.js — the 6 story missions of NEON BAY (v8 rebuild).
// Frozen mission definitions from the v8 spec.

import { PLACES } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'Back in Town',
    par: 90,
    reward: 250,
    tip: 'Get back on your feet: steal a car and reach the safehouse.',
    steps: [
      { type: 'goto', place: 'garage', label: 'Go to the garage' },
      { type: 'steal_car', label: 'Steal a car' },
      { type: 'goto', place: 'safehouse', needCar: true, label: 'Drive to the safehouse' },
    ],
  },
  {
    id: 2,
    name: 'The Package',
    par: 150,
    reward: 400,
    tip: 'Pick up the package at the docks and deliver it to the club. Do not wreck the car.',
    steps: [
      { type: 'goto', place: 'docks', label: 'Go to the docks' },
      { type: 'deliver', place: 'club', label: 'Deliver the package to the club' },
    ],
  },
  {
    id: 3,
    name: 'Crew Call',
    par: 180,
    reward: 500,
    tip: 'Meet the crew at the warehouse and deal with the lookouts.',
    steps: [
      { type: 'goto', place: 'warehouse', label: 'Go to the warehouse' },
      { type: 'kill', place: 'warehouse', kills: 3, label: 'Take out 3 lookouts' },
      { type: 'goto', place: 'safehouse', needCar: true, label: 'Drive to the safehouse' },
    ],
  },
  {
    id: 4,
    name: 'Bank of Neon Bay',
    par: 180,
    reward: 600,
    tip: 'Hit the bank, hold it, then lose the heat and get home.',
    steps: [
      { type: 'goto', place: 'bank', needCar: true, label: 'Drive to the bank' },
      { type: 'hold', place: 'bank', holdS: 8, label: 'Hold the bank (8s)' },
      { type: 'escape', label: 'Lose the wanted level' },
      { type: 'goto', place: 'safehouse', needCar: true, label: 'Drive to the safehouse' },
    ],
  },
  {
    id: 5,
    name: "Sal's Enforcers",
    par: 240,
    reward: 800,
    tip: 'The warehouse is crawling with Sal\u2019s enforcers. Take them all down — Sal is last.',
    steps: [
      { type: 'goto', place: 'warehouse', label: 'Go to the warehouse' },
      { type: 'kill', place: 'warehouse', kills: 7, boss: true, label: 'Take out 7 enforcers (Sal is last)' },
    ],
  },
  {
    id: 6,
    name: 'The Long Goodbye',
    par: 150,
    reward: 1000,
    tip: 'Survive the night. 45 seconds and you are free.',
    steps: [
      { type: 'survive', surviveS: 45, label: 'Survive 45s' },
    ],
  },
  {
    id: 7,
    name: 'The Tower Job',
    par: 240,
    reward: 1500,
    tip: 'The Grand Tower holds the city\u2019s codes. Take the guards down, grab the case and get it to the airport.',
    steps: [
      { type: 'goto', place: 'tower', needCar: true, label: 'Drive to the Grand Tower' },
      { type: 'kill', place: 'tower', kills: 4, boss: true, label: 'Take out 4 tower guards (chief is last)' },
      { type: 'deliver', place: 'airport', label: 'Deliver the case to the airport' },
      { type: 'goto', place: 'safehouse', needCar: true, label: 'Drive home to the safehouse' },
    ],
  },
];

// Returns the PLACES entry for a step (same object reference every call),
// or null for steps with no destination.
export function missionPlace(step) {
  if (!step || !step.place) return null;
  return PLACES[step.place] || null;
}

export function fmtTime(s) {
  if (s === null || s === undefined || !isFinite(s)) return '--:--';
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return m + ':' + String(sec).padStart(2, '0');
}
