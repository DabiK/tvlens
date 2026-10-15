/**
 * Pure model of the commands of the Mac window: which ones are switched off, whether the record button shows
 * a running capture, and which wording each text takes. It holds no sentence: the window keeps its phrases in
 * tables indexed by the modes returned here.
 * The expressions are the ones the window used to write itself, so a session state is read as it always was:
 * it carries its `segments` and its `history`, and one that does not makes the model throw.
 */
const hasId = session => Boolean(session?.id);
const isArchive = session => Boolean(session?.readOnly);
const isAnalyzing = session => Boolean(session?.analyzing);
const isAnswering = session => Boolean(session?.asking);
const canAsk = session => Boolean(session?.segments.length || session?.history.length);
const hasPassageToKeep = session => Boolean(session?.segments.some(segment => segment.available));

function captureCommands({ session, recording, previewOpen, stopping, captureBusy, configuration, source }) {
  const newSession = Boolean(previewOpen) || isAnalyzing(session) || Boolean(stopping);
  return {
    'new-session': newSession,
    'archive-new': newSession,
    'float-record': Boolean(captureBusy) || Boolean(stopping),
    observe: !configuration?.canObserve || !source || Boolean(recording) || Boolean(captureBusy) || Boolean(stopping),
    'archive-resume': Boolean(recording) || Boolean(captureBusy) || Boolean(stopping),
  };
}

function momentCommands({ session, stopping, quickBusy }) {
  const quick = !hasId(session) || Boolean(stopping) || Boolean(quickBusy);
  const keep = !hasPassageToKeep(session) || Boolean(stopping);
  return {
    'float-explain': quick,
    'explain-moment': quick,
    'catch-up': quick,
    'mark-attention': quick,
    'moment-summarize': Boolean(quickBusy),
    'moment-explain': Boolean(quickBusy),
    'moment-send': Boolean(quickBusy),
    'keep-moment': keep,
    'float-keep': keep,
  };
}

function chatCommands({ session, configuration, verificationBusy, pendingQuestion }) {
  return {
    question: false,
    verify: !configuration?.verificationAvailable || Boolean(verificationBusy),
    send: !canAsk(session) || Boolean(pendingQuestion),
  };
}

/** What the status of the floating bar says: the capture first, then the archive, then a session that waits. */
function floatStatusMode(session, recording) {
  if (recording) return 'live';
  if (isArchive(session)) return 'archive';
  if (hasId(session)) return 'paused';
  return 'ready';
}

/** The title of the record button: pause it, resume the archive, or start. */
function recordTitleMode(session, recording) {
  if (recording) return 'recording';
  if (isArchive(session)) return 'archive';
  return 'idle';
}

/** The label of the observe command, in the same order of priority as the status of the bar. */
function observeLabelMode(session, recording) {
  if (recording) return 'recording';
  if (isArchive(session)) return 'archive';
  if (hasId(session)) return 'paused';
  return 'idle';
}

/** The line under the question field: an answer under way first, then what can be asked, then what is awaited. */
function askStatusMode(session) {
  if (isAnswering(session)) return 'answering';
  if (isArchive(session) && canAsk(session)) return 'archive';
  if (canAsk(session)) return 'ready';
  if (hasId(session)) return 'waiting';
  return 'idle';
}

/**
 * @param {{session:object|null, recording:boolean, previewOpen:boolean, stopping:boolean, captureBusy:boolean,
 *   quickBusy:boolean, configuration:{canObserve?:boolean, verificationAvailable?:boolean}|undefined,
 *   verificationBusy:boolean, pendingQuestion:string, source:string}} input
 *   session: the loaded session state; captureBusy: the floating bar is capturing; source: the id of the chosen source.
 * @returns {{disabled:Record<string, boolean>, recording:boolean, floatStatus:string, recordTitle:string,
 *   observeLabel:string, askStatus:string}}
 */
export function describeControls(input) {
  const { session, recording } = input;
  return {
    disabled: { ...captureCommands(input), ...momentCommands(input), ...chatCommands(input) },
    recording: Boolean(recording),
    floatStatus: floatStatusMode(session, recording),
    recordTitle: recordTitleMode(session, recording),
    observeLabel: observeLabelMode(session, recording),
    askStatus: askStatusMode(session),
  };
}
