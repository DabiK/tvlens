// Why a passage has no video to replay, said to the agent only where it changes what it can do: an unreadable video
// is still re-examined, on the images kept at capture. An expired or missing one is not, and looks as it always did.
const mediaEvidenceFields = s => {
  if (s.hasImages === false) return { hasImages: false, mediaReason: 'images-absent' };
  return s.mediaReason === 'unreadable' ? { mediaReason: 'unreadable' } : {};
};
module.exports = { mediaEvidenceFields };
