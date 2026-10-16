// Lecture de l'état de la boucle sur le disque, en lecture seule : événements, verrou, tickets, relectures et flux de la
// session en cours. Rien n'est jamais écrit, ni dans `.harness-state/`, ni ailleurs. Le flux d'une session, qui peut peser
// plusieurs Mo, se lit par incréments : seuls les octets arrivés depuis la dernière lecture sont lus.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { analyzeEvents, emptySession, foldSession, loopStatus } from "../loop-view.mjs";
import { launchEvents } from "../loop-view/events.mjs";
import { list } from "../loop/tickets.mjs";

const NEWLINE = 0x0a;
// Seule une commande de la boucle dit combien de tickets elle doit prendre ; un autre processus au même numéro n'en dit rien.
const LOOP_COMMAND = /loop\/run\.mjs/;
const DEFAULT_MAX_TICKETS = 1;
// Un identifiant de ticket sert de nom de dossier : celui qui sortirait de `tickets/` n'est pas lu.
const SAFE_TICKET_ID = /^[A-Za-z0-9_-]+$/;

const missing = (error) => error.code === "ENOENT";

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

/** Les lignes JSON d'un journal ; une ligne abîmée ou en cours d'écriture est sautée, la suivante dira la suite. */
function jsonLines(text) {
  const rows = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      // Une ligne qui n'est pas un objet (`null`, un nombre, une liste) n'est pas un événement ni un verdict.
      if (row !== null && typeof row === "object" && !Array.isArray(row)) rows.push(row);
    } catch (error) {
      // Ligne en cours d'écriture ou abîmée : rien à en tirer.
      continue;
    }
  }
  return rows;
}

/** Le processus vit-il ? Un refus de permission (EPERM) dit qu'il existe, à un autre utilisateur. `kill` se remplace pour les tests. */
export function processLives(pid, kill = process.kill) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function psCommand(pid) {
  const run = spawnSync("ps", ["-ww", "-p", String(pid), "-o", "command="], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim() : null;
}

function maxTicketsOf(command) {
  if (!command || !LOOP_COMMAND.test(command)) return null;
  const asked = /--max\s+(\d+)/.exec(command);
  return asked ? Number(asked[1]) : DEFAULT_MAX_TICKETS;
}

/** Les octets arrivés après `offset`, coupés à la dernière fin de ligne : une ligne ou un caractère à moitié écrit attend la suite. */
export function newLines(file, offset) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch (error) {
    if (missing(error)) return { lines: [], consumed: 0 };
    throw error;
  }
  try {
    const size = fs.fstatSync(fd).size;
    if (size < offset) return { shrunk: true };
    const buffer = Buffer.alloc(size - offset);
    let filled = 0;
    while (filled < buffer.length) {
      const count = fs.readSync(fd, buffer, filled, buffer.length - filled, offset + filled);
      if (count === 0) break;
      filled += count;
    }
    const end = buffer.subarray(0, filled).lastIndexOf(NEWLINE);
    if (end < 0) return { lines: [], consumed: 0 };
    return { lines: buffer.subarray(0, end).toString("utf8").split("\n"), consumed: end + 1 };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Suit le flux de la session en cours. Il repart du début quand la session change, quand l'événement qui la lance est
 * plus récent (la boucle a recommencé la même tentative) ou quand le fichier est devenu plus court.
 */
function createStreamTracker(root) {
  const fresh = (key) => ({ key, offset: 0, state: emptySession() });
  let tracked = fresh(null);
  return (current, dir) => {
    if (!current) {
      tracked = fresh(null);
      return tracked.state;
    }
    const prefix = current.moteur === "codex" ? "codex" : "session";
    const file = path.join(dir, `${prefix}-${current.attempt}.jsonl`);
    const key = `${file}@${current.attemptAt}`;
    if (tracked.key !== key) tracked = fresh(key);
    let increment = newLines(file, tracked.offset);
    if (increment.shrunk) {
      tracked = fresh(key);
      increment = newLines(file, 0);
    }
    tracked.state = foldSession(tracked.state, increment.lines, { root, engine: current.moteur });
    tracked.offset += increment.consumed;
    return tracked.state;
  };
}

function readReviews(dir) {
  const entries = jsonLines(readIfExists(path.join(dir, "relectures.jsonl")));
  const reports = {};
  for (let rank = 1; rank <= entries.length; rank++) {
    const report = readIfExists(path.join(dir, `relecture-${rank}.md`));
    if (report !== null) reports[rank] = report;
  }
  return { entries, reports };
}

function readVerdictStatus(dir) {
  const text = readIfExists(path.join(dir, "verdict.json"));
  if (text === null) return null;
  try {
    return JSON.parse(text)?.statut ?? null;
  } catch (error) {
    // Le verdict peut être en cours d'écriture ; il ne peut pas encore annoncer de relecture.
    return null;
  }
}

function readLock(file) {
  try {
    return { text: fs.readFileSync(file, "utf8"), mtimeMs: fs.statSync(file).mtimeMs };
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

/**
 * Un lecteur de l'état de la boucle de `root`. `isRunning` et `commandOf` se remplacent pour les tests ; `read` rend ce
 * que `buildView` attend. Le verrou, écrit au lancement de la boucle, en donne l'heure de lancement.
 */
export function createReader(root, { isRunning = processLives, commandOf = psCommand } = {}) {
  const state = path.join(root, ".harness-state");
  const track = createStreamTracker(root);
  const commands = new Map();
  const commandLine = (pid) => {
    if (!commands.has(pid)) commands.set(pid, commandOf(pid));
    return commands.get(pid);
  };
  return {
    read(now) {
      const events = jsonLines(readIfExists(path.join(state, "loop", "events.jsonl")));
      const lock = readLock(path.join(state, "loop", "lock"));
      const { alive, pid } = loopStatus(lock?.text ?? null, isRunning);
      const found = analyzeEvents(launchEvents(events, { alive, launchedAt: lock?.mtimeMs })).current;
      const current = found && SAFE_TICKET_ID.test(found.id) ? found : null;
      const dir = current ? path.join(state, "tickets", current.id) : null;
      const { entries, reports } = dir ? readReviews(dir) : { entries: [], reports: {} };
      return {
        now,
        events,
        stream: track(current, dir),
        reviews: entries,
        verdictStatus: current?.moteur === "codex" ? readVerdictStatus(dir) : null,
        reports,
        tickets: list(root),
        loop: {
          alive, pid, launchedAt: alive ? lock.mtimeMs : null, maxTickets: alive ? maxTicketsOf(commandLine(pid)) : null,
          retrospective: !alive || !/(?:^|\s)--no-retro(?:\s|$)/.test(commandLine(pid) || ""),
        },
      };
    },
  };
}
