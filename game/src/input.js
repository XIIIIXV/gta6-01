// input.js — keyboard + mouse input for NEON BAY (v8 rebuild).
// pollInput(state, toWorld) fills the `toWorld` object in place and returns
// nothing — the caller passes a persistent object every frame.

export function createInput() {
  return {
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    paused: false,
  };
}

export function attachInput(state, element) {
  const el = element || window;
  window.addEventListener('keydown', (e) => {
    state.keys[e.code] = true;
    if (e.code === 'KeyP') state.paused = !state.paused;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    state.keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    state.keys = {};
    state.mouse.down = false;
  });
  if (el && el.addEventListener) {
    el.addEventListener('mousemove', (e) => {
      state.mouse.x = e.clientX;
      state.mouse.y = e.clientY;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) state.mouse.down = true;
    });
    el.addEventListener('mouseup', (e) => {
      if (e.button === 0) state.mouse.down = false;
    });
  }
}

export function isDown(state, code) {
  return !!state.keys[code];
}

export function pollInput(state, toWorld) {
  const k = state.keys;
  let mx = 0;
  let my = 0;
  if (k['KeyW'] || k['ArrowUp']) my -= 1;
  if (k['KeyS'] || k['ArrowDown']) my += 1;
  if (k['KeyA'] || k['ArrowLeft']) mx -= 1;
  if (k['KeyD'] || k['ArrowRight']) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  toWorld.move.x = mx;
  toWorld.move.y = my;
  toWorld.move.active = len > 0;
  toWorld.run = !!(k['ShiftLeft'] || k['ShiftRight']);
  toWorld.enterPressed = !!k['KeyE'];
  toWorld.punchPressed = !!k['KeyF'];
  toWorld.shootHeld = state.mouse.down;
  toWorld.reloadPressed = !!k['KeyR'];
  toWorld.switchPressed = !!k['KeyQ'];
  toWorld.hornPressed = !!k['KeyH'];
  // Round 6: C — next radio station, V — radio on/off, T — start time trial,
  // B — toggle the phone (NEONFEED) overlay.
  toWorld.radioPressed = !!k['KeyC'];
  toWorld.radioTogglePressed = !!k['KeyV'];
  toWorld.trialPressed = !!k['KeyT'];
  toWorld.phonePressed = !!k['KeyB'];
  toWorld.aim.x = state.mouse.x;
  toWorld.aim.y = state.mouse.y;
  // Edge-triggered keys are consumed by the caller (main.js clears them
  // after each poll); here we just report the held state.
  return toWorld;
}
