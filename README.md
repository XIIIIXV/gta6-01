# NEON BAY

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game (GTA-style, no Rockstar assets or names) for
the make.fun **gta6-01** bounty ($1,666). A 3.2 km² neon city at night, built
in real 3D with Three.js: steal cars, dodge the heat, run six story missions,
and leave Neon Bay for good.

## How to play

```sh
node serve.ts --port 8080
# then open http://localhost:8080/
```

Or run `node main.ts` for a build summary first.

## The game

- **Open world:** grid streets, ~15 buildings plus the Grand Tower landmark,
  parks with animated fountains, neon signs, street lights, traffic cars and
  pedestrians.
- **Driving:** car-relative steering, traffic, car stealing (stealing raises
  your wanted level), horn (H), pickups (health at the plaza, armor at the
  docks, +50, respawn 30s).
- **Wanted 0–5 stars + police:** cruisers chase and ram, back off, and
  despawn when the heat dies down.
- **Combat:** pistol (12-round mag, R to reload, Q to switch weapon, F to
  punch), enemies with line-of-sight shooting, kill-step armor bonus (+50).
- **Missions:** six story missions with PAR targets and cash rewards (below).
  Mission-complete heals you. Best times are tracked in localStorage under
  `neonbay.bestTimes` — a mission summary shows your time, best time, cash
  earned, and **★ NEW BEST!** when you beat your best or **★ BEAT PAR!**
  when you beat the PAR. A full run past M1 records per-mission bests; the
  best total is only set when you finish all six missions.

## Missions and PAR targets

| # | Mission | PAR | Reward | Objective |
|---|---------|-----|--------|-----------|
| 1 | Back in Town | 90s | $250 | Steal a car, reach the safehouse |
| 2 | The Package | 150s | $400 | Deliver the package to the club — don't wreck the car |
| 3 | Crew Call | 180s | $500 | Clear 3 lookouts at the warehouse |
| 4 | Bank of Neon Bay | 180s | $600 | Hold the bank 8s, lose the heat, get home |
| 5 | Sal's Enforcers | 240s | $800 | Clear 7 enforcers — the last one is Sal |
| 6 | The Long Goodbye | 150s | $1000 | Survive 45 seconds |

## 3D rendering and polish (Three.js r160, vendored under game/vendor/)

- Perspective third-person chase camera: smooth-lerped follow, look-ahead,
  speed FOV kick, subtle shake on collisions. Higher and closer on foot.
- Procedural 3D city from the same data as the logic: asphalt roads with
  dashed centre lines and crosswalks, raised sidewalks, buildings with
  emissive neon windows (Grand Tower much taller, with a blinking beacon),
  neon sign strips, animated fountain discs, instanced street lights, night
  sky with stars and fog.
- Low-poly cars built from boxes (body, cabin, spinning wheels, visibly
  steering front wheels), headlight spotlight on the player's car, neon
  underglow, police cruisers with flashing red/blue light bars and halos.
- Player and pedestrians as 3D characters; enemies distinct with red
  markers; pickups as glowing floating icons (green cross, blue shield).
- Lighting: ambient + directional moonlight with shadows, emissive neon,
  muzzle flash light, exhaust/skid particle puffs.
- Performance: shared geometries and materials, no per-frame allocations in
  the hot loop, pixel ratio capped at 1.5, fog to limit draw distance.
- Fallback: if WebGL cannot be created (headless without GPU), a 2D top-down
  renderer takes over so the game still plays — never a blank screen.
- HUD on a 2D overlay canvas: wanted stars, health/armor bars, cash, speed,
  mission name/tip, objective arrow, minimap (player, cars, police,
  pickups, destination marker), mission and game-complete summaries.
  Auto-pause on tab switch (P to pause/resume).

## Judge winrate

Measured with the included harness:

```sh
node tools/winrate.mjs 200 1
```

**Result: 200/200 = 100.0%** (N=200, seeds 1–200). A win is all six
missions complete with the ending screen, no wasted / busted / mission
failed, and no >120s soft-lock.

Also verified: `node tools/simtest.mjs` (all 17 checks pass),
`node tools/playtest.mjs` (0 console errors, 0 failed requests, 0 external
requests), and `node tools/shots.mjs` (4 screenshots, each under 256 KiB,
0 errors, all visibly 3D).

## Controls

| Input | Action |
|-------|--------|
| WASD / Arrows | Drive or walk |
| E | Steal / enter car |
| Mouse | Aim, Click to shoot |
| R | Reload |
| Q | Switch weapon |
| F | Punch |
| H | Horn |
| Shift | Run |
| Enter | Start / retry |
| P | Pause |

## Files

- `game/index.html` — page, import map (`three` → `./vendor/three.module.js`), stacked canvases
- `game/src/main.js` — boot, fixed-step game loop, screens, shot staging
- `game/src/world.js` — simulation: driving, wanted/police, combat, missions
- `game/src/render.js` — Three.js 3D renderer, HUD, 2D fallback, best times
- `game/src/city.js` — procedural city (roads, buildings, parks, fountains)
- `game/src/missions.js` — the six mission definitions
- `game/src/config.js` — frozen tuning constants
- `game/src/random.js` — seeded RNG helpers
- `game/src/input.js` — keyboard + mouse input
- `game/src/audio.js` — synthesized WebAudio bleeps (no audio assets)
- `game/src/shots.js` — staged screenshot scenes
- `game/vendor/three.module.js` — Three.js r160 (vendored library, MIT)
- `main.ts` — entrypoint guard + build summary (`node main.ts`)
- `serve.ts` — dev server (`node serve.ts --port 8080`)
- `tools/` — `winrate.mjs`, `simtest.mjs`, `playtest.mjs`, `shots.mjs`
- `screenshots/` — 1-start, 2-play, 3-chase, 4-mission
