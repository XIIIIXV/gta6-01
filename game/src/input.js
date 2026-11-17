// Keyboard + mouse input for NEON BAY. Tracks held keys, edge presses, and the
// mouse position in canvas pixels (converted to world aim by the game loop).
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  function codeOf(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouseDown = true;
      mouseClicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    // Held keys.
    down(...codes) { return codes.some((c) => keys.has(c)); },
    // True once, on the frame the key went down.
    wasPressed(...codes) { return codes.some((c) => pressed.has(c)); },
    endFrame() { pressed.clear(); mouseClicked = false; },
    get mouse() { return { x: mouseX, y: mouseY, down: mouseDown, clicked: mouseClicked }; },
    get moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
    },
    get run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
  };
}
