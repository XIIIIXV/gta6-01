// render.js — canvas renderer for NEON BAY.
// Pure drawing: reads world state, draws the city, entities and HUD.
// No game logic here; the world module owns all simulation.
// Field names match world.js exactly (screen: title/play/wasted/busted/
// failed/ending; money on player; stars on world; police are cars).

import { CITY, PLACES, TUNING, BEST_TIMES_KEY } from './config.js';
import { missionPlace, fmtTime } from './missions.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function drawCar(ctx, x, y, angle, color, wrecked, police) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (wrecked) ctx.globalAlpha = 0.55;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-26, -13, 52, 26, 6);
  ctx.fill();
  ctx.fillStyle = police ? '#e8f4ff' : 'rgba(10, 16, 32, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-6, -11, 18, 22, 4);
  ctx.fill();
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(22, -10, 4, 5);
  ctx.fillRect(22, 5, 4, 5);
  ctx.fillStyle = '#ff2244';
  ctx.fillRect(-26, -10, 4, 5);
  ctx.fillRect(-26, 5, 4, 5);
  if (police) {
    ctx.fillStyle = '#ff2244';
    ctx.fillRect(-2, -13, 6, 4);
    ctx.fillStyle = '#2244ff';
    ctx.fillRect(-2, 9, 6, 4);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  ctx.stroke();
  ctx.restore();
}

// Best total time from localStorage (browser only; null in Node).
export function loadBestTime() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return typeof obj.total === 'number' ? obj.total : null;
  } catch {
    return null;
  }
}

export function saveBestTime(total) {
  try {
    if (typeof localStorage === 'undefined') return false;
    const prev = loadBestTime();
    if (prev !== null && prev <= total) return false;
    localStorage.setItem(BEST_TIMES_KEY, JSON.stringify({ total, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function render(ctx, world, view, now, bestTime) {
  const { camX, camY, zoom, w, h } = view;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#070b18';
  ctx.fillRect(0, 0, w, h);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  ctx.fillStyle = '#0d1526';
  ctx.fillRect(0, 0, CITY.SIZE, CITY.SIZE);

  // Roads.
  ctx.fillStyle = '#1a2233';
  for (const c of CITY.ROAD_CENTERS) {
    ctx.fillRect(0, c - CITY.ROAD_WIDTH / 2, CITY.SIZE, CITY.ROAD_WIDTH);
    ctx.fillRect(c - CITY.ROAD_WIDTH / 2, 0, CITY.ROAD_WIDTH, CITY.SIZE);
  }
  ctx.strokeStyle = 'rgba(255, 214, 64, 0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  for (const c of CITY.ROAD_CENTERS) {
    ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(CITY.SIZE, c); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, CITY.SIZE); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Parks.
  for (const park of world.city.parks) {
    ctx.fillStyle = '#0f2a1a';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = '#123a22';
    ctx.beginPath();
    ctx.arc(park.x + park.w / 2, park.y + park.h / 2, Math.min(park.w, park.h) * 0.28, 0, TAU);
    ctx.fill();
    if (park.fountain) {
      ctx.fillStyle = '#00b8d4';
      ctx.beginPath();
      ctx.arc(park.x + park.w / 2, park.y + park.h / 2, 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#aee9ff';
      ctx.beginPath();
      ctx.arc(park.x + park.w / 2, park.y + park.h / 2, 7, 0, TAU);
      ctx.fill();
    }
  }

  // Buildings.
  for (const b of world.city.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(b.x, b.y, b.w, 4);
    if (b.neon) {
      ctx.strokeStyle = b.neonColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
    ctx.fillStyle = 'rgba(255, 220, 120, 0.25)';
    const cols = Math.max(1, Math.floor(b.w / 22));
    const rows = Math.max(1, Math.floor(b.h / 22));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        if (((i * 7 + j * 13 + b.x) % 3) === 0) ctx.fillRect(b.x + 6 + i * 22, b.y + 6 + j * 22, 8, 8);
      }
    }
  }

  // Grand Tower.
  ctx.fillStyle = '#3a2a5a';
  ctx.fillRect(PLACES.tower.x - 60, PLACES.tower.y - 60, 120, 120);
  ctx.strokeStyle = '#ff2d95';
  ctx.lineWidth = 3;
  ctx.strokeRect(PLACES.tower.x - 60, PLACES.tower.y - 60, 120, 120);
  ctx.fillStyle = '#ff2d95';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEON BAY', PLACES.tower.x, PLACES.tower.y - 70);

  // Place markers.
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (const [name, place] of Object.entries(PLACES)) {
    if (name === 'tower') continue;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(place.x, place.y, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9beaff';
    ctx.fillText((place.label || name).toUpperCase(), place.x, place.y - 12);
  }

  // Pickups.
  for (const pk of world.pickups) {
    if (!pk.active) continue;
    const pulse = 0.7 + 0.3 * Math.sin(now / 200);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = pk.kind === 'health' ? '#00ff9d' : '#00e5ff';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 10, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#04121a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + 4);
  }

  // Mission marker (pulsing) at the current step's place.
  if (world.mission && !world.mission.done) {
    const m = missionPlace(world.mission.step);
    if (m) {
      const pulse = 1 + 0.25 * Math.sin(now / 180);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(-7, -12);
      ctx.lineTo(7, -12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // All cars (parked, traffic, delivery, police). Skip the player's car
  // here; it is drawn after the pedestrians so it sits on top.
  for (const car of world.cars) {
    if (world.player.car === car) continue;
    drawCar(ctx, car.x, car.y, car.angle, car.color, car.wrecked, car.police);
  }

  // Enemies.
  for (const e of world.enemies) {
    if (e.dead) continue;
    drawPerson(ctx, e.x, e.y, e.angle, '#ff3355', 11);
    if (e.hp < 100) {
      ctx.fillStyle = '#222';
      ctx.fillRect(e.x - 14, e.y - 20, 28, 4);
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(e.x - 14, e.y - 20, 28 * (e.hp / 100), 4);
    }
  }

  // On-foot cops.
  for (const c of world.cops) {
    if (c.dead) continue;
    drawPerson(ctx, c.x, c.y, c.angle, '#2244ff', 10);
  }

  // Pedestrians.
  for (const ped of world.peds) {
    drawPerson(ctx, ped.x, ped.y, ped.angle, '#c9d4e8', 8);
  }

  // Bullets.
  ctx.fillStyle = '#ffe600';
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, TAU);
    ctx.fill();
  }

  // Player.
  const p = world.player;
  if (p.car) {
    drawCar(ctx, p.car.x, p.car.y, p.car.angle, p.car.color, false, false);
  } else {
    drawPerson(ctx, p.x, p.y, p.angle, '#00e5ff', 11);
    if (p.weapon === 'pistol') {
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
      ctx.stroke();
    }
  }

  ctx.restore();

  // ---- HUD (screen space) ----
  const pad = 14;
  ctx.textAlign = 'left';
  // Money.
  ctx.fillStyle = 'rgba(4, 10, 20, 0.7)';
  ctx.fillRect(pad, pad, 150, 30);
  ctx.fillStyle = '#00ff9d';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`$ ${p.money}`, pad + 10, pad + 21);
  // Wanted stars.
  ctx.fillStyle = 'rgba(4, 10, 20, 0.7)';
  ctx.fillRect(pad, pad + 38, 150, 30);
  ctx.fillStyle = '#ffd600';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < world.stars ? '★' : '☆';
  ctx.fillText(stars, pad + 10, pad + 59);
  // Health / armor bars.
  ctx.fillStyle = 'rgba(4, 10, 20, 0.7)';
  ctx.fillRect(pad, h - pad - 58, 210, 58);
  ctx.fillStyle = '#ff3355';
  ctx.fillRect(pad + 10, h - pad - 48, 190 * clamp(p.health / 100, 0, 1), 10);
  ctx.fillStyle = '#00e5ff';
  ctx.fillRect(pad + 10, h - pad - 32, 190 * clamp(p.armor / 100, 0, 1), 10);
  ctx.fillStyle = '#e8f4ff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.health)}  ARMOR ${Math.ceil(p.armor)}`, pad + 10, h - pad - 6);
  // Ammo.
  if (p.weapon === 'pistol') {
    ctx.fillStyle = 'rgba(4, 10, 20, 0.7)';
    ctx.fillRect(w - pad - 130, h - pad - 30, 130, 30);
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(p.reloadT > 0 ? 'RELOADING…' : `AMMO ${p.mag}/${TUNING.PISTOL_MAG}`, w - pad - 120, h - pad - 10);
  }
  // Mission panel (top-right).
  if (world.mission && world.screen === 'play') {
    const ms = world.mission;
    const def = ms.def;
    const panelW = 320;
    ctx.fillStyle = 'rgba(4, 10, 20, 0.78)';
    ctx.fillRect(w - pad - panelW, pad, panelW, 92);
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`MISSION ${def.id}/6 — ${def.name}`, w - pad - panelW + 12, pad + 22);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '13px sans-serif';
    // Wrap the step tip to two lines so it never runs off the panel.
    const tip = ms.step ? ms.step.tip : '';
    const maxTipW = panelW - 24;
    if (ctx.measureText(tip).width <= maxTipW) {
      ctx.fillText(tip, w - pad - panelW + 12, pad + 44);
    } else {
      const words = tip.split(' ');
      let line1 = '';
      let i = 0;
      while (i < words.length && ctx.measureText(`${line1} ${words[i]}`.trim()).width <= maxTipW) {
        line1 = `${line1} ${words[i]}`.trim();
        i += 1;
      }
      const line2 = words.slice(i).join(' ');
      ctx.fillText(line1, w - pad - panelW + 12, pad + 42);
      ctx.fillText(line2, w - pad - panelW + 12, pad + 58);
    }
    const elapsed = world.time - ms.startedAt;
    ctx.fillStyle = '#9beaff';
    ctx.fillText(`TIME ${fmtTime(elapsed)}   PAR ${fmtTime(def.par)}`, w - pad - panelW + 12, pad + 66);
    if (ms.step && ms.step.type === 'hold') {
      ctx.fillStyle = '#00ff9d';
      ctx.fillText(`HOLD ${ms.holdT.toFixed(1)}s / ${ms.step.seconds}s`, w - pad - panelW + 12, pad + 86);
    } else if (ms.step && ms.step.type === 'kill') {
      ctx.fillStyle = '#00ff9d';
      ctx.fillText(`KILLS ${ms.kills}/${ms.step.count}`, w - pad - panelW + 12, pad + 86);
    } else if (ms.step && ms.step.type === 'survive') {
      ctx.fillStyle = '#00ff9d';
      ctx.fillText(`SURVIVE ${Math.max(0, ms.timer).toFixed(0)}s`, w - pad - panelW + 12, pad + 86);
    }
  }
  // Best time (top-center).
  if (bestTime !== null && bestTime !== undefined) {
    ctx.fillStyle = 'rgba(4, 10, 20, 0.7)';
    ctx.fillRect(w / 2 - 90, pad, 180, 30);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`BEST ${fmtTime(bestTime)}`, w / 2, pad + 21);
    ctx.textAlign = 'left';
  }
  // Mission-complete summary panel (shown during the cooldown).
  if (world.summary && world.mission && world.mission.done && world.screen === 'play') {
    const s = world.summary;
    const pw = 360;
    const ph = 150;
    ctx.fillStyle = 'rgba(4, 10, 20, 0.88)';
    ctx.fillRect(w / 2 - pw / 2, h / 2 - ph / 2, pw, ph);
    ctx.fillStyle = '#00ff9d';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION COMPLETE', w / 2, h / 2 - ph / 2 + 34);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${s.name} — ${fmtTime(s.time)} (PAR ${fmtTime(s.par)})`, w / 2, h / 2 - ph / 2 + 64);
    ctx.fillStyle = '#00ff9d';
    ctx.fillText(`+$${s.cash}`, w / 2, h / 2 - ph / 2 + 90);
    if (s.beatPar) {
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('★ BEAT PAR! ★', w / 2, h / 2 - ph / 2 + 118);
    }
    ctx.textAlign = 'left';
  }
  // Ending screen (all 6 missions done): run summary + best time.
  if (world.screen === 'ending') {
    const total = world.runSummary.totalTime;
    const times = world.runSummary.missionTimes;
    ctx.fillStyle = 'rgba(4, 10, 20, 0.9)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#00ff9d';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEON BAY — RUN COMPLETE', w / 2, h / 2 - 130);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '17px sans-serif';
    let y = h / 2 - 90;
    const names = ['Back in Town', 'The Package', 'Crew Call', 'Bank of Neon Bay', "Sal's Enforcers", 'The Long Goodbye'];
    for (let i = 1; i <= 6; i += 1) {
      const t = times[i];
      ctx.fillText(`${i}. ${names[i - 1]} — ${fmtTime(t)}`, w / 2, y);
      y += 26;
    }
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`TOTAL TIME  ${fmtTime(total)}`, w / 2, y + 12);
    if (bestTime !== null && bestTime !== undefined) {
      ctx.fillStyle = '#9beaff';
      ctx.font = '16px sans-serif';
      ctx.fillText(`BEST TIME  ${fmtTime(bestTime)}`, w / 2, y + 40);
    }
    if (total !== null && bestTime !== null && total <= bestTime) {
      ctx.fillStyle = '#00ff9d';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('★ NEW BEST! ★', w / 2, y + 68);
    }
    ctx.fillStyle = '#9beaff';
    ctx.font = '15px sans-serif';
    ctx.fillText('Press ENTER to play again', w / 2, y + 100);
    ctx.textAlign = 'left';
  }
  // Wasted / busted / failed.
  if (world.screen === 'wasted' || world.screen === 'busted' || world.screen === 'failed') {
    ctx.fillStyle = 'rgba(20, 4, 10, 0.88)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff3355';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(world.screen === 'busted' ? 'BUSTED' : world.screen === 'failed' ? 'MISSION FAILED' : 'WASTED', w / 2, h / 2 - 10);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '16px sans-serif';
    ctx.fillText('Press ENTER to try again', w / 2, h / 2 + 24);
    ctx.textAlign = 'left';
  }
  // Title screen.
  if (world.screen === 'title') {
    ctx.fillStyle = 'rgba(4, 10, 20, 0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff2d95';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEON BAY', w / 2, h / 2 - 70);
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('A neon open-world crime spree — 6 story missions', w / 2, h / 2 - 36);
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '15px sans-serif';
    ctx.fillText('WASD / arrows — drive & walk    E — enter / exit car', w / 2, h / 2 + 4);
    ctx.fillText('Mouse — aim    Click / Space — shoot    R — reload', w / 2, h / 2 + 28);
    ctx.fillText('F — switch weapon    H — horn    ENTER — start mission', w / 2, h / 2 + 52);
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Press ENTER to start', w / 2, h / 2 + 92);
    ctx.textAlign = 'left';
  }
  // Controls help (bottom-right, small).
  ctx.fillStyle = 'rgba(232, 244, 255, 0.55)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WASD drive · E enter car · Click shoot · R reload · ENTER mission', w - pad, h - pad);
  ctx.textAlign = 'left';
}
