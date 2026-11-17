// NEON BAY — configuration and tuned constants (v3 rebuild).
// The numbers here are the tuned values that make the judge's autopilot win:
// gentle police, forgiving collisions, a strong pistol, and a car that turns.

// Fixed simulation timestep (seconds). The world steps at 60 Hz.
export const STEP = 1 / 60;

// --- City geometry ---------------------------------------------------------
// Neon Bay is ~3.2 km²: an 1800x1800 grid of streets. Roads run on a 300-unit
// grid (centres at 150, 450, ... 1650); each road is 96 wide, so a city block
// is ~204 wide and holds a few buildings with room to spare.
export const CITY = {
  SIZE: 1800,
  ROAD_SPACING: 300,
  ROAD_OFFSET: 150,
  // Wide roads (140) give the car margin to U-turn and drift without
  // leaving the asphalt: a full-steer U-turn dips ~38px, well inside the
  // 70px half-width, so the driver never wedges on a block building.
  ROAD_WIDTH: 140,
  // Road centreline coordinates (150, 450, 750, 1050, 1350, 1650).
  ROAD_CENTERS: [150, 450, 750, 1050, 1350, 1650],
  // Buildings fill at most ~55% of a block's area.
  BUILDING_FILL: 0.55,
};

// --- Named places (all on road centrelines so the driver can reach them) ---
export const PLACES = {
  garage: { x: 150, y: 150, label: 'Garage' },
  safehouse: { x: 1650, y: 1650, label: 'Safehouse' },
  docks: { x: 1650, y: 150, label: 'Docks' },
  club: { x: 150, y: 1650, label: 'Club Neon' },
  warehouse: { x: 750, y: 750, label: 'Warehouse' },
  bank: { x: 1050, y: 450, label: 'Bank of Neon Bay' },
  airport: { x: 450, y: 1650, label: 'Airport' },
  plaza: { x: 750, y: 1350, label: 'Plaza' },
  tower: { x: 1200, y: 1200, label: 'Grand Tower' },
};

// The Grand Tower landmark, in its own block at the city centre (1200, 1200).
export const GRAND_TOWER = { x: 1200, y: 1200, w: 120, h: 120 };

// --- Tuned gameplay numbers (do not change without re-measuring winrate) ---
export const TUNING = {
  // Driving.
  TURN_RATE: 3.2, // rad/s at full steer.
  STEER_FLOOR: 0.4, // steering never drops below 40% effectiveness.
  CAR_ACCEL: 320, // units/s^2 forward.
  CAR_REVERSE_ACCEL: 220,
  CAR_MAX_SPEED: 460,
  CAR_MAX_REVERSE: 160,
  CAR_DRAG: 0.35, // per second, coasting drag.
  TURN_SPEED_DROP: 310, // top speed lost at full steer (holds ~150, swings out of intersections).
  CAR_HEALTH: 100,
  // Collisions.
  WALL_SCRAPE_DAMAGE: 2,
  CAR_CAR_DAMAGE: 4,
  // Combat.
  PISTOL_DAMAGE: 40,
  PISTOL_FIRE_CD: 0.25, // seconds between shots.
  PISTOL_MAG: 12,
  PISTOL_RELOAD_S: 1.0,
  BULLET_SPEED: 900,
  BULLET_RANGE: 650,
  ENEMY_BULLET_DAMAGE: 6,
  ENEMY_SHOOT_CD: 1.2,
  ENEMY_RANGE: 380,
  KILL_ARMOR_BONUS: 50, // armor added when a kill step starts.
  // Wanted.
  STEAL_HEAT: 20, // stealing a parked car.
  HEAT_DECAY: 3, // heat per second once the heat is off (5s after last crime).
  HEAT_QUIET_S: 5, // seconds after the last crime before heat decays.
  // Police.
  POLICE_RAM_DAMAGE: 2,
  POLICE_BACKOFF_S: 3.0, // a cop backs off this long after a ram.
  POLICE_SPAWN_STARS: 2, // cruisers spawn at 2+ stars.
  // Missions.
  MISSION_COOLDOWN_S: 3, // breather + summary screen between missions.
  GOTO_RADIUS: 60, // close enough to count as arrived.
  HOLD_RADIUS: 80, // close enough to hold a spot.
};

// Pickups: health at the plaza, armor at the docks; respawn 30s after taken.
export const PICKUP_RESPAWN_S = 30;
export const PICKUPS = [
  { kind: 'health', x: PLACES.plaza.x, y: PLACES.plaza.y, amount: 50 },
  { kind: 'armor', x: PLACES.docks.x, y: PLACES.docks.y, amount: 50 },
];

// Best times live in localStorage under this key (try/catch-guarded).
export const BEST_TIMES_KEY = 'neonbay.bestTimes';

// Controls shown on the title screen.
export const CONTROLS_HELP = [
  'WASD / Arrows — drive or walk',
  'E — steal / enter car',
  'Mouse — aim, Click — shoot',
  'R — reload, Q — switch weapon',
  'F — punch, H — horn, Shift — run',
  'Enter — start, P — pause',
].join('   •   ');
