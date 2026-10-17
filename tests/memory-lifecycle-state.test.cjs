'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const memory = require('../core/memory/index.cjs');

// closed, ending, accepting, readOnly : les axes restent indépendants.
const bits = state => [state.closed, state.ending, state.accepting, state.readOnly].map(Number).join('');
const states = [
  ['live', [], '0010'],
  ['paused', ['pause'], '0000'],
  ['suspended', ['suspendAdmission'], '0000'],
  ['intake closed', ['closeIntake'], '0000'],
  ['ending live', ['beginEnding'], '0110'],
  ['ending paused', ['beginEnding', 'pause'], '0100'],
  ['archive', ['restore'], '0001'],
  ['ending archive', ['beginEnding', 'restore'], '0101'],
  ['closed', ['close'], '1000'],
  ['ending closed', ['beginEnding', 'close'], '1100'],
  ['closed archive', ['restore', 'close'], '1001'],
  ['ending closed archive', ['restore', 'beginEnding', 'close'], '1101'],
];
const transitions = [
  ['pause', '0000', '0000', '0000', '0000', '0100', '0100', '0001', '0101', '1000', '1100', '1001', '1101'],
  ['suspendAdmission', '0000', '0000', '0000', '0000', '0100', '0100', '0001', '0101', '1000', '1100', '1001', '1101'],
  ['closeIntake', '0000', '0000', '0000', '0000', '0100', '0100', '0001', '0101', '1000', '1100', '1001', '1101'],
  ['beginEnding', '0110', '0100', '0100', '0100', '0110', '0100', '0101', '0101', '1100', '1100', '1101', '1101'],
  ['close', '1000', '1000', '1000', '1000', '1100', '1100', '1001', '1101', '1000', '1100', '1001', '1101'],
  ['resume', '0010', '0010', '0010', '0010', '0110', '0110', '0010', '0110', null, null, null, null],
  ['restore', '0001', '0001', '0001', '0001', '0101', '0101', '0001', '0101', null, null, null, null],
];

test('memory lifecycle transitions preserve every reachable combination across repeated calls', () => {
  assert.equal(typeof memory.MemoryLifecycleState, 'function');
  for (const [transition, ...expected] of transitions) {
    for (const [index, [name, path, original]] of states.entries()) {
      const initial = path.reduce((state, command) => state[command](), new memory.MemoryLifecycleState());
      assert.equal(bits(initial), original, name);
      let current = initial;
      for (let repeat = 0; repeat < 2; repeat++) {
        const label = `${transition} from ${name}, repetition ${repeat}`;
        if (expected[index] === null) {
          const code = transition === 'resume' ? 'TVLENS_SESSION_STOPPED' : 'TVLENS_MEMORY_RESTORE_REFUSED';
          assert.throws(() => current[transition](), { code }, label);
        } else {
          current = current[transition]();
          assert.equal(bits(current), expected[index], label);
          assert.equal(Object.isFrozen(current), true, label);
        }
        assert.equal(bits(initial), original, 'a transition never mutates its input');
      }
    }
  }
});

test('a lifecycle value cannot be changed through a read', () => {
  assert.equal(typeof memory.MemoryLifecycleState, 'function');
  const value = new memory.MemoryLifecycleState();
  for (const flag of ['closed', 'ending', 'accepting', 'readOnly']) {
    assert.throws(() => { value[flag] = !value[flag]; }, TypeError);
  }
  assert.equal(bits(value), '0010');
});
