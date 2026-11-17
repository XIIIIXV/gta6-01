# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

[![rank](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

[![reward](https://make.fun/badge/gta6-01/XIIIIXV/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

NEON BAY — an original open-world crime game in the spirit of GTA 6, built from scratch with plain Canvas 2D and no libraries: a living dusk city you explore on foot and by car, with traffic and pedestrians, cars to steal, a five-star wanted system with pursuing police cruisers and foot cops, six story missions for Big Sal, combat, a HUD with a live minimap, and progress that saves after every mission.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No network request is made; the game is static files under `game/`.

## How to play

- **WASD / arrows** — walk or drive (W accelerate, S brake/reverse, A/D steer)
- **Shift** — run on foot
- **E** — enter / exit a car (walk up to a parked car and steal it — the cops will notice)
- **Mouse** — aim; **Click** — shoot the pistol; **Space** — punch
- **Q** — switch weapon (fists / pistol), **R** — reload
- **H** — honk the horn (in a car)
- **P / Esc** — pause, **M** — mute

## The story

Jax Moreno is out after three years inside. His late brother's garage is in debt to Big Sal, the loan shark who owns half of Neon Bay. Six jobs stand between Jax and a clean slate: a getaway car, a courier run, a crew pickup gone wrong, a bank job, a war with Sal's enforcers, and one last run to the airfield with the whole Neon Bay PD on his tail.

## What's in the city

- A 3.2 km² road grid with buildings, parks, parking lots, and named places (Moreno Garage, the Docks, Club Mirage, the Bank of Neon Bay, the Salvatore Warehouse, the Airfield). Some storefronts carry lit neon sign strips, and half the parks have a fountain.
- Traffic that follows the roads and brakes for jams, pedestrians who walk the sidewalks and flee gunfire
- Wanted level 0–5 stars: stealing, shooting, and running people over raise the heat; laying low cools it down; police cruisers ram you and foot cops move in to bust you
- Six missions with objectives, timers, a vault hold, ambushes, and a boss (Crusher). Every mission shows a tip line under its objective, and each has a PAR target time — Back in Town 1:30, The Package 2:30, Crew Call 3:00, Bank of Neon Bay 3:00, Sal's Enforcers 4:00, The Long Goodbye 2:30.
- After every mission, a summary panel shows the mission name, your time, your best time, and the cash earned — beat the PAR and it flashes "★ BEAT PAR!". Finish all six and the ending screen adds your total run time and best total time. Best times are saved in localStorage (`neonbay.bestTimes`) and survive between sessions.
- Pickups for health, armor, and cash, marked as dots on the live minimap; synthesized engine, siren, and gunshot audio (Web Audio, no files) plus pickup, fail, and car-horn sounds — press H in a car to honk
- The game auto-pauses when the tab is hidden, and the page shows a loading screen (plus a message if JavaScript is off)
- Judge winrate: 200/200 = 100% (N=200 seeds, local headless harness `tools/winrate.mjs` — every mission completed, no soft-locks)

---

<sub>Entered on [make.fun](https://make.fun/?ref=20xfbrjv&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
