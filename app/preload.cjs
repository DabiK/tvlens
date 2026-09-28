const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('capture', {
  sources: () => ipcRenderer.invoke('capture:sources'),
  select: id => ipcRenderer.invoke('capture:select', id),
  settings: () => ipcRenderer.invoke('capture:settings')
});
contextBridge.exposeInMainWorld('tvlens', {
  autoState:()=>ipcRenderer.invoke('auto:state'),
  startAuto:value=>ipcRenderer.invoke('auto:start',value),
  stopAuto:()=>ipcRenderer.invoke('auto:stop'),
  openAutoSource:(id,index)=>ipcRenderer.invoke('auto:open-source',{id,index}),
  onAuto:listener=>ipcRenderer.on('auto:state',(_e,state)=>listener(state)),
  keepMoment:()=>ipcRenderer.invoke('saved:keep'),
  savedMoments:()=>ipcRenderer.invoke('saved:list'),
  removeSaved:id=>ipcRenderer.invoke('saved:remove',id),
  searchMoments:query=>ipcRenderer.invoke('moments:search',query),
  viewingSettings:()=>ipcRenderer.invoke('viewing:get'),
  saveViewingSettings:value=>ipcRenderer.invoke('viewing:save',value),
  quota:()=>ipcRenderer.invoke('codex:quota'),
  onSaved:listener=>ipcRenderer.on('saved:changed',listener),
  onSaveError:listener=>ipcRenderer.on('saved:error',(_e,message)=>listener(message)),
  windowMode: value => ipcRenderer.invoke('window:mode',value),
  modelChoices: () => ipcRenderer.invoke('models:choices'),
  models: () => ipcRenderer.invoke('models:get'),
  saveModels: value => ipcRenderer.invoke('models:save',value),
  openChatSource: (jobId,index) => ipcRenderer.invoke('deep:open-source',{jobId,index}),
  config: () => ipcRenderer.invoke('app:config'),
  importConfig: () => ipcRenderer.invoke('app:import-config'),
  newSession: () => ipcRenderer.invoke('watch:new'),
  onReset: listener => ipcRenderer.on('watch:reset',listener),
  start: () => ipcRenderer.invoke('watch:start'),
  ingest: input => ipcRenderer.invoke('watch:ingest', input),
  stop: () => ipcRenderer.invoke('watch:stop'),
  ask: question => ipcRenderer.invoke('watch:ask', question),
  deepen: question => ipcRenderer.invoke('deep:ask', question),
  deepState: () => ipcRenderer.invoke('deep:state'),
  researchBudget: () => ipcRenderer.invoke('deep:budget'),
  cancelDeep: id => ipcRenderer.invoke('deep:cancel', id),
  onDeepState: listener => {
    const callback = (_event, state) => listener(state);
    ipcRenderer.on('deep:state', callback);
    return () => ipcRenderer.removeListener('deep:state', callback);
  },
  verify: claim => ipcRenderer.invoke('verify:run', { claim }),
  verificationState: () => ipcRenderer.invoke('verify:state'),
  cancelVerification: () => ipcRenderer.invoke('verify:cancel'),
  openSource: (jobId, index) => ipcRenderer.invoke('verify:open-source', { jobId, index }),
  onVerificationState: listener => {
    const callback = (_event, state) => listener(state);
    ipcRenderer.on('verify:state', callback);
    return () => ipcRenderer.removeListener('verify:state', callback);
  },
  state: () => ipcRenderer.invoke('watch:state'),
  onState: listener => {
    const callback = (_event, state) => listener(state);
    ipcRenderer.on('watch:state', callback);
    return () => ipcRenderer.removeListener('watch:state', callback);
  }
});
