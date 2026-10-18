const TVLENS_LOCAL_THINK_INVALID = 'TVLENS_LOCAL_THINK_INVALID';

function normalizeThink(value = 'default', setting) {
  if (typeof setting !== 'string' || !setting) {
    throw Object.assign(Error('Nom du réglage de raisonnement requis.'), { code: TVLENS_LOCAL_THINK_INVALID });
  }
  if (!['default', 'on', 'off'].includes(value)) {
    throw Object.assign(Error(`${setting} : valeur attendue default, on ou off.`), { code: TVLENS_LOCAL_THINK_INVALID });
  }
  return value;
}

function thinkParameter(value) {
  return value === 'default' ? {} : { think: value === 'on' };
}

function countThinking(data, usage) {
  if (typeof data?.message?.thinking === 'string') {
    usage.thinkingChars = (usage.thinkingChars ?? 0) + data.message.thinking.length;
  }
}

module.exports = { normalizeThink, thinkParameter, countThinking, TVLENS_LOCAL_THINK_INVALID };
