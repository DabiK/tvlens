// Un faux dossier de projet avec son `.harness-state` : de quoi lire l'état d'une boucle sans en lancer une.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const stream = require("./loop-stream.cjs");

const MINUTE_MS = 60000;

function ticketFile(id, title, status, blockedBy = "") {
  const header = `id: ${id}\ntitre: ${title}\nstatut: ${status}\nbloque_par: ${blockedBy}\nadr: non\ninstalle: non\nharnais: non\nsupprime_tests: non`;
  return `---\n${header}\n---\n\n## Hypothèses bloquantes\n\nAucune décision n'est attendue.\n`;
}

/**
 * Un projet où T001 est intégré, T015 tourne (deux relectures faites, le contrôle complet en cours) et T016 attend.
 * `lock` est le contenu du verrou de la boucle, null pour ne pas en écrire. Les dates des événements sont relatives
 * à maintenant : la boucle a été lancée il y a 90 minutes.
 */
function fakeRoot({ lock = String(process.pid) } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "loop-view-"));
  const write = (relative, text) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  };
  const ago = (minutes) => new Date(Date.now() - minutes * MINUTE_MS).toISOString();
  const at = (minutes, event) => ({ ...event, at: ago(minutes) });
  const events = [
    at(88, stream.sessionEvent(0, "T001")),
    at(70, stream.endedEvent(0, "T001", 1, 2)),
    at(68, stream.integratedEvent(0, "T001", 2)),
    at(30, stream.sessionEvent(0, "T015", 1, { niveau: "standard", modele: "claude-sonnet-5-5", effort: "high" })),
  ];
  write(".harness-state/loop/events.jsonl", events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  const lockFile = lock === null ? null : write(".harness-state/loop/lock", lock);
  if (lockFile) fs.utimesSync(lockFile, new Date(Date.now() - 90 * MINUTE_MS), new Date(Date.now() - 90 * MINUTE_MS));
  const session = stream.sessionUpTo("exploration", "implementation", "record1", "review1", "correction", "record2", "review2", "check");
  const sessionFile = write(".harness-state/tickets/T015/session-1.jsonl", session.join("\n") + "\n");
  const reviews = [
    { at: new Date(stream.START + 30000).toISOString(), revue: "revue-1.diff", verdict: "à corriger", modele: "claude-opus-5-5" },
    { at: new Date(stream.START + 42000).toISOString(), revue: "revue-2.diff", verdict: "accepté", modele: "claude-opus-5-5" },
  ];
  write(".harness-state/tickets/T015/relectures.jsonl", reviews.map((review) => JSON.stringify(review)).join("\n") + "\n");
  write(".harness-state/tickets/T015/relecture-1.md", stream.REPORT_FIX);
  write(".harness-state/tickets/T015/relecture-2.md", stream.REPORT_OK);
  write("docs/travail/tickets/001-first-ticket.md", ticketFile("T001", "First ticket, already integrated", "termine"));
  write("docs/travail/tickets/015-second-ticket.md", ticketFile("T015", "Second ticket, in progress", "en-cours"));
  write("docs/travail/tickets/016-third-ticket.md", ticketFile("T016", "Third ticket, waiting", "a-faire", "T015"));
  return { root, write, sessionFile, remove: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Chemins, tailles et dates de modification de tout un dossier : deux relevés égaux, rien n'a été écrit entre les deux. */
function snapshot(root) {
  const entries = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      entries.push(`${path.relative(root, file)} ${stat.isDirectory() ? "dir" : stat.size} ${stat.mtimeMs}`);
      if (stat.isDirectory()) walk(file);
    }
  };
  walk(root);
  return entries;
}

module.exports = { fakeRoot, snapshot, MINUTE_MS };
