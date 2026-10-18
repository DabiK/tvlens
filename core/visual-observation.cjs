const VISUAL_TEXT_FIELDS = Object.freeze(['summary', 'visual', 'uncertainty', 'topic']);
const VISUAL_CONTINUITIES = Object.freeze(['continue', 'change', 'uncertain']);
const MAX_VISUAL_TEXT = 8000;

// La perception et le juge de langue doivent refuser les mêmes observations avant toute redemande.
function visualObservationIssue(output) {
  if (VISUAL_TEXT_FIELDS.some(field => typeof output[field] !== 'string' || output[field].length > MAX_VISUAL_TEXT)) return 'text';
  if (output.continuity !== undefined && !VISUAL_CONTINUITIES.includes(output.continuity)) return 'continuity';
  return null;
}

module.exports = { VISUAL_TEXT_FIELDS, VISUAL_CONTINUITIES, visualObservationIssue };
