const { contextBridge, ipcRenderer } = require('electron');
// Electron wraps every rejection of a handler in an English prefix followed by the error's class name:
// the viewer only reads our own message. Only that exact prefix is removed; an "Error:" further in a
// message stays as written.
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch(error => {
  throw new Error(String(error?.message || error).replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''));
});
// Every subscription hands back its own removal, and the listener receives the payload, never the IPC event.
const on = channel => listener => {
  const callback = (_event, value) => listener(value);
  ipcRenderer.on(channel, callback);
  return () => ipcRenderer.removeListener(channel, callback);
};
// The startup window can only choose whether to restore its settings; it cannot drive the application.
if (process.argv.includes('--config-welcome')) {
  contextBridge.exposeInMainWorld('configuration', { choose: action => invoke('config:welcome', action) });
} else {
contextBridge.exposeInMainWorld('capture', {
  sources: () => invoke('capture:sources'),
  select: id => invoke('capture:select', id),
  settings: () => invoke('capture:settings')
});
contextBridge.exposeInMainWorld('tvlens', {
  freezeMoment: value => invoke('moments:freeze', value),
  explainMoment: value => invoke('moments:explain', value),
  reexamineMoment: jobId => invoke('moments:reexamine', jobId),
  catchUp: value => invoke('moments:catch-up', value),
  markAttention: () => invoke('moments:mark'),
  momentShortcuts: () => invoke('moments:shortcuts'),
  onExplainMoment: on('moments:explain-requested'),
  recapState: () => invoke('recap:state'),
  onRecap: on('recap:state'),
  // Free-instruction surveillance: runs alongside questions, never suspended by them.
  surveillanceState: () => invoke('surveillance:state'),
  surveillanceHistory: () => invoke('surveillance:history'),
  startSurveillance: value => invoke('surveillance:start', { instruction: value?.instruction }),
  stopSurveillance: () => invoke('surveillance:stop'),
  retrySurveillanceClaim: claimId => invoke('surveillance:retry', claimId),
  openSurveillanceSource: (lotId, index) => invoke('surveillance:open-source', { lotId, index }),
  onSurveillance: on('surveillance:state'),
  // Durable sessions: an archive opens read-only; capture only comes back through resumeSession().
  sessions: () => invoke('sessions:list'),
  openSession: id => invoke('sessions:open', id),
  resumeSession: () => invoke('sessions:resume'),
  deleteSession: id => invoke('sessions:delete', id),
  storage: () => invoke('sessions:storage'),
  onSessionsChanged: on('sessions:changed'),
  onStorage: on('storage:state'),
  keepMoment: () => invoke('saved:keep'),
  savedMoments: () => invoke('saved:list'),
  removeSaved: id => invoke('saved:remove', id),
  searchMoments: query => invoke('moments:search', query),
  viewingSettings: () => invoke('viewing:get'),
  saveViewingSettings: value => invoke('viewing:save', value),
  quota: () => invoke('codex:quota'),
  onSaved: on('saved:changed'),
  onSaveError: on('saved:error'),
  windowMode: value => invoke('window:mode', value),
  modelChoices: () => invoke('models:choices'),
  models: () => invoke('models:get'),
  saveModels: value => invoke('models:save', value),
  openChatSource: (jobId, index) => invoke('deep:open-source', { jobId, index }),
  config: () => invoke('app:config'),
  setupStatus: () => invoke('setup:status'),
  setupChoose: key => invoke('setup:choose', key),
  setupAction: name => invoke('setup:action', name),
  importConfig: () => invoke('app:import-config'),
  newSession: () => invoke('watch:new'),
  onReset: on('watch:reset'),
  start: () => invoke('watch:start'),
  ingest: input => invoke('watch:ingest', input),
  stop: () => invoke('watch:stop'),
  ask: question => invoke('watch:ask', question),
  deepen: question => invoke('deep:ask', question),
  deepState: () => invoke('deep:state'),
  researchBudget: () => invoke('deep:budget'),
  cancelDeep: id => invoke('deep:cancel', id),
  onDeepState: on('deep:state'),
  verify: claim => invoke('verify:run', { claim }),
  verificationState: () => invoke('verify:state'),
  cancelVerification: () => invoke('verify:cancel'),
  openSource: (jobId, index) => invoke('verify:open-source', { jobId, index }),
  onVerificationState: on('verify:state'),
  state: () => invoke('watch:state'),
  onState: on('watch:state')
});
}
