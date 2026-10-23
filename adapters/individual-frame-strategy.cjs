const { domainError } = require('../core/shared/domain-error.cjs');
const { selectFrames } = require('./frame-selection.cjs');

const MAX_INSPECTION_IMAGES = 12;
const MAX_INSPECTION_DIMENSION = 1280;
const TOO_MANY_PASSAGES = 'TVLENS_INSPECTION_TOO_MANY_PASSAGES';
const NO_CANDIDATE_IMAGES = 'TVLENS_INSPECTION_NO_CANDIDATE_IMAGES';

// Spend the request budget on readable images, preserving each passage's time coverage.
class IndividualFrameStrategy {
  name = 'frames-diverse';
  diverse = true;
  extractionScale = `scale='min(${MAX_INSPECTION_DIMENSION},iw)':'min(${MAX_INSPECTION_DIMENSION},ih)'` +
    ':force_original_aspect_ratio=decrease:force_divisible_by=2';

  async prepare({ segments, signal }) {
    if (segments.length > MAX_INSPECTION_IMAGES)
      throw domainError(TOO_MANY_PASSAGES, 'Trop de passages pour les images de réexamen.');
    let remaining = MAX_INSPECTION_IMAGES;
    const prepared = [];
    for (const [index, segment] of segments.entries()) {
      signal?.throwIfAborted();
      if (!segment.frames.length) throw domainError(NO_CANDIDATE_IMAGES, 'Aucune image candidate pour le passage.');
      const count = Math.min(segment.frames.length, Math.floor(remaining / (segments.length - index)));
      // The diverse selector retains both endpoints; a single slot must stay a single image.
      const frames = count === 1 ? [segment.frames[0]] :
        await selectFrames(segment.frames, count, { diverse: true, signal });
      remaining -= frames.length;
      prepared.push({ ...segment, frames });
    }
    return {
      segments: prepared,
      cost: 0,
      metadata: {
        selectionCalls: 0,
        selection: 'pixel-delta + temporal anchors',
        format: 'individual-images',
        maxImages: MAX_INSPECTION_IMAGES,
        images: MAX_INSPECTION_IMAGES - remaining,
        maxDimension: MAX_INSPECTION_DIMENSION,
        selectedTimes: prepared.map(segment => ({ id: segment.id, times: segment.frames.map(frame => frame.atMs) })),
      },
    };
  }
}

module.exports = { IndividualFrameStrategy };
