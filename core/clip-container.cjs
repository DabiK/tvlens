// What a stored clip holds, read from its container alone: no decoder, no size rule.
// A WebM recorder that received sound but no video frame still writes a valid header and nothing else (seen on
// a saturated Mac: 110 bytes for a 2 s passage). The file exists, plays nowhere, and its size proves nothing by
// itself. The test here is structural: a Matroska/WebM cluster carrying at least one block.
// It answers "is this container empty?", never "will this clip decode?": a damaged clip that still holds blocks is
// only found out when it is replayed or re-examined.
const EBML = 0x1a45dfa3, SEGMENT = 0x18538067, CLUSTER = 0x1f43b675, SIMPLE_BLOCK = 0xa3, BLOCK_GROUP = 0xa0;

// Element identifier: 1 to 4 bytes, the leading bits of the first one give the length and stay in the value.
function readId(bytes, at) {
  const first = bytes[at];
  const length = first & 0x80 ? 1 : first & 0x40 ? 2 : first & 0x20 ? 3 : first & 0x10 ? 4 : 0;
  if (!length || at + length > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + bytes[at + i];
  return { id, length };
}
// Element size: 1 to 8 bytes, length marker removed. All data bits set means "unknown", what a live recorder writes.
function readSize(bytes, at) {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;
  let length = 1, marker = 0x80;
  while (!(first & marker)) { length++; marker >>= 1; }
  if (at + length > bytes.length) return null;
  let value = first & (marker - 1), unknown = value === marker - 1;
  for (let i = 1; i < length; i++) { if (bytes[at + i] !== 0xff) unknown = false; value = value * 256 + bytes[at + i]; }
  return { size: unknown ? Infinity : value, length };
}
const onlyPadding = (bytes, from, to) => { for (let i = from; i < to; i++) if (bytes[i] !== 0) return false; return true; };

// 'block' as soon as a cluster holds one, 'none' when the whole range was walked without any, 'unknown' when the
// range cannot be walked to its end.
function walk(bytes, from, to, inCluster) {
  let at = from;
  while (at < to) {
    const id = readId(bytes, at), size = id && readSize(bytes, at + id.length);
    // Zeros after the last element are padding, not content. Anything else unread is not ours to judge.
    if (!size) return onlyPadding(bytes, at, to) ? 'none' : 'unknown';
    const start = at + id.length + size.length, end = Math.min(to, start + size.size);
    if (inCluster && (id.id === SIMPLE_BLOCK || id.id === BLOCK_GROUP) && size.size > 0) return 'block';
    // A cluster header met inside a cluster of unknown size is the next cluster: read on as its sibling, so that the
    // depth never exceeds segment then cluster whatever the file holds.
    if (id.id === CLUSTER && inCluster) { at = start; continue; }
    if (id.id === SEGMENT || id.id === CLUSTER) {
      const inside = walk(bytes, start, end, id.id === CLUSTER);
      if (inside !== 'none') return inside;
    } else if (size.size === Infinity) return 'unknown';
    at = end;
  }
  return 'none';
}

/**
 * Whether a clip holds media, as far as its container says.
 * @param {Uint8Array|ArrayBuffer|null|undefined} clip
 * @returns {boolean|null} false: zero bytes, or a Matroska/WebM container without a single media block;
 *   true: a cluster carries a block; null: no bytes given, not a Matroska/WebM container, or one that cannot be
 *   walked — nothing is claimed about it.
 */
function holdsMedia(clip) {
  const bytes = clip instanceof Uint8Array ? clip : clip instanceof ArrayBuffer ? new Uint8Array(clip) : null;
  if (!bytes) return null;
  if (!bytes.length) return false;
  const head = readId(bytes, 0);
  if (!head || head.id !== EBML) return null;
  const found = walk(bytes, 0, bytes.length, false);
  return found === 'unknown' ? null : found === 'block';
}

module.exports = { holdsMedia };
