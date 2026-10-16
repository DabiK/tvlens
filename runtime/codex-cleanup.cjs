const path = require('node:path');

function writeDiagnostic(log, finding) {
  try {
    Promise.resolve(log(JSON.stringify(finding))).catch(() => {});
  } catch {
    // Le journal ne participe pas à la décision de démarrer ni à celle de conserver un arbre.
  }
}

// Le balayeur vient de l'hôte : son remplacement dans les bancs reste la seule opération appelée.
async function cleanupCodexContexts({ sweep, root, log }) {
  const onDiagnostic = finding => writeDiagnostic(log, finding);
  try {
    const removed = await sweep(root, undefined, undefined, { onDiagnostic });
    for (const name of removed) {
      onDiagnostic({ code: 'TVLENS_CODEX_CLEANUP_REMOVED', candidate: path.join(root, name) });
    }
    return removed;
  } catch (error) {
    const systemCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code) ? error.code : 'UNKNOWN';
    onDiagnostic({ code: 'TVLENS_CODEX_CLEANUP_FAILED', candidate: root, operation: 'sweep', systemCode });
    return [];
  }
}

module.exports = { cleanupCodexContexts };
