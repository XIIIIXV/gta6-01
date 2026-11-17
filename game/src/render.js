// NEON BAY renderer: top-down dusk city, entities, HUD, minimap, and screens.
// All drawing is Canvas 2D; the game is fully playable from this one canvas.
import { WORLD_SIZE, ROAD_CENTERS, ROAD_WIDTH, PLACES } from './config.js';
import { mulberry32 } from './random.js';
import { MISSIONS, STORY_INTRO } from './missions.js';
import { starsForHeat } from './world.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let vw = 1280;
  let vh = 800;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = canvas.clientWidth;
    vh = canvas.clientHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- helpers -------------------------------------------------------------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(x, y, angle, color, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(-21, -9, 42, 20, 6);
    ctx.fill();
    ctx.translate(-2, -1);
    // Body.
    ctx.fillStyle = color;
    rr(-20, -11, 40, 22, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(-20, -11, 40, 7, 6);
    ctx.fill();
    // Cabin + windows.
    ctx.fillStyle = '#10141f';
    rr(-6, -9, 14, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(-2, -8, 6, 16);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(18, -9, 3, 4);
    ctx.fillRect(18, 5, 3, 4);
    // Taillights.
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(-21, -9, 3, 4);
    ctx.fillRect(-21, 5, 3, 4);
    if (opts.police) {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-6, -11, 12, 22);
      ctx.fillStyle = '#2030a0';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 3);
      // Light bar flashing.
      const flash = Math.floor(opts.time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d5bff';
      ctx.fillRect(-4, -13, 8, 4);
    }
    if (opts.wrecked) {
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      rr(-20, -11, 40, 22, 6);
      ctx.fill();
    }
    ctx.restore();
    if (opts.wrecked) {
      // Smoke.
      ctx.fillStyle = 'rgba(120,120,120,0.5)';
      ctx.beginPath();
      ctx.arc(x + Math.sin(opts.time * 2) * 6, y - 8, 7 + Math.sin(opts.time * 3) * 2, 0, TAU);
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, shirt, skin, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 9, 7, 0, 0, TAU);
    ctx.fill();
    if (opts.dead) {
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(10, 2, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Body.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fill();
    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(5, 0, 5, 0, TAU);
    ctx.fill();
    // Facing tick.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(8, -1.5, 5, 3);
    ctx.restore();
  }

  // ---- world ---------------------------------------------------------------
  function drawCity(world, cam) {
    const { city } = world;
    const x0 = cam.x - vw / 2 - 60;
    const y0 = cam.y - vh / 2 - 60;
    const x1 = cam.x + vw / 2 + 60;
    const y1 = cam.y + vh / 2 + 60;
    // Harbor water outside the city, land inside.
    ctx.fillStyle = '#16324a';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = '#1d4258';
    for (let wx = Math.floor(x0 / 90) * 90; wx < x1; wx += 90) {
      for (let wy = Math.floor(y0 / 90) * 90; wy < y1; wy += 90) {
        if (wx < 96 || wx > 3104 || wy < 96 || wy > 3104) {
          ctx.fillRect(wx + 20, wy + 30, 34, 2);
        }
      }
    }
    // Land.
    ctx.fillStyle = '#20242e';
    ctx.fillRect(Math.max(x0, 96), Math.max(y0, 96), Math.min(x1, 3104) - Math.max(x0, 96), Math.min(y1, 3104) - Math.max(y0, 96));
    // Parks.
    for (const park of city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = '#2c4a2e';
      ctx.fillRect(park.x, park.y, park.w, park.h);
      const rng = mulberry32(park.seed);
      ctx.fillStyle = '#3f6b35';
      for (let i = 0; i < park.trees; i += 1) {
        ctx.beginPath();
        ctx.arc(park.x + rng() * park.w, park.y + rng() * park.h, 9 + rng() * 7, 0, TAU);
        ctx.fill();
      }
    }
    // Roads.
    ctx.fillStyle = '#33363f';
    const half = ROAD_WIDTH / 2;
    for (const c of ROAD_CENTERS) {
      ctx.fillRect(x0, c - half, x1 - x0, ROAD_WIDTH);
      ctx.fillRect(c - half, y0, ROAD_WIDTH, y1 - y0);
    }
    // Sidewalks.
    ctx.fillStyle = '#454a58';
    for (const c of ROAD_CENTERS) {
      ctx.fillRect(x0, c - half - 22, x1 - x0, 22);
      ctx.fillRect(x0, c + half, x1 - x0, 22);
      ctx.fillRect(c - half - 22, y0, 22, y1 - y0);
      ctx.fillRect(c + half, y0, 22, y1 - y0);
    }
    // Lane markings.
    ctx.strokeStyle = 'rgba(242,194,48,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    ctx.beginPath();
    for (const c of ROAD_CENTERS) {
      ctx.moveTo(x0, c);
      ctx.lineTo(x1, c);
      ctx.moveTo(c, y0);
      ctx.lineTo(c, y1);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Parking lots.
    for (const lot of city.lots) {
      if (lot.x > x1 || lot.x + lot.w < x0 || lot.y > y1 || lot.y + lot.h < y0) continue;
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      for (let gx = lot.x + 20; gx < lot.x + lot.w - 10; gx += 44) {
        ctx.beginPath();
        ctx.moveTo(gx, lot.y + 8);
        ctx.lineTo(gx, lot.y + 30);
        ctx.stroke();
      }
    }
    // Buildings.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      // Wall + roof.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      // Lit windows.
      const rng = mulberry32(b.seed);
      ctx.fillStyle = 'rgba(255,214,120,0.85)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          if (rng() < 0.45) {
            ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 7, 9);
          }
        }
      }
    }
    // Place labels.
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (const [key, place] of Object.entries(PLACES)) {
      if (place.x < x0 || place.x > x1 || place.y < y0 || place.y > y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(place.name).width + 16;
      rr(place.x - w / 2, place.y - 52, w, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillText(place.name, place.x, place.y - 38);
    }
  }

  function drawMarker(world, cam) {
    const m = world.mission;
    if (!m || m.done || !m.step) return;
    const step = m.step;
    const place = step.place ? PLACES[step.place] : null;
    let tx = null;
    let ty = null;
    if (place) { tx = place.x; ty = place.y; }
    if (step.type === 'kill' && world.enemies.some((e) => !e.dead)) {
      const alive = world.enemies.filter((e) => !e.dead);
      tx = alive.reduce((s, e) => s + e.x, 0) / alive.length;
      ty = alive.reduce((s, e) => s + e.y, 0) / alive.length;
    }
    if (tx === null) return;
    const pulse = 1 + Math.sin(world.time * 5) * 0.15;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 46 * pulse, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,10,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 46 * pulse, 0, TAU);
    ctx.fill();
    // Beacon beam.
    const grad = ctx.createLinearGradient(0, -260, 0, 0);
    grad.addColorStop(0, 'rgba(255,214,10,0)');
    grad.addColorStop(1, 'rgba(255,214,10,0.35)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-4, -260);
    ctx.lineTo(4, -260);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Off-screen edge arrow pointing at the marker.
    const p = world.player;
    const sx = tx - cam.x + vw / 2;
    const sy = ty - cam.y + vh / 2;
    if (sx < 40 || sx > vw - 40 || sy < 40 || sy > vh - 40) {
      const cx = clamp(sx, 50, vw - 50);
      const cy = clamp(sy, 50, vh - 50);
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- HUD -----------------------------------------------------------------
  function drawMinimap(world) {
    const size = 190;
    const x = 16;
    const y = vh - size - 16;
    const s = size / WORLD_SIZE;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.82)';
    rr(x - 6, y - 6, size + 12, size + 12, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.fillStyle = '#1d2432';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#3a3f4d';
    for (const c of ROAD_CENTERS) {
      ctx.fillRect(x, y + c * s - 2, size, 4);
      ctx.fillRect(x + c * s - 2, y, 4, size);
    }
    ctx.fillStyle = '#5a5f6e';
    for (const b of world.city.buildings) ctx.fillRect(x + b.x * s, y + b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
    const dot = (wx, wy, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + wx * s, y + wy * s, r, 0, TAU);
      ctx.fill();
    };
    const m = world.mission;
    if (m && !m.done && m.step?.place) {
      const place = PLACES[m.step.place];
      if (place) dot(place.x, place.y, '#ffd60a', 4 + Math.sin(world.time * 5) * 1.5);
    }
    for (const car of world.cars) if (car.police && !car.wrecked) dot(car.x, car.y, '#4d7cff', 2.5);
    for (const car of world.cars) if (car.mission === 'deliver' && !car.wrecked) dot(car.x, car.y, '#37b24d', 3);
    const p = world.player;
    ctx.save();
    ctx.translate(x + p.x * s, y + p.y * s);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NEON BAY', x + 2, y - 10);
  }

  function drawHUD(world) {
    const p = world.player;
    // Top-right: money, stars, health.
    ctx.textAlign = 'right';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#7ee787';
    ctx.fillText(`$${p.money.toLocaleString('en-US')}`, vw - 18, 34);
    // Wanted stars.
    const stars = world.stars;
    ctx.font = '26px sans-serif';
    let starText = '';
    for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
    ctx.fillStyle = stars > 0 ? '#ffd60a' : 'rgba(255,255,255,0.35)';
    ctx.fillText(starText, vw - 18, 66);
    // Health + armor bars.
    const bw = 220;
    const bx = vw - 18 - bw;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(bx, 78, bw, 14, 7);
    ctx.fill();
    ctx.fillStyle = p.health > 30 ? '#37b24d' : '#e33f2f';
    rr(bx, 78, bw * (p.health / 100), 14, 7);
    ctx.fill();
    if (p.armor > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(bx, 96, bw, 8, 4);
      ctx.fill();
      ctx.fillStyle = '#74c0fc';
      rr(bx, 96, bw * (p.armor / 100), 8, 4);
      ctx.fill();
    }
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`HEALTH ${Math.ceil(p.health)}${p.armor > 0 ? `  ARMOR ${Math.ceil(p.armor)}` : ''}`, vw - 18, 90);
    // Weapon + ammo (bottom-right).
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#fff';
    const weapon = p.car ? 'DRIVING' : p.weapon === 'pistol' ? `PISTOL  ${p.mag}/${p.magSize}` : 'FISTS';
    ctx.fillText(weapon, vw - 18, vh - 52);
    if (p.car) {
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = p.car.health > 30 ? '#fff' : '#ff6b6b';
      ctx.fillText(`CAR ${Math.max(0, Math.ceil(p.car.health))}%  •  ${Math.round(Math.abs(p.car.speed) * 0.12)} mph`, vw - 18, vh - 28);
    }
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('E enter/exit car  •  Q weapon  •  P pause  •  M mute', vw - 18, vh - 78);
    // Mission objective (top-left).
    const m = world.mission;
    if (m && !m.done && m.step) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const lines = [`MISSION ${m.def.id}: ${m.def.title}`, m.step.text];
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
      rr(14, 14, w, 52, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd60a';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(lines[0], 26, 34);
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.fillText(lines[1], 26, 54);
      // Timers / progress.
      if (m.step.type === 'deliver' || m.step.type === 'survive') {
        ctx.fillStyle = m.timer < 15 ? '#ff6b6b' : '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${Math.ceil(m.timer)}s`, 26, 76);
      }
      if (m.step.type === 'hold') {
        ctx.fillStyle = '#37b24d';
        ctx.fillRect(26, 66, 160 * (m.holdProgress / m.step.seconds), 8);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(26, 66, 160, 8);
      }
      if (m.step.type === 'kill') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${m.kills}/${m.step.count} down`, 26, 76);
      }
    }
    // Toast message (top center, capped so it never runs off-screen or into
    // the top-right HUD; long text is cut with an ellipsis).
    if (world.message) {
      ctx.textAlign = 'center';
      let size = 15;
      ctx.font = `bold ${size}px sans-serif`;
      let text = world.message.text;
      const maxW = vw - 520;
      while (ctx.measureText(text).width > maxW - 28 && size > 11) {
        size -= 1;
        ctx.font = `bold ${size}px sans-serif`;
      }
      while (ctx.measureText(text).width > maxW - 28 && text.length > 10) {
        text = text.slice(0, -4) + '…';
      }
      const w = Math.min(ctx.measureText(text).width + 28, maxW);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      rr(vw / 2 - w / 2, 84, w, 30, 15);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, vw / 2, 84 + size + 3);
    }
    // Mission banner.
    if (m && m.bannerT > 0 && m.banner) {
      const alpha = clamp(m.bannerT, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(m.banner, vw / 2 + 3, vh / 2 - 97);
      ctx.fillStyle = '#ffd60a';
      ctx.fillText(m.banner, vw / 2, vh / 2 - 100);
      ctx.restore();
    }
    // Low-health vignette.
    if (p.health < 30 && !world.over) {
      const pulse = 0.25 + Math.sin(world.time * 6) * 0.12;
      const grad = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.75);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, `rgba(255,0,0,${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, vw, vh);
    }
    drawMinimap(world);
  }

  function drawCrosshair(aim) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 9, 0, TAU);
    ctx.moveTo(aim.x - 14, aim.y);
    ctx.lineTo(aim.x - 6, aim.y);
    ctx.moveTo(aim.x + 6, aim.y);
    ctx.lineTo(aim.x + 14, aim.y);
    ctx.moveTo(aim.x, aim.y - 14);
    ctx.lineTo(aim.x, aim.y - 6);
    ctx.moveTo(aim.x, aim.y + 6);
    ctx.lineTo(aim.x, aim.y + 14);
    ctx.stroke();
  }

  // ---- screens ---------------------------------------------------------------
  function overlay(title, subtitle, lines, accent = '#ffd60a') {
    ctx.fillStyle = 'rgba(6,8,14,0.82)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(title, vw / 2, vh / 2 - 110);
    ctx.fillStyle = '#fff';
    ctx.font = '22px sans-serif';
    ctx.fillText(subtitle, vw / 2, vh / 2 - 66);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    lines.forEach((l, i) => ctx.fillText(l, vw / 2, vh / 2 - 20 + i * 26));
  }

  function drawTitle(world, save) {
    // City backdrop: draw the world from above the garage.
    const cam = { x: PLACES.garage.x, y: PLACES.garage.y };
    ctx.save();
    ctx.fillStyle = '#10131c';
    ctx.fillRect(0, 0, vw, vh);
    ctx.translate(vw / 2 - cam.x, vh / 2 - cam.y);
    drawCity(world, cam);
    ctx.restore();
    ctx.fillStyle = 'rgba(6,8,14,0.72)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd60a';
    ctx.font = 'bold 76px sans-serif';
    ctx.fillText('NEON BAY', vw / 2, 170);
    ctx.fillStyle = '#ff6b9d';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('AN OPEN-WORLD CRIME STORY', vw / 2, 205);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    STORY_INTRO.forEach((l, i) => ctx.fillText(l, vw / 2, 260 + i * 24));
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#7ee787';
    ctx.fillText('PRESS ENTER — NEW GAME', vw / 2, 430);
    if (save) {
      ctx.fillStyle = '#74c0fc';
      ctx.fillText(`PRESS C — CONTINUE  (Mission ${save.mission}, $${save.money})`, vw / 2, 462);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '15px sans-serif';
    ctx.fillText('WASD drive & walk  •  E steal / enter car  •  Mouse aim, Click shoot  •  Space punch  •  Q weapon', vw / 2, 530);
    ctx.fillText('Shift run  •  R reload  •  P pause  •  M mute  •  Progress saves after every mission', vw / 2, 556);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '13px sans-serif';
    ctx.fillText('An original game. No Rockstar assets, names, or story. Steal cars, dodge the Neon Bay PD, work six jobs for Big Sal.', vw / 2, 610);
    ctx.fillText('Best played in a desktop browser, keyboard + mouse.', vw / 2, 632);
  }

  // ---- main render -----------------------------------------------------------
  function render(world, screen, opts = {}) {
    const p = world.player;
    const cam = opts.cam ?? { x: p.x, y: p.y };
    if (screen === 'title') {
      drawTitle(world, opts.save);
      return;
    }
    // Dusk sky backdrop outside the city bounds.
    ctx.fillStyle = '#141824';
    ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(vw / 2 - cam.x, vh / 2 - cam.y);
    drawCity(world, cam);
    drawMarker(world, cam);
    // Pickups.
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const bob = Math.sin(world.time * 3 + pk.x) * 3;
      ctx.fillStyle = pk.kind === 'health' ? '#37b24d' : pk.kind === 'armor' ? '#74c0fc' : '#ffd60a';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'armor' ? 'A' : '$', pk.x, pk.y + bob + 4);
    }
    // Dead peds.
    for (const ped of world.peds) if (ped.dead) drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.color, { dead: true });
    // Cars (traffic + parked + police), wrecked last.
    const cars = [...world.cars].sort((a, b) => (a.wrecked ? 1 : 0) - (b.wrecked ? 1 : 0));
    for (const car of cars) {
      if (car === p.car) continue;
      drawCar(car.x, car.y, car.angle, car.color, { police: car.police, wrecked: car.wrecked, time: world.time });
    }
    // Peds.
    for (const ped of world.peds) if (!ped.dead) drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.color);
    // Enemies (Red Vipers / enforcers).
    for (const en of world.enemies) {
      if (en.dead) { drawPerson(en.x, en.y, en.angle, '#3d0a0a', '#e8c39e', { dead: true }); continue; }
      drawPerson(en.x, en.y, en.angle, en.boss ? '#1a1a1a' : '#8b1a1a', '#e8c39e');
      // Health bar for the boss.
      if (en.boss) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(en.x - 24, en.y - 26, 48, 6);
        ctx.fillStyle = '#ff2d2d';
        ctx.fillRect(en.x - 24, en.y - 26, 48 * (en.health / 300), 6);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CRUSHER', en.x, en.y - 32);
      }
    }
    // Foot cops.
    for (const cop of world.cops) {
      if (cop.dead) { drawPerson(cop.x, cop.y, cop.angle, '#1c2733', '#e8c39e', { dead: true }); continue; }
      drawPerson(cop.x, cop.y, cop.angle, '#1c2733', '#e8c39e');
      ctx.fillStyle = '#2030a0';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y - 2, 4, 0, TAU);
      ctx.fill();
    }
    // Player.
    if (p.car) {
      drawCar(p.car.x, p.car.y, p.car.angle, p.car.color, { time: world.time, wrecked: p.car.wrecked });
    } else if (!world.over || screen !== 'wasted') {
      drawPerson(p.x, p.y, p.angle, p.weapon === 'pistol' ? '#2b4a6b' : '#c2255c', '#e8c39e');
      if (p.weapon === 'pistol') {
        // Gun barrel.
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
        ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
        ctx.stroke();
      }
    }
    // Bullets.
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of world.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Night tint + headlight glow around the player.
    const grad = ctx.createRadialGradient(vw / 2, vh / 2, 120, vw / 2, vh / 2, Math.max(vw, vh) * 0.62);
    grad.addColorStop(0, 'rgba(10,12,26,0)');
    grad.addColorStop(1, 'rgba(10,12,26,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

    if (screen === 'play') {
      drawHUD(world);
      if (p.weapon === 'pistol' && !p.car && opts.aim) drawCrosshair(opts.aim);
    } else if (screen === 'paused') {
      drawHUD(world);
      overlay('PAUSED', 'Take a breath, Jax.', [
        'ENTER — resume',
        'R — restart this mission',
        'Q — quit to the title screen (progress is saved after each mission)',
      ]);
    } else if (screen === 'wasted') {
      overlay('WASTED', 'Neon Bay got the better of you this time.', [
        `You had $${p.money.toLocaleString('en-US')} and finished ${world.missionIndex} of ${MISSIONS.length} missions.`,
        'ENTER — retry the mission',
        'Q — quit to the title screen',
      ], '#ff6b6b');
    } else if (screen === 'busted') {
      overlay('BUSTED', 'The Neon Bay PD caught up with you.', [
        'ENTER — retry the mission',
        'Q — quit to the title screen',
      ], '#4d7cff');
    } else if (screen === 'failed') {
      overlay('MISSION FAILED', world.mission?.failReason ?? 'The job went south.', [
        'ENTER — retry the mission',
        'Q — quit to the title screen',
      ], '#ff6b6b');
    } else if (screen === 'ending') {
      overlay('THE LONG GOODBYE', 'Jax makes the airfield as the sun comes up over Neon Bay.', [
        `Final take: $${p.money.toLocaleString('en-US')}  •  ${world.stats.kills} takedowns  •  ${world.stats.carsStolen} cars stolen`,
        'The debt is paid. Neon Bay is behind you — for now.',
        'ENTER — play again from Mission 1',
      ], '#7ee787');
    }
  }

  return { render, resize, get vw() { return vw; }, get vh() { return vh; } };
}
