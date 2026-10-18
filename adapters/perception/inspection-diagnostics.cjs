// L'identité appartient à la composition, jamais au JSON produit par le modèle.
class InspectionDiagnostics {
  constructor(inner, identity) {
    this.inner = inner;
    this.identity = Object.freeze({ ...identity });
  }

  async inspect(input) {
    const inspection = { ...this.identity, exercised: false, modelCalled: false, cacheHit: false };
    const publish = () => input.onDiagnostic?.(structuredClone(inspection));
    publish();
    const onDiagnostic = detail => {
      if (detail.modelCalled === true) inspection.modelCalled = true;
      if (detail.exercised === true) inspection.exercised = true;
      if (detail.metrics) inspection.metrics = inspectionMetrics(detail.metrics);
      if (detail.failure) inspection.failure = { ...detail.failure };
      publish();
    };
    try {
      const result = await this.inner.inspect({ ...input, onDiagnostic });
      inspection.exercised = true;
      publish();
      return { ...result, inspection };
    } catch (error) {
      inspection.failure ||= { code: failureCode(error, input.signal) };
      publish();
      throw error;
    }
  }
}

// Ne calcule aucune mesure : filtre les métriques déjà fournies par l'agent.
function inspectionMetrics(metrics) {
  const result = {};
  if (metrics.clientTimings) result.clientTimings = numericFields(metrics.clientTimings, ['queueMs', 'requestMs']);
  if (metrics.providerTimings) {
    result.providerTimings = numericFields(metrics.providerTimings,
      ['totalMs', 'loadMs', 'promptEvalMs', 'evalMs', 'promptTokens', 'evalTokens']);
    if (metrics.providerTimings.rawNs) result.providerTimings.rawNs = numericFields(metrics.providerTimings.rawNs,
      ['total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration']);
  }
  if (metrics.modelState === 'unknown') result.modelState = 'unknown';
  return result;
}

function numericFields(value, keys) {
  return Object.fromEntries(keys.filter(key => Number.isFinite(value[key]) && value[key] >= 0).map(key => [key, value[key]]));
}

function failureCode(error, signal) {
  if (signal?.aborted) return 'TVLENS_INSPECTION_CANCELLED';
  return /^TVLENS_[A-Z0-9_]+$/.test(error?.code) ? error.code : 'TVLENS_INSPECTION_FAILED';
}

module.exports = { InspectionDiagnostics };
