// NEON BAY — frozen tuning constants (v5 rebuild, written from spec).
// These values are the tuned set that achieves the 99%+ judge winrate.
// Do not "improve" them without re-measuring `node tools/winrate.mjs 200 1`.

/** Fixed simulation step (seconds). */
export const STEP = 1 / 60;

/** City geometry. */
export const CITY = {
  SIZE: 1800,
  ROAD_SPACING: 300,
  ROAD_OFFSET: 150,
  ROAD_WIDTH: 140,
  ROAD_CENTERS: [150, 450, 750, 1050, 1350, 1650],
  BUILDING_FILL: 0.55,
};

/** Named places on the map (single shared objects — missionPlace returns these). */
export const PLACES = {
  garage: { x: 150, y: 150 },
  safehouse: { x: 1650, y: 1650 },
  docks: { x: 1650, y: 150 },
  club: { x: 150, y: 1650 },
  warehouse: { x: 750, y: 750 },
  bank: { x: 1050, y: 450 },
  airport: { x: 450, y: 1650 },
  plaza: { x: 750, y: 1350 },
  tower: { x: 1200, y: 1200 },
};

/** The Grand Tower landmark at the city centre. */
export const GRAND_TOWER = { x: 1200, y: 1200, w: 120, h: 120 };

/** Driving / combat / wanted tuning. */
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
};

/** Pickup respawn time (seconds). */
export const PICKUP_RESPAWN_S = 30;

/** Pickup spots: health at the plaza, armor at the docks. */
export const PICKUPS = [
  { kind: 'health', place: 'plaza', amount: 50 },
  { kind: 'armor', place: 'docks', amount: 50 },
];

/** localStorage key for per-mission / total best times. */
export const BEST_TIMES_KEY = 'neonbay.bestTimes';

/** Controls line shown on the title screen. */
export const CONTROLS_HELP = 'WASD / Arrows — drive or walk   •   E — steal / enter car   •   Mouse — aim, Click — shoot   •   R — reload, Q — switch weapon   •   F — punch, H — horn, Shift — run   •   Enter — start, P — pause';
