const { createSessionPerception } = require('../runtime/session-providers.cjs');
const { sha256 } = require('./perception-replay-input.cjs');

function observeFrameReads(loaded) {
  const selected = [];
  // La perception lit dataUrl seulement sur les images qu'elle transmet. Observer ces lectures
  // distingue aussi deux images identiques sans reproduire sa politique de sélection.
  const frames = loaded.segment.frames.map((frame, index) => ({ atMs: frame.atMs, get dataUrl() {
    selected.push({ identity: loaded.input.frames[index], url: frame.dataUrl });
    return frame.dataUrl;
  } }));
  return { frames, selected };
}
function instrument(perception, selected, entry, writer, signal, onResponse) {
  const answer = perception.agent.answer.bind(perception.agent);
  const diagnosticIndices = new WeakMap();
  perception.agent.answer = async input => {
    signal?.throwIfAborted();
    if (selected.length !== input.mediaInput.length || selected.some((frame, i) => frame.url !== input.mediaInput[i].url))
      throw Object.assign(Error('Sélection d’images inconnue.'), { code: 'TVLENS_REPLAY_SELECTION_INVALID' });
    entry.request = { instructions: input.instructions, outputSchema: input.outputSchema,
      frames: selected.map(frame => frame.identity),
      promptSha256: sha256(input.instructions) };
    await writer.save();
    signal?.throwIfAborted();
    const response = await answer({ ...input, onDiagnostic: diagnostic => {
      if (signal?.aborted) return;
      // L'agent enrichit une même mesure après lecture des durées fournisseur.
      // Remplacer sa copie conserve une seule ligne comptable par requête HTTP.
      if (!diagnosticIndices.has(diagnostic)) diagnosticIndices.set(diagnostic, entry.diagnostics.length);
      entry.diagnostics[diagnosticIndices.get(diagnostic)] = structuredClone(diagnostic);
      writer.save();
      input.onDiagnostic?.(diagnostic);
    } });
    onResponse();
    return response;
  };
}
// La course traite aussi un agent qui ignore le signal et rend une réponse tardive.
function abortable(work, signal) {
  if (!signal) return work;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function failure(error, signal, responseReceived) {
  if (signal?.aborted) return { status: 'cancelled', error: { code: 'TVLENS_REPLAY_CANCELLED' } };
  const code = error?.code || (responseReceived ? 'TVLENS_REPLAY_RESPONSE_INVALID' : 'TVLENS_REPLAY_PROVIDER_ERROR');
  const refused = error?.authRequired || /_(INPUT_REFUSED|CONFINEMENT_REFUSED|TOOL_REFUSED|SESSION_CLOSED|ROLE_REFUSED)$/.test(code)
    || (Number.isInteger(error?.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 499);
  return { status: refused ? 'refused' : 'error', error: failureDetails(error, code) };
}
function failureDetails(error, code) {
  const details = { code };
  if (Number.isInteger(error?.httpStatus)) details.httpStatus = error.httpStatus;
  if (typeof error?.cause?.code === 'string') {
    details.cause = { code: error.cause.code };
    if (Number.isInteger(error.cause.httpStatus)) details.cause.httpStatus = error.cause.httpStatus;
  }
  return details;
}
async function executeCase(options, dependencies, loaded, entry, writer, report) {
  const { signal } = options;
  let perception, responseReceived = false;
  entry.backend = options.backend;
  entry.status = 'running';
  entry.diagnostics = [];
  await writer.save();
  try {
    signal?.throwIfAborted();
    perception = createSessionPerception({ id: report.runId + '-' + entry.index,
      config: { perceptionBackend: options.backend,
        localVlm: { url: options.url, model: options.model, numCtx: options.numCtx, keepAlive: options.keepAlive } },
      selectedModels: { observationModel: options.model }, codexBinary: options.codexBinary,
      smoke: false, liveObservation: true, overrides: {},
    }, dependencies.providerDependencies);
    if (options.backend === 'local') {
      const agent = perception.agent;
      Object.assign(report.config, { model: agent.model, host: agent.host, numCtx: agent.numCtx ?? null, keepAlive: agent.keepAlive ?? null });
    }
    entry.config = { ...report.config };
    const observed = observeFrameReads(loaded);
    instrument(perception, observed.selected, entry, writer, signal, () => { responseReceived = true; });
    const result = await abortable(perception.observeVisual({ ...loaded.segment, frames: observed.frames, signal }), signal);
    signal?.throwIfAborted();
    entry.result = result;
    entry.status = 'succeeded';
  } catch (error) {
    // La validation produit peut échouer après une réponse ; elle n'a pas toujours de code public.
    Object.assign(entry, failure(error, signal, responseReceived));
  } finally {
    try { await writer.save(); }
    finally {
      if (perception) {
        try { await perception.close(); }
        catch { entry.closeError = { code: 'TVLENS_REPLAY_CLOSE_FAILED' }; }
      }
    }
    await writer.save();
  }
}
module.exports = { executeCase };
