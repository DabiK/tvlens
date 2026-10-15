const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWindowMode } = require('../app/window-mode.cjs');

function stage(bounds = { x: 40, y: 50, width: 1340, height: 920 }) {
  const state = { bounds: { ...bounds }, minimum: [1000, 720], onTop: [false] };
  const window = {
    getBounds: () => ({ ...state.bounds }),
    getContentBounds: () => ({ ...state.bounds, height: state.bounds.height - 28 }),
    setBounds: value => { state.bounds = { ...value }; },
    setMinimumSize: (...value) => { state.minimum = value; },
    setAlwaysOnTop: (...value) => { state.onTop = value; },
  };
  const screen = { getDisplayMatching: () => ({ workArea: { x: 100, y: 200, width: 1920, height: 1080 } }) };
  return { state, window, screen, mode: createWindowMode({ window, screen }) };
}

test('invalid window modes are refused without changing the window', () => {
  const { mode, state } = stage();
  const before = structuredClone(state);
  for (const value of [undefined, null, {}, { floating: true }, { floating: 1, expanded: false }, { floating: false, expanded: 'yes' }]) {
    assert.throws(() => mode(value), { message: 'Mode de fenêtre invalide.' });
    assert.deepEqual(state, before);
  }
});

test('floating mode places a compact window above others inside the matching work area', () => {
  const { mode, state, screen } = stage();
  screen.getDisplayMatching = bounds => {
    assert.deepEqual(bounds, { x: 40, y: 50, width: 1340, height: 920 });
    return { workArea: { x: 100, y: 200, width: 1920, height: 1080 } };
  };
  const value = { floating: true, expanded: false };
  assert.equal(mode(value), value);
  assert.deepEqual(state, {
    bounds: { x: 1580, y: 260, width: 420, height: 92 }, minimum: [420, 96], onTop: [true, 'floating'],
  });
});

test('full mode restores the bounds saved when entering floating mode, independently for each window', () => {
  const a = stage();
  const b = stage({ x: -900, y: 10, width: 1100, height: 800 });
  a.state.bounds = { x: 150, y: 250, width: 1200, height: 850 };
  const saved = { ...a.state.bounds };
  a.mode({ floating: true, expanded: false });
  b.mode({ floating: true, expanded: true });
  a.state.bounds.x = 400;
  a.mode({ floating: true, expanded: true });
  a.mode({ floating: false, expanded: false });
  b.mode({ floating: false, expanded: false });
  assert.deepEqual(a.state, { bounds: saved, minimum: [1000, 720], onTop: [false] });
  assert.deepEqual(b.state.bounds, { x: -900, y: 10, width: 1100, height: 800 });
});

test('expanding a floating window keeps its position within the work area and caps its height', () => {
  const { mode, state, screen } = stage();
  mode({ floating: true, expanded: false });
  state.bounds = { x: -500, y: 1500, width: 420, height: 92 };
  mode({ floating: true, expanded: true });
  assert.deepEqual(state.bounds, { x: 100, y: 632, width: 420, height: 648 });
  screen.getDisplayMatching = () => ({ workArea: { x: -1000, y: -200, width: 800, height: 500 } });
  mode({ floating: true, expanded: true });
  assert.deepEqual(state.bounds, { x: -620, y: -200, width: 420, height: 500 });
});
