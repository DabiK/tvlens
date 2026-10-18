const { TVLENS_MEMORY_MEDIA_UNAVAILABLE } = require('../core/memory/index.cjs');
const { domainError } = require('../core/shared/domain-error.cjs');

const unavailable = () => domainError(TVLENS_MEMORY_MEDIA_UNAVAILABLE, 'Média indisponible pour cette consultation.');

/** @returns {import('../core/memory/index.cjs').MemoryMediaPort} */
function createMemoryMedia(store) {
  return {
    async read(id) {
      try {
        const data = await store.read(id);
        return {
          frames: data.frames.map(({ atMs, dataUrl }) => ({ atMs, dataUrl })),
          audio: data.audio ? new Uint8Array(data.audio) : null,
        };
      } catch {
        throw unavailable();
      }
    },
    async lease(ids) {
      try {
        const release = await store.lease([...ids]);
        let releasing;
        return () => {
          releasing ??= Promise.resolve().then(release).catch(() => { throw unavailable(); });
          return releasing;
        };
      } catch {
        throw unavailable();
      }
    },
  };
}

module.exports = { createMemoryMedia };
