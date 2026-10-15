/**
 * Pure rules of what the chat of the Mac window sends to the models: the claim taken from a text for the verification,
 * the question stripped of its prefix, and the request to go deeper into an answer. Nothing here touches the page or the host.
 */

const CLAIM_LIMIT = 2000;
const DEEPEN_LIMIT = 1200;
// que and si are dropped only as whole words: no letter, accented or not, may follow them (\b ignores accented letters).
const VERIFY_PREFIX = /^(?:\/verify\b|v[ée]rifie(?:r)?\b(?:\s+(?:que|si)(?!\p{L}))?|fact[- ]?check\b)\s*[:—-]?\s*/iu;
const BARE_REFERENCE = /^(?:ça|cela|cette affirmation|ce qu['’]il vient de dire)[.!?]?$/i;

/** The claim offered in the verification box: prefix removed, a bare reference emptied, at most CLAIM_LIMIT characters. */
export function claimFrom(text = '') {
  let claim = text.trim().replace(VERIFY_PREFIX, '').trim();
  if (BARE_REFERENCE.test(claim)) claim = '';
  return claim.slice(0, CLAIM_LIMIT);
}

/** The text stripped of its edge spaces and of its verification prefix, nothing else. */
export function withoutVerifyPrefix(text = '') {
  return text.trim().replace(VERIFY_PREFIX, '').trim();
}

/** The request that asks the models to go deeper into an answer, from its first DEEPEN_LIMIT characters. */
export function deepenRequest(answer) {
  return `Approfondis cette réponse : ${answer.slice(0, DEEPEN_LIMIT)}`;
}
