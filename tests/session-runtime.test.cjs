const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionRuntime, validateSegment } = require('../runtime/session-runtime.cjs');

for (const [condition, restore, message] of [
  ['incomplete', {}, 'Archive incomplète : état et inventaire requis.'],
  ['unreadable', { snapshot: { id: 's' }, inventory: {} }, 'Archive illisible.'],
  ['foreign', { snapshot: { id: 'other', segments: [] }, inventory: {} }, 'Archive d’une autre session.'],
]) {
  test(`archive composition retains its explicit refusal for an archive that is ${condition}`, () => {
    assert.throws(() => createSessionRuntime({ id: 's', restore }), { code: 'invalid-archive', status: 400, message });
  });
}

const segment = () => ({
  startMs: 0, endMs: 100, clip: Buffer.from('clip'), frames: [{ atMs: 0, dataUrl: 'data:image/jpeg;base64,YQ==' }],
});
for (const [condition, change, message] of [
  ['future timestamp', { endMs: 3101 }, 'Horodatage de capture invalide.'],
  ['empty clip', { clip: Buffer.alloc(0) }, 'Segment vidéo trop volumineux ou vide.'],
  ['invalid audio', { audio: 'text' }, 'Audio invalide.'],
  ['empty frames', { frames: [] }, 'Images de capture invalides.'],
]) {
  test(`captured segment validation identifies ${condition}`, () => {
    assert.throws(() => validateSegment({ ...segment(), ...change }, 100), {
      code: 'invalid-captured-segment', status: 400, message,
    });
  });
}
