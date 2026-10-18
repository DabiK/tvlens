const { test } = require("node:test");
const assert = require("node:assert/strict");
const stream = require("./helpers/loop-stream.cjs");

const { loopView, ticket, viewOf, sessionUpTo, REPORT_FIX } = stream;

const timelineOf = (view) => view.timeline.map(({ label, state }) => `${state}:${label}`);

test("the view of a ticket in review names the ticket, its phase and the running review as a cycle in progress", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration", "implementation", "record1", "review1") });
  assert.equal(view.ticket.id, "T015");
  assert.equal(view.ticket.titre, "Title of T015");
  assert.equal(view.ticket.modele, "claude-sonnet-5-5");
  assert.equal(view.ticket.elapsedMs, 28 * 60000);
  assert.equal(view.phase.label, "Relecture 1");
  assert.deepEqual(view.cycles.map(({ rank, verdict, pending }) => ({ rank, verdict, pending })), [{ rank: 1, verdict: null, pending: true }]);
  assert.equal(view.reviewCount, 0);
});

test("a recorded review is a finished cycle, and the next review in progress is a new one", async () => {
  const lines = sessionUpTo("exploration", "implementation", "record1", "review1", "correction", "record2", "review2");
  // Le verdict de la relecture 1 est enregistré entre le lancement de la relecture 1 (25 s) et celui de la relecture 2 (40 s).
  const recorded = [{ at: new Date(stream.START + 30000).toISOString(), revue: "revue-1.diff", verdict: "à corriger", modele: "claude-opus-5-5" }];
  const view = await viewOf({ lines, reviews: recorded, reports: { 1: REPORT_FIX } });
  assert.equal(view.phase.label, "Relecture 2");
  assert.deepEqual(view.cycles.map(({ rank, verdict, pending }) => ({ rank, verdict, pending })), [
    { rank: 1, verdict: "à corriger", pending: false },
    { rank: 2, verdict: null, pending: true },
  ]);
  assert.equal(view.reviewCount, 1);
});

test("a review whose verdict is recorded is no longer in progress", async () => {
  const lines = sessionUpTo("exploration", "implementation", "record1", "review1");
  const startedAt = Date.parse("2026-10-14T10:00:00.000Z");
  const recorded = [{ at: new Date(startedAt + 3600000).toISOString(), revue: "revue-1.diff", verdict: "accepté", modele: "claude-opus-5-5" }];
  const view = await viewOf({ lines, reviews: recorded });
  assert.deepEqual(view.cycles.map((cycle) => [cycle.rank, cycle.pending]), [[1, false]]);
});

test("the timeline lists the phases done, the one in progress and the ones to come, without the recording step", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration", "implementation", "record1", "review1", "correction", "record2", "review2") });
  assert.deepEqual(timelineOf(view), [
    "done:Exploration", "done:Implémentation", "done:Relecture 1", "done:Correction", "current:Relecture 2",
    "todo:Contrôle complet", "todo:Verdict", "todo:Contrôles de la boucle", "todo:Rétrospective",
  ]);
});

test("the recording step shows in the timeline while it is the phase in progress", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration", "implementation", "record1") });
  assert.deepEqual(timelineOf(view).slice(0, 4), ["done:Exploration", "done:Implémentation", "current:Enregistrement de l'état relu", "todo:Relecture"]);
});

test("a session that has not acted yet is starting, with every phase still to come", async () => {
  const view = await viewOf({ lines: [] });
  assert.equal(view.phase.label, "Démarrage");
  assert.equal(timelineOf(view)[0], "current:Démarrage");
  assert.equal(timelineOf(view)[1], "todo:Exploration");
});

test("once the session has ended the phases come from the events: the loop's own checks, then the retrospective", async () => {
  const lines = sessionUpTo("exploration", "implementation", "record1", "review1", "check", "verdict", "end");
  const ended = [stream.sessionEvent(0, "T015"), stream.endedEvent(80, "T015")];
  const checks = await viewOf({ lines, events: ended });
  assert.equal(checks.phase.label, "Contrôles de la boucle");
  assert.deepEqual(timelineOf(checks).slice(-3), ["done:Verdict", "current:Contrôles de la boucle", "todo:Rétrospective"]);
  const retro = await viewOf({ lines, events: [...ended, stream.integratedEvent(82, "T015")] });
  assert.equal(retro.phase.label, "Rétrospective");
  assert.equal(timelineOf(retro).at(-1), "current:Rétrospective");
});

test("a blocked ticket keeps its reason during retrospective and a refused attempt shows its reason", async () => {
  const started = [stream.sessionEvent(0, "T015"), stream.endedEvent(80, "T015")];
  const blocked = await viewOf({ events: [...started, stream.blockedEvent(81, "T015", "the ticket is wrong")] });
  assert.deepEqual([blocked.phase.label, blocked.reason], ["Rétrospective", "the ticket is wrong"]);
  const refused = await viewOf({ events: [...started, stream.refusedEvent(81, "T015", 1, "no verdict")] });
  assert.deepEqual([refused.phase.label, refused.reason], ["Tentative refusée", "no verdict"]);
});

test("a stopped loop is stopped whatever its last event says, and keeps the phase it stopped in", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration", "implementation"), loop: { alive: false, pid: 4242 } });
  assert.deepEqual([view.alive, view.phase.label, view.phase.detail], [false, "Boucle arrêtée", "Implémentation"]);
  assert.equal(view.timeline.at(-1).state, "stopped");
  assert.equal(view.eta, null);
});

test("a quota stop remains visible after the lock is released and announces no checks or retrospective", async () => {
  const reprise = "Oct 22nd, 2026 8:41 AM";
  const events = [stream.sessionEvent(0, "T015"), stream.endedEvent(80, "T015"),
    stream.loopEvent(81, "quota-epuise", { ticket: "T015", reprise })];
  for (const alive of [true, false]) {
    const view = await viewOf({ events, loop: { alive }, tickets: stream.QUEUE.map(t => t.id === "T015" ? { ...t, statut: "a-faire" } : t) });
    assert.equal(alive ? view.phase.label : view.phase.detail, "Quota Codex épuisé");
    assert.ok(view.reason.includes(reprise));
    assert.equal(view.finished.some(t => t.id === "T015"), false);
    assert.deepEqual(view.cycles, []);
    assert.equal(view.timeline.some(entry => entry.state === "todo"), false);
    assert.ok(view.remaining.tickets.some(t => t.id === "T015"));
  }
});

test("the view of a tuning session is a tuning, not a ticket of the queue", async () => {
  const tuning = stream.loopEvent(1, "harmonisation", { id: "H001", sujets: ["a"], observations: ["R-1"] });
  const events = [stream.integratedEvent(0, "T001"), tuning, stream.sessionEvent(2, "H001")];
  const view = await viewOf({ events, lines: [stream.assistant([stream.agentCall("h", "harmoniseur", "Tune")])] });
  const shown = [view.ticket.id, view.ticket.kind, view.ticket.titre, view.phase.label];
  assert.deepEqual(shown, ["H001", "harmonisation", "Harmonisation des consignes", "Harmonisation"]);
});

test("the view is empty but readable before the loop has written anything", async () => {
  const view = await viewOf({ events: [], loop: { alive: false, pid: null, launchedAt: null } });
  assert.deepEqual([view.ticket, view.phase.label, view.finished, view.cycles], [null, "Boucle arrêtée", [], []]);
});

test("the last actions of the stream come with the view, at most eight", async () => {
  const reads = Array.from({ length: 12 }, (_, i) => stream.assistant([stream.toolUse(`r${i}`, "Read", { file_path: `/work/core/f${i}.cjs` })]));
  const view = await viewOf({ lines: reads });
  assert.deepEqual([view.actions.length, view.actions.at(-1).target], [8, "core/f11.cjs"]);
});

test("the night counts the tickets finished since the launch, the cost, and what remains with its estimated end", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration") });
  const finished = view.finished.map(({ id, outcome, durationMs }) => [id, outcome, durationMs]);
  assert.deepEqual(finished, [["T001", "integre", 20 * 60000], ["T002", "integre", 39 * 60000]]);
  assert.equal(view.costUsd, 6);
  assert.deepEqual(view.remaining.tickets.map((t) => t.id), ["T016", "T017"]);
  // Moyenne 29,5 min ; T015 tourne depuis 28 min : il reste 1,5 min à T015 puis deux tickets.
  assert.equal(view.eta.at, Date.parse(stream.minutesAfter(90)) + 1.5 * 60000 + 2 * 29.5 * 60000);
  assert.equal(view.eta.basis, "launch");
});

test("tickets finished before the launch are left out of the night, but still give an estimate when nothing finished since", async () => {
  const events = [
    stream.sessionEvent(-200, "T001"), stream.integratedEvent(-170, "T001", 2),
    stream.sessionEvent(-160, "T002"), stream.integratedEvent(-100, "T002", 2),
    stream.sessionEvent(1, "T015"),
  ];
  const view = await viewOf({ events, lines: sessionUpTo("exploration") });
  assert.deepEqual([view.finished.length, view.costUsd], [0, 0]);
  assert.deepEqual([view.eta.basis, view.eta.averageMs], ["history", 45 * 60000]);
});

test("the limit given to the loop caps the remaining tickets by what it already took", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration"), loop: { maxTickets: 4 } });
  assert.deepEqual([view.remaining.tickets.map((t) => t.id), view.remaining.capped], [["T016"], true]);
});

test("a loop without a known launch time counts the last twelve hours before its last event", async () => {
  const events = [
    stream.sessionEvent(0, "T001"), stream.integratedEvent(10, "T001", 1),
    stream.sessionEvent(900, "T002"), stream.integratedEvent(920, "T002", 1),
    stream.sessionEvent(930, "T015"),
  ];
  const view = await viewOf({ events, loop: { launchedAt: null }, now: 931 });
  assert.deepEqual(view.finished.map((entry) => entry.id), ["T002"]);
  assert.equal(view.sinceKind, "window");
  const launched = await viewOf({ events, now: 931 });
  assert.equal(launched.sinceKind, "launch");
});

test("during a correction the next review is still to come", async () => {
  const view = await viewOf({ lines: sessionUpTo("exploration", "implementation", "record1", "review1", "correction") });
  assert.deepEqual(timelineOf(view), [
    "done:Exploration", "done:Implémentation", "done:Relecture 1", "current:Correction",
    "todo:Relecture", "todo:Contrôle complet", "todo:Verdict", "todo:Contrôles de la boucle", "todo:Rétrospective",
  ]);
});

test("a blocked ticket or a refused attempt announces no phase to come", async () => {
  const started = [stream.sessionEvent(0, "T015"), stream.endedEvent(80, "T015")];
  const blocked = await viewOf({ events: [...started, stream.loopEvent(81, "bloque", { ticket: "T015", raison: "x", tentatives: 1, cout_usd: 1 })] });
  const refused = await viewOf({ events: [...started, stream.loopEvent(81, "tentative-refusee", { ticket: "T015", attempt: 1, raison: "x" })] });
  assert.deepEqual(timelineOf(blocked), ["current:Rétrospective"]);
  assert.deepEqual(timelineOf(refused), ["current:Tentative refusée"]);
});

test("a push refusal is forgotten once the loop starts another session", async () => {
  const refusal = [stream.sessionEvent(0, "T001"), stream.integratedEvent(5, "T001"), stream.loopEvent(6, "push-refuse", { ticket: "T001", sortie: "fatal" })];
  assert.equal((await viewOf({ events: refusal })).pushRefused, true);
  assert.equal((await viewOf({ events: [...refusal, stream.sessionEvent(7, "T015")] })).pushRefused, false);
});

test("a loop launched after its last event shows nothing of the earlier launch, and waits for its first ticket", async () => {
  const earlier = [stream.sessionEvent(-200, "T001"), stream.endedEvent(-180, "T001"), stream.integratedEvent(-175, "T001")];
  const view = await viewOf({ events: earlier, now: 1, lines: sessionUpTo("review1"),
    reviews: [{ at: stream.minutesAfter(-180), verdict: "à corriger" }], reports: { 1: REPORT_FIX } });
  assert.deepEqual([view.ticket, view.phase.label, view.finished, view.costUsd], [null, "En attente du premier ticket", [], 0]);
  assert.deepEqual(timelineOf(view), ["current:En attente du premier ticket"]);
  assert.deepEqual([view.actions, view.cycles, view.reviewCount], [[], [], 0]);
});

test("a loop that has written an event since its launch shows that event", async () => {
  const view = await viewOf({ events: [stream.integratedEvent(-175, "T001"), stream.sessionEvent(1, "T015")], now: 2 });
  assert.deepEqual([view.ticket.id, view.phase.label], ["T015", "Démarrage"]);
});

test("a blocked ticket runs its retrospective before showing the block", async () => {
  const events = [stream.sessionEvent(0, "T015"), stream.blockedEvent(80, "T015", "wrong ticket")];
  const view = await viewOf({ events });
  assert.deepEqual([view.phase.label, view.reason], ["Rétrospective", "wrong ticket"]);
});

test("a completed retrospective leaves the loop between tickets", async () => {
  const events = [stream.sessionEvent(0, "T015"), stream.integratedEvent(80, "T015"), stream.retroEvent(81, "T015")];
  assert.equal((await viewOf({ events })).phase.label, "Entre deux tickets");
});

test("a failed retrospective ends the retrospective and preserves the block reason", async () => {
  const events = [stream.sessionEvent(0, "T015"), stream.blockedEvent(80, "T015", "wrong ticket"),
    stream.loopEvent(81, "retro-echouee", { ticket: "T015" })];
  const view = await viewOf({ events });
  assert.deepEqual([view.phase.label, view.reason], ["Bloqué", "wrong ticket"]);
  const integrated = [stream.sessionEvent(0, "T015"), stream.integratedEvent(80, "T015"), events.at(-1)];
  assert.equal((await viewOf({ events: integrated })).phase.label, "Entre deux tickets");
});

test("a loop with retrospectives disabled never announces one", async () => {
  const loop = { retrospective: false };
  const started = [stream.sessionEvent(0, "T015")];
  const active = await viewOf({ events: started, lines: sessionUpTo("implementation"), loop });
  assert.ok(!timelineOf(active).some((entry) => entry.includes("Rétrospective")));
  const integrated = await viewOf({ events: [...started, stream.integratedEvent(80, "T015")], loop });
  assert.equal(integrated.phase.label, "Entre deux tickets");
});

test("the review phase uses the cumulative cycle rank after a refused attempt", async () => {
  const reviews = [-20, -10].map((minute) => ({ at: stream.minutesAfter(minute), verdict: "à corriger" }));
  const view = await viewOf({ lines: sessionUpTo("review1"), reviews });
  assert.equal(view.phase.label, "Relecture 3");
  assert.equal(view.cycles.at(-1).rank, 3);
});

test("an estimate from previous launches uses only the ten most recent integrated ticket durations", async () => {
  const events = Array.from({ length: 12 }, (_, index) => {
    const minute = -2000 + index * 100;
    const duration = index < 2 ? 90 : (index - 1) * 2;
    return [stream.sessionEvent(minute, "T001"), stream.integratedEvent(minute + duration, "T001")];
  }).flat();
  events.push(stream.sessionEvent(1, "T015"));
  const view = await viewOf({ events, now: 2 });
  assert.equal(view.eta.averageMs, 11 * 60000);
  assert.equal(view.eta.at, Date.parse(stream.minutesAfter(34)));
  assert.deepEqual(view.finished, []);
});

test("a harmonizer correction announces the next review without announcing another harmonization", async () => {
  const lines = [stream.assistant([stream.agentCall("h", "harmoniseur")]),
    stream.agentResult("h", "agent-harmonizer", "harmoniseur"), ...sessionUpTo("review1"),
    stream.assistant([stream.toolUse("m", "SendMessage", { to: "agent-harmonizer" })])];
  const view = await viewOf({ events: [stream.sessionEvent(0, "H001")], lines });
  assert.equal(view.phase.label, "Correction");
  assert.deepEqual(view.timeline.filter((entry) => entry.state === "todo").map((entry) => entry.label),
    ["Relecture", "Contrôle complet", "Verdict", "Contrôles de la boucle"]);
});
