// NEON BAY — keyboard + mouse input (v5 rebuild, written from spec).
// createInput() owns the raw state; attachInput wires DOM listeners;
// pollInput(state, out) fills the persistent `out` object IN PLACE every
// frame (the shape stepWorld expects) and returns nothing. Edge-triggered
// actions (E / F / R / Q) are true for exactly one poll after the keypress.

/** createInput(): fresh raw input state. */
export function createInput() {
  return {
    keys: new Set(),
    pressed: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    attached: false,
  };
}

/** isDown(state, code): is a KeyboardEvent.code currently held? */
export function isDown(state, code) {
  return state.keys.has(code);
}

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyE', 'KeyF', 'KeyR', 'KeyQ', 'KeyH',
  'ShiftLeft', 'ShiftRight', 'Enter', 'KeyP', 'Space',
]);

/**
 * attachInput(state, element): wire keyboard (window) and mouse (element)
 * listeners. Safe to call once; a second call is a no-op.
 */
export function attachInput(state, element) {
  if (state.attached || typeof window === 'undefined') return;
  state.attached = true;
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      state.keys.add(e.code);
      state.pressed.add(e.code);
    }
  });
  window.addEventListener('keyup', (e) => {
    state.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    state.keys.clear();
    state.mouseDown = false;
  });
  const target = element ?? window;
  target.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  });
  target.addEventListener('mousedown', (e) => {
    if (e.button === 0) state.mouseDown = true;
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.mouseDown = false;
  });
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * pollInput(state, out): fill `out` in place with this frame's input.
 * out shape: { move: {x, y, active}, run, enterPressed, punchPressed,
 * shootHeld, reloadPressed, switchPressed, aim: {x, y} }.
 * aim is in SCREEN pixels here — main.js converts it to world coords
 * via renderer.screenToWorld before stepping the world.
 * Edge actions are consumed: they read true once, then clear.
 */
export function pollInput(state, out) {
  const left = state.keys.has('KeyA') || state.keys.has('ArrowLeft');
  const right = state.keys.has('KeyD') || state.keys.has('ArrowRight');
  const up = state.keys.has('KeyW') || state.keys.has('ArrowUp');
  const down = state.keys.has('KeyS') || state.keys.has('ArrowDown');
  const mx = (right ? 1 : 0) - (left ? 1 : 0);
  const my = (down ? 1 : 0) - (up ? 1 : 0);
  out.move.x = mx;
  out.move.y = my;
  out.move.active = mx !== 0 || my !== 0;
  out.run = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
  out.enterPressed = state.pressed.has('KeyE');
  out.punchPressed = state.pressed.has('KeyF');
  out.reloadPressed = state.pressed.has('KeyR');
  out.switchPressed = state.pressed.has('KeyQ');
  out.shootHeld = state.mouseDown;
  out.aim.x = state.mouseX;
  out.aim.y = state.mouseY;
  // Consume the edge-triggered presses so they fire exactly once.
  state.pressed.delete('KeyE');
  state.pressed.delete('KeyF');
  state.pressed.delete('KeyR');
  state.pressed.delete('KeyQ');
  return out;
}
