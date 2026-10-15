// Les relectures sont externes à Codex. Leurs rangs viennent du journal ; les tours du flux situent les sessions de correction.
import { PHASES } from "./phases.mjs";

const WORK_PHASES = new Set(["resume", "exploration", "implementation"]);

function correctionPhase(entry, reviews) {
  const previous = reviews[entry.turn - 2];
  const resumed = entry.turn > 1 && previous && previous.verdict !== "accepté";
  return resumed && WORK_PHASES.has(entry.key) ? { ...entry, ...PHASES.correction } : entry;
}

export function codexReviews(stream, reviews, current, verdictStatus) {
  const offset = reviews.filter((entry) => Date.parse(entry.at) < Date.parse(current.attemptAt)).length;
  const attemptReviews = reviews.slice(offset);
  const history = [];
  for (const [index, entry] of stream.history.entries()) {
    history.push(correctionPhase(entry, attemptReviews));
    const endsTurn = stream.history[index + 1]?.turn !== entry.turn;
    const reviewed = Boolean(attemptReviews[entry.turn - 1]);
    const pending = entry.turn === stream.turnsStarted && verdictStatus === "TERMINÉ";
    if (endsTurn && entry.turn <= (stream.turnsCompleted ?? 0) && (reviewed || pending)) {
      const number = offset + entry.turn;
      history.push({ key: "review", label: `Relecture ${number}`, number, turn: entry.turn });
    }
  }
  const latest = history.at(-1);
  const phase = latest ? { ...stream.phase, ...latest } : stream.phase;
  return { ...stream, phase, history };
}
