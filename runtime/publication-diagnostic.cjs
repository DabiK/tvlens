const { safeError } = require('../adapters/chat-trace.cjs');

// Le journal reste actif sans option de trace fournisseur ; aucun détail brut ne part vers les clients.
function createPublicationDiagnostic(log = line => process.stderr.write(`${line}\n`)) {
  return ({ error, ...context }) => log(JSON.stringify({ ...context, error: safeError(error) }));
}

module.exports = { createPublicationDiagnostic };
