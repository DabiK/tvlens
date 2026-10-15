import { describeControls } from "./controls-view.mjs";

const FLOAT_STATUS = {
  live: "En direct",
  archive: "Archive en lecture seule",
  paused: "En pause",
  ready: "Prêt",
};
const RECORD_TITLE = {
  recording: "Mettre en pause ; mémoire et fil Codex conservés",
  archive: "Reprendre la capture dans cette archive",
  idle: "Choisir une source puis lancer la capture et l’analyse",
};
const OBSERVE_LABEL = {
  recording: "Observation en cours",
  archive: "Reprendre la capture…",
  paused: "Reprendre l’observation",
  idle: "Lancer l’observation",
};
const ASK_STATUS = {
  answering: "Réponse en cours · Tu peux ajouter une question.",
  archive: "Archive · Tu peux poser des questions sur ce qui a été enregistré.",
  ready: "Entrée pour envoyer · Maj+Entrée pour une ligne",
  waiting: "Les premiers passages arrivent bientôt.",
  idle: "Choisis une source et lance TVLens.",
};
export function renderCaptureControls({
  get,
  shell,
  capture,
  session,
  ...input
}) {
  shell.observation(session, capture.recording);
  const controls = describeControls({
    session,
    recording: capture.recording,
    previewOpen: capture.previewOpen,
    stopping: capture.stopping,
    captureBusy: input.captureBusy,
    quickBusy: input.quickBusy,
    configuration: input.configuration,
    verificationBusy: input.verificationBusy,
    pendingQuestion: input.pendingQuestion,
    source: get("source").value,
  });
  for (const [id, disabled] of Object.entries(controls.disabled))
    get(id).disabled = disabled;
  get("float-record").classList.toggle("recording", controls.recording);
  get("float-status").textContent = FLOAT_STATUS[controls.floatStatus];
  get("float-record").title = RECORD_TITLE[controls.recordTitle];
  get("observe").textContent = OBSERVE_LABEL[controls.observeLabel];
  get("ask-status").textContent = ASK_STATUS[controls.askStatus];
}
