# NEON BAY

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

A neon open-world crime spree in a 3.2 km² city. Steal cars, dodge the
cops, and run 6 story missions across Neon Bay — from a quiet return to
town to a city-wide getaway. Built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

## Play

```bash
node serve.ts --port 8080
# open http://localhost:8080/
```

Or just open `game/index.html` in a browser (module scripts need to be
served over HTTP for the imports to resolve — use the dev server above).

## Controls

| Key | Action |
| --- | ------ |
| WASD / arrows | Drive & walk |
| E | Enter / exit car |
| Mouse | Aim |
| Click / Space | Shoot (pistol) |
| R | Reload |
| F | Switch weapon |
| H | Horn |
| M | Mute / unmute |
| ENTER | Start mission / continue / play again |

## Missions (PAR targets)

| # | Mission | PAR | Reward |
| --- | ------- | --- | ------ |
| 1 | Back in Town | 90s | $250 |
| 2 | The Package | 150s | $400 |
| 3 | Crew Call | 180s | $500 |
| 4 | Bank of Neon Bay | 180s | $600 |
| 5 | Sal's Enforcers | 240s | $800 |
| 6 | The Long Goodbye | 150s | $1,000 |

Beat a mission's PAR and the summary panel shows **★ BEAT PAR! ★**.
Finish all six and the ending screen shows your per-mission times, total
time, and — if you beat your previous best — **★ NEW BEST! ★**. Best
times are kept in `localStorage` under `neonbay.bestTimes`.

## The city

- 3.2 km² neon grid: 6×6 road network, ~91 buildings (capped at ~55% of
  each block), per-block shuffled roof palette, neon sign strips on ~25%
  of buildings, park fountains on ~50% of parks, and the Grand Tower
  landmark at the centre.
- Traffic cars and pedestrians wander the streets; pedestrians wear
  weighted shirt colours and turn at random.
- Pickups: health at the plaza, armor at the docks (respawn every 30s).

## Wanted & police

- 0–5 wanted stars, driven by heat (stealing a car adds heat; the
  getaway car in a delivery is free to take and adds none).
- Police cruisers ram (damage 2) and back off for 3.0s after a hit;
  on-foot cops can arrest you at 3+ stars. All police despawn when your
  wanted level falls to 0.
- Wall scrapes damage 2, car–car collisions damage 4.

## Combat

- Pistol: damage 40, 12-round mag, 1.0s reload. Enemy bullets deal 6.
- Clearing a kill step grants +50 armor; completing a mission heals you
  to full health.

## Driving

Cars steer with a 0.4 floor and a 3.2 turn rate, and bleed speed in hard
turns so U-turns stay inside the 96-wide roads instead of swinging into
a block. Top speed 460, reverse 160.

## Verification

```bash
node tools/simtest.mjs   # 17 headless simulation tests
node tools/playtest.mjs  # headless Chromium playtest (0 console errors)
node tools/winrate.mjs   # judge winrate, N=200 seeds
node tools/shots.mjs     # regenerate the 4 screenshots
```

Measured judge winrate (N=200, seeds 1–200): **200/200 = 100.0%**.

## Files

- `game/index.html` — entry page (loading veil, noscript, meta).
- `game/src/` — the game: `random.js` (seeded RNG), `config.js`
  (tuning + places), `city.js` (procedural city), `world.js`
  (simulation), `missions.js` (6 story missions), `render.js`
  (canvas renderer + HUD + summary), `input.js` (keyboard/mouse),
  `audio.js` (WebAudio synth SFX), `main.js` (loop + camera),
  `shots.js` (screenshot scene setup).
- `main.ts` — repo entrypoint (guards + build summary).
- `serve.ts` — dev server (access log, HEAD support, `--quiet`).
- `tools/` — verification harness (`simtest.mjs`, `playtest.mjs`,
  `winrate.mjs`, `shots.mjs`) and `shots-report.json`.
- `screenshots/` — 4 staged captures (`1-start`, `2-play`, `3-chase`,
  `4-mission`), each under 256 KiB.
- `vendor/makefun-game.ts` — kit file (do not modify).

## License

MIT — see [LICENSE](LICENSE).
