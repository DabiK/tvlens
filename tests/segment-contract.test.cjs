const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateCapturedSegment } = require("../runtime/segment-contract.cjs");

const segment = () => ({
  startMs: 0,
  endMs: 100,
  clip: new Uint8Array([1]),
  frames: [{ atMs: 0, dataUrl: "data:image/jpeg;base64,YQ==" }],
});

test("a valid captured segment is accepted", () => {
  const input = segment();
  Object.freeze(input.frames[0]);
  Object.freeze(input.frames);
  Object.freeze(input);
  assert.equal(validateCapturedSegment(input, { now: 100 }), undefined);
});

test("captured frames retain their count, JPEG encoding, size and timestamp requirements", () => {
  const frame = segment().frames[0];
  for (const frames of [
    undefined,
    [],
    Array(9).fill(frame),
    [{ ...frame, dataUrl: 42 }],
    [{ ...frame, dataUrl: "data:image/png;base64,YQ==" }],
    [{ ...frame, dataUrl: "data:image/jpeg;base64,invalid!" }],
    [{ ...frame, dataUrl: "data:image/jpeg;base64," + "A".repeat(1000000) }],
    [{ ...frame, atMs: NaN }],
    [{ ...frame, atMs: -101 }],
    [{ ...frame, atMs: 201 }],
  ]) {
    assert.throws(() => validateCapturedSegment({ ...segment(), frames }, { now: 100 }), {
      status: 400,
      code: "invalid-captured-segment",
      message: "Images de capture invalides.",
    });
  }
  for (const frames of [
    [frame],
    Array(8).fill(frame),
    [{ ...frame, atMs: -100 }, { ...frame, atMs: 200 }],
    [{ ...frame, dataUrl: "data:image/jpeg;base64," + "A".repeat(999977) }],
  ]) {
    assert.doesNotThrow(() => validateCapturedSegment({ ...segment(), frames }, { now: 100 }));
  }
});

test("captured audio remains optional and retains its inclusive byte limit", () => {
  for (const audio of ["audio", new Uint8Array(2100001)]) {
    assert.throws(() => validateCapturedSegment({ ...segment(), audio }, { now: 100 }), {
      status: 400,
      code: "invalid-captured-segment",
      message: "Audio invalide.",
    });
  }
  for (const audio of [undefined, null, new Uint8Array(), Buffer.alloc(2100000)]) {
    assert.doesNotThrow(() => validateCapturedSegment({ ...segment(), audio }, { now: 100 }));
  }
});

test("captured clips retain their type and inclusive size requirements", () => {
  for (const clip of [undefined, "clip", new Uint8Array(), new Uint8Array(20000001)]) {
    assert.throws(() => validateCapturedSegment({ ...segment(), clip }, { now: 100 }), {
      status: 400,
      code: "invalid-captured-segment",
      message: "Segment vidéo trop volumineux ou vide.",
    });
  }
  for (const clip of [new Uint8Array(1), Buffer.alloc(20000000)]) {
    assert.doesNotThrow(() => validateCapturedSegment({ ...segment(), clip }, { now: 100 }));
  }
});

test("captured timestamps retain their refusal beyond the inclusive future tolerance", () => {
  for (const change of [{ endMs: 3101 }, { endMs: Infinity }, { startMs: NaN }]) {
    assert.throws(() => validateCapturedSegment({ ...segment(), ...change }, { now: 100 }), {
      status: 400,
      code: "invalid-captured-segment",
      message: "Horodatage de capture invalide.",
    });
  }
  assert.throws(() => validateCapturedSegment(null, { now: 100 }), {
    status: 400,
    code: "invalid-captured-segment",
    message: "Horodatage de capture invalide.",
  });
  assert.doesNotThrow(() => validateCapturedSegment({ ...segment(), endMs: 3100 }, { now: 100 }));
});
