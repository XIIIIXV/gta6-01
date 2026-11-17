// NEON BAY — keyboard + mouse input (v3 rebuild).
// Tracks keys and the mouse, and produces the input object stepWorld takes:
//   { move:{x,y,active}, run, enterPressed, punchPressed, shootHeld,
//     reloadPressed, switchPressed, hornPressed, aim:{x,y} }
// Edge-triggered actions (enter, punch, reload, switch, horn) are true for
// exactly one poll, then cleared. Aim is in world coordinates (the caller
// supplies a screen->world mapping, since the camera lives in main.js).

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Fresh input state. */
export function createInput() {
  return {
    keys: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    edge: { enter: false, punch: false, reload: false, switch: false, horn: false },
  };
}

/** Attach DOM listeners. Call once from main.js. */
export function attachInput(state, element) {
  const target = element || (typeof window !== 'undefined' ? window : null);
  if (!target || !target.addEventListener) return;
  target.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    state.keys.add(e.code);
    if (e.code === 'KeyE') state.edge.enter = true;
    if (e.code === 'KeyF' || e.code === 'Space') state.edge.punch = true;
    if (e.code === 'KeyR') state.edge.reload = true;
    if (e.code === 'KeyQ') state.edge.switch = true;
    if (e.code === 'KeyH') state.edge.horn = true;
    // Keep the page from scrolling on game keys.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  target.addEventListener('keyup', (e) => {
    state.keys.delete(e.code);
  });
  target.addEventListener('blur', () => {
    state.keys.clear();
    state.mouseDown = false;
  });
  if (element && element.addEventListener) {
    element.addEventListener('mousemove', (e) => {
      const r = element.getBoundingClientRect();
      state.mouseX = e.clientX - r.left;
      state.mouseY = e.clientY - r.top;
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) state.mouseDown = true;
    });
    element.addEventListener('mouseup', (e) => {
      if (e.button === 0) state.mouseDown = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

/** Whether a key is currently held. */
export function isDown(state, code) {
  return state.keys.has(code);
}

/**
 * Build the stepWorld input for this frame and clear the edge flags.
 * `toWorld(sx, sy)` maps screen pixels to world coordinates (for aim).
 */
export function pollInput(state, toWorld) {
  let mx = 0;
  let my = 0;
  for (const code of state.keys) {
    const d = MOVE_KEYS[code];
    if (d) {
      mx += d[0];
      my += d[1];
    }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const aim = toWorld ? toWorld(state.mouseX, state.mouseY) : { x: 0, y: 0 };
  const out = {
    move: { x: mx, y: my, active: len > 0 },
    run: state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'),
    enterPressed: state.edge.enter,
    punchPressed: state.edge.punch,
    shootHeld: state.mouseDown,
    reloadPressed: state.edge.reload,
    switchPressed: state.edge.switch,
    hornPressed: state.edge.horn,
    aim,
  };
  state.edge.enter = false;
  state.edge.punch = false;
  state.edge.reload = false;
  state.edge.switch = false;
  state.edge.horn = false;
  return out;
}
