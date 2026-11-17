// Shared constants for NEON BAY.
export const STEP = 1 / 60;
export const WORLD_SIZE = 3200;
export const ROAD_PITCH = 400;
export const ROAD_WIDTH = 96;
export const ROAD_CENTERS = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const SAVE_KEY = 'neonbay-save-v1';
export const BEST_TIMES_KEY = 'neonbay.bestTimes';
// Pickups come back this many seconds after being taken.
export const PICKUP_RESPAWN_S = 30;

// The controls, in one place so the title screen, the pause screen, and the
// HUD all print the same lines. Keep each line short enough for the title
// screen (the renderer measures them, but a line over ~70 chars wraps badly).
export const CONTROLS_HELP = [
  'WASD drive & walk  •  E steal / enter car  •  Mouse aim, Click shoot  •  Space punch  •  Q weapon',
  'Shift run  •  R reload  •  H horn (in car)  •  P pause  •  M mute  •  Progress saves after every mission',
];

// Named places (all on roads, so they are always reachable).
export const PLACES = {
  garage: { x: 600, y: 600, name: 'Moreno Garage' },
  safehouse: { x: 2600, y: 2600, name: 'Safehouse' },
  docks: { x: 1600, y: 3000, name: 'The Docks' },
  club: { x: 2600, y: 600, name: 'Club Mirage' },
  bank: { x: 1400, y: 1400, name: 'Bank of Neon Bay' },
  warehouse: { x: 600, y: 2600, name: 'Salvatore Warehouse' },
  meet: { x: 2200, y: 1800, name: 'The Meet' },
  airport: { x: 1600, y: 200, name: 'Neon Bay Airfield' },
  hospital: { x: 1000, y: 2600, name: 'St. Mercy Hospital' },
  plaza: { x: 1800, y: 1400, name: 'Liberty Plaza' },
  tower: { x: 1800, y: 600, name: 'Grand Tower' },
};

export const CAR_COLORS = [
  '#e33f2f', '#2f7fe3', '#f2c230', '#37b24d', '#8b5cf6', '#f27d16',
  '#e8e8e8', '#222831', '#e64980', '#20c997', '#adb5bd', '#9775fa',
];
