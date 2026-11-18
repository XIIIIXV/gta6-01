// gl.js — hand-rolled minimal WebGL engine for NEON BAY (v8 rebuild).
// Written from scratch from the v8 spec. No libraries, no CDN.
// Matrices are column-major Float32Array(16). The vertex shader takes
// position/normal/colour attributes; uMVP ALREADY contains the model matrix
// (v7 fix: do NOT multiply by worldPos again — that doubles translation
// and squares scale).

export function identity(out) {
  const m = out || new Float32Array(16);
  m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0;
  m[4] = 0; m[5] = 1; m[6] = 0; m[7] = 0;
  m[8] = 0; m[9] = 0; m[10] = 1; m[11] = 0;
  m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
  return m;
}

export function translate(x, y, z, out) {
  const m = identity(out);
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function scale(x, y, z, out) {
  const m = out || new Float32Array(16);
  m[0] = x; m[1] = 0; m[2] = 0; m[3] = 0;
  m[4] = 0; m[5] = y; m[6] = 0; m[7] = 0;
  m[8] = 0; m[9] = 0; m[10] = z; m[11] = 0;
  m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
  return m;
}

export function rotateX(a, out) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity(out);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function rotateY(a, out) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity(out);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function rotateZ(a, out) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = identity(out);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

export function multiply(a, b, out) {
  const m = out || new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      m[col * 4 + row] = sum;
    }
  }
  return m;
}

export function perspective(fovY, aspect, near, far, out) {
  const f = 1 / Math.tan(fovY / 2);
  const m = out || new Float32Array(16);
  m[0] = f / aspect; m[1] = 0; m[2] = 0; m[3] = 0;
  m[4] = 0; m[5] = f; m[6] = 0; m[7] = 0;
  m[8] = 0; m[9] = 0; m[10] = (far + near) / (near - far); m[11] = -1;
  m[12] = 0; m[13] = 0; m[14] = (2 * far * near) / (near - far); m[15] = 0;
  return m;
}

export function lookAt(eye, target, up, out) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = out || new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec3 uColor;
uniform vec3 uCameraPos;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
varying vec3 vColor;
varying float vFog;
varying float vEmissive;
varying float vAlpha;
uniform float uEmissive;
void main() {
  vec3 n = normalize(uNormalMat * aNormal);
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.5));
  float diff = max(dot(n, lightDir), 0.0);
  vColor = aColor * uColor * (0.5 + 0.6 * diff);
  vEmissive = uEmissive;
  vAlpha = uAlpha;
  vec4 worldPos = uModel * vec4(aPos, 1.0);
  gl_Position = uMVP * vec4(aPos, 1.0);
  float dist = distance(worldPos.xyz, uCameraPos);
  vFog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec3 vColor;
varying float vFog;
varying float vEmissive;
varying float vAlpha;
uniform vec3 uFogColor;
void main() {
  vec3 c = vColor * (1.0 + vEmissive);
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, vAlpha);
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.error('[neon-bay] shader compile error: ' + log);
    return null;
  }
  return sh;
}

const colorCache = new Map();

function parseColor(c) {
  if (Array.isArray(c)) return c;
  let v = colorCache.get(c);
  if (v) return v;
  let hex = String(c).replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  v = [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
  colorCache.set(c, v);
  return v;
}

// Unit box: 24 verts (4 per face), 36 indices. Centred at origin, size 1.
function boxGeometry() {
  const P = [
    // +x
    0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
    // -x
    -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
    // +y
    -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // -y
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5,
    // +z
    -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
    // -z
    0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5,
  ];
  const N = [
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  ];
  const C = new Array(24 * 3).fill(1);
  const I = [];
  for (let f = 0; f < 6; f++) {
    const o = f * 4;
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return { positions: P, normals: N, colors: C, indices: I };
}

// Unit quad in the XZ plane (flat, facing +Y), size 1, centred at origin.
function quadGeometry() {
  const P = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
  const N = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const C = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const I = [0, 1, 2, 0, 2, 3];
  return { positions: P, normals: N, colors: C, indices: I };
}

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (e) {
    return false;
  }
}

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
    canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
  if (!gl) return null;
  gl.enable(gl.DEPTH_TEST);
  // No face culling: this hand-rolled engine draws boxes and single-sided
  // quads from every angle (windows, signs, glow pools); depth testing
  // already hides the far faces of solid boxes.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[neon-bay] program link error: ' + gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const loc = {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    aColor: gl.getAttribLocation(prog, 'aColor'),
    uMVP: gl.getUniformLocation(prog, 'uMVP'),
    uModel: gl.getUniformLocation(prog, 'uModel'),
    uNormalMat: gl.getUniformLocation(prog, 'uNormalMat'),
    uColor: gl.getUniformLocation(prog, 'uColor'),
    uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
    uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
    uFogColor: gl.getUniformLocation(prog, 'uFogColor'),
    uFogNear: gl.getUniformLocation(prog, 'uFogNear'),
    uFogFar: gl.getUniformLocation(prog, 'uFogFar'),
    uCameraPos: gl.getUniformLocation(prog, 'uCameraPos'),
  };

  function makeBuffers(geo) {
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.positions), gl.STATIC_DRAW);
    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.normals), gl.STATIC_DRAW);
    const colBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.colors), gl.STATIC_DRAW);
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.indices), gl.STATIC_DRAW);
    return { posBuf, nrmBuf, colBuf, idxBuf, count: geo.indices.length };
  }

  const box = makeBuffers(boxGeometry());
  const quad = makeBuffers(quadGeometry());

  const viewProj = new Float32Array(16);
  const mvp = new Float32Array(16);
  const normalMat = new Float32Array(9);
  let view = identity();
  let proj = identity();
  const fogColor = [0.05, 0.07, 0.16];
  let fogNear = 1200;
  let fogFar = 3400;
  const cameraPos = [0, 0, 0];

  function bindBuffers(b) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b.posBuf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.nrmBuf);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.colBuf);
    gl.enableVertexAttribArray(loc.aColor);
    gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idxBuf);
  }

  function draw(model, color, emissive, alpha, buffers) {
    multiply(viewProj, model, mvp);
    gl.uniformMatrix4fv(loc.uMVP, false, mvp);
    gl.uniformMatrix4fv(loc.uModel, false, model);
    normalMat[0] = model[0]; normalMat[1] = model[1]; normalMat[2] = model[2];
    normalMat[3] = model[4]; normalMat[4] = model[5]; normalMat[5] = model[6];
    normalMat[6] = model[8]; normalMat[7] = model[9]; normalMat[8] = model[10];
    gl.uniformMatrix3fv(loc.uNormalMat, false, normalMat);
    const c = parseColor(color);
    gl.uniform3f(loc.uColor, c[0], c[1], c[2]);
    gl.uniform1f(loc.uEmissive, emissive || 0);
    gl.uniform1f(loc.uAlpha, alpha === undefined ? 1 : alpha);
    bindBuffers(buffers);
    gl.drawElements(gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0);
  }

  return {
    gl,
    setCamera(viewMatrix, projMatrix, eye) {
      view = viewMatrix;
      proj = projMatrix;
      multiply(proj, view, viewProj);
      cameraPos[0] = eye[0];
      cameraPos[1] = eye[1];
      cameraPos[2] = eye[2];
      gl.uniform3f(loc.uCameraPos, eye[0], eye[1], eye[2]);
    },
    setFog(color, near, far) {
      const c = parseColor(color);
      fogColor[0] = c[0]; fogColor[1] = c[1]; fogColor[2] = c[2];
      fogNear = near;
      fogFar = far;
      gl.uniform3f(loc.uFogColor, c[0], c[1], c[2]);
      gl.uniform1f(loc.uFogNear, near);
      gl.uniform1f(loc.uFogFar, far);
    },
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },
    clear(r, g, b) {
      gl.clearColor(r === undefined ? 0.05 : r, g === undefined ? 0.07 : g, b === undefined ? 0.16 : b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    drawBox(model, color, emissive, alpha) {
      draw(model, color, emissive || 0, alpha, box);
    },
    drawQuad(model, color, emissive, alpha) {
      draw(model, color, emissive || 0, alpha, quad);
    },
    depthWrite(on) {
      gl.depthMask(!!on);
    },
  };
}
