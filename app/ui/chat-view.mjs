import { jobEntry, verificationEntry, pendingEntry } from "./job-card.js";
import { KeyedList, isNearBottom } from "./list-view.mjs";
import { plural, agree } from "./text.mjs";

const STICK_PX = 80;
const ECHO_TOLERANCE_MS = 1000;

// La page et les sondes utilisent les mêmes cartes et la même réconciliation.
export function createChatView({ list: container, box, intro, queueStatus }) {
  const list = new KeyedList(container);
  return function drawChatCards({
    context,
    deepState,
    verificationState,
    pendingQuestion = "",
    pendingQuestionAt = 0,
    forceBottom = false,
    limit,
  }) {
    const waiting = context.queuedIds.length;
    queueStatus.textContent = waiting
      ? `${plural(waiting, "question")} en attente · ${agree(waiting, "traitée")} dans l’ordre${limit ? `, ${limit} au plus` : ""}`
      : "";
    const echo =
      pendingQuestion &&
      !deepState.jobs.some(
        (job) =>
          job.question === pendingQuestion &&
          job.createdAt >= pendingQuestionAt - ECHO_TOLERANCE_MS,
      );
    const entries = [
      ...verificationState.jobs.map((job) => ({
        at: job.createdAt,
        entry: verificationEntry(job, context),
      })),
      ...deepState.jobs.map((job) => ({
        at: job.createdAt,
        entry: jobEntry(job, context),
      })),
      ...(echo
        ? [{ at: pendingQuestionAt, entry: pendingEntry(pendingQuestion) }]
        : []),
    ]
      .sort((a, b) => a.at - b.at)
      .map((item) => item.entry);
    // Follow the answer only if the reader was at the bottom: reading an earlier answer is never interrupted.
    const stick = forceBottom || isNearBottom(box, STICK_PX);
    const changes = list.sync(entries);
    intro.hidden = entries.length > 0;
    if (
      stick &&
      (forceBottom || changes.created || changes.updated || changes.removed)
    )
      box.scrollTop = box.scrollHeight;
  };
}
