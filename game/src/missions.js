// Missions for NEON BAY — an original story. Jax Moreno is out after three years
// inside and owes Big Sal, the loan shark who owns his late brother's garage.
// Six missions, each a list of steps the world engine walks through.
import { PLACES } from './config.js';

export const STORY_INTRO = [
  'NEON BAY, 2026.',
  'Jax Moreno is out after three years inside.',
  'His brother\'s garage is in debt to Big Sal —',
  'and Sal collects in person.',
  'Work the jobs. Pay the debt. Get out clean.',
];

export const MISSIONS = [
  {
    id: 1,
    title: 'Back in Town',
    brief: 'Sal\'s boys are watching the garage. Get there on foot, then steal a ride and bring it to the safehouse.',
    reward: 200,
    steps: [
      { type: 'goto', place: 'garage', text: 'Get to Moreno Garage' },
      { type: 'steal_car', text: 'Steal a car  (walk up to one and press E)' },
      { type: 'goto', place: 'safehouse', needCar: true, text: 'Drive to the Safehouse' },
    ],
  },
  {
    id: 2,
    title: 'The Package',
    brief: 'A courier job for Club Mirage. Pick the package up at the docks, then deliver it to the club in 90 seconds. Don\'t wreck the car.',
    reward: 350,
    steps: [
      { type: 'goto', place: 'docks', text: 'Pick up the package at the Docks' },
      { type: 'deliver', place: 'club', time: 90, text: 'Deliver to Club Mirage — 90 seconds!' },
    ],
  },
  {
    id: 3,
    title: 'Crew Call',
    brief: 'Milo, your old wheelman, is back in town. Pick him up, drive him to the meet — and the Red Vipers heard about it. Expect trouble.',
    reward: 500,
    steps: [
      { type: 'goto', place: 'plaza', text: 'Pick up Milo at Liberty Plaza' },
      { type: 'goto', place: 'meet', needCar: true, text: 'Drive Milo to the meet' },
      { type: 'kill', count: 4, place: 'meet', text: 'Ambush! Take out 4 Red Vipers' },
    ],
  },
  {
    id: 4,
    title: 'Bank of Neon Bay',
    brief: 'Sal wants his money back with interest. Hit the bank, grab the cash, and lose the cops. Three stars and counting.',
    reward: 1500,
    steps: [
      { type: 'goto', place: 'bank', text: 'Get to the Bank of Neon Bay' },
      { type: 'hold', place: 'bank', seconds: 4, text: 'Crack the vault — stay in the circle!' },
      { type: 'escape', text: 'Lose the cops! Get your wanted level to zero' },
    ],
  },
  {
    id: 5,
    title: 'Sal\'s Enforcers',
    brief: 'Sal sent his enforcers to the warehouse to send you a message. Send one back. Take out all six — and their boss, Crusher.',
    reward: 1200,
    steps: [
      { type: 'goto', place: 'warehouse', text: 'Get to the Salvatore Warehouse' },
      { type: 'kill', count: 7, place: 'warehouse', boss: true, text: 'Take out the enforcers (7) — including Crusher' },
    ],
  },
  {
    id: 6,
    title: 'The Long Goodbye',
    brief: 'One last run. The whole Neon Bay PD is on you. Reach the airfield and fly out — four stars, forty-five seconds of hell, no turning back.',
    reward: 3000,
    steps: [
      { type: 'goto', place: 'airport', text: 'Reach the Neon Bay Airfield' },
      { type: 'survive', seconds: 45, text: 'Survive the manhunt — 45 seconds!' },
      { type: 'goto', place: 'airport', text: 'Get to the runway plane' },
    ],
  },
];

export function missionPlace(step) {
  return step.place ? PLACES[step.place] : null;
}
