function inspectionEvidence(diagnostic, clock, status) {
  const { role, backend, model, host, numCtx, cacheHit, modelCalled, metrics, failure } = diagnostic;
  return { atMs: clock.now(), identity: { role: role ?? null, backend: backend ?? null, model: model ?? null,
    host: host ?? null, numCtx: numCtx ?? null }, cacheHit: Boolean(cacheHit), modelCalled: Boolean(modelCalled),
    status, metrics: structuredClone(metrics ?? null), failure: failure ?? null };
}
function instrumentInspection(session, role, lifetime, clock) {
  const inspect = session.inspector.inspect.bind(session.inspector);
  session.inspector.inspect = async input => {
    if (lifetime.sealed) return inspect(input);
    role.calls++;
    let diagnostic = session.inspector.identity;
    const onDiagnostic = detail => {
      diagnostic = detail;
      if (!lifetime.sealed && detail.modelCalled) {
        role.exercised = true;
        role.observedIdentity = detail;
      }
      input.onDiagnostic?.(detail);
    };
    try {
      const result = await inspect({ ...input, onDiagnostic });
      if (!lifetime.sealed) {
        role.successful ||= result.inspection?.modelCalled === true;
        role.evidence.push(inspectionEvidence(result.inspection || diagnostic, clock, 'returned'));
      }
      return result;
    } catch (error) {
      if (!lifetime.sealed) {
        role.failures = (role.failures || 0) + 1;
        role.evidence.push(inspectionEvidence(diagnostic, clock, 'error'));
      }
      throw error;
    }
  };
}
function instrumentSearch(session, role, lifetime, clock) {
  const search = session.search.search.bind(session.search);
  session.search.search = async input => {
    if (lifetime.sealed) return search(input);
    role.searches = (role.searches || 0) + 1;
    const result = await search(input);
    if (!lifetime.sealed) {
      role.successful ||= result.mode === 'hybrid';
      role.evidence.push({ atMs: clock.now(), mode: result.mode, identity: result.embeddings ?? null,
        providerRequests: null, index: session.search.index?.status() ?? null });
    }
    return result;
  };
}
function instrumentTranscriber(transcriber, role, lifetime, clock) {
  const transcribe = transcriber.transcribe.bind(transcriber);
  transcriber.transcribe = async (...args) => {
    if (lifetime.sealed) return transcribe(...args);
    role.providerInvocations = (role.providerInvocations || 0) + 1;
    const record = { scope: 'transcriber', atMs: clock.now(), identity: role.identity, status: 'running', providerRequests: null };
    role.evidence.push(record);
    try {
      const result = await transcribe(...args);
      if (!lifetime.sealed) Object.assign(record, { status: result.metrics?.failed ? 'failed' : 'returned',
        cacheHit: Boolean(result.cacheHit), metrics: structuredClone(result.metrics ?? null) });
      return result;
    } catch (error) {
      if (!lifetime.sealed) Object.assign(record, { status: 'error', code: error.code || 'UNKNOWN' });
      throw error;
    } finally {
      if (!lifetime.sealed) record.finishedAtMs = clock.now();
    }
  };
}
function observeSurveillance(runtime, roles) {
  const metrics = runtime.surveillance.snapshot().metrics;
  if (!metrics) return;
  for (const [name, calls, evidence] of [['surveillanceDetection', metrics.detect.calls, metrics.detect],
    ['surveillanceWeb', metrics.verify.lots, metrics.verify]]) {
    const role = roles[name];
    role.calls = Math.max(role.calls, calls);
    role.exercised = role.calls > 0;
    if (calls > 0) role.callEvidence = structuredClone(evidence);
  }
  roles.surveillance.calls = roles.surveillanceDetection.calls + roles.surveillanceWeb.calls;
  roles.surveillance.exercised = roles.surveillance.calls > 0;
}
module.exports = { instrumentInspection, instrumentSearch, instrumentTranscriber, observeSurveillance };
