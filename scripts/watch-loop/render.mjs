import { MS_PER_SECOND, SECONDS_PER_MINUTE, MINUTES_PER_HOUR, MS_PER_HOUR, RECENT_WINDOW_MS } from "../loop-view/constants.mjs";
import { DEFAULT_COLUMNS, plain } from "./text.mjs";
// Mise en page de l'écran : la vue de la boucle en lignes de texte, chacune assez courte pour la largeur du terminal.
// Fonction pure : elle ne lit ni le disque ni le terminal, et tout le texte qu'elle reçoit est montré comme du texte.
import { displayName } from "../loop/models.mjs";

const ELLIPSIS = "…";
const MIN_WIDTH = 20;
const AGENT_COLUMN = 13;
const TOOL_COLUMN = 10;
const VERDICT_COLUMN = 10;
const SHOWN_FINISHED = 5;
const SHOWN_REMAINING = 6;
const TIME_COLUMN = 8;

const RESET = "\x1b[0m";
const STYLES = { bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m" };

const TIMELINE_GAP = "  ";
const PHASE_SYMBOLS = { done: "✓", current: "▶", todo: "·", stopped: "■" };
const PHASE_STYLES = { done: "green", current: "bold", todo: "dim", stopped: "red" };
const VERDICT_STYLES = { accepté: "green", "à corriger": "yellow", illisible: "red" };

const verdictStyle = (verdict) => (Object.hasOwn(VERDICT_STYLES, verdict) ? VERDICT_STYLES[verdict] : null);
const seg = (text, style = null) => ({ text, style });
const length = (segments) => segments.reduce((sum, { text }) => sum + [...text].length, 0);
const padded = (text, columns) => String(text).padEnd(columns);
const plural = (count, word) => (count > 1 ? `${word}s` : word);

const two = (n) => String(n).padStart(2, "0");

/** « 42 s », « 3 min 05 s », « 1 h 05 min » ; un tiret quand la durée est inconnue. */
export function duration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  const seconds = Math.max(0, Math.round(ms / MS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) return `${seconds} s`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ${two(seconds % SECONDS_PER_MINUTE)} s`;
  return `${Math.floor(minutes / MINUTES_PER_HOUR)} h ${two(minutes % MINUTES_PER_HOUR)} min`;
}

/** L'heure locale, avec ou sans les secondes ; vide quand elle est inconnue. */
export function clock(ms, seconds = false) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "";
  const date = new Date(ms);
  const base = `${two(date.getHours())}:${two(date.getMinutes())}`;
  return seconds ? `${base}:${two(date.getSeconds())}` : base;
}

/** L'heure, précédée du jour et du mois quand ce n'est pas aujourd'hui. */
function dayClock(ms, now) {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay ? clock(ms) : `${two(date.getDate())}/${two(date.getMonth() + 1)} ${clock(ms)}`;
}

const money = (value) => value === null ? "inconnu" : `${(value || 0).toFixed(2).replace(".", ",")} $`;

/** Le texte tient dans `columns` : coupé et terminé par « … » s'il est trop long, jamais passé à la ligne. */
function fit(segments, columns) {
  const cleaned = segments.map(({ text, style }) => ({ text: plain(text), style }));
  if (length(cleaned) <= columns) return cleaned;
  const kept = [];
  let room = columns - 1;
  for (const { text, style } of cleaned) {
    if (room <= 0) break;
    const characters = [...text];
    kept.push({ text: characters.slice(0, room).join(""), style });
    room -= characters.length;
  }
  return [...kept, seg(ELLIPSIS, kept.at(-1)?.style ?? null)];
}

const paint = (segments, color) =>
  segments.map(({ text, style }) => (color && style ? `${STYLES[style]}${text}${RESET}` : text)).join("");

function headerLine(view, columns) {
  const left = [seg("TVLens · boucle de tickets", "bold")];
  const state = view.alive ? seg(`● boucle vivante · pid ${view.pid}`, "green") : seg("■ boucle arrêtée", "red");
  const right = [state, seg(` · ${clock(view.now, true)}`, "dim")];
  const gap = columns - length(left) - length(right);
  return gap > 0 ? [...left, seg(" ".repeat(gap)), ...right] : left;
}

function modelName(model) {
  if (!model) return "modèle inconnu";
  const name = displayName(model);
  if (name === "Claude") return model;
  return name.replace(/^Claude /, "");
}

function ticketLines(view) {
  const ticket = view.ticket;
  if (!ticket) return [[seg("Aucun ticket en cours", "dim")]];
  const model = modelName(ticket.modele);
  const attempt = ticket.attempt > 1 ? `tentative ${ticket.attempt} (depuis ${duration(ticket.attemptElapsedMs)})` : "tentative 1";
  const details = [
    ticket.niveau ? `niveau ${ticket.niveau}` : null,
    ticket.effort ? `${model}, effort ${ticket.effort}` : model,
    attempt,
    `depuis ${duration(ticket.elapsedMs)}`,
  ].filter(Boolean);
  return [[seg(ticket.id, "bold"), seg("  "), seg(ticket.titre || "(titre inconnu)", "bold")], [seg(details.join(" · "), "dim")]];
}

/** Les phases les unes après les autres, à la ligne entre deux phases quand elles ne tiennent plus. */
function timelineLines(items, columns) {
  const lines = [[]];
  for (const item of items) {
    const entry = seg(`${PHASE_SYMBOLS[item.state]} ${item.label}`, PHASE_STYLES[item.state]);
    const line = lines.at(-1);
    if (!line.length) line.push(entry);
    else if (length(line) + TIMELINE_GAP.length + length([entry]) > columns) lines.push([entry]);
    else line.push(seg(TIMELINE_GAP), entry);
  }
  return lines;
}

function phaseLines(view, columns) {
  const { phase } = view;
  const since = phase.since ? ` · depuis ${duration(view.now - phase.since)}` : "";
  const label = [seg("Phase  ", "dim"), seg(phase.label, "bold"), seg(since, "dim")];
  if (phase.detail) label.push(seg(` (dernière phase : ${phase.detail})`, "dim"));
  const lines = [label, ...timelineLines(view.timeline, columns)];
  if (view.reason) lines.push([seg("Raison  ", "dim"), seg(view.reason, "yellow")]);
  if (view.pushRefused) lines.push([seg("Le push a été refusé : la boucle s'est arrêtée.", "red")]);
  return lines;
}

function findingsText(findings) {
  if (!findings) return "décompte indisponible";
  const { blocking, minor, outOfScope } = findings;
  return `${blocking} ${plural(blocking, "bloquant")} · ${minor} ${plural(minor, "mineur")} · ${outOfScope} hors périmètre`;
}

function cycleLines(view) {
  const recorded = view.cycles.filter((cycle) => !cycle.pending).length;
  const running = view.cycles.some((cycle) => cycle.pending);
  const lines = [[seg(`Cycles de relecture : ${recorded}${running ? " (+ 1 en cours)" : ""}`, "bold")]];
  for (const cycle of view.cycles) {
    if (cycle.pending) {
      lines.push([seg(`  ${cycle.rank}  en cours…`, "dim")]);
      continue;
    }
    const verdict = seg(padded(cycle.verdict, VERDICT_COLUMN), verdictStyle(cycle.verdict));
    lines.push([seg(`  ${cycle.rank}  `), verdict, seg(`  ${findingsText(cycle.findings)}`, "dim")]);
  }
  return lines;
}

function actionLines(view) {
  const lines = [[seg("Dernières actions", "bold")]];
  if (!view.actions.length) lines.push([seg("  aucune pour l'instant", "dim")]);
  for (const { agent, tool, target, at, status, exitCode } of view.actions) {
    const when = at ? clock(Date.parse(at), true) : "";
    let detail = target;
    if (status === "in_progress") detail = `en cours · ${target}`;
    if (status === "failed" || (typeof exitCode === "number" && exitCode !== 0)) detail = `échec ${exitCode ?? ""} · ${target}`;
    lines.push([
      seg(`  ${padded(when, TIME_COLUMN)}  `, "dim"), seg(padded(agent, AGENT_COLUMN), "dim"),
      seg(` ${padded(tool, TOOL_COLUMN)}`), seg(` ${detail}`),
    ]);
  }
  return lines;
}

function finishedLine(entry) {
  const done = entry.outcome === "integre";
  return [
    seg(`  ${done ? "✓" : "✗"} ${entry.id}`, done ? "green" : "red"),
    seg(`  ${duration(entry.durationMs)}  ${money(entry.costUsd)}  ${entry.titre}`, "dim"),
  ];
}

function remainingText(remaining) {
  const ids = remaining.tickets.slice(0, SHOWN_REMAINING).map((ticket) => ticket.id);
  const more = remaining.tickets.length > SHOWN_REMAINING ? ", …" : "";
  const list = ids.length ? ` (${ids.join(", ")}${more})` : "";
  return `Restants : ${remaining.tickets.length}${list}${remaining.capped ? " · limité par le --max de la boucle" : ""}`;
}

function estimateText(view) {
  if (!view.alive) return "Fin estimée : — (boucle arrêtée)";
  if (!view.eta) return "Fin estimée : inconnue (aucun ticket intégré à moyenner)";
  const basis = view.eta.basis === "launch" ? "moyenne depuis le lancement" : "moyenne des lancements précédents";
  return `Fin estimée : ${dayClock(view.eta.at, view.now)} (${duration(view.eta.averageMs)} par ticket, ${basis})`;
}

function nightLines(view) {
  const recent = `${RECENT_WINDOW_MS / MS_PER_HOUR} dernières heures, lancement inconnu`;
  const since = view.sinceKind === "launch" ? `depuis le lancement à ${clock(view.launchedAt)}` : recent;
  const integrated = view.finished.filter((entry) => entry.outcome === "integre").length;
  const blocked = view.finished.length - integrated;
  const cost = view.unknownCosts ? "inconnu" : money(view.costUsd);
  const total = view.unknownCosts && view.costUsd ? `${money(view.costUsd)} + coût inconnu` : cost;
  const lines = [[seg(`La nuit · ${since}`, "bold")]];
  lines.push([seg(`  Intégrés : ${integrated} · Bloqués : ${blocked} · Coût cumulé : ${total}`)]);
  const shown = view.finished.slice(-SHOWN_FINISHED);
  if (view.finished.length > shown.length) lines.push([seg(`  … ${view.finished.length - shown.length} de plus avant`, "dim")]);
  for (const entry of shown) lines.push(finishedLine(entry));
  lines.push([seg(`  ${remainingText(view.remaining)}`)]);
  if (view.remaining.reason) lines.push([seg(`  Ensuite : ${view.remaining.reason}`, "dim")]);
  lines.push([seg(`  ${estimateText(view)}`)]);
  return lines;
}

/**
 * Les lignes de l'écran. `width` est la largeur du terminal, `color` active les styles ANSI (jamais autre chose
 * qu'une séquence de style). Chaque ligne rendue tient dans la largeur.
 */
export function render(view, { width = DEFAULT_COLUMNS, color = false } = {}) {
  const columns = Math.max(MIN_WIDTH, width);
  const rule = [seg("─".repeat(columns), "dim")];
  const sections = [
    [headerLine(view, columns), rule],
    ticketLines(view),
    [[]],
    phaseLines(view, columns),
    [[]],
    cycleLines(view),
    [[]],
    actionLines(view),
    [[]],
    nightLines(view),
  ];
  return sections.flat().map((line) => paint(fit(line, columns), color));
}
