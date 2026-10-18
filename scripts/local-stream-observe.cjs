const { LocalVlmAgent } = require('../adapters/local-vlm-agent.cjs');
const { CodexAnalysisAgent } = require('../adapters/codex-analysis-agent.cjs');

function questionIdentity(agent) {
  const value = agent.identity;
  if (!value) return { kind: 'unknown' };
  const keys = ['role', 'kind', 'model', 'host', 'numCtx', 'keepAlive', 'temperature', 'reasoningEffort', 'transport'];
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
function analysisIdentity(perception) {
  const agent = perception.agent;
  if (agent instanceof LocalVlmAgent) return { kind: 'ollama', model: agent.model, host: agent.host,
    numCtx: agent.numCtx ?? null, keepAlive: agent.keepAlive };
  if (agent instanceof CodexAnalysisAgent) return { kind: 'codex', model: perception.model };
  return { kind: 'unknown', model: perception.model ?? null };
}
function guard(report, code, entry) {
  const failure = { code, ...(entry ? { upload: entry.sequence } : {}) };
  report.guardFailures.push(failure);
  return Object.assign(Error('Configuration effective incompatible avec la mesure déclarée.'), { code });
}
function roleCalled(role, identity) {
  role.exercised = true;
  role.calls++;
  if (identity) role.identity = structuredClone(identity);
}
function observedVisual(result, role, record, report, entry) {
  record.identity = result.metrics?.backend || role.identity;
  role.observedIdentity = result.metrics?.backend ?? null;
  // Une qualification invalide reste dans le rapport ; elle ne doit pas devenir une panne du produit.
  if (role.configured === 'local' && result.metrics?.backend?.kind !== 'ollama')
    guard(report, 'TVLENS_REPLAY_PERCEPTION_IDENTITY_INVALID', entry);
}
function recordLanguage(roleName, record, entry, report, readLanguage) {
  if (roleName !== 'transcription') return;
  record.language = readLanguage();
  if (entry && record.language !== entry.language)
    guard(report, 'TVLENS_REPLAY_TRANSCRIPTION_LANGUAGE_MISMATCH', entry);
}
function instrumentPerception(session, report, writer, clock, lifetime, readLanguage) {
  const roles = report.roles, perception = session.perception;
  for (const [method, roleName] of [['observeVisual', 'perception'], ['transcribe', 'transcription']]) {
    const call = perception[method].bind(perception);
    perception[method] = async input => {
      const entry = report.uploads.find(item => item.startMs === input.startMs && item.endMs === input.endMs);
      const role = roles[roleName];
      roleCalled(role);
      const record = { identity: role.identity, origin: role.origin, startedAtMs: clock.now(), status: 'running' };
      if (entry) entry.roles[roleName] = record;
      writer.save();
      try {
        recordLanguage(roleName, record, entry, report, readLanguage);
        const result = await call(input);
        if (lifetime.sealed) return result;
        if (roleName === 'perception') observedVisual(result, role, record, report, entry);
        record.status = 'returned';
        return result;
      } catch (error) {
        if (!lifetime.sealed) {
          record.status = 'error';
          record.code = error.code || 'TVLENS_REPLAY_PROVIDER_ERROR';
        }
        throw error;
      } finally {
        if (!lifetime.sealed) { record.finishedAtMs = clock.now(); writer.save(); }
      }
    };
  }
}
function observeTools(input, called, lifetime, roles) {
  called.roles = {};
  const call = input.tools.call.bind(input.tools);
  input.tools.call = async (...args) => {
    const result = await call(...args);
    if (!lifetime.sealed && args[0] === 'search_moments') {
      called.roles.embeddings = { requested: true, exercised: result.mode === 'hybrid',
        identity: result.embeddings ?? null, mode: result.mode, providerRequests: null };
      if (result.mode === 'hybrid') {
        roles.embeddings.exercised = true;
        roles.embeddings.observedIdentity = result.embeddings;
      }
    }
    return result;
  };
}
function questionOrigin(options, backend) {
  if (options.agent) return 'injected';
  if (backend === 'local' && options.LocalAgent || backend === 'codex' && options.CodexAgent) return 'substituted';
  return 'composed';
}
function observeSurveillance(runtime, role) {
  const metrics = runtime.surveillance.snapshot().metrics;
  if (!metrics) return;
  role.calls = Math.max(role.calls, metrics.detect.calls + metrics.verify.lots);
  role.exercised = role.calls > 0;
}
function observeHost(host, report, writer, options) {
  const { runtime, clock } = host, { session } = runtime, roles = report.roles;
  const overrides = options.overrides || {};
  Object.assign(roles.perception, { origin: overrides.perception ? 'injected' : 'composed', identity: analysisIdentity(session.perception) });
  Object.assign(roles.questions, { origin: questionOrigin(options, roles.questions.configured), identity: questionIdentity(runtime.agent),
    web: roles.questions.configured === 'local' ? 'indisponible ; outils vidéo seulement' : 'capacité Codex' });
  Object.assign(roles.embeddings, { origin: overrides.embeddings ? 'injected' : 'composed', identity: session.search.embeddingDiagnostics });
  roles.embeddings.calls = roles.embeddings.identity.enabled ? null : 0;
  Object.assign(roles.inspection, { origin: options.localInspection ? 'simulated' : 'composed', identity: session.inspector.identity });
  Object.assign(roles.transcription, { origin: options.transcriber ? 'injected' : 'composed',
    identity: { kind: options.transcriber ? 'injected' : 'whisper', availability: runtime.transcriber.availability(),
      model: runtime.transcriber.model ?? null, binary: runtime.transcriber.binary ?? null } });
  Object.assign(roles.surveillance, { origin: options.surveillanceAgent ? 'injected' : 'composed',
    identity: { kind: options.surveillanceAgent ? 'unknown' : 'codex', model: runtime.options.selectedModels.codexModel } });
  if (roles.questions.configured === 'local' && roles.questions.identity.kind !== 'ollama')
    throw guard(report, 'TVLENS_REPLAY_QUESTIONS_IDENTITY_INVALID');
  const lifetime = { sealed: false };
  instrumentPerception(session, report, writer, clock, lifetime, () => runtime.options.config.transcriptionLanguage);
  const answer = runtime.agent.answer.bind(runtime.agent);
  const invoked = new Map();
  runtime.agent.answer = input => {
    if (lifetime.sealed) return answer(input);
    roleCalled(roles.questions);
    roles.questions.observedIdentity = questionIdentity(runtime.agent);
    const called = { exercised: true, identity: questionIdentity(runtime.agent), origin: roles.questions.origin };
    observeTools(input, called, lifetime, roles);
    invoked.set(input.jobId, called);
    return answer(input);
  };
  const inspect = session.inspector.inspect.bind(session.inspector);
  session.inspector.inspect = async input => {
    roles.inspection.calls++;
    return inspect({ ...input, onDiagnostic: diagnostic => {
      if (!lifetime.sealed && diagnostic.modelCalled) {
        roles.inspection.exercised = true;
        roles.inspection.observedIdentity = diagnostic;
      }
      input.onDiagnostic?.(diagnostic);
    } });
  };
  const search = session.search.search.bind(session.search);
  session.search.search = async input => {
    roles.embeddings.searches = (roles.embeddings.searches || 0) + 1;
    return search(input);
  };
  let latest = runtime.snapshot(), wake = () => {};
  function refresh(state = runtime.snapshot()) {
    if (lifetime.sealed) return;
    latest = state;
    observeSurveillance(runtime, roles.surveillance);
    if (state.index) {
      roles.embeddings.indexEvidence = state.index;
      if (state.index.indexed > 0 || state.index.failed > 0) {
        roles.embeddings.exercised = true;
        roles.embeddings.observedIdentity = roles.embeddings.identity;
      }
    }
    for (const entry of report.questions) {
      const job = state.chat.jobs.find(item => item.id === entry.jobId);
      if (!job) continue;
      Object.assign(entry, { status: job.status, result: structuredClone(job.result), metrics: structuredClone(job.metrics ?? null),
        effectiveBackend: job.metrics?.backend || { configured: roles.questions.configured, identity: roles.questions.identity,
          origin: roles.questions.origin }, called: structuredClone(invoked.get(job.id) || { exercised: false }),
        roles: structuredClone(invoked.get(job.id)?.roles || {}) });
      if (job.errorDetail) entry.error = job.errorDetail;
    }
    writer.save();
    wake();
  }
  runtime.listeners.add(refresh);
  return { refresh, get state() { return latest; }, onWake(fn) { wake = fn; }, detach() {
    lifetime.sealed = true;
    runtime.listeners.delete(refresh);
    wake = () => {};
  } };
}
module.exports = { observeHost, roleCalled };
