const { refusal } = require("./errors.cjs");
// Les bornes communes viennent de l'adaptateur : celui-ci ne peut pas dépendre du runtime.
const { REMOTE_MEDIA_LIMITS } = require("../adapters/remote-media.cjs");

const SEGMENT_LIMITS = Object.freeze({
  futureToleranceMs: 3000,
  minClipBytes: 1,
  maxClipBytes: 20000000,
  maxAudioBytes: REMOTE_MEDIA_LIMITS.maxAudioBytes,
  minFrames: REMOTE_MEDIA_LIMITS.minFrames,
  maxFrames: 8,
  maxFrameDataUrlLength: 1000000,
  frameToleranceMs: 100,
});

function validateCapturedSegment(input, { now }) {
  if (
    !input ||
    !Number.isFinite(input.startMs) ||
    !Number.isFinite(input.endMs) ||
    input.endMs > now + SEGMENT_LIMITS.futureToleranceMs
  )
    throw refusal(400, "Horodatage de capture invalide.", "invalid-captured-segment");
  if (
    !(input.clip instanceof Uint8Array) ||
    input.clip.byteLength < SEGMENT_LIMITS.minClipBytes ||
    input.clip.byteLength > SEGMENT_LIMITS.maxClipBytes
  )
    throw refusal(400, "Segment vidéo trop volumineux ou vide.", "invalid-captured-segment");
  if (
    input.audio &&
    (!(input.audio instanceof Uint8Array) || input.audio.byteLength > SEGMENT_LIMITS.maxAudioBytes)
  )
    throw refusal(400, "Audio invalide.", "invalid-captured-segment");
  validateCapturedFrames(input);
}

function validateCapturedFrames(input) {
  if (
    !Array.isArray(input.frames) ||
    input.frames.length < SEGMENT_LIMITS.minFrames ||
    input.frames.length > SEGMENT_LIMITS.maxFrames ||
    input.frames.some(
      (f) =>
        typeof f.dataUrl !== "string" ||
        f.dataUrl.length > SEGMENT_LIMITS.maxFrameDataUrlLength ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(f.dataUrl) ||
        !Number.isFinite(f.atMs) ||
        f.atMs < input.startMs - SEGMENT_LIMITS.frameToleranceMs ||
        f.atMs > input.endMs + SEGMENT_LIMITS.frameToleranceMs,
    )
  )
    throw refusal(400, "Images de capture invalides.", "invalid-captured-segment");
}

module.exports = { SEGMENT_LIMITS, validateCapturedSegment };
