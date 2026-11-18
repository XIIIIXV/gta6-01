// render.js — NEON BAY 3D renderer (v8 rebuild).
// Hand-rolled WebGL scene (gl.js) + 2D top-down fallback + HUD.
// World (x, y) maps to 3D (x, height, y). Car heading theta maps to a
// rotateY(-theta) model rotation. Lighting values are the v7 ones that
// worked: ambient 0.5 (in the shader), brighter palette, window bands
// 8 tall + emissive 1.7, big lamp glow pools.

import { CITY, PLACES, GRAND_TOWER, TUNING, BEST_TIMES_KEY, CONTROLS_HELP } from './config.js';
import { MISSIONS, missionPlace, fmtTime } from './missions.js';
import {
  createGL, isWebGLAvailable,
  identity, translate, rotateX, rotateY, rotateZ, scale, multiply,
  perspective, lookAt,
} from './gl.js';

export function loadBestTime() {
  try {
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return { missions: {}, total: null };
    const d = JSON.parse(raw);
    return { missions: d.missions || {}, total: d.total === undefined ? null : d.total };
  } catch (e) {
    return { missions: {}, total: null };
  }
}

export function saveBestTime(total) {
  try {
    const d = loadBestTime();
    if (d.total === null || total < d.total) d.total = total;
    localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(d));
  } catch (e) {
    // Storage is best-effort.
  }
}

export function saveMissionBest(name, time) {
  try {
    const d = loadBestTime();
    if (d.missions[name] === undefined || time < d.missions[name]) d.missions[name] = time;
    localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(d));
  } catch (e) {
    // Storage is best-effort.
  }
}

const FOG_COLOR = '#0a0e1e';
const FOG_NEAR = 1200;
const FOG_FAR = 3400;

export function createRenderer(gameCanvas, hudCanvas, world) {
  const hud = hudCanvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const forceFallback = params.get('fallback') === '1';
  let gl = null;
  let fallback = false;
  if (forceFallback || !isWebGLAvailable()) {
    fallback = true;
  } else {
    gl = createGL(gameCanvas);
    if (!gl) fallback = true;
  }
  let ctx2d = null;
  if (fallback) ctx2d = gameCanvas.getContext('2d');

  let w = 1280;
  let h = 720;
  let rendered = false;
  let best = loadBestTime();

  // Camera state.
  let eye = [900, 380, 450];
  let target = [GRAND_TOWER.x, 60, GRAND_TOWER.y];
  let fovDeg = 68;
  let viewMat = identity();
  let projMat = identity();
  let cam = { eye: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], fov: 68 * Math.PI / 180, aspect: 16 / 9 };

  const carAnim = new Map();
  const _t1 = new Float32Array(16);
  const _t2 = new Float32Array(16);
  const _t3 = new Float32Array(16);
  const _t4 = new Float32Array(16);
  const _t5 = new Float32Array(16);
  const _t6 = new Float32Array(16);
  const _model = new Float32Array(16);
  // compose() temps — DEDICATED, never used as an `out` by any caller.
  // compose() used to reuse _t1.._t6 as its scratch, so a second compose()
  // clobbered the `base` matrix a caller had just composed into _t1 — every
  // car body, cabin, wheel and every person's limb rendered at the world
  // origin instead of at the car/person, leaving only the underglow quad
  // (drawn via quadAt/_model) visible at the right spot.
  const _c1 = new Float32Array(16);
  const _c2 = new Float32Array(16);
  const _c3 = new Float32Array(16);
  const _c4 = new Float32Array(16);
  const _c5 = new Float32Array(16);
  const _c6 = new Float32Array(16);

  // Precomputed skyline ring (24 towers) + stars, built once.
  const skyline = [];
  {
    let s = 12345;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 2500 + rnd() * 500;
      skyline.push({
        x: 900 + Math.cos(a) * r,
        z: 900 + Math.sin(a) * r,
        w: 120 + rnd() * 160,
        h: 150 + rnd() * 280,
        color: ['#2a3550', '#33405e', '#25304a'][i % 3],
      });
    }
  }
  const stars = [];
  {
    let s = 999;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < 48; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.25 + rnd() * 0.9;
      stars.push({ dx: Math.cos(a) * Math.cos(e), dy: Math.sin(e), dz: Math.sin(a) * Math.cos(e), s: 2 + rnd() * 3 });
    }
  }

  function compose(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const t = translate(tx, ty, tz, _c1);
    const ryM = rotateY(ry, _c2);
    const rxM = rotateX(rx, _c3);
    const rzM = rotateZ(rz, _c4);
    const s = scale(sx, sy, sz, _c5);
    multiply(t, ryM, _c6);
    multiply(_c6, rxM, _c1);
    multiply(_c1, rzM, _c6);
    multiply(_c6, s, out);
    return out;
  }

  function boxAt(x, y, z, ry, sx, sy, sz, color, emissive, alpha) {
    compose(_model, x, y, z, 0, ry, 0, sx, sy, sz);
    gl.drawBox(_model, color, emissive || 0, alpha);
  }

  function quadAt(x, y, z, rx, ry, rz, sx, sy, sz, color, emissive, alpha) {
    compose(_model, x, y, z, rx, ry, rz, sx, sy, sz);
    gl.drawQuad(_model, color, emissive || 0, alpha);
  }

  // Vertical quad on a building face. (nx, nz) is the outward face normal.
  function faceQuad(nx, nz, fx, fy, fz, w, h, color, emissive, alpha) {
    if (nx === 1) quadAt(fx, fy, fz, 0, 0, -Math.PI / 2, h, 1, w, color, emissive, alpha);
    else if (nx === -1) quadAt(fx, fy, fz, 0, 0, Math.PI / 2, h, 1, w, color, emissive, alpha);
    else if (nz === 1) quadAt(fx, fy, fz, Math.PI / 2, 0, 0, w, 1, h, color, emissive, alpha);
    else quadAt(fx, fy, fz, -Math.PI / 2, 0, 0, w, 1, h, color, emissive, alpha);
  }

  function updateCamera(world, dt) {
    const p = world.player;
    let desiredEye;
    let desiredTarget;
    let desiredFov = 68;
    if (world.screen === 'title' || world.shotName === 'start') {
      const t = world.time * 0.12;
      desiredEye = [
        GRAND_TOWER.x + Math.cos(t) * 750,
        380,
        GRAND_TOWER.y + Math.sin(t) * 750,
      ];
      desiredTarget = [GRAND_TOWER.x, 100, GRAND_TOWER.y];
      desiredFov = 62;
    } else if (world.shotName === 'chase') {
      const fx = Math.cos(p.angle);
      const fz = Math.sin(p.angle);
      const rx = -Math.sin(p.angle);
      const rz = Math.cos(p.angle);
      // Chase cam: BEHIND the hero car on the road, not to the side — a
      // 260-unit side offset put the camera inside a building block south of
      // the road, and its roof filled the frame. Small right offset (50, on
      // the 140-wide road) + extra height (140) so the flanking cruisers read
      // in frame and the hero car sits lower-centre.
      desiredEye = [p.x - fx * 280 + rx * 50, 140, p.y - fz * 280 + rz * 50];
      desiredTarget = [p.x + fx * 140, 25, p.y + fz * 140];
      desiredFov = 66;
    } else if (p.car) {
      const fx = Math.cos(p.angle);
      const fz = Math.sin(p.angle);
      const sp = Math.abs(p.car.speed || 0);
      desiredEye = [p.x - fx * 200, 100, p.y - fz * 200];
      desiredTarget = [p.x + fx * 140, 25, p.y + fz * 140];
      desiredFov = 68 + 18 * (sp / TUNING.CAR_MAX_SPEED);
    } else {
      const fx = Math.cos(p.angle);
      const fz = Math.sin(p.angle);
      desiredEye = [p.x - fx * 140, 130, p.y - fz * 140];
      desiredTarget = [p.x + fx * 90, 30, p.y + fz * 90];
      desiredFov = 68;
    }
    if (!rendered) {
      eye = desiredEye.slice();
      target = desiredTarget.slice();
      fovDeg = desiredFov;
    } else {
      const k = 1 - Math.exp(-dt * 4.5);
      for (let i = 0; i < 3; i++) {
        eye[i] += (desiredEye[i] - eye[i]) * k;
        target[i] += (desiredTarget[i] - target[i]) * k;
      }
      fovDeg += (desiredFov - fovDeg) * k;
    }
    const sh = world.shake || 0;
    const ex = eye[0] + (sh ? (Math.random() - 0.5) * sh * 0.4 : 0);
    const ey = eye[1] + (sh ? (Math.random() - 0.5) * sh * 0.4 : 0);
    const ez = eye[2] + (sh ? (Math.random() - 0.5) * sh * 0.4 : 0);
    lookAt([ex, ey, ez], target, [0, 1, 0], viewMat);
    perspective((fovDeg * Math.PI) / 180, w / h, 1, 6000, projMat);
    // Camera basis for screenToWorld. r = cross(f, up) with up = (0,1,0).
    const f = [target[0] - ex, target[1] - ey, target[2] - ez];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    let r = [-f[2], 0, f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[1] /= rl; r[2] /= rl;
    const u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];
    cam = { eye: [ex, ey, ez], f, r, u, fov: (fovDeg * Math.PI) / 180, aspect: w / h };
    return { eye: [ex, ey, ez], fovDeg };
  }

  function projectToScreen(x, y, z) {
    // clip = proj * view * [x, y, z, 1]
    const v = [x, y, z, 1];
    const vv = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      vv[row] = viewMat[row] * v[0] + viewMat[4 + row] * v[1] + viewMat[8 + row] * v[2] + viewMat[12 + row] * v[3];
    }
    const c = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) {
      c[row] = projMat[row] * vv[0] + projMat[4 + row] * vv[1] + projMat[8 + row] * vv[2] + projMat[12 + row] * vv[3];
    }
    if (c[3] <= 0.01) return null;
    const nx = c[0] / c[3];
    const ny = c[1] / c[3];
    return { x: ((nx + 1) / 2) * w, y: ((1 - ny) / 2) * h, behind: false };
  }

  function drawPerson(x, y, angle, shirt, pants, opts) {
    const o = opts || {};
    const walking = !!o.walking;
    const phase = o.walkPhase || 0;
    const aiming = !!o.aiming;
    const base = compose(_t1, x, 0, y, 0, -angle, 0, 1, 1, 1);
    // Legs (pivot at hip, y=20, swing opposite phase).
    const legSwing = walking ? Math.sin(phase) * 0.7 : 0;
    for (const side of [-1, 1]) {
      const sw = side === 1 ? legSwing : -legSwing;
      compose(_t2, side * 4.5, 20, 0, sw, 0, 0, 1, 1, 1);
      multiply(base, _t2, _t3);
      compose(_t4, 0, -9, 0, 0, 0, 0, 6, 18, 5);
      multiply(_t3, _t4, _t5);
      gl.drawBox(_t5, pants || '#2a2f45', 0);
    }
    // Torso.
    compose(_t2, 0, 30, 0, 0, 0, 0, 16, 20, 9);
    multiply(base, _t2, _t3);
    gl.drawBox(_t3, shirt, 0);
    // Head.
    compose(_t2, 0, 46, 0, 0, 0, 0, 10, 10, 10);
    multiply(base, _t2, _t3);
    gl.drawBox(_t3, '#e8b88a', 0);
    // Hair.
    compose(_t2, 0, 51, 0, 0, 0, 0, 10.5, 3, 10.5);
    multiply(base, _t2, _t3);
    gl.drawBox(_t3, '#1a1a22', 0);
    // Arms (pivot at shoulder, y=38). Swing opposite phase; forward when aiming.
    const armSwing = walking ? Math.sin(phase) * 0.6 : 0;
    for (const side of [-1, 1]) {
      const sw = aiming ? -1.25 : (side === 1 ? armSwing : -armSwing);
      compose(_t2, side * 10, 38, 0, sw, 0, 0, 1, 1, 1);
      multiply(base, _t2, _t3);
      compose(_t4, 0, -8, 0, 0, 0, 0, 5, 16, 5);
      multiply(_t3, _t4, _t5);
      gl.drawBox(_t5, shirt, 0);
    }
    if (aiming) {
      // Gun in front of the chest.
      compose(_t2, 0, 34, 14, 0, 0, 0, 4, 4, 16);
      multiply(base, _t2, _t3);
      gl.drawBox(_t3, '#111118', 0);
    }
  }

  function drawCar(world, car, dt) {
    const x = car.x;
    const y = car.y;
    let anim = carAnim.get(car);
    if (!anim) {
      anim = { prevAngle: car.angle, spin: 0 };
      carAnim.set(car, anim);
    }
    let dAngle = car.angle - anim.prevAngle;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    const steer = Math.max(-0.5, Math.min(0.5, dAngle * 8));
    anim.prevAngle = car.angle;
    anim.spin += (car.speed || 0) * dt / 5;
    const wrecked = car.wrecked;
    const bodyColor = wrecked ? '#3a3a42' : car.color;
    const base = compose(_t1, x, 0, y, 0, -car.angle, 0, 1, 1, 1);
    // Blob shadow is drawn in the transparent pass; body here.
    // Body.
    compose(_t2, 0, 8, 0, 0, 0, 0, 52, 13, 26);
    multiply(base, _t2, _t3);
    gl.drawBox(_t3, bodyColor, wrecked ? 0 : 0.15);
    // Cabin.
    compose(_t2, -3, 19, 0, 0, 0, 0, 28, 11, 22);
    multiply(base, _t2, _t3);
    gl.drawBox(_t3, wrecked ? '#2a2a32' : '#20242e', wrecked ? 0 : 0.25);
    // Wheels (front wheels steer, all spin).
    for (const wx of [17, -17]) {
      for (const wz of [-13, 13]) {
        const isFront = wx > 0;
        compose(_t2, wx, 5, wz, 0, isFront ? -steer : 0, 0, 1, 1, 1);
        multiply(base, _t2, _t3);
        compose(_t4, 0, 0, 0, 0, 0, anim.spin, 10, 8, 6);
        multiply(_t3, _t4, _t5);
        gl.drawBox(_t5, '#0c0c10', 0);
      }
    }
    if (!wrecked) {
      // Headlights.
      for (const wz of [-9, 9]) {
        compose(_t2, 26.5, 8, wz, 0, 0, 0, 2, 4, 5);
        multiply(base, _t2, _t3);
        gl.drawBox(_t3, '#fff6c8', 1.6);
      }
      // Taillights.
      for (const wz of [-9, 9]) {
        compose(_t2, -26.5, 8, wz, 0, 0, 0, 2, 4, 5);
        multiply(base, _t2, _t3);
        gl.drawBox(_t3, '#ff2e2e', 1.2);
      }
      if (car.police) {
        // Larger police light bar, red/blue alternating by time.
        const flash = Math.floor(worldTime() * 4) % 2 === 0;
        compose(_t2, -3, 27, -5, 0, 0, 0, 10, 4, 7);
        multiply(base, _t2, _t3);
        gl.drawBox(_t3, flash ? '#ff2e2e' : '#222630', flash ? 2.0 : 0);
        compose(_t2, -3, 27, 5, 0, 0, 0, 10, 4, 7);
        multiply(base, _t2, _t3);
        gl.drawBox(_t3, !flash ? '#2e6bff' : '#222630', !flash ? 2.0 : 0);
      }
      if (car === world.player.car) {
        // Neon underglow — a subtle rim just past the body (52x26), not a
        // slab: at 64x38 / alpha 0.5 it read as a flat teal box and hid the
        // red/gold body from the chase camera.
        quadAt(x, 1.2, y, 0, 0, 0, 56, 1, 30, '#37e6ff', 0.8, 0.35);
      }
    }
  }

  function worldTime() {
    return lastWorld ? lastWorld.time : 0;
  }

  let lastWorld = null;

  function render3D(world, dt) {
    lastWorld = world;
    const camInfo = updateCamera(world, dt);
    gl.setCamera(viewMat, projMat, camInfo.eye);
    gl.setFog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    gl.clear(0.04, 0.06, 0.14);
    const t = world.time;
    const p = world.player;
    const city = world.city;

    // ---- Opaque pass ----
    // Ground.
    quadAt(900, 0, 900, 0, 0, 0, 1800, 1, 1800, '#232838', 0);
    // Roads (brighter asphalt) + centre lines + sidewalks.
    for (const c of CITY.ROAD_CENTERS) {
      quadAt(c, 0.5, 900, 0, 0, 0, 140, 1, 1800, '#3a4152', 0);
      quadAt(900, 0.5, c, 0, 0, 0, 1800, 1, 140, '#3a4152', 0);
      quadAt(c, 0.8, 900, 0, 0, 0, 4, 1, 1800, '#8a8f9e', 0);
      quadAt(900, 0.8, c, 0, 0, 0, 1800, 1, 4, '#8a8f9e', 0);
      quadAt(c - 83, 0.7, 900, 0, 0, 0, 26, 1, 1800, '#4a4f5e', 0);
      quadAt(c + 83, 0.7, 900, 0, 0, 0, 26, 1, 1800, '#4a4f5e', 0);
      quadAt(900, 0.7, c - 83, 0, 0, 0, 1800, 1, 26, '#4a4f5e', 0);
      quadAt(900, 0.7, c + 83, 0, 0, 0, 1800, 1, 26, '#4a4f5e', 0);
    }
    // Crosswalks at intersections near the camera.
    for (const rx of CITY.ROAD_CENTERS) {
      for (const ry of CITY.ROAD_CENTERS) {
        const d = Math.hypot(rx - p.x, ry - p.y);
        if (d > 700) continue;
        for (let s = -1; s <= 1; s++) {
          quadAt(rx + s * 22, 0.9, ry - 62, 0, 0, 0, 10, 1, 26, '#c8ccd8', 0);
          quadAt(rx + s * 22, 0.9, ry + 62, 0, 0, 0, 10, 1, 26, '#c8ccd8', 0);
          quadAt(rx - 62, 0.9, ry + s * 22, 0, 0, 0, 26, 1, 10, '#c8ccd8', 0);
          quadAt(rx + 62, 0.9, ry + s * 22, 0, 0, 0, 26, 1, 10, '#c8ccd8', 0);
        }
      }
    }
    // Manholes + puddles (flat, on the roads).
    for (const mh of city.manholes) {
      quadAt(mh.x, 0.9, mh.y, 0, 0, 0, 16, 1, 16, '#22242e', 0);
    }
    // Buildings.
    for (const b of city.buildings) {
      boxAt(b.x, b.height / 2, b.y, 0, b.w, b.height, b.h, b.wall, 0.08);
      boxAt(b.x, b.height + 1.5, b.y, 0, b.w + 2, 3, b.h + 2, b.roof, 0);
      // Rooftop props (AC box + antenna).
      boxAt(b.x - b.w / 4, b.height + 5, b.y, 0, 12, 5, 10, '#1c1f2a', 0);
      boxAt(b.x + b.w / 4, b.height + 8, b.y, 0, 2, 14, 2, '#3a3f4e', 0);
      const dCam = Math.hypot(b.x - p.x, b.y - p.y);
      if (dCam < 900) {
        // Window bands on the most-visible face: 8 tall bright bands.
        const dx = eye[0] - b.x;
        const dz = eye[2] - b.y;
        let nx = 0;
        let nz = 0;
        if (Math.abs(dx) > Math.abs(dz)) nx = dx > 0 ? 1 : -1;
        else nz = dz > 0 ? 1 : -1;
        const faceW = nx !== 0 ? b.h : b.w;
        const fx = b.x + (nx !== 0 ? nx * (b.w / 2 + 0.6) : 0);
        const fz = b.y + (nz !== 0 ? nz * (b.h / 2 + 0.6) : 0);
        for (let i = 0; i < 8; i++) {
          const by = (b.height * (i + 0.7)) / 8.5;
          faceQuad(nx, nz, fx, by, fz, faceW * 0.8, b.height * 0.085, b.windows, 1.7);
        }
        if (b.neon) {
          // Neon sign near the top + halo.
          const sy = b.height * 0.82;
          faceQuad(nx, nz, fx + (nx !== 0 ? nx * 1.2 : 0), sy, fz + (nz !== 0 ? nz * 1.2 : 0), faceW * 0.5, 12, b.neonColor, 1.7);
        }
        // Shop-front strip at street level on the most-visible face.
        const shopY = 7;
        faceQuad(nx, nz, fx, shopY, fz, faceW * 0.85, 10, '#ff9ad5', 0.9);
      }
      if (b.tower) {
        // Grand Tower: cyan/pink bands + pulsing beacon.
        for (let i = 0; i < 6; i++) {
          const by = 30 + i * 38;
          const col = i % 2 === 0 ? '#37e6ff' : '#ff2e88';
          faceQuad(1, 0, b.x + b.w / 2 + 0.6, by, b.y, b.h * 0.9, 10, col, 1.8);
          faceQuad(0, 1, b.x, by, b.y + b.h / 2 + 0.6, b.w * 0.9, 10, col, 1.8);
        }
        const pulse = 1.2 + Math.sin(t * 3) * 0.8;
        boxAt(b.x, b.height + 10, b.y, 0, 10, 18, 10, '#ff2e88', pulse);
      }
    }
    // Skyline ring (precomputed, brighter).
    for (const tw of skyline) {
      boxAt(tw.x, tw.h / 2, tw.z, 0, tw.w, tw.h, tw.w, tw.color, 0.25);
    }
    // Stars + moon, positioned relative to the camera so fog never eats them.
    for (const st of stars) {
      const sx = eye[0] + st.dx * 900;
      const sy = eye[1] + st.dy * 900;
      const sz = eye[2] + st.dz * 900;
      boxAt(sx, sy, sz, 0, st.s, st.s, st.s, '#ffffff', 1.4);
    }
    boxAt(eye[0] + 400, eye[1] + 500, eye[2] - 700, 0, 60, 60, 4, '#e8ecf5', 1.2);
    // Trees + palms.
    for (const tr of city.trees) {
      boxAt(tr.x, tr.h / 2, tr.y, 0, 5, tr.h, 5, '#5a3a22', 0);
      boxAt(tr.x, tr.h + 6, tr.y, 0, 18, 13, 18, '#2e7d32', 0.1);
    }
    for (const pm of city.palms) {
      // Trunk (leaning) + fronds.
      boxAt(pm.x, pm.h / 2, pm.y, 0, 5, pm.h, 5, '#6e4a2a', 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        compose(_t1, pm.x + Math.cos(a) * 12, pm.h + 4, pm.y + Math.sin(a) * 12, 0, -a, 0, 1, 1, 1);
        compose(_t2, 0, 0, 0, 0.5, 0, 0, 22, 2, 6);
        multiply(_t1, _t2, _t3);
        gl.drawBox(_t3, '#2e8b57', 0.1);
      }
    }
    // Street lamps (pole + head) — glow pools in the transparent pass.
    for (const lamp of city.lamps) {
      boxAt(lamp.x, 15, lamp.y, 0, 3, 30, 3, '#1c1f2a', 0);
      boxAt(lamp.x, 31, lamp.y, 0, 8, 4, 8, '#ffd27a', 1.5);
    }
    // Traffic lights.
    for (const tl of city.trafficLights) {
      boxAt(tl.x, 18, tl.y, 0, 3, 36, 3, '#1c1f2a', 0);
      const green = Math.sin(t * 0.8 + tl.phase) > 0;
      boxAt(tl.x, 38, tl.y, 0, 8, 12, 5, green ? '#2ecc71' : '#ff2e2e', 1.6);
    }
    // Small props.
    for (const hd of city.hydrants) boxAt(hd.x, 4, hd.y, 0, 6, 8, 6, '#c0392b', 0.2);
    for (const bn of city.bins) boxAt(bn.x, 5, bn.y, 0, 8, 10, 8, '#1e4d2b', 0);
    for (const pl of city.planters) boxAt(pl.x, 3, pl.y, 0, 14, 6, 14, '#3a3f4e', 0);
    for (const bn of city.benches) boxAt(bn.x, 4, bn.y, bn.angle, 20, 7, 7, '#6e4a2a', 0);
    for (const bb of city.billboards) {
      boxAt(bb.x, 25, bb.y, 0, 6, 50, 6, '#1c1f2a', 0);
      compose(_model, bb.x, 55, bb.y, 0, bb.angle, 0, 1, 1, 1);
      compose(_t1, 0, 0, 0, 0, 0, 0, 60, 24, 2);
      multiply(_model, _t1, _t2);
      gl.drawBox(_t2, '#ff2e88', 1.1);
    }
    for (const bs of city.busStops) {
      boxAt(bs.x, 12, bs.y, 0, 4, 24, 4, '#1c1f2a', 0);
      boxAt(bs.x + 14, 12, bs.y, 0, 4, 24, 4, '#1c1f2a', 0);
      boxAt(bs.x + 7, 26, bs.y, 0, 32, 2, 12, '#2a2f45', 0);
    }
    for (const br of city.barriers) boxAt(br.x, 5, br.y, 0, 22, 10, 4, '#e67e22', 0.4);
    // Fountains (animated water discs + spray jets).
    for (const f of city.fountains) {
      const pulse = 1 + Math.sin(t * 2) * 0.08;
      quadAt(f.x, 1.5, f.y, 0, 0, 0, f.r * 2 * pulse, 1, f.r * 2 * pulse, '#3a9bdc', 0.9, 0.9);
      for (let j = 0; j < 3; j++) {
        const a = (j / 3) * Math.PI * 2 + t * 0.5;
        const jh = 14 + Math.sin(t * 3 + j) * 5;
        boxAt(f.x + Math.cos(a) * 10, jh / 2 + 2, f.y + Math.sin(a) * 10, 0, 3, jh, 3, '#9ad5ff', 1.2);
      }
    }
    // Docks water planes (north + east of the docks corner), animated shimmer.
    const shim = 0.5 + 0.2 * Math.sin(t * 1.5);
    quadAt(1600, 1, -160, 0, 0, 0, 420, 1, 320, '#1e5a8a', shim, 0.92);
    quadAt(1960, 1, 250, 0, 0, 0, 320, 1, 420, '#1e5a8a', shim, 0.92);
    // Cars.
    for (const car of world.cars) drawCar(world, car, dt);
    // Player on foot / peds / enemies.
    if (!p.car) {
      drawPerson(p.x, p.y, p.angle, '#37e6ff', '#2a2f45', {
        walking: p.walking, walkPhase: p.walkPhase || 0, aiming: world.muzzleT > 0 || false,
      });
    }
    for (const ped of world.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, '#3a3f4e', { walking: true, walkPhase: ped.walkPhase || 0 });
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      drawPerson(e.x, e.y, e.angle, e.shirt, '#1a1a22', {
        walking: e.walking, walkPhase: e.walkPhase || 0, aiming: true,
      });
      // Red marker above enemies.
      const bob = Math.sin(t * 3 + e.x) * 3;
      quadAt(e.x, 62 + bob, e.y, 0, 0, 0, 10, 1, 10, '#ff2e2e', 1.6, 0.9);
    }
    // Pickups (bob + spin).
    for (const pk of world.pickups) {
      if (!pk.active) continue;
      const bob = Math.sin(t * 2.5 + pk.x) * 4;
      if (pk.kind === 'health') {
        boxAt(pk.x, 26 + bob, pk.y, t * 0.8, 22, 6, 6, '#2ecc71', 1.5);
        boxAt(pk.x, 26 + bob, pk.y, t * 0.8, 6, 22, 6, '#2ecc71', 1.5);
      } else {
        boxAt(pk.x, 26 + bob, pk.y, t * 0.8, 20, 20, 4, '#4a90d9', 1.5);
      }
    }
    // Muzzle flash.
    if (world.muzzleT > 0) {
      const a = p.angle;
      quadAt(p.x + Math.cos(a) * 34, 34, p.y + Math.sin(a) * 34, 0, 0, 0, 16, 1, 16, '#fff6c8', 2.0, 0.9);
    }

    // ---- Transparent pass (no depth write) ----
    gl.depthWrite(false);
    // Lamp glow pools (bigger, v7).
    for (const lamp of city.lamps) {
      quadAt(lamp.x, 1.1, lamp.y, 0, 0, 0, 110, 1, 110, '#ffd27a', 0.9, 0.22);
    }
    // Neon sign halos.
    for (const b of city.buildings) {
      if (!b.neon) continue;
      const dCam = Math.hypot(b.x - p.x, b.y - p.y);
      if (dCam > 900) continue;
      const dx = eye[0] - b.x;
      const dz = eye[2] - b.y;
      let nx = 0;
      let nz = 0;
      if (Math.abs(dx) > Math.abs(dz)) nx = dx > 0 ? 1 : -1;
      else nz = dz > 0 ? 1 : -1;
      const faceW = nx !== 0 ? b.h : b.w;
      const fx = b.x + (nx !== 0 ? nx * (b.w / 2 + 2.4) : 0);
      const fz = b.y + (nz !== 0 ? nz * (b.h / 2 + 2.4) : 0);
      faceQuad(nx, nz, fx, b.height * 0.82, fz, faceW * 0.7, 26, b.neonColor, 1.0, 0.22);
    }
    // Puddles (dark glossy).
    for (const pd of city.puddles) {
      quadAt(pd.x, 1.0, pd.y, 0, 0, 0, pd.r * 2, 1, pd.r * 2, '#16283a', 0.4, 0.75);
    }
    // Blob shadows under cars + people.
    for (const car of world.cars) {
      quadAt(car.x, 0.6, car.y, 0, 0, 0, 58, 1, 32, '#000000', 0, 0.35);
    }
    if (!p.car) quadAt(p.x, 0.6, p.y, 0, 0, 0, 20, 1, 20, '#000000', 0, 0.35);
    for (const ped of world.peds) quadAt(ped.x, 0.6, ped.y, 0, 0, 0, 18, 1, 18, '#000000', 0, 0.3);
    for (const e of world.enemies) {
      if (e.alive) quadAt(e.x, 0.6, e.y, 0, 0, 0, 20, 1, 20, '#000000', 0, 0.35);
    }
    // Headlight beam (player car only) + police light-bar ground glow.
    if (p.car && !p.car.wrecked) {
      const a = p.angle;
      quadAt(p.x + Math.cos(a) * 90, 1.3, p.y + Math.sin(a) * 90, 0, 0, 0, 130, 1, 60, '#fff6c8', 0.6, 0.12);
    }
    for (const cop of world.cops) {
      if (cop.wrecked) continue;
      const flash = Math.floor(t * 4) % 2 === 0;
      quadAt(cop.x, 1.1, cop.y, 0, 0, 0, 90, 1, 70, flash ? '#ff2e2e' : '#2e6bff', 0.8, 0.3);
    }
    // Exhaust / skid particles.
    for (const pt of world.particles) {
      const a = Math.max(0, pt.life / pt.maxLife) * 0.4;
      quadAt(pt.x, 2, pt.y, 0, 0, 0, pt.size, 1, pt.size, '#8a8f9e', 0, a);
    }
    gl.depthWrite(true);
  }

  function drawHUD(world, dt) {
    hud.clearRect(0, 0, w, h);
    const p = world.player;
    // Tower sign: project the Grand Tower top to the screen.
    if (!fallback && world.screen !== 'ending') {
      const sp = projectToScreen(GRAND_TOWER.x, 285, GRAND_TOWER.y);
      if (sp && sp.x > 40 && sp.x < w - 40 && sp.y > 20 && sp.y < h - 40) {
        hud.font = 'bold 30px sans-serif';
        hud.textAlign = 'center';
        hud.fillStyle = 'rgba(0,0,0,0.55)';
        hud.fillText('NEON BAY', sp.x + 2, sp.y + 2);
        hud.fillStyle = '#ffd700';
        hud.fillText('NEON BAY', sp.x, sp.y);
      }
    }
    if (world.screen === 'title') {
      hud.fillStyle = 'rgba(4, 6, 16, 0.55)';
      hud.fillRect(0, 0, w, h);
      hud.textAlign = 'center';
      hud.fillStyle = '#ffd700';
      hud.font = 'bold 72px sans-serif';
      hud.fillText('NEON BAY', w / 2, h * 0.32);
      hud.fillStyle = '#e8ecf5';
      hud.font = '24px sans-serif';
      hud.fillText('An open-world crime story — 3.2 km² of neon, heat and getaways.', w / 2, h * 0.32 + 44);
      hud.font = 'bold 26px sans-serif';
      hud.fillStyle = '#37e6ff';
      hud.fillText('Press Enter to start', w / 2, h * 0.48);
      hud.fillStyle = '#c8ccd8';
      hud.font = '17px sans-serif';
      const lines = CONTROLS_HELP.split('   •   ');
      lines.forEach((ln, i) => hud.fillText(ln, w / 2, h * 0.58 + i * 26));
      const bt = loadBestTime();
      if (bt.total !== null) {
        hud.fillStyle = '#ffd700';
        hud.font = '20px sans-serif';
        hud.fillText('Best total time: ' + fmtTime(bt.total), w / 2, h * 0.58 + lines.length * 26 + 30);
      }
      return;
    }
    if (world.over) {
      hud.fillStyle = 'rgba(10, 0, 0, 0.6)';
      hud.fillRect(0, 0, w, h);
      hud.textAlign = 'center';
      hud.fillStyle = '#ff2e2e';
      hud.font = 'bold 64px sans-serif';
      const label = world.failReason === 'wasted' ? 'WASTED' : world.failReason === 'busted' ? 'BUSTED' : 'MISSION FAILED';
      hud.fillText(label, w / 2, h / 2 - 10);
      hud.fillStyle = '#e8ecf5';
      hud.font = '22px sans-serif';
      hud.fillText(world.failReason ? '(' + world.failReason + ')' : '', w / 2, h / 2 + 30);
      hud.fillText('Press Enter to retry', w / 2, h / 2 + 70);
      return;
    }
    // Top-left status panel.
    hud.textAlign = 'left';
    hud.fillStyle = 'rgba(4, 6, 16, 0.6)';
    hud.fillRect(14, 14, 250, 108);
    // Wanted stars.
    hud.font = 'bold 22px sans-serif';
    for (let i = 0; i < 5; i++) {
      hud.fillStyle = i < world.stars ? '#ffd700' : '#3a3f4e';
      hud.fillText('★', 24 + i * 26, 40);
    }
    // Health / armor bars.
    hud.fillStyle = '#22242e';
    hud.fillRect(24, 52, 200, 12);
    hud.fillStyle = '#2ecc71';
    hud.fillRect(24, 52, 200 * Math.max(0, p.health / 100), 12);
    hud.fillStyle = '#22242e';
    hud.fillRect(24, 70, 200, 12);
    hud.fillStyle = '#4a90d9';
    hud.fillRect(24, 70, 200 * Math.max(0, p.armor / 100), 12);
    hud.fillStyle = '#e8ecf5';
    hud.font = 'bold 18px sans-serif';
    hud.fillText('$' + p.money, 24, 104);
    if (p.car) {
      hud.fillText(Math.round(Math.abs(p.car.speed) * 0.36 * 2) + ' km/h', 140, 104);
    }
    // Mission panel (top-right).
    const m = world.mission;
    if (m) {
      hud.textAlign = 'right';
      hud.fillStyle = 'rgba(4, 6, 16, 0.6)';
      hud.fillRect(w - 364, 14, 350, 76);
      hud.fillStyle = '#ffd700';
      hud.font = 'bold 19px sans-serif';
      hud.fillText(m.done ? m.def.name + ' — COMPLETE' : m.def.name, w - 24, 40);
      hud.fillStyle = '#e8ecf5';
      hud.font = '16px sans-serif';
      const stepLabel = m.done ? 'Reward $' + m.def.reward : (m.step ? m.step.label || m.step.type : '');
      hud.fillText(stepLabel, w - 24, 64);
      hud.fillStyle = '#c8ccd8';
      hud.fillText('Time ' + fmtTime(m.timer) + '   PAR ' + fmtTime(m.def.par), w - 24, 84);
      // Objective marker: destination on screen, or an edge arrow.
      if (!m.done) {
        const dest = missionPlace(m.step);
        if (dest) {
          const sp = fallback ? null : projectToScreen(dest.x, 30, dest.y);
          if (sp && sp.x > 20 && sp.x < w - 20 && sp.y > 20 && sp.y < h - 20) {
            hud.fillStyle = '#ffd700';
            hud.beginPath();
            hud.moveTo(sp.x, sp.y - 12);
            hud.lineTo(sp.x + 10, sp.y + 8);
            hud.lineTo(sp.x - 10, sp.y + 8);
            hud.closePath();
            hud.fill();
          } else {
            // Edge arrow toward the destination.
            const dx = dest.x - p.x;
            const dy = dest.y - p.y;
            const ang = Math.atan2(dy, dx);
            const cx = w / 2;
            const cy = h / 2;
            const ex = cx + Math.cos(ang) * (Math.min(w, h) / 2 - 60);
            const ey = cy + Math.sin(ang) * (Math.min(w, h) / 2 - 60);
            hud.save();
            hud.translate(ex, ey);
            hud.rotate(ang);
            hud.fillStyle = '#ffd700';
            hud.beginPath();
            hud.moveTo(14, 0);
            hud.lineTo(-10, -10);
            hud.lineTo(-10, 10);
            hud.closePath();
            hud.fill();
            hud.restore();
          }
        }
      }
    }
    // Minimap (bottom-right).
    const ms = 180;
    const mx0 = w - ms - 16;
    const my0 = h - ms - 16;
    const k = ms / CITY.SIZE;
    hud.fillStyle = 'rgba(4, 6, 16, 0.65)';
    hud.fillRect(mx0 - 4, my0 - 4, ms + 8, ms + 8);
    hud.fillStyle = '#3a4152';
    for (const c of CITY.ROAD_CENTERS) {
      hud.fillRect(mx0 + (c - 70) * k, my0, 140 * k, ms);
      hud.fillRect(mx0, my0 + (c - 70) * k, ms, 140 * k);
    }
    hud.fillStyle = '#4a4f5e';
    for (const b of world.city.buildings) {
      hud.fillRect(mx0 + (b.x - b.w / 2) * k, my0 + (b.y - b.h / 2) * k, b.w * k, b.h * k);
    }
    for (const pk of world.pickups) {
      if (!pk.active) continue;
      hud.fillStyle = pk.kind === 'health' ? '#2ecc71' : '#4a90d9';
      hud.beginPath();
      hud.arc(mx0 + pk.x * k, my0 + pk.y * k, 3, 0, Math.PI * 2);
      hud.fill();
    }
    for (const car of world.cars) {
      hud.fillStyle = car.police ? '#2e6bff' : '#e8e8e8';
      hud.beginPath();
      hud.arc(mx0 + car.x * k, my0 + car.y * k, car.police ? 3.5 : 2.5, 0, Math.PI * 2);
      hud.fill();
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      hud.fillStyle = '#ff2e2e';
      hud.beginPath();
      hud.arc(mx0 + e.x * k, my0 + e.y * k, 3, 0, Math.PI * 2);
      hud.fill();
    }
    if (m && !m.done) {
      const dest = missionPlace(m.step);
      if (dest) {
        hud.strokeStyle = '#ffd700';
        hud.lineWidth = 2;
        hud.beginPath();
        hud.arc(mx0 + dest.x * k, my0 + dest.y * k, 6, 0, Math.PI * 2);
        hud.stroke();
      }
    }
    hud.fillStyle = '#37e6ff';
    hud.beginPath();
    hud.arc(mx0 + p.x * k, my0 + p.y * k, 4, 0, Math.PI * 2);
    hud.fill();
    // Mission summary overlay (during the cooldown after a completion).
    if (m && m.done && world.missionCooldown > 0) {
      const bt = loadBestTime();
      const b = bt.missions[m.def.name];
      const isBest = b !== undefined && m.timer <= b + 0.001;
      const beatPar = m.timer < m.def.par;
      hud.textAlign = 'center';
      hud.fillStyle = 'rgba(4, 6, 16, 0.75)';
      hud.fillRect(w / 2 - 220, h / 2 - 110, 440, 190);
      hud.fillStyle = '#ffd700';
      hud.font = 'bold 28px sans-serif';
      hud.fillText(m.def.name + ' — COMPLETE', w / 2, h / 2 - 66);
      hud.fillStyle = '#e8ecf5';
      hud.font = '20px sans-serif';
      hud.fillText('Time ' + fmtTime(m.timer) + '   Best ' + (b !== undefined ? fmtTime(b) : '--:--'), w / 2, h / 2 - 30);
      hud.fillText('Cash earned $' + m.def.reward, w / 2, h / 2 + 2);
      hud.fillStyle = '#ffd700';
      hud.font = 'bold 22px sans-serif';
      if (isBest) hud.fillText('★ NEW BEST!', w / 2, h / 2 + 38);
      else if (beatPar) hud.fillText('★ BEAT PAR!', w / 2, h / 2 + 38);
    }
    // Game-complete summary.
    if (world.screen === 'ending') {
      const bt = loadBestTime();
      const total = world.totalTime || 0;
      hud.textAlign = 'center';
      hud.fillStyle = 'rgba(4, 6, 16, 0.8)';
      hud.fillRect(w / 2 - 240, h / 2 - 120, 480, 210);
      hud.fillStyle = '#ffd700';
      hud.font = 'bold 32px sans-serif';
      hud.fillText('NEON BAY COMPLETE', w / 2, h / 2 - 70);
      hud.fillStyle = '#e8ecf5';
      hud.font = '22px sans-serif';
      hud.fillText('Total time ' + fmtTime(total), w / 2, h / 2 - 30);
      hud.fillText('Best total ' + (bt.total !== null ? fmtTime(bt.total) : '--:--'), w / 2, h / 2 + 2);
      hud.fillStyle = '#37e6ff';
      hud.fillText('Press Enter to play again', w / 2, h / 2 + 44);
    }
  }

  function render2D(world) {
    const ctx = ctx2d;
    ctx.fillStyle = '#0a0e1e';
    ctx.fillRect(0, 0, w, h);
    const s = Math.min(w, h) / 1900;
    const ox = (w - 1800 * s) / 2;
    const oy = (h - 1800 * s) / 2;
    const X = (x) => ox + x * s;
    const Y = (y) => oy + y * s;
    ctx.fillStyle = '#3a4152';
    for (const c of CITY.ROAD_CENTERS) {
      ctx.fillRect(X(c - 70), Y(0), 140 * s, 1800 * s);
      ctx.fillRect(X(0), Y(c - 70), 1800 * s, 140 * s);
    }
    ctx.fillStyle = '#1e4d2b';
    for (const pk of world.city.parks) {
      ctx.fillRect(X(pk.x - 80), Y(pk.y - 80), 160 * s, 160 * s);
    }
    for (const b of world.city.buildings) {
      ctx.fillStyle = b.wall;
      ctx.fillRect(X(b.x - b.w / 2), Y(b.y - b.h / 2), b.w * s, b.h * s);
    }
    for (const pk of world.pickups) {
      if (!pk.active) continue;
      ctx.fillStyle = pk.kind === 'health' ? '#2ecc71' : '#4a90d9';
      ctx.beginPath();
      ctx.arc(X(pk.x), Y(pk.y), 8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of world.cars) {
      ctx.fillStyle = car.wrecked ? '#3a3a42' : car.color;
      ctx.fillRect(X(car.x - 26), Y(car.y - 13), 52 * s, 26 * s);
    }
    ctx.fillStyle = '#e8e8e8';
    for (const ped of world.peds) {
      ctx.beginPath();
      ctx.arc(X(ped.x), Y(ped.y), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff2e2e';
    for (const e of world.enemies) {
      if (!e.alive) continue;
      ctx.beginPath();
      ctx.arc(X(e.x), Y(e.y), 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#37e6ff';
    ctx.beginPath();
    ctx.arc(X(world.player.x), Y(world.player.y), 8, 0, Math.PI * 2);
    ctx.fill();
    const m = world.mission;
    if (m && !m.done) {
      const dest = missionPlace(m.step);
      if (dest) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(X(dest.x), Y(dest.y), 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function screenToWorld(sx, sy) {
    if (fallback) {
      const s = Math.min(w, h) / 1900;
      const ox = (w - 1800 * s) / 2;
      const oy = (h - 1800 * s) / 2;
      return { x: (sx - ox) / s, y: (sy - oy) / s };
    }
    const nx = (2 * sx) / w - 1;
    const ny = 1 - (2 * sy) / h;
    const tanF = Math.tan(cam.fov / 2);
    const dir = [
      cam.f[0] + cam.r[0] * nx * tanF * cam.aspect + cam.u[0] * ny * tanF,
      cam.f[1] + cam.r[1] * nx * tanF * cam.aspect + cam.u[1] * ny * tanF,
      cam.f[2] + cam.r[2] * nx * tanF * cam.aspect + cam.u[2] * ny * tanF,
    ];
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
    if (dir[1] >= -0.001) return { x: cam.eye[0], y: cam.eye[2] };
    const t = -cam.eye[1] / dir[1];
    return { x: cam.eye[0] + dir[0] * t, y: cam.eye[2] + dir[2] * t };
  }

  function render(world, dt) {
    if (fallback) render2D(world);
    else render3D(world, dt);
    drawHUD(world, dt);
    rendered = true;
  }

  function resize(w2, h2) {
    w = w2;
    h = h2;
    gameCanvas.width = w2;
    gameCanvas.height = h2;
    hudCanvas.width = w2;
    hudCanvas.height = h2;
    if (gl) gl.resize(w2, h2);
  }

  return {
    render,
    resize,
    screenToWorld,
    isFallback: () => fallback,
    wasRendered: () => rendered,
    get best() {
      return best;
    },
    refreshBest() {
      best = loadBestTime();
    },
  };
}
