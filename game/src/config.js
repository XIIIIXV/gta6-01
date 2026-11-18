// config.js — frozen tuned constants for NEON BAY (v8 rebuild).
// Values copied verbatim from the v8 spec. Do not retune without re-measuring.

export const STEP = 1 / 60;

export const CITY = {
  SIZE: 1800,
  ROAD_SPACING: 300,
  ROAD_OFFSET: 150,
  ROAD_WIDTH: 140,
  ROAD_CENTERS: [150, 450, 750, 1050, 1350, 1650],
  BUILDING_FILL: 0.55,
};

export const PLACES = {
  garage: { x: 150, y: 150 },
  safehouse: { x: 1650, y: 1650 },
  docks: { x: 1650, y: 150 },
  club: { x: 150, y: 1650 },
  warehouse: { x: 750, y: 750 },
  bank: { x: 1050, y: 450 },
  airport: { x: 450, y: 1650 },
  plaza: { x: 750, y: 1350 },
  tower: { x: 1200, y: 1050 }, // Road in front of the Grand Tower (the
  // tower building itself is 120x120 at 1200,1200 — a car can never get
  // within GOTO_RADIUS of its centre, so the place is the road approach).
};

export const GRAND_TOWER = { x: 1200, y: 1200, w: 120, h: 120 };

export const TUNING = {
  TURN_RATE: 3.2,
  STEER_FLOOR: 0.4,
  CAR_ACCEL: 320,
  CAR_REVERSE_ACCEL: 220,
  CAR_MAX_SPEED: 460,
  CAR_MAX_REVERSE: 160,
  CAR_DRAG: 0.35,
  TURN_SPEED_DROP: 310,
  CAR_HEALTH: 100,
  WALL_SCRAPE_DAMAGE: 2,
  CAR_CAR_DAMAGE: 4,
  PISTOL_DAMAGE: 40,
  PISTOL_FIRE_CD: 0.25,
  PISTOL_MAG: 12,
  PISTOL_RELOAD_S: 1.0,
  BULLET_SPEED: 900,
  BULLET_RANGE: 650,
  ENEMY_BULLET_DAMAGE: 6,
  ENEMY_SHOOT_CD: 1.2,
  ENEMY_RANGE: 380,
  KILL_ARMOR_BONUS: 50,
  STEAL_HEAT: 20,
  HEAT_DECAY: 3,
  HEAT_QUIET_S: 5,
  POLICE_RAM_DAMAGE: 2,
  POLICE_BACKOFF_S: 3.0,
  POLICE_SPAWN_STARS: 2,
  MISSION_COOLDOWN_S: 3,
  GOTO_RADIUS: 60,
  HOLD_RADIUS: 80,
  // Round 6 — 6-star wanted system (GTA 6 style). Heat caps at 120 (6 stars);
  // missions never push past 4 stars, so the new tiers only bite in free roam.
  HEAT_CAP: 120,
  STARS_MAX: 6,
  // Hiding: when no cop has line of sight for 8s, heat decays twice as fast.
  HIDDEN_LOSE_S: 8,
  HIDDEN_DECAY: 6,
  COP_LOS_RANGE: 500,
  // Helicopter (4+ stars): follows from above, searchlight on the player,
  // slower than the hero car's top speed so it can be outrun. Never damages
  // the player directly — it only keeps the player "spotted" (no hidden decay).
  HELI_SPAWN_STARS: 4,
  HELI_SPEED: 380,
  HELI_HEIGHT: 160, // High enough to clear most roofs, low enough to see.
  HELI_LOSE_RANGE: 900,
  HELI_LOSE_S: 3,
  // SWAT van (6 stars only): tougher, faster cruiser, same ram damage.
  SWAT_SPAWN_STARS: 6,
  SWAT_HEALTH: 150,
  SWAT_MAX_SPEED: 450,
  // Time trial (side activity): tower -> airport against the clock.
  TRIAL_PAR_S: 75,
  TRIAL_REWARD_PAR: 300,
  TRIAL_REWARD_FINISH: 150,
  // Stunt jumps (side activity): ramp airtime pays cash.
  STUNT_MIN_SPEED: 180,
  STUNT_AIR_S: 0.9,
  STUNT_REWARD_BASE: 50,
  STUNT_REWARD_PER_S: 100,
};

export const PICKUP_RESPAWN_S = 30;

export const PICKUPS = [
  { kind: 'health', place: 'plaza', amount: 50 },
  { kind: 'armor', place: 'docks', amount: 50 },
];

export const BEST_TIMES_KEY = 'neonbay.bestTimes';
export const SAVE_KEY = 'neonbay.save.v1';
export const TRIAL_BEST_KEY = 'neonbay.trialBest';

// Time-trial route: Grand Tower -> Airport, against the clock.
export const TRIAL_ROUTE = {
  name: 'Neon Bay Time Trial',
  checkpoints: ['tower', 'airport'],
  startPlace: 'plaza',
};

// GTA 6-style social feed handles (NEONFEED).
export const FEED_HANDLES = [
  '@vice_vicky', '@neon_nate', '@baywatch_ben', '@docks_dan',
  '@club_carla', '@tower_tom', '@palm_pete', '@grand_greta',
];

export const CONTROLS_HELP =
  'WASD / Arrows — drive or walk   •   E — steal / enter car   •   Mouse — aim, Click — shoot   •   R — reload, Q — switch weapon   •   F — punch, H — horn, Shift — run   •   C — radio station, V — radio on/off, T — time trial, B — phone   •   Enter — start, P — pause';
