const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');
const { EMBEDDING_MODEL } = require('../openrouter-embeddings.cjs');
const TVLENS_EMBEDDINGS_IDENTITY_REQUIRED = 'TVLENS_EMBEDDINGS_IDENTITY_REQUIRED';
const TVLENS_EMBEDDINGS_IDENTITY_CHANGED = 'TVLENS_EMBEDDINGS_IDENTITY_CHANGED';
const HISTORICAL_IDENTITY = { backend: 'openrouter', model: EMBEDDING_MODEL, parameters: { encodingFormat: 'float' } };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function providerIdentity(provider, root) {
  const identity = provider.identity;
  if (!identity || typeof identity.backend !== 'string' || !identity.backend || typeof identity.model !== 'string' || !identity.model) {
    throw Object.assign(Error('Une identité explicite est requise pour le fournisseur d’embeddings.'), { code: TVLENS_EMBEDDINGS_IDENTITY_REQUIRED });
  }
  const serialized = JSON.stringify(canonical(identity));
  const unknown = identity.backend === 'ollama' && !identity.revision;
  const space = unknown ? JSON.stringify({ serialized, instance: randomUUID() }) : serialized;
  const hash = createHash('sha256').update(space).digest('hex');
  const historical = serialized === JSON.stringify(canonical(HISTORICAL_IDENTITY));
  const assertIdentity = identityGuard(provider, serialized);
  return {
    model: historical ? EMBEDDING_MODEL : space,
    file: path.join(root, historical ? 'embeddings.json' : `embeddings-${hash}.json`),
    diagnostic: Object.freeze({ enabled: true, backend: identity.backend, model: identity.model, identity: hash }),
    assertIdentity,
    provider: boundProvider(provider, assertIdentity),
    identityScoped: !historical,
  };
}
function boundProvider(provider, assertIdentity) {
  return new Proxy(provider, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (!['embed', 'embedMany'].includes(key) || typeof value !== 'function') return value;
      return async (...args) => {
        assertIdentity();
        const result = await value.apply(target, args);
        assertIdentity();
        return result;
      };
    },
  });
}
function identityChanged() {
  return Object.assign(Error('Identité des embeddings modifiée : un nouvel index est requis.'), { code: TVLENS_EMBEDDINGS_IDENTITY_CHANGED });
}
function identityGuard(provider, serialized) {
  let changed = false;
  return () => {
    provider.assertIdentity?.();
    changed ||= JSON.stringify(canonical(provider.identity)) !== serialized;
    if (changed) throw identityChanged();
  };
}
module.exports = { providerIdentity, HISTORICAL_IDENTITY, identityChanged,
  TVLENS_EMBEDDINGS_IDENTITY_REQUIRED, TVLENS_EMBEDDINGS_IDENTITY_CHANGED };
