// NEON BAY — Three.js 3D renderer + HUD + 2D fallback (v5 rebuild, written from spec).
// Perspective chase camera, procedural 3D city from the same city data as
// the logic, low-poly cars / peds / enemies, neon lighting, fog, shadows.
// If WebGL cannot be created (headless without GPU) it falls back to a
// simple 2D top-down renderer so the game still plays and __shotReady
// still fires. NEVER a blank screen.

import * as THREE from 'three';
import { CITY, GRAND_TOWER, BEST_TIMES_KEY, CONTROLS_HELP } from './config.js';
import { missionPlace, fmtTime } from './missions.js';

// ---------------------------------------------------------------- best times

export function loadBestTime() {
  try {
    if (typeof localStorage === 'undefined') return { total: null, missions: {} };
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return { total: null, missions: {} };
    const data = JSON.parse(raw);
    return {
      total: typeof data.total === 'number' ? data.total : null,
      missions: data.missions && typeof data.missions === 'object' ? data.missions : {},
    };
  } catch {
    return { total: null, missions: {} };
  }
}

function storeBest(data) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(data));
  } catch {
    // Best times are cosmetic; never break the game over storage.
  }
}

export function saveBestTime(total) {
  const data = loadBestTime();
  if (data.total === null || total < data.total) {
    data.total = total;
    storeBest(data);
    return true;
  }
  return false;
}

export function saveMissionBest(name, time) {
  const data = loadBestTime();
  const prev = data.missions[name];
  if (prev === undefined || time < prev) {
    data.missions[name] = time;
    storeBest(data);
    return true;
  }
  return false;
}

export function loadMissionBest(name) {
  const data = loadBestTime();
  const v = data.missions[name];
  return typeof v === 'number' ? v : null;
}

// ---------------------------------------------------------------- textures

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeRoadTexture() {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#1e1e2a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 200; i += 1) {
      g.fillStyle = Math.random() < 0.5 ? '#232336' : '#1a1a26';
      g.fillRect(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128), 3, 3);
    }
    g.fillStyle = '#3a3a4e';
    g.fillRect(0, 2, 128, 3);
    g.fillRect(0, 123, 128, 3);
    g.fillStyle = '#d8c25a';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 61, 18, 6);
  });
}

function makeWindowTexture() {
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = '#23233a';
    g.fillRect(0, 0, 128, 256);
    const lit = ['#66ffee', '#ffcc66', '#ff66cc', '#99ccff'];
    for (let row = 0; row < 16; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const x = 6 + col * 15;
        const y = 6 + row * 15;
        if (Math.random() < 0.45) {
          g.fillStyle = lit[Math.floor(Math.random() * lit.length)];
          g.globalAlpha = 0.55 + Math.random() * 0.45;
        } else {
          g.fillStyle = '#101018';
          g.globalAlpha = 1;
        }
        g.fillRect(x, y, 9, 10);
      }
    }
    g.globalAlpha = 1;
  });
}

function makeCrosswalkTexture() {
  return canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(230,230,240,0.75)';
    for (let x = 8; x < 128; x += 24) g.fillRect(x, 6, 12, 116);
  });
}

function makeGlowTexture() {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(200,200,220,0.35)');
    grad.addColorStop(1, 'rgba(200,200,220,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

// ---------------------------------------------------------------- renderer

export function createRenderer(gameCanvas, hudCanvas, world) {
  const ui = {
    summary: null,
    gameSummary: null,
    banner: null,
    bannerT: 0,
    paused: false,
    flash: null,
    flashT: 0,
  };
  let W = 1280;
  let H = 800;
  let rendered = false;
  let fallback = false;
  let renderer3d = null;
  let scene = null;
  let camera = null;
  let hudCtx = null;
  try {
    hudCtx = hudCanvas.getContext('2d');
  } catch {
    hudCtx = null;
  }

  // Shared geometries / materials (created once, reused every frame).
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const carBodyGeo = new THREE.BoxGeometry(36, 9, 18);
  const carCabinGeo = new THREE.BoxGeometry(18, 7, 15);
  const wheelGeo = new THREE.CylinderGeometry(5, 5, 4, 12);
  const capsuleGeo = new THREE.CapsuleGeometry(7, 12, 4, 10);
  const headGeo = new THREE.SphereGeometry(5, 12, 10);
  const bodyMats = new Map();
  const shirtMats = new Map();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1526, metalness: 0.8, roughness: 0.25 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
  const wreckMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 });
  const neonMats = [
    new THREE.MeshBasicMaterial({ color: 0x22eeff }),
    new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
    new THREE.MeshBasicMaterial({ color: 0x9dff2e }),
  ];
  const lightBarRed = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const lightBarBlue = new THREE.MeshBasicMaterial({ color: 0x2244ff });
  const lightBarDim = new THREE.MeshBasicMaterial({ color: 0x331111 });
  const glowTexShared = makeGlowTexture();
  const glowRedMat = new THREE.SpriteMaterial({
    map: glowTexShared, color: 0xff2222, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glowBlueMat = new THREE.SpriteMaterial({
    map: glowTexShared, color: 0x3355ff, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const underglowMat = new THREE.MeshBasicMaterial({
    color: 0x22eeff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const playerBulletMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a });

  function bodyMat(color) {
    let m = bodyMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35 });
      bodyMats.set(color, m);
    }
    return m;
  }
  function shirtMat(color) {
    let m = shirtMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      shirtMats.set(color, m);
    }
    return m;
  }

  // Dynamic object pools.
  const carMeshes = new Map();
  const pedMeshes = new Map();
  const enemyMeshes = new Map();
  const pickupMeshes = new Map();
  const bulletPool = [];
  const puffPool = [];
  let playerMesh = null;
  let muzzleLight = null;
  let headlight = null;
  let headlightTarget = null;
  let beaconMat = null;
  let towerTop = null;
  const fountains3d = [];
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();

  // --- 2D fallback state ---
  let fbCtx = null;
  let fbScale = 0.5;
  let fbCx = 900;
  let fbCy = 900;

  function buildCarMesh(car) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(carBodyGeo, bodyMat(car.color));
    body.position.y = 7;
    body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(carCabinGeo, glassMat);
    cabin.position.set(-2, 14, 0);
    cabin.castShadow = true;
    g.add(cabin);
    const wheels = [];
    const wheelPos = [[12, 9], [12, -9], [-12, 9], [-12, -9]];
    for (let i = 0; i < 4; i += 1) {
      const steerG = new THREE.Group();
      steerG.position.set(wheelPos[i][0], 5, wheelPos[i][1]);
      const spinG = new THREE.Group();
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      spinG.add(wheel);
      steerG.add(spinG);
      g.add(steerG);
      wheels.push({ steerG, spinG, front: i < 2 });
    }
    let barL = null;
    let barR = null;
    let glow = null;
    if (car.police) {
      barL = new THREE.Mesh(boxGeo, lightBarRed);
      barL.scale.set(9, 4, 7);
      barL.position.set(-2, 19, -5);
      barR = new THREE.Mesh(boxGeo, lightBarBlue);
      barR.scale.set(9, 4, 7);
      barR.position.set(-2, 19, 5);
      g.add(barL);
      g.add(barR);
      // Flashing halo so a dark cruiser reads at night from a distance.
      glow = new THREE.Sprite(glowRedMat);
      glow.scale.set(46, 46, 1);
      glow.position.set(-2, 26, 0);
      g.add(glow);
    }
    g.userData = { body, cabin, wheels, barL, barR, glow, color: car.color, isPlayer: false };
    return g;
  }

  function buildPersonMesh(shirtColor, marker) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(capsuleGeo, shirtMat(shirtColor));
    body.position.y = 14;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(headGeo, shirtMat('#e8b98a'));
    head.position.y = 28;
    g.add(head);
    let cone = null;
    if (marker) {
      cone = new THREE.Mesh(
        new THREE.ConeGeometry(6, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }),
      );
      cone.position.y = 42;
      g.add(cone);
    }
    g.userData = { body, cone };
    return g;
  }

  function buildPickupMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'health') {
      const mat = new THREE.MeshBasicMaterial({ color: 0x2eff7a });
      const a = new THREE.Mesh(boxGeo, mat);
      a.scale.set(20, 6, 6);
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(6, 20, 6);
      g.add(a);
      g.add(b);
    } else {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(11),
        new THREE.MeshBasicMaterial({ color: 0x3fa9ff }),
      );
      g.add(m);
    }
    return g;
  }

  function init3d() {
    // THREE logs context-creation failures to console.error before it
    // throws; mute that around the constructor so a headless run without
    // GPU stays silent and the 2D fallback takes over cleanly.
    const _err = console.error;
    console.error = () => {};
    try {
      renderer3d = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
    } finally {
      console.error = _err;
    }
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer3d.shadowMap.enabled = true;
    renderer3d.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a18);
    scene.fog = new THREE.Fog(0x0a0a18, 500, 1900);
    camera = new THREE.PerspectiveCamera(60, W / H, 1, 4500);
    camera.position.set(world.player.x, 120, world.player.y + 160);

    scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    const moon = new THREE.DirectionalLight(0xaabbff, 1.0);
    moon.position.set(world.player.x + 300, 520, world.player.y + 200);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -380;
    moon.shadow.camera.right = 380;
    moon.shadow.camera.top = 380;
    moon.shadow.camera.bottom = -380;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 1600;
    moon.shadow.bias = -0.0005;
    scene.add(moon);
    scene.add(moon.target);
    scene.userData.moon = moon;

    // Ground.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.SIZE + 600, CITY.SIZE + 600),
      new THREE.MeshStandardMaterial({ color: 0x0e0e18, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CITY.SIZE / 2, -0.2, CITY.SIZE / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    // Roads (shared texture, dashed centre line).
    const roadTex = makeRoadTexture();
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3c, roughness: 1 });
    const crossTex = makeCrosswalkTexture();
    const crossMat = new THREE.MeshBasicMaterial({
      map: crossTex, transparent: true, opacity: 0.8, depthWrite: false,
    });
    for (const c of CITY.ROAD_CENTERS) {
      for (const horizontal of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.SIZE, CITY.ROAD_WIDTH), roadMat.clone());
        road.material.map = roadTex.clone();
        road.material.map.repeat.set(CITY.SIZE / 128, 1);
        road.material.map.needsUpdate = true;
        road.rotation.x = -Math.PI / 2;
        if (!horizontal) road.rotation.z = Math.PI / 2;
        road.position.set(horizontal ? CITY.SIZE / 2 : c, 0.02, horizontal ? c : CITY.SIZE / 2);
        road.receiveShadow = true;
        scene.add(road);
        for (const side of [-1, 1]) {
          const walk = new THREE.Mesh(boxGeo, sidewalkMat);
          const off = CITY.ROAD_WIDTH / 2 + 8;
          if (horizontal) {
            walk.scale.set(CITY.SIZE, 0.6, 12);
            walk.position.set(CITY.SIZE / 2, 0.1, c + side * off);
          } else {
            walk.scale.set(12, 0.6, CITY.SIZE);
            walk.position.set(c + side * off, 0.1, CITY.SIZE / 2);
          }
          scene.add(walk);
        }
      }
    }
    // Crosswalks at every intersection.
    for (const cx of CITY.ROAD_CENTERS) {
      for (const cy of CITY.ROAD_CENTERS) {
        const cross = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), crossMat);
        cross.rotation.x = -Math.PI / 2;
        cross.position.set(cx, 0.04, cy);
        scene.add(cross);
      }
    }

    // Buildings.
    const windowTex = makeWindowTexture();
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x9a9ab8, map: windowTex, emissive: 0xffffff, emissiveMap: windowTex, emissiveIntensity: 0.5, roughness: 0.9,
    });
    const roofMats = new Map();
    const roofMat = (color) => {
      let m = roofMats.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
        roofMats.set(color, m);
      }
      return m;
    };
    for (const b of world.city.buildings) {
      const roof = roofMat(b.roof);
      const mesh = new THREE.Mesh(boxGeo, [sideMat, sideMat, roof, roof, sideMat, sideMat]);
      mesh.scale.set(b.w, b.height, b.h);
      mesh.position.set(b.x, b.height / 2, b.y);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      if (b.neon) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(b.w * 0.7, 60), 6),
          neonMats[Math.floor(Math.random() * neonMats.length)],
        );
        sign.position.set(b.x, b.height * 0.72, b.y + b.h / 2 + 0.6);
        scene.add(sign);
      }
      if (b.tower) {
        beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
        towerTop = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 10), beaconMat);
        towerTop.position.set(b.x, b.height + 10, b.y);
        scene.add(towerTop);
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 24, 6),
          new THREE.MeshStandardMaterial({ color: 0x888899 }),
        );
        antenna.position.set(b.x, b.height + 6, b.y);
        scene.add(antenna);
      }
    }

    // Parks + fountains.
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x14261a, roughness: 1 });
    for (const pk of world.city.parks) {
      const park = new THREE.Mesh(new THREE.PlaneGeometry(pk.w, pk.h), parkMat);
      park.rotation.x = -Math.PI / 2;
      park.position.set(pk.x, 0.01, pk.y);
      park.receiveShadow = true;
      scene.add(park);
    }
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f7fc4, emissive: 0x1a4a7a, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.4,
    });
    for (const f of world.city.fountains) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(f.r, 20), waterMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(f.x, 0.06, f.y);
      scene.add(disc);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 0.25, f.r * 0.3, 7, 10), parkMat);
      hub.position.set(f.x, 3, f.y);
      scene.add(hub);
      fountains3d.push(disc);
    }

    // Street lights (instanced posts + lamp heads).
    const postGeo = new THREE.CylinderGeometry(1.2, 1.6, 26, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.8 });
    const headGeo2 = new THREE.SphereGeometry(3, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const spots = [];
    for (const cx of CITY.ROAD_CENTERS) {
      for (const cy of CITY.ROAD_CENTERS) {
        spots.push([cx + 78, cy + 78]);
        spots.push([cx - 78, cy - 78]);
      }
    }
    const posts = new THREE.InstancedMesh(postGeo, postMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo2, headMat, spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 13, z);
      posts.setMatrixAt(i, m4);
      m4.makeTranslation(x, 27, z);
      heads.setMatrixAt(i, m4);
    });
    scene.add(posts);
    scene.add(heads);

    // Night sky stars.
    const starCount = 400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.15 + Math.random() * 1.2;
      const r = 2400;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r + CITY.SIZE / 2;
      starPos[i * 3 + 1] = Math.sin(e) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r + CITY.SIZE / 2;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.5, sizeAttenuation: false, fog: false,
    })));

    // Player character mesh (on foot).
    playerMesh = buildPersonMesh('#ff5a5a', false);
    scene.add(playerMesh);

    // Muzzle flash + player headlight.
    muzzleLight = new THREE.PointLight(0xffcc66, 0, 320, 1.6);
    scene.add(muzzleLight);
    headlight = new THREE.SpotLight(0xfff2cc, 60, 420, 0.5, 0.45, 1.2);
    headlightTarget = new THREE.Object3D();
    scene.add(headlightTarget);
    headlight.target = headlightTarget;
    scene.add(headlight);

    // Bullet tracer pool + exhaust/skid puff pool.
    for (let i = 0; i < 24; i += 1) {
      const tracer = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 2), playerBulletMat);
      tracer.visible = false;
      scene.add(tracer);
      bulletPool.push(tracer);
    }
    const glowTex = makeGlowTexture();
    for (let i = 0; i < 20; i += 1) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0x9999aa, transparent: true, opacity: 0.32, depthWrite: false,
      }));
      spr.visible = false;
      spr.scale.set(10, 10, 1);
      scene.add(spr);
      puffPool.push({ spr, life: 0, max: 0.6 });
    }
  }

  try {
    init3d();
  } catch {
    fallback = true;
    renderer3d = null;
    scene = null;
    try {
      fbCtx = gameCanvas.getContext('2d');
    } catch {
      fbCtx = null;
    }
  }

  function syncCarMesh(car, dt, time) {
    let g = carMeshes.get(car);
    if (!g) {
      g = buildCarMesh(car);
      carMeshes.set(car, g);
      scene.add(g);
    }
    g.position.set(car.x, 0, car.y);
    g.rotation.y = -car.angle;
    const u = g.userData;
    if (car.wrecked) {
      g.rotation.z = 0.07;
      if (u.body.material !== wreckMat) u.body.material = wreckMat;
    } else if (u.body.material === wreckMat) {
      u.body.material = bodyMat(u.color);
      g.rotation.z = 0;
    }
    const steerAngle = car._steer ?? 0;
    for (const w of u.wheels) {
      if (w.front) w.steerG.rotation.y = -steerAngle * 0.45;
      w.spinG.rotation.z -= (car.speed * dt) / 5;
    }
    if (car.police && u.barL && u.barR) {
      const phase = Math.floor(time * 6) % 2 === 0;
      u.barL.material = phase ? lightBarRed : lightBarDim;
      u.barR.material = phase ? lightBarDim : lightBarBlue;
      if (u.glow) u.glow.material = phase ? glowRedMat : glowBlueMat;
    }
    return g;
  }

  function updateCamera(world, dt) {
    const p = world.player;
    const inCar = !!p.car;
    const dist = inCar ? 178 : 118;
    const height = inCar ? 82 : 122;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    const tx = p.x - fx * dist;
    const tz = p.y - fy * dist;
    const k = rendered ? 1 - Math.exp(-4.5 * dt) : 1;
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (height - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    _v1.set(p.x + fx * 45, 12, p.y + fy * 45);
    camera.lookAt(_v1);
    const speed = inCar ? Math.abs(p.car.speed) : 0;
    const targetFov = 60 + Math.min(10, (speed / 460) * 10);
    camera.fov += (targetFov - camera.fov) * k;
    camera.updateProjectionMatrix();
    if (world.shakeT > 0) {
      camera.position.x += (Math.random() - 0.5) * 7 * world.shakeT;
      camera.position.y += (Math.random() - 0.5) * 5 * world.shakeT;
      camera.position.z += (Math.random() - 0.5) * 7 * world.shakeT;
    }
    const moon = scene.userData.moon;
    moon.position.set(p.x + 300, 520, p.y + 200);
    moon.target.position.set(p.x, 0, p.y);
    moon.target.updateMatrixWorld();
  }

  function render3d(world, dt) {
    const time = world.time;
    const p = world.player;
    updateCamera(world, dt);

    // Cars.
    const seen = new Set();
    for (const car of world.cars) {
      seen.add(car);
      const g = syncCarMesh(car, dt, time);
      if (car === p.car) {
        g.userData.isPlayer = true;
        if (!g.userData.glow) {
          const glow = new THREE.Mesh(
            new THREE.PlaneGeometry(44, 26),
            underglowMat,
          );
          glow.rotation.x = -Math.PI / 2;
          glow.position.y = 0.6;
          g.add(glow);
          g.userData.glow = glow;
        }
        car._steer = 0;
      }
    }
    for (const [car, g] of [...carMeshes]) {
      if (!seen.has(car)) {
        scene.remove(g);
        carMeshes.delete(car);
      }
    }

    // Player on foot.
    if (p.car) {
      playerMesh.visible = false;
    } else {
      playerMesh.visible = true;
      playerMesh.position.set(p.x, 0, p.y);
      playerMesh.rotation.y = -p.angle;
    }

    // Peds.
    const seenPeds = new Set();
    world.peds.forEach((ped, i) => {
      seenPeds.add(ped);
      let g = pedMeshes.get(ped);
      if (!g) {
        g = buildPersonMesh(ped.shirt, false);
        pedMeshes.set(ped, g);
        scene.add(g);
      }
      g.position.set(ped.x, Math.abs(Math.sin(time * 6 + i)) * 1.5, ped.y);
      g.rotation.y = -ped.angle;
    });
    for (const [ped, g] of [...pedMeshes]) {
      if (!seenPeds.has(ped)) {
        scene.remove(g);
        pedMeshes.delete(ped);
      }
    }

    // Enemies.
    const seenEnemies = new Set();
    for (const e of world.enemies) {
      if (e.dead) continue;
      seenEnemies.add(e);
      let g = enemyMeshes.get(e);
      if (!g) {
        g = buildPersonMesh('#22222e', true);
        enemyMeshes.set(e, g);
        scene.add(g);
      }
      g.position.set(e.x, 0, e.y);
      g.rotation.y = -e.angle;
      if (g.userData.cone) g.userData.cone.material.color.setHex(Math.floor(time * 3) % 2 === 0 ? 0xff2222 : 0x881111);
    }
    for (const [e, g] of [...enemyMeshes]) {
      if (!seenEnemies.has(e)) {
        scene.remove(g);
        enemyMeshes.delete(e);
      }
    }

    // Pickups.
    for (const pk of world.pickups) {
      let g = pickupMeshes.get(pk);
      if (!g) {
        g = buildPickupMesh(pk.kind);
        pickupMeshes.set(pk, g);
        scene.add(g);
      }
      g.visible = !pk.taken;
      if (!pk.taken) {
        g.position.set(pk.x, 14 + Math.sin(time * 2.2) * 3, pk.y);
        g.rotation.y = time * 1.5;
      }
    }

    // Bullets (tracers).
    let bi = 0;
    const drawTracer = (b, mat) => {
      if (bi >= bulletPool.length) return;
      const t = bulletPool[bi];
      bi += 1;
      t.visible = true;
      t.material = mat;
      t.position.set(b.x, 12, b.y);
      t.rotation.y = -Math.atan2(b.vy, b.vx);
    };
    for (const b of world.bullets) drawTracer(b, playerBulletMat);
    for (const b of world.ebullets) drawTracer(b, enemyBulletMat);
    for (; bi < bulletPool.length; bi += 1) bulletPool[bi].visible = false;

    // Muzzle flash + headlight.
    if (world.muzzleT > 0) {
      muzzleLight.position.set(p.x, 16, p.y);
      muzzleLight.intensity = 60;
    } else {
      muzzleLight.intensity = 0;
    }
    if (p.car) {
      const car = p.car;
      headlight.position.set(car.x + Math.cos(car.angle) * 18, 12, car.y + Math.sin(car.angle) * 18);
      headlightTarget.position.set(
        car.x + Math.cos(car.angle) * 220, 0, car.y + Math.sin(car.angle) * 220,
      );
      headlight.intensity = 60;
    } else {
      headlight.intensity = 0;
    }

    // Fountains + tower beacon.
    for (const disc of fountains3d) {
      const s = 1 + Math.sin(time * 1.8 + disc.position.x) * 0.05;
      disc.scale.set(s, s, 1);
    }
    if (beaconMat) beaconMat.color.setHex(Math.floor(time * 2) % 2 === 0 ? 0xff3344 : 0x881122);

    // Exhaust / skid puffs from the player's car.
    if (p.car && Math.abs(p.car.speed) > 200) {
      const car = p.car;
      const puff = puffPool.find((pf) => pf.life <= 0);
      if (puff && Math.random() < 0.5) {
        puff.life = puff.max;
        puff.spr.visible = true;
        puff.spr.position.set(
          car.x - Math.cos(car.angle) * 20, 6, car.y - Math.sin(car.angle) * 20,
        );
      }
    }
    for (const pf of puffPool) {
      if (pf.life <= 0) continue;
      pf.life -= dt;
      if (pf.life <= 0) {
        pf.spr.visible = false;
        continue;
      }
      const age = pf.max - pf.life;
      const s = 8 + age * 34;
      pf.spr.scale.set(s, s, 1);
      pf.spr.position.y += 5 * dt;
    }

    renderer3d.render(scene, camera);
  }

  // ---------------------------------------------------------------- HUD

  function drawStars(g, x, y, stars) {
    g.font = 'bold 22px sans-serif';
    g.textBaseline = 'middle';
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.25)';
      g.fillText('★', x + i * 26, y);
    }
  }

  function drawBar(g, x, y, w, h, frac, color, label) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#22222e';
    g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
    g.fillStyle = '#ffffff';
    g.font = 'bold 11px sans-serif';
    g.textBaseline = 'middle';
    g.fillText(label, x + 6, y + h / 2);
  }

  function drawMinimap(g, world) {
    const size = 190;
    const x0 = W - size - 14;
    const y0 = H - size - 14;
    const s = size / CITY.SIZE;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
    g.save();
    g.beginPath();
    g.rect(x0, y0, size, size);
    g.clip();
    g.fillStyle = '#0b0b14';
    g.fillRect(x0, y0, size, size);
    g.fillStyle = '#232336';
    for (const c of CITY.ROAD_CENTERS) {
      g.fillRect(x0, y0 + c * s - (CITY.ROAD_WIDTH / 2) * s, size, CITY.ROAD_WIDTH * s);
      g.fillRect(x0 + c * s - (CITY.ROAD_WIDTH / 2) * s, y0, CITY.ROAD_WIDTH * s, size);
    }
    g.fillStyle = '#3a3a4e';
    for (const b of world.city.buildings) {
      g.fillRect(x0 + (b.x - b.w / 2) * s, y0 + (b.y - b.h / 2) * s, b.w * s, b.h * s);
    }
    g.fillStyle = '#ffd23e';
    g.fillRect(
      x0 + (GRAND_TOWER.x - GRAND_TOWER.w / 2) * s,
      y0 + (GRAND_TOWER.y - GRAND_TOWER.h / 2) * s,
      GRAND_TOWER.w * s, GRAND_TOWER.h * s,
    );
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      g.fillStyle = pk.kind === 'health' ? '#2eff7a' : '#3fa9ff';
      g.beginPath();
      g.arc(x0 + pk.x * s, y0 + pk.y * s, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const car of world.cars) {
      if (car.wrecked) continue;
      g.fillStyle = car.police ? '#ff4444' : car.mission === 'deliver' ? '#ffd23e' : car.traffic ? '#bbbbbb' : '#888888';
      g.beginPath();
      g.arc(x0 + car.x * s, y0 + car.y * s, car.police ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const e of world.enemies) {
      if (e.dead) continue;
      g.fillStyle = '#ff2222';
      g.beginPath();
      g.arc(x0 + e.x * s, y0 + e.y * s, 3, 0, Math.PI * 2);
      g.fill();
    }
    const dest = world.mission?.step ? missionPlace(world.mission.step) : null;
    if (dest) {
      const pulse = 5 + Math.sin(world.time * 4) * 2;
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x0 + dest.x * s, y0 + dest.y * s, pulse, 0, Math.PI * 2);
      g.stroke();
    }
    const p = world.player;
    g.save();
    g.translate(x0 + p.x * s, y0 + p.y * s);
    g.rotate(p.angle);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-5, -5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();
  }

  function drawHUD(world) {
    if (!hudCtx) return;
    const g = hudCtx;
    g.clearRect(0, 0, W, H);
    const p = world.player;
    const m = world.mission;

    if (world.screen === 'title') {
      g.fillStyle = 'rgba(5,5,16,0.55)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.fillStyle = '#22eeff';
      g.font = 'bold 84px sans-serif';
      g.fillText('NEON BAY', W / 2, H / 2 - 120);
      g.fillStyle = '#ffffff';
      g.font = '20px sans-serif';
      g.fillText('An open-world crime story — original, Three.js 3D', W / 2, H / 2 - 72);
      g.font = '15px sans-serif';
      g.fillStyle = '#ccccdd';
      const lines = CONTROLS_HELP.split('   •   ');
      lines.forEach((line, i) => {
        g.fillText(line.trim(), W / 2, H / 2 - 30 + i * 24);
      });
      const best = loadBestTime();
      if (best.total !== null) {
        g.fillStyle = '#ffd23e';
        g.font = 'bold 17px sans-serif';
        g.fillText(`Best total time: ${fmtTime(best.total)}`, W / 2, H / 2 + 96);
      }
      g.fillStyle = '#ffffff';
      g.font = 'bold 22px sans-serif';
      const blink = Math.floor(world.time * 1.5) % 2 === 0;
      if (blink) g.fillText('Press ENTER to start', W / 2, H / 2 + 140);
      g.textAlign = 'left';
      return;
    }

    // Top-left: wanted, health, armor.
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(10, 10, 210, 86);
    drawStars(g, 20, 26, world.stars);
    drawBar(g, 18, 44, 180, 13, p.health / 100, '#2eff7a', `HP ${Math.round(p.health)}`);
    drawBar(g, 18, 64, 180, 13, p.armor / 100, '#3fa9ff', `ARMOR ${Math.round(p.armor)}`);

    // Top-right: cash, speed, mission.
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(W - 230, 10, 220, 86);
    g.fillStyle = '#2eff7a';
    g.font = 'bold 24px sans-serif';
    g.textAlign = 'right';
    g.fillText(`$${p.money}`, W - 22, 34);
    g.fillStyle = '#ffffff';
    g.font = '15px sans-serif';
    const speed = p.car ? Math.round(Math.abs(p.car.speed) * 0.22) : 0;
    g.fillText(p.car ? `${speed} mph` : 'on foot', W - 22, 58);
    if (m) {
      g.fillStyle = '#ffd23e';
      g.font = 'bold 14px sans-serif';
      g.fillText(`M${m.def.id} ${m.def.name}  ${fmtTime(m.timer)}`, W - 22, 80);
    }
    g.textAlign = 'left';

    // Mission tip + objective arrow.
    if (m && m.step && !m.done) {
      const dest = missionPlace(m.step);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(10, H - 64, Math.min(560, W - 230), 54);
      g.fillStyle = '#ffd23e';
      g.font = 'bold 15px sans-serif';
      g.fillText(`${m.def.name} — ${m.step.type.toUpperCase()}`, 20, H - 44);
      g.fillStyle = '#ffffff';
      g.font = '14px sans-serif';
      g.fillText(m.def.tip, 20, H - 22);
      if (dest) {
        const d = Math.hypot(dest.x - p.x, dest.y - p.y);
        const rel = Math.atan2(dest.y - p.y, dest.x - p.x) - p.angle;
        const ax = W / 2;
        const ay = 116;
        g.save();
        g.translate(ax, ay);
        g.rotate(rel + Math.PI / 2);
        g.fillStyle = '#ffd23e';
        g.beginPath();
        g.moveTo(0, -16);
        g.lineTo(11, 10);
        g.lineTo(-11, 10);
        g.closePath();
        g.fill();
        g.restore();
        g.fillStyle = '#ffd23e';
        g.font = 'bold 13px sans-serif';
        g.textAlign = 'center';
        g.fillText(`${Math.round(d / 10)}m`, ax, ay + 34);
        g.textAlign = 'left';
      }
    }

    // Mission banner.
    if (ui.banner && ui.bannerT > 0) {
      g.globalAlpha = Math.min(1, ui.bannerT);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      const bw = 520;
      g.fillRect(W / 2 - bw / 2, 150, bw, 54);
      g.fillStyle = '#22eeff';
      g.font = 'bold 24px sans-serif';
      g.textAlign = 'center';
      g.fillText(ui.banner, W / 2, 185);
      g.textAlign = 'left';
      g.globalAlpha = 1;
    }

    // Pickup flash.
    if (ui.flash && ui.flashT > 0) {
      g.fillStyle = ui.flash.kind === 'health' ? '#2eff7a' : '#3fa9ff';
      g.font = 'bold 18px sans-serif';
      g.textAlign = 'center';
      g.fillText(`+50 ${ui.flash.kind.toUpperCase()}`, W / 2, 240);
      g.textAlign = 'left';
    }

    drawMinimap(g, world);

    // Mission summary overlay.
    if (ui.summary) {
      const s = ui.summary;
      const bw = 460;
      const bh = 210;
      g.fillStyle = 'rgba(5,5,16,0.85)';
      g.fillRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      g.strokeStyle = '#22eeff';
      g.lineWidth = 2;
      g.strokeRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      g.textAlign = 'center';
      g.fillStyle = '#22eeff';
      g.font = 'bold 26px sans-serif';
      g.fillText('MISSION COMPLETE', W / 2, H / 2 - 62);
      g.fillStyle = '#ffffff';
      g.font = '19px sans-serif';
      g.fillText(s.name, W / 2, H / 2 - 30);
      g.font = '16px sans-serif';
      g.fillText(`Time: ${fmtTime(s.time)}   Best: ${fmtTime(s.best)}`, W / 2, H / 2 + 2);
      g.fillStyle = '#2eff7a';
      g.fillText(`Cash earned: $${s.cash}`, W / 2, H / 2 + 30);
      if (s.isNewBest) {
        g.fillStyle = '#ffd23e';
        g.font = 'bold 19px sans-serif';
        g.fillText('★ NEW BEST!', W / 2, H / 2 + 62);
      } else if (s.beatPar) {
        g.fillStyle = '#ffd23e';
        g.font = 'bold 19px sans-serif';
        g.fillText('★ BEAT PAR!', W / 2, H / 2 + 62);
      }
      g.textAlign = 'left';
    }

    // Game-complete summary.
    if (ui.gameSummary) {
      const s = ui.gameSummary;
      const bw = 480;
      const bh = 220;
      g.fillStyle = 'rgba(5,5,16,0.88)';
      g.fillRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 2;
      g.strokeRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      g.textAlign = 'center';
      g.fillStyle = '#ffd23e';
      g.font = 'bold 28px sans-serif';
      g.fillText('THE LONG GOODBYE', W / 2, H / 2 - 66);
      g.fillStyle = '#ffffff';
      g.font = '19px sans-serif';
      g.fillText('You left Neon Bay for good.', W / 2, H / 2 - 34);
      g.font = '16px sans-serif';
      g.fillText(`Total time: ${fmtTime(s.total)}   Best: ${fmtTime(s.best)}`, W / 2, H / 2 + 0);
      g.fillStyle = '#2eff7a';
      g.fillText(`Total cash: $${s.money}   Kills: ${s.kills}`, W / 2, H / 2 + 28);
      if (s.isNewBest) {
        g.fillStyle = '#ffd23e';
        g.font = 'bold 19px sans-serif';
        g.fillText('★ NEW BEST TOTAL!', W / 2, H / 2 + 62);
      }
      g.font = '15px sans-serif';
      g.fillStyle = '#ccccdd';
      g.fillText('Press ENTER to play again', W / 2, H / 2 + 88);
      g.textAlign = 'left';
    }

    // Wasted / failed overlays.
    if (world.screen === 'wasted' || world.screen === 'failed') {
      g.fillStyle = 'rgba(20,0,0,0.72)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.fillStyle = '#ff4444';
      g.font = 'bold 64px sans-serif';
      g.fillText(world.screen === 'wasted' ? 'WASTED' : 'MISSION FAILED', W / 2, H / 2 - 20);
      g.fillStyle = '#ffffff';
      g.font = '18px sans-serif';
      if (world.screen === 'failed' && m?.failReason) g.fillText(m.failReason, W / 2, H / 2 + 20);
      g.fillText('Press ENTER to retry', W / 2, H / 2 + 56);
      g.textAlign = 'left';
    }

    // Paused overlay.
    if (ui.paused) {
      g.fillStyle = 'rgba(5,5,16,0.6)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = 'bold 44px sans-serif';
      g.fillText('PAUSED', W / 2, H / 2);
      g.font = '18px sans-serif';
      g.fillText('Press P to resume', W / 2, H / 2 + 40);
      g.textAlign = 'left';
    }
  }

  // ---------------------------------------------------------------- fallback

  function renderFallback(world, dt) {
    void dt;
    const g = fbCtx;
    if (!g) return;
    const p = world.player;
    fbScale = Math.min(W, H) / 900;
    const halfW = W / 2 / fbScale;
    const halfH = H / 2 / fbScale;
    fbCx = CITY.SIZE <= halfW * 2 ? CITY.SIZE / 2 : Math.max(halfW, Math.min(CITY.SIZE - halfW, p.x));
    fbCy = CITY.SIZE <= halfH * 2 ? CITY.SIZE / 2 : Math.max(halfH, Math.min(CITY.SIZE - halfH, p.y));
    const toX = (x) => (x - fbCx) * fbScale + W / 2;
    const toY = (y) => (y - fbCy) * fbScale + H / 2;
    g.fillStyle = '#0b0b14';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1c1c28';
    for (const c of CITY.ROAD_CENTERS) {
      g.fillRect(0, toY(c - CITY.ROAD_WIDTH / 2), W, CITY.ROAD_WIDTH * fbScale);
      g.fillRect(toX(c - CITY.ROAD_WIDTH / 2), 0, CITY.ROAD_WIDTH * fbScale, H);
    }
    g.fillStyle = '#14261a';
    for (const pk of world.city.parks) {
      g.fillRect(toX(pk.x - pk.w / 2), toY(pk.y - pk.h / 2), pk.w * fbScale, pk.h * fbScale);
    }
    for (const b of world.city.buildings) {
      g.fillStyle = b.tower ? '#ffd23e' : b.roof;
      g.fillRect(toX(b.x - b.w / 2), toY(b.y - b.h / 2), b.w * fbScale, b.h * fbScale);
    }
    g.fillStyle = '#2f7fc4';
    for (const f of world.city.fountains) {
      g.beginPath();
      g.arc(toX(f.x), toY(f.y), f.r * fbScale, 0, Math.PI * 2);
      g.fill();
    }
    const drawCar2d = (car) => {
      g.save();
      g.translate(toX(car.x), toY(car.y));
      g.rotate(car.angle);
      g.fillStyle = car.wrecked ? '#2a2a2e' : car.color;
      g.fillRect(-18 * fbScale, -9 * fbScale, 36 * fbScale, 18 * fbScale);
      g.fillStyle = '#0d1526';
      g.fillRect(-8 * fbScale, -7 * fbScale, 16 * fbScale, 14 * fbScale);
      if (car.police) {
        g.fillStyle = Math.floor(world.time * 6) % 2 === 0 ? '#ff2222' : '#2244ff';
        g.fillRect(-2 * fbScale, -9 * fbScale, 5 * fbScale, 18 * fbScale);
      }
      g.restore();
    };
    for (const car of world.cars) drawCar2d(car);
    for (const ped of world.peds) {
      g.fillStyle = ped.shirt;
      g.beginPath();
      g.arc(toX(ped.x), toY(ped.y), 4, 0, Math.PI * 2);
      g.fill();
    }
    for (const e of world.enemies) {
      if (e.dead) continue;
      g.fillStyle = '#ff2222';
      g.beginPath();
      g.arc(toX(e.x), toY(e.y), 6, 0, Math.PI * 2);
      g.fill();
    }
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      g.fillStyle = pk.kind === 'health' ? '#2eff7a' : '#3fa9ff';
      g.beginPath();
      g.arc(toX(pk.x), toY(pk.y), 7, 0, Math.PI * 2);
      g.fill();
    }
    if (!p.car) {
      g.fillStyle = '#ff5a5a';
      g.beginPath();
      g.arc(toX(p.x), toY(p.y), 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.moveTo(toX(p.x), toY(p.y));
      g.lineTo(toX(p.x + Math.cos(p.angle) * 18), toY(p.y + Math.sin(p.angle) * 18));
      g.stroke();
    }
    const dest = world.mission?.step ? missionPlace(world.mission.step) : null;
    if (dest) {
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(toX(dest.x), toY(dest.y), 14 + Math.sin(world.time * 4) * 4, 0, Math.PI * 2);
      g.stroke();
    }
    drawHUD(world);
  }

  // ---------------------------------------------------------------- public API

  function render(world, dt) {
    if (ui.bannerT > 0) ui.bannerT -= dt;
    if (ui.flashT > 0) ui.flashT -= dt;
    if (fallback) {
      renderFallback(world, dt);
    } else {
      render3d(world, dt);
      drawHUD(world);
    }
    rendered = true;
  }

  function resize(w, h) {
    W = Math.max(320, Math.floor(w));
    H = Math.max(240, Math.floor(h));
    gameCanvas.width = W;
    gameCanvas.height = H;
    hudCanvas.width = W;
    hudCanvas.height = H;
    if (renderer3d && camera) {
      renderer3d.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
  }

  function screenToWorld(sx, sy) {
    if (fallback) {
      return {
        x: (sx - W / 2) / fbScale + fbCx,
        y: (sy - H / 2) / fbScale + fbCy,
      };
    }
    if (!camera) return { x: world.player.x, y: world.player.y };
    _ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const o = _ray.ray.origin;
    const d = _ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return { x: world.player.x, y: world.player.y };
    const t = -o.y / d.y;
    if (t < 0) return { x: world.player.x, y: world.player.y };
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }

  return {
    render,
    resize,
    screenToWorld,
    isFallback: () => fallback,
    wasRendered: () => rendered,
    get best() {
      return loadBestTime();
    },
    refreshBest() {
      return loadBestTime();
    },
    ui,
  };
}
