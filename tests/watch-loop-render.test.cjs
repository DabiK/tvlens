const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const stream = require("./helpers/loop-stream.cjs");

const { viewOf, sessionUpTo, REPORT_FIX } = stream;
const screen = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/watch-loop/render.mjs")).href);

// Les séquences de style que l'affichage met lui-même ; toute autre séquence d'échappement serait venue du texte affiché.
const STYLE = /\x1b\[[0-9;]*m/g;
const HAS_STYLE = /\x1b\[[0-9;]*m/;
const visible = (line) => line.replace(STYLE, "");
const width = (line) => [...visible(line)].length;

const IN_REVIEW = ["exploration", "implementation", "record1", "review1", "correction", "record2", "review2"];
const firstReview = [{ at: new Date(stream.START + 30000).toISOString(), revue: "revue-1.diff", verdict: "à corriger", modele: "claude-opus-5-5" }];
const richView = () => viewOf({ lines: sessionUpTo(...IN_REVIEW), reviews: firstReview, reports: { 1: REPORT_FIX } });

test("the screen names the ticket, its phase, the review cycles, the last actions and the night", async () => {
  const { render } = await screen();
  const text = render(await richView(), { width: 120, color: false }).join("\n");
  for (const expected of [
    "T015",
    "Title of T015",
    "Sonnet 5.5",
    "tentative 1",
    "Relecture 2",
    "Cycles de relecture : 1 (+ 1 en cours)",
    "à corriger",
    "0 bloquant · 2 mineurs · 1 hors périmètre",
    "orchestrateur",
    "Intégrés : 2",
    "Restants : 2 (T016, T017)",
    "Fin estimée",
  ]) {
    assert.ok(text.includes(expected), `missing « ${expected} » in:\n${text}`);
  }
});

test("the timeline marks the phases done, in progress and to come", async () => {
  const { render } = await screen();
  const lines = render(await richView(), { width: 160, color: false });
  const timeline = lines.find((line) => line.includes("Exploration") && line.includes("Rétrospective"));
  assert.match(timeline, /✓ Exploration .*✓ Correction .*▶ Relecture 2 .*· Contrôle complet .*· Rétrospective/);
});

test("every line fits the width of the terminal, at any width, with or without colour", async () => {
  const { render } = await screen();
  const view = await richView();
  for (const columns of [30, 40, 60, 100, 160]) {
    for (const color of [false, true]) {
      for (const line of render(view, { width: columns, color })) assert.ok(width(line) <= columns, `${columns} columns: « ${visible(line)} »`);
    }
  }
});

test("a line that is too long is cut with an ellipsis rather than wrapped", async () => {
  const { render } = await screen();
  const long = stream.toolUse("x", "Bash", { command: "ls", description: "a-very-long-target-".repeat(10) });
  const view = await viewOf({ lines: [stream.assistant([long])] });
  const lines = render(view, { width: 60, color: false });
  const action = lines.find((line) => line.includes("a-very-long-target"));
  assert.ok(action.endsWith("…"));
  assert.equal(width(action), 60);
  assert.ok(lines.every((line) => !line.includes("\n")));
});

test("the header puts the state of the loop and the time at the right edge", async () => {
  const { render } = await screen();
  const [alive, stopped] = await Promise.all([viewOf({}), viewOf({ loop: { alive: false, pid: 4242 } })]);
  const [header] = render(alive, { width: 100, color: false });
  assert.ok(header.startsWith("TVLens · boucle de tickets"));
  assert.match(header, /● boucle vivante · pid 4242 · \d\d:\d\d:\d\d$/);
  assert.equal(width(header), 100);
  assert.match(render(stopped, { width: 100, color: false })[0], /■ boucle arrêtée · \d\d:\d\d:\d\d$/);
});

test("colour is only used when asked, and only as style sequences", async () => {
  const { render } = await screen();
  const view = await richView();
  assert.ok(render(view, { width: 100, color: false }).every((line) => !line.includes("\x1b")));
  const coloured = render(view, { width: 100, color: true });
  assert.ok(coloured.some((line) => HAS_STYLE.test(line)));
  assert.ok(coloured.every((line) => !visible(line).includes("\x1b")));
});

test("text that comes from a session cannot move the cursor, clear the screen or break a line", async () => {
  const { render } = await screen();
  const hostile = "Read \x1b[2J\x1b]0;owned\x07\rfile\nnext line";
  const view = await viewOf({ lines: [stream.assistant([stream.toolUse("x", "Bash", { command: "ls", description: hostile })])] });
  for (const color of [false, true]) {
    const lines = render(view, { width: 120, color });
    assert.ok(lines.every((line) => !visible(line).includes("\x1b") && !/[\r\n\x07]/.test(line)));
    assert.ok(lines.some((line) => line.includes("Read")));
  }
});

test("a stopped loop says so and gives no estimated end", async () => {
  const { render } = await screen();
  const text = render(await viewOf({ lines: sessionUpTo("exploration"), loop: { alive: false, pid: 4242 } }), { width: 120, color: false }).join("\n");
  assert.ok(text.includes("Boucle arrêtée"));
  assert.ok(text.includes("Fin estimée : —"));
});

test("a screen with nothing to show says there is no ticket in progress", async () => {
  const { render } = await screen();
  const view = await viewOf({ events: [], loop: { alive: false, pid: null, launchedAt: null } });
  assert.ok(render(view, { width: 80, color: false }).join("\n").includes("Aucun ticket en cours"));
});

test("counts of findings are singular for one and plural for more", async () => {
  const { render } = await screen();
  const one = { at: new Date(stream.START + 30000).toISOString(), revue: "revue-1.diff", verdict: "à corriger", modele: null };
  const report = "VERDICT : à corriger\nCONSTATS : 1 bloquant, 1 mineur, 0 hors périmètre\n";
  const view = await viewOf({ lines: sessionUpTo("exploration"), reviews: [one], reports: { 1: report } });
  assert.ok(render(view, { width: 120, color: false }).join("\n").includes("1 bloquant · 1 mineur · 0 hors périmètre"));
});

test("the timeline goes on to the next line between two phases instead of losing the last ones", async () => {
  const { render } = await screen();
  const lines = render(await richView(), { width: 50, color: false });
  const phases = ["Exploration", "Implémentation", "Correction", "Relecture 2", "Contrôle complet", "Verdict", "Contrôles de la boucle", "Rétrospective"];
  for (const phase of phases) assert.ok(lines.some((line) => line.includes(phase)), `« ${phase} » is lost at 50 columns`);
  assert.ok(lines.every((line) => width(line) <= 50));
});

test("unknown model identifiers stay verbatim and known Codex models use their display name", async () => {
  const { render } = await screen();
  const rendered = [];
  for (const modele of ["opus", "custom-model", "gpt-6-astra"]) {
    const view = await viewOf({ events: [stream.sessionEvent(0, "T015", 1, { modele })] });
    rendered.push(render(view, { width: 120 }).find((line) => line.includes("effort high")));
  }
  assert.match(rendered[0], /opus, effort high/);
  assert.match(rendered[1], /custom-model, effort high/);
  assert.match(rendered[2], /Codex \(GPT-6 Astra\), effort high/);
});

test("a completed Codex session with null cost is shown as unknown rather than free", async () => {
  const { render } = await screen();
  const events = [stream.sessionEvent(0, "T015", 1, { moteur: "codex", modele: "gpt-6-astra" }),
    stream.endedEvent(10, "T015", 1, null), stream.integratedEvent(11, "T015", null)];
  const text = render(await viewOf({ events }), { width: 160 }).join("\n");
  assert.match(text, /Coût cumulé : inconnu/);
  assert.match(text, /✓ T015\s+11 min 00 s\s+inconnu/);
});
