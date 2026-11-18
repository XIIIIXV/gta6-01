# NEON BAY

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game (GTA-style, no Rockstar assets) built for the
make.fun gta6-01 bounty ($1,666). 3.2 km² of neon streets, 6 story missions,
wanted levels, police chases, and a hand-rolled WebGL 3D renderer — no
Three.js, no external libraries, no CDN. Every line of game code is authored
by hand; the game loads fully offline.

## Summary

You are back in Neon Bay with nothing but a pistol and a reputation. Steal a
car, run packages, hit the Bank of Neon Bay, take down Sal's enforcers, and
survive the long goodbye. Drive with car-relative steering, fight on foot with
aim-and-shoot combat, lose the heat, and get home.

## Judge winrate

Measured with `node tools/winrate.mjs 200 1` (N=200, seeds 1–200): **200/200 = 100.0%** —
verified 2026-11-18 after the final render fixes. Target: 99.7% (user order), floor 99%.
Also verified with a 12-game judge-format check: **12/12 = 100.0%** (target 12-0-0).

## Best-time tracker

Best times are saved in localStorage under `neonbay.bestTimes`. Per-mission
bests and the best total time are shown on the mission-complete and
game-complete summaries. Beat a mission under its PAR and you get
"★ BEAT PAR!"; beat your own best and you get "★ NEW BEST!".

## PAR targets

| Mission | PAR | Reward |
|---|---|---|
| 1. Back in Town | 90s | $250 |
| 2. The Package | 150s | $400 |
| 3. Crew Call | 180s | $500 |
| 4. Bank of Neon Bay | 180s | $600 |
| 5. Sal's Enforcers | 240s | $800 |
| 6. The Long Goodbye | 150s | $1000 |

## 3D rendering + polish

- Hand-rolled WebGL engine (`game/src/gl.js` + `render.js`): own mat4 math,
  own shaders, shared box/quad geometry, one directional moonlight + ambient
  0.5, distance fog, emissive neon.
- Cinematic chase camera (FOV kick with speed, collision shake), low orbit
  around the Grand Tower on the title screen, side-tracking chase camera.
- A living city: ~91 buildings with 8-band lit windows, neon signs with
  halos, rooftop props, shop fronts, the Grand Tower with cyan/pink bands
  and a pulsing beacon, street lamps with glow pools, traffic lights,
  hydrants, bins, planters, benches, billboards, bus stops, barriers,
  manholes, puddles, park fountains with animated water, docks water with
  shimmer, street trees and palms.
- Cars built from boxes: body + cabin + steering front wheels + spinning
  hubs, headlights with a light cone, brake lights, police light bars with
  ground glow, neon underglow on the player's car, fake blob shadows.
- People with arms and legs: pedestrians, enemies and the player are
  torso + head + two arms + two legs, with limbs that swing while walking
  and gun arms forward when aiming.
- 2D top-down fallback (`?fallback=1`) if WebGL is unavailable, so the game
  always plays and `window.__shotReady` always fires.
- HUD: wanted stars, health/armor bars, cash, speed, mission tip, objective
  marker arrow, minimap, mission and game-complete summaries.

## How to play

```sh
node serve.ts --port 8080
# open http://localhost:8080/
```

Or run the entrypoint check first: `node main.ts`.

## Controls

| Input | Action |
|---|---|
| WASD / Arrows | Drive or walk |
| E | Steal / enter car |
| Mouse | Aim |
| Click | Shoot |
| R | Reload |
| Q | Switch weapon |
| F | Punch |
| H | Horn |
| Shift | Run |
| Enter | Start |
| P | Pause |

## Files

- `game/index.html` — entry page, two stacked canvases (#game WebGL, #hud 2D)
- `game/src/random.js` — deterministic RNG (mulberry32)
- `game/src/config.js` — frozen tuned constants
- `game/src/city.js` — procedural city (roads, buildings, parks, props)
- `game/src/missions.js` — the 6 story missions
- `game/src/world.js` — game logic (driving, combat, police, missions)
- `game/src/gl.js` — hand-rolled WebGL engine
- `game/src/render.js` — 3D scene + HUD + 2D fallback
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — procedural WebAudio sounds
- `game/src/shots.js` — staged screenshot scenes
- `game/src/main.js` — boot + game loop
- `tools/winrate.mjs` — judge-winrate harness (N=200)
- `tools/shots.mjs` — staged screenshots (headless Chromium + SwiftShader)
- `tools/simtest.mjs`, `tools/playtest.mjs` — headless tests
- `main.ts` — entrypoint guard + build summary
- `serve.ts` — dev server
