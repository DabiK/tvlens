// The end of a loaded session, the same on the Mac host and on the server host: a new session, the opening
// of another one, a deletion, a stop of the host. What is common lives here: what is done before anything is
// awaited, a closing step that fails and is kept instead of stopping the end half-way, what becomes of the
// session (archived, discarded for being empty, deleted), the host left without it whatever happened, and
// the line of the journal. Each host hands over what only it knows: its own closing steps in its own order,
// when a session is not worth an archive, how it lets go of one. Its transport, its capture and what only it
// has stay with it. Nothing here reads a disk, a clock or a transport.

// One line per failure, under the name of the step it happened in: the same on both hosts.
const said = (step, error) =>
  `${step} : ${String(error?.message || error).slice(0, 200)}`;

// One closing step, attempted whatever the others did: its failure is kept in `errors` instead of stopping
// the end half-way. An adapter that fails to close neither keeps a session from being archived nor leaves
// the others open. Resolves true when the step came back.
async function attempt(errors, step, work) {
  try {
    await work();
    return true;
  } catch (error) {
    errors.push(said(step, error));
    return false;
  }
}

// The last state of each question is published, hence saved, before its promise settles. Whatever still
// waited for its second is then handed over too (`save`), before the session is closed or sealed, and
// whatever the cancellation did.
async function settleQuestions(deep, reason, save) {
  try {
    deep.cancelAll(reason);
    await Promise.allSettled(deep.jobs.map((job) => job.done));
  } finally {
    save();
  }
}

// Ends `session`, the session runtime its host has loaded; with none, only the steps of the host are run.
// - `begin` ([step, work]) is run before anything is awaited, the end of the session already raised: what
//   must not wait behind a step that takes time. The first of `steps` is entered in that same turn.
// - `steps` ([[step, work], …]) are the closing steps of the host, in its order, each one attempted.
// - The session is then archived. One its host finds `empty()` is sealed and erased from `library` instead,
//   and so is one explicitly deleted (`remove`), whatever it holds. Nothing is erased unless the store is
//   really sealed, so that no late write of this runtime can bring the deleted directory back.
// - `letGo` leaves the host without this session whatever happened above, before any folder is erased.
// - `log` is handed one line when anything failed.
// Never rejects. Every failure is in `errors` and keeps nothing from going on: an archive the disk refused
// leaves `archived` false, and its folder keeps what was last confirmed. `refused` is why an explicit
// deletion did not happen, the very error of the seal or of the erasure: its host hands it back to whoever
// asked. An empty session that cannot be discarded never holds its host back.
async function closeSession({
  session,
  library,
  remove = false,
  empty,
  begin,
  steps,
  letGo,
  log,
}) {
  const errors = [],
    outcome = {
      id: session?.id ?? null,
      archived: false,
      freedBytes: 0,
      errors,
      refused: null,
    };
  // A passage still landing is stored and saved, but no analysis is started for it only to be given up a
  // moment later.
  if (session) session.watch.ending = true;
  try {
    begin[1]();
  } catch (error) {
    errors.push(said(begin[0], error));
  }
  for (const [step, work] of steps) await attempt(errors, step, work);
  let sealed = false;
  if (session) {
    let discard = remove;
    // A session whose host cannot say whether it is empty is kept.
    try {
      discard ||= Boolean(empty());
    } catch (error) {
      errors.push(said("archive", error));
    }
    if (!discard)
      outcome.archived = await attempt(errors, "archive", () =>
        session.archive(),
      );
    else
      try {
        await session.seal();
        sealed = true;
      } catch (error) {
        errors.push(said("scellement", error));
        if (remove) outcome.refused = error;
      }
    // What failed while the runtime itself was closing: kept by it for its host.
    errors.push(...(session.closeErrors || []));
  }
  try {
    letGo();
  } catch (error) {
    errors.push(said("hôte", error));
  }
  if (sealed)
    try {
      // A session that never reached the disk has nothing to erase.
      const onDisk = await library.folder(session.id).then(
        () => true,
        () => false,
      );
      if (onDisk)
        outcome.freedBytes = (await library.remove(session.id)).freedBytes;
    } catch (error) {
      errors.push(said("effacement", error));
      if (remove) outcome.refused = error;
    }
  if (errors.length)
    try {
      log(
        `TVLens — fermeture incomplète de la session ${outcome.id || "(aucune)"} : ${errors.join(" ; ")}`,
      );
    } catch {}
  return outcome;
}
module.exports = { closeSession, settleQuestions, attempt };
