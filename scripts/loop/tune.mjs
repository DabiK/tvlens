// Harmonisation des consignes du harnais : tous les N tickets intégrés, la boucle reprend les problèmes qui reviennent
// dans les rétrospectives et lance une session qui corrige les skills et les agents. Le code choisit ce qui est traité ;
// la session ne touche jamais aux contrôles, et la boucle revérifie tout avant de committer.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { INSTRUCTIONS_SCOPE, inScope, scopeDirs } from "./harness-scopes.mjs";
import { displayName, LADDER } from "./models.mjs";
import { decide, pendingObservations } from "./retro.mjs";
import { statusEntries, ticketDir, unacceptedReview, unreviewedChange, untrackedPaths, writeUntrackedBefore } from "./reviewed-state.mjs";

// Un sujet est retenu s'il revient sur au moins MIN_TICKETS tickets distincts, ou si l'une de ses observations a l'impact
// STRONG_IMPACT. MAX_SUBJECTS sujets au plus par harmonisation : une session courte, un commit relisible.
const MIN_TICKETS = 2;
const STRONG_IMPACT = "fort";
const MAX_SUBJECTS = 3;
const OBSERVATIONS_FILE = "observations.json";
const TUNE_ID = /^H(\d+)$/;
const TUNE_ID_DIGITS = 3;
const MAX_OUTPUT = 256 * 1024 * 1024;
const MAX_EVENT_TEXT = 2000;
// Code de sortie de la boucle quand une harmonisation refusée n'a pas pu être défaite : distinct de 0 à 3 (run.mjs).
const DIRTY_TREE_EXIT = 4;

/** Regroupe par sujet les problèmes en attente, dans l'ordre de leur première apparition dans le journal. */
function pendingProblemsBySubject(observations) {
  const subjects = new Map();
  for (const o of observations) {
    if (o.statut !== "propose" || o.type !== "probleme") continue;
    const sujet = String(o.sujet ?? "").trim();
    if (!subjects.has(sujet)) subjects.set(sujet, { sujet, order: subjects.size, tickets: new Set(), strong: false, observations: [] });
    const subject = subjects.get(sujet);
    subject.tickets.add(o.ticket);
    subject.strong ||= o.impact === STRONG_IMPACT;
    subject.observations.push(o);
  }
  return [...subjects.values()];
}

/**
 * Sujets à harmoniser, choisis par le code et non par un modèle : les problèmes en attente qui reviennent sur
 * MIN_TICKETS tickets distincts ou qui ont une observation d'impact fort. Les plus fréquents d'abord, à égalité le
 * premier apparu ; MAX_SUBJECTS au plus. Un sujet retenu apporte toutes ses observations de problème en attente.
 */
export function selectSubjects(observations) {
  return pendingProblemsBySubject(observations)
    .filter((s) => s.tickets.size >= MIN_TICKETS || s.strong)
    .sort((a, b) => b.tickets.size - a.tickets.size || a.order - b.order)
    .slice(0, MAX_SUBJECTS)
    .map(({ sujet, tickets, observations: chosen }) => ({ sujet, tickets: [...tickets], observations: chosen }));
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: MAX_OUTPUT });
  return { code: result.status ?? 1, out: (result.stdout || "") + (result.stderr || "") };
}

/** Identifiant de la prochaine harmonisation : un de plus que la plus haute déjà lancée, pour ne jamais en réutiliser un. */
function nextTuneId(root) {
  const dir = path.join(root, ".harness-state", "tickets");
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const used = names.map((name) => TUNE_ID.exec(name)).filter(Boolean).map((match) => Number(match[1]));
  return `H${String(Math.max(0, ...used) + 1).padStart(TUNE_ID_DIGITS, "0")}`;
}

/** Premier palier Opus de l'échelle, relecteur compris : `--model` et `--effort` ne valent que pour les tickets. */
function tunePlan() {
  const palier = LADDER.findIndex((rung) => rung.alias === "opus");
  return { modele: LADDER[palier].model, effort: LADDER[palier].effort, palier, relecteur: LADDER[palier].alias };
}

/** Crée le dossier d'état de l'harmonisation : observations retenues, et fichiers non suivis d'avant la session. */
function prepare(root, subjects) {
  const id = nextTuneId(root);
  const dir = ticketDir(root, id);
  const file = path.posix.join(".harness-state", "tickets", id, OBSERVATIONS_FILE);
  const observations = subjects.flatMap((s) => s.observations);
  // Lus par `git status -z`, comme l'état relu : la remise à HEAD et la relecture partent de la même liste.
  const before = new Set(untrackedPaths(root));
  writeUntrackedBefore(dir, before);
  fs.writeFileSync(path.join(root, file), JSON.stringify(observations, null, 2) + "\n");
  return { id, dir, file, observations, before, step: tunePlan() };
}

function tunePrompt({ id, file }) {
  return (
    `Harmonise les consignes du harnais (${id}) en suivant la skill « harmonisation » : lis d'abord` +
    ` .claude/skills/harmonisation/SKILL.md. Les observations retenues par la boucle sont dans ${file}.` +
    ` Avant de terminer, écris ton verdict dans .harness-state/tickets/${id}/verdict.json.` +
    " Tu ne committes pas et tu ne pousses pas : la boucle le fait après ses propres contrôles."
  );
}

/** Variables propres à la session d'harmonisation : le harnais ouvert, mais sur les seules consignes. */
const tuneEnv = ({ file }) => ({
  TVLENS_TICKET_FILE: file,
  TVLENS_TUNE: "1",
  TVLENS_HARNESS: "1",
  TVLENS_HARNESS_SCOPE: INSTRUCTIONS_SCOPE,
  TVLENS_ALLOW_INSTALL: "0",
});

function readVerdict(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "verdict.json"), "utf8"));
  } catch (error) {
    // Pas de verdict lisible : la session s'est arrêtée sans conclure, ce qui vaut un refus.
    return null;
  }
}

/** Les observations que la session déclare différées, avec leur raison ; elles restent en attente. */
function deferredOf(verdict) {
  const list = Array.isArray(verdict?.differees) ? verdict.differees : [];
  return list.filter((d) => typeof d?.id === "string");
}

/** Les observations traitées : celles que le verdict déclare, parmi celles que la boucle a retenues et hors différées. */
function handledOf(verdict, run) {
  const selected = new Set(run.observations.map((o) => o.id));
  const deferred = new Set(deferredOf(verdict).map((d) => d.id));
  const declared = Array.isArray(verdict.observations) ? verdict.observations : [];
  return [...new Set(declared)].filter((id) => selected.has(id) && !deferred.has(id));
}

/**
 * Fichiers changés depuis le début de la session : suivis modifiés (index compris), et nouveaux absents de la liste
 * d'avant (`paths`). `problem` si Git ne peut pas lire l'état de l'arbre : on ne conclut jamais « rien n'a changé » sans lui.
 */
function changedSince(root, before) {
  const status = git(root, ["status", "--porcelain"]);
  if (status.code !== 0) return { problem: `git status a échoué : ${status.out.trim()}` };
  const paths = statusEntries(root)
    .filter((e) => e.status !== "??" || !before.has(e.paths[0]))
    .flatMap((e) => e.paths);
  return { paths };
}

/**
 * Raison de refuser l'harmonisation, ou null. Les contrôles se suivent dans cet ordre : le périmètre passe avant
 * `scripts/check.mjs`, pour qu'un contrôle modifié par la session ne soit jamais exécuté.
 */
function refusal(root, run, session, verdict, changed) {
  if (!verdict) return `La session d'harmonisation s'est terminée sans verdict (code de sortie ${session.code}).`;
  if (verdict.statut !== "TERMINÉ") return `La session d'harmonisation s'est déclarée ${verdict.statut ?? "sans statut"} : ${verdict.resume ?? ""}`;
  const outside = changed.filter((p) => !inScope(INSTRUCTIONS_SCOPE, p));
  if (outside.length) return `Le diff sort des consignes (${scopeDirs(INSTRUCTIONS_SCOPE).join(", ")}) : ${outside.join(", ")}`;
  const reviewed = { id: run.id, file: run.file };
  const review = unreviewedChange(root, reviewed) || unacceptedReview(root, reviewed);
  if (review) return review;
  const check = spawnSync(process.execPath, ["scripts/check.mjs"], { cwd: root, encoding: "utf8", maxBuffer: MAX_OUTPUT });
  if (check.status !== 0) return "Le contrôle qualité complet est rouge :\n" + (check.stdout || "") + (check.stderr || "");
  return null;
}

/** Retire les fichiers nouveaux de la session ; renvoie les erreurs de suppression. */
function removeAdded(root, before) {
  const errors = [];
  const added = statusEntries(root).filter((e) => e.status === "??" && !before.has(e.paths[0]));
  for (const p of added.flatMap((e) => e.paths)) {
    try {
      fs.rmSync(path.join(root, p), { recursive: true, force: true });
    } catch (error) {
      // Droits, fichier occupé : la vérification qui suit le retrouvera ; l'erreur dit pourquoi.
      errors.push(`suppression de ${p} : ${error.message}`);
    }
  }
  return errors;
}

/**
 * Défait la session : désindexe, remet les fichiers suivis dans leur état de HEAD, retire les nouveaux fichiers, puis
 * vérifie. Renvoie null si l'arbre est revenu à son état d'avant, sinon les commandes en échec (`errors`) et les
 * fichiers de la session encore là (`left`).
 */
function restore(root, before) {
  const errors = [];
  const run = (label, args) => {
    const result = git(root, args);
    if (result.code !== 0) errors.push(`${label} a échoué : ${result.out.trim()}`);
  };
  run("git reset", ["reset", "-q"]);
  const tracked = statusEntries(root).filter((e) => e.status !== "??").flatMap((e) => e.paths);
  if (tracked.length) run("git checkout HEAD", ["--literal-pathspecs", "checkout", "HEAD", "--", ...tracked]);
  errors.push(...removeAdded(root, before));
  const after = changedSince(root, before);
  if (after.problem) errors.push(after.problem);
  const left = after.paths ?? [];
  return errors.length || left.length ? { errors, left } : null;
}

/** Remise à HEAD incomplète : la boucle s'arrête plutôt que de lancer un ticket sur un arbre que la session a laissé sale. */
function stopOnDirtyTree(root, run, reason, { errors, left }, io) {
  const refusal = path.join(run.dir, "refus.txt");
  const details = ["", "Remise à HEAD incomplète :", ...errors, ...left.map((p) => `reste : ${p}`)];
  fs.writeFileSync(refusal, [reason, ...details].join("\n") + "\n");
  const cut = (text) => text.slice(0, MAX_EVENT_TEXT);
  io.event("harmonisation-non-defaite", { id: run.id, raison: cut(reason), reste: left, erreurs: errors.map(cut) });
  io.say(`Harmonisation ${run.id} refusée, et sa remise à HEAD est incomplète : la boucle s'arrête, aucun ticket n'est lancé.`);
  io.say(`Raison du refus : ${reason.split("\n")[0]}`);
  if (left.length) io.say(`Restent de la session : ${left.join(", ")}`);
  for (const error of errors) io.say(error.split("\n")[0]);
  io.say(`À examiner : git status, un .git/index.lock resté en place, ${path.relative(root, refusal)}. Remettre l'arbre à HEAD, puis relancer.`);
  return DIRTY_TREE_EXIT;
}

/** Refus : la session est défaite, ses observations restent en attente, et la file continue ; sinon la boucle s'arrête. */
function refuse(root, run, reason, io) {
  const undone = restore(root, run.before);
  if (undone) return stopOnDirtyTree(root, run, reason, undone, io);
  fs.writeFileSync(path.join(run.dir, "refus.txt"), reason + "\n");
  io.event("harmonisation-refusee", { id: run.id, raison: reason.slice(0, MAX_EVENT_TEXT) });
  io.say(`Harmonisation ${run.id} refusée, consignes remises à HEAD ; la file continue. ${reason.split("\n")[0]}`);
  return 0;
}

const firstLine = (text) => String(text ?? "").trim().split("\n")[0].trim();

/** Les problèmes en attente du journal des retours, ou `problem` s'il ne se lit pas. */
function readPending(root) {
  try {
    return { observations: pendingObservations(root) };
  } catch (error) {
    // Ligne tronquée ou écrite à la main : sans journal lisible il n'y a rien à choisir, la file de tickets continue.
    return { problem: error.message };
  }
}

/** Marque les observations traitées du commit ; renvoie la raison d'un échec, ou null. Le commit reste fait. */
function markHandled(root, handled, head, note) {
  if (!handled.length) return null;
  try {
    return decide(root, handled, `harmonisation:${head}`, note).error ?? null;
  } catch (error) {
    // Journal devenu illisible pendant la session (il est hors Git et hors du harnais protégé) : le marquage se fait à la main.
    return error.message;
  }
}

/** Commit des consignes, marquage des observations traitées, puis push. Renvoie le code de sortie de la boucle. */
function integrateTuning(root, run, { verdict, changed, session }, io) {
  const handled = handledOf(verdict, run);
  const paragraphs = [
    `Tune the harness: ${firstLine(verdict.resume) || "update the skills and agents"}`,
    `Observations: ${handled.join(", ") || "none"}`,
    `Co-Authored-By: ${displayName(run.step.modele)} <noreply@anthropic.com>`,
  ];
  const committed = io.commit(changed, paragraphs);
  if (committed.problem) return refuse(root, run, "Le commit de l'harmonisation a échoué :\n" + committed.problem, io);
  const unmarked = markHandled(root, handled, committed.head, firstLine(verdict.resume));
  if (unmarked) {
    const by = `node scripts/loop/retro.mjs decider <id> harmonisation:${committed.head}`;
    io.say(`Les observations traitées n'ont pas pu être marquées (${unmarked}) : ${handled.join(", ")}. À marquer à la main : ${by}`);
  }
  const integrated = { id: run.id, commit: committed.head, observations: handled, cout_usd: session.report.cout_usd };
  io.event("harmonisation-integree", unmarked ? { ...integrated, marquage_echoue: unmarked } : integrated);
  io.say(`Harmonisation ${run.id} intégrée (${committed.head}) : ${handled.length} observation(s) traitée(s).`);
  return io.push(run.id);
}

/**
 * Étape d'harmonisation, entre deux tickets intégrés. Renvoie le code de sortie de la boucle : 0 pour continuer la
 * file (refus défait et journal des retours illisible compris), 3 si le push est refusé, DIRTY_TREE_EXIT si un refus
 * n'a pas pu être défait. `io` apporte ce que la boucle partage avec les tickets : `say`, `event`, `launch` (une session
 * `claude -p`), `commit` et `push`.
 */
export async function tuneInstructions(root, io) {
  const pending = readPending(root);
  if (pending.problem) {
    io.event("harmonisation-sautee", { raison: pending.problem.slice(0, MAX_EVENT_TEXT) });
    io.say(`Harmonisation sautée : le journal des retours est illisible (${pending.problem}). La file continue.`);
    return 0;
  }
  const subjects = selectSubjects(pending.observations);
  if (!subjects.length) {
    io.say("Rien à harmoniser : aucun problème en attente ne revient sur deux tickets ni n'a un impact fort.");
    return 0;
  }
  const run = prepare(root, subjects);
  const ids = run.observations.map((o) => o.id);
  io.event("harmonisation", { id: run.id, sujets: subjects.map((s) => s.sujet), observations: ids });
  io.say(`Harmonisation ${run.id} : ${subjects.map((s) => `« ${s.sujet} »`).join(", ")} (${ids.join(", ")}).`);
  io.say(`Session d'harmonisation, une tentative : ${run.step.modele}, effort ${run.step.effort}, relecteur ${run.step.relecteur}.`);
  const name = `TVLens ${run.id} harmonisation`;
  const session = await io.launch({ id: run.id, attempt: 1, dir: run.dir, prompt: tunePrompt(run), name, step: run.step, env: tuneEnv(run) });
  const verdict = readVerdict(run.dir);
  for (const d of deferredOf(verdict)) io.say(`Différée par l'harmonisation : ${d.id} — ${d.raison ?? "sans raison donnée"}`);
  const changed = changedSince(root, run.before);
  if (changed.problem) return refuse(root, run, changed.problem, io);
  if (verdict?.statut === "TERMINÉ" && !changed.paths.length) {
    io.event("harmonisation-sans-changement", { id: run.id });
    io.say(`Harmonisation ${run.id} sans changement : rien à committer, les observations restent en attente.`);
    return 0;
  }
  const reason = refusal(root, run, session, verdict, changed.paths);
  if (reason) return refuse(root, run, reason, io);
  return integrateTuning(root, run, { verdict, changed: changed.paths, session }, io);
}
