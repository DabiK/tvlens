const { test } = require("node:test");
const assert = require("node:assert/strict");
const stream = require("./helpers/loop-stream.cjs");

const { loopView, ticket } = stream;

// --- Événements de la boucle : ticket en cours, étape, tickets terminés ---

test("the current ticket is the one of the last session event, with its model, effort and start", async () => {
  const { analyzeEvents } = await loopView();
  const sensible = { niveau: "sensible", modele: "claude-opus-5-5", effort: "xhigh", palier: 2 };
  const events = [
    stream.sessionEvent(0, "T001"),
    stream.endedEvent(5, "T001"),
    stream.integratedEvent(7, "T001"),
    stream.sessionEvent(9, "T015", 1, sensible),
  ];
  const { current, stage } = analyzeEvents(events);
  assert.deepEqual(current, {
    id: "T015",
    moteur: "claude",
    kind: "ticket",
    attempt: 1,
    niveau: "sensible",
    modele: "claude-opus-5-5",
    effort: "xhigh",
    palier: 2,
    relecteur: "opus",
    startedAt: stream.minutesAfter(9),
    attemptAt: stream.minutesAfter(9),
  });
  assert.equal(stage, "session");
});

test("there is no current ticket and no stage before the first event", async () => {
  const { analyzeEvents } = await loopView();
  assert.deepEqual(analyzeEvents([]), {
    current: null,
    stage: "none",
    stageAt: null,
    reason: null,
    pushRefused: false,
    retroPending: false,
    finished: [],
    costUsd: 0,
    unknownCosts: 0,
    lastEventAt: null,
  });
});

test("the stage follows the events of the ticket: gates after the session ends, then refused, integrated or blocked", async () => {
  const { analyzeEvents } = await loopView();
  const stageAfter = (...events) => analyzeEvents(events).stage;
  assert.equal(stageAfter(stream.sessionEvent(0, "T015")), "session");
  assert.equal(stageAfter(stream.sessionEvent(0, "T015"), stream.endedEvent(5, "T015")), "gates");
  const ended = [stream.sessionEvent(0, "T015"), stream.endedEvent(5, "T015")];
  assert.equal(stageAfter(...ended, stream.refusedEvent(6, "T015")), "refused");
  assert.equal(stageAfter(...ended, stream.integratedEvent(6, "T015")), "integrated");
  assert.equal(stageAfter(...ended, stream.blockedEvent(6, "T015")), "blocked");
});

for (const reprise of [null, "Oct 22nd, 2026 8:41 AM"]) {
  test(`quota exhaustion leaves the ticket pending without a failure or retrospective: ${reprise}`, async () => {
    const { analyzeEvents } = await loopView();
    const quota = stream.loopEvent(6, "quota-epuise", { ticket: "T015", reprise });
    const state = analyzeEvents([stream.sessionEvent(0, "T015"), stream.endedEvent(5, "T015"), quota]);
    assert.equal(state.stage, "quota");
    assert.equal(state.current.id, "T015");
    assert.equal(state.stageAt, Date.parse(quota.at));
    assert.equal(state.retroPending, false);
    assert.deepEqual(state.finished, []);
    assert.match(state.reason, /Quota Codex épuisé/);
    if (reprise) assert.ok(state.reason.includes(reprise));
    else assert.match(state.reason, /Reprise non fournie/);
  });
}

test("a refusal and a block keep their reason, and the retrospective changes neither the stage nor the reason", async () => {
  const { analyzeEvents } = await loopView();
  const blocked = [stream.sessionEvent(0, "T015"), stream.endedEvent(5, "T015"), stream.blockedEvent(6, "T015", "ticket is wrong")];
  const afterRetro = analyzeEvents([...blocked, stream.retroEvent(7, "T015")]);
  assert.equal(afterRetro.stage, "blocked");
  assert.equal(afterRetro.reason, "ticket is wrong");
});

test("a refused attempt followed by the next attempt is one stretch of work on the ticket, started at the first attempt", async () => {
  const { analyzeEvents } = await loopView();
  const events = [
    stream.sessionEvent(0, "T015", 1),
    stream.endedEvent(10, "T015", 1),
    stream.refusedEvent(11, "T015", 1),
    stream.sessionEvent(12, "T015", 2),
  ];
  const { current } = analyzeEvents(events);
  assert.equal(current.attempt, 2);
  assert.equal(current.startedAt, stream.minutesAfter(0));
  assert.equal(current.attemptAt, stream.minutesAfter(12));
});

test("a session that starts again at the same attempt, after a restart of the loop, restarts the stretch of work", async () => {
  const { analyzeEvents } = await loopView();
  const { current } = analyzeEvents([stream.sessionEvent(0, "T015", 1), stream.sessionEvent(120, "T015", 1)]);
  assert.equal(current.startedAt, stream.minutesAfter(120));
});

test("the stage keeps the time of the event that set it, whatever is written after", async () => {
  const { analyzeEvents } = await loopView();
  const events = [stream.sessionEvent(0, "T015"), stream.endedEvent(5, "T015"), stream.integratedEvent(6, "T015"), stream.retroEvent(7, "T015")];
  const analysis = analyzeEvents(events);
  assert.deepEqual([analysis.stageAt, analysis.lastEventAt], [Date.parse(stream.minutesAfter(6)), Date.parse(stream.minutesAfter(7))]);
});

test("a push refusal is noted without changing the stage", async () => {
  const { analyzeEvents } = await loopView();
  const refusal = stream.loopEvent(7, "push-refuse", { ticket: "T015", sortie: "fatal" });
  const events = [stream.sessionEvent(0, "T015"), stream.endedEvent(5, "T015"), stream.integratedEvent(6, "T015"), refusal];
  const analysis = analyzeEvents(events);
  assert.deepEqual([analysis.stage, analysis.pushRefused], ["integrated", true]);
});

test("a tuning session is a current item of its own kind, and its end leaves the loop between two tickets", async () => {
  const { analyzeEvents } = await loopView();
  const start = [stream.integratedEvent(0, "T001"), stream.loopEvent(1, "harmonisation", { id: "H001", sujets: ["a"], observations: ["R-1"] })];
  assert.equal(analyzeEvents(start).stage, "harmonisation");
  const running = analyzeEvents([...start, stream.sessionEvent(2, "H001")]);
  assert.deepEqual([running.current.id, running.current.kind, running.stage], ["H001", "harmonisation", "session"]);
  const done = stream.loopEvent(10, "harmonisation-integree", { id: "H001", commit: "def5678" });
  const ended = analyzeEvents([...start, stream.sessionEvent(2, "H001"), stream.endedEvent(9, "H001"), done]);
  assert.equal(ended.stage, "between");
});

test("finished tickets since the launch carry their wall duration, cost and outcome; earlier ones are left out", async () => {
  const { analyzeEvents } = await loopView();
  const events = [
    stream.sessionEvent(0, "T001"), stream.endedEvent(10, "T001", 1, 3), stream.integratedEvent(12, "T001", 3),
    stream.sessionEvent(100, "T002"), stream.endedEvent(120, "T002", 1, 4), stream.integratedEvent(123, "T002", 4, { tentatives: 2 }),
    stream.sessionEvent(130, "T003"), stream.endedEvent(140, "T003", 1, 5), stream.blockedEvent(141, "T003", "stuck", 5),
  ];
  const { finished } = analyzeEvents(events, { since: Date.parse(stream.minutesAfter(60)) });
  assert.deepEqual(
    finished.map(({ id, outcome, durationMs, costUsd, attempts }) => ({ id, outcome, durationMs, costUsd, attempts })),
    [
      { id: "T002", outcome: "integre", durationMs: 23 * 60000, costUsd: 4, attempts: 2 },
      { id: "T003", outcome: "bloque", durationMs: 11 * 60000, costUsd: 5, attempts: 1 },
    ],
  );
});

test("the cost counts the sessions and the retrospectives since the launch, and nothing else", async () => {
  const { analyzeEvents } = await loopView();
  const events = [
    stream.sessionEvent(0, "T001"), stream.endedEvent(10, "T001", 1, 3), stream.integratedEvent(12, "T001", 3), stream.retroEvent(13, "T001", 0.25),
    stream.sessionEvent(100, "T002"), stream.endedEvent(120, "T002", 1, 4), stream.integratedEvent(123, "T002", 4), stream.retroEvent(124, "T002", 0.5),
  ];
  assert.equal(analyzeEvents(events, { since: Date.parse(stream.minutesAfter(60)) }).costUsd, 4.5);
  assert.equal(analyzeEvents(events).costUsd, 7.75);
});

// --- File restante ---

test("the remaining tickets are the ones the loop would take next, as if each ticket it takes were finished", async () => {
  const { remainingTickets } = await loopView();
  const queue = [
    ticket("T001", "termine"),
    ticket("T002", "en-cours"),
    ticket("T003", "a-faire", { bloquePar: ["T002"] }),
    ticket("T004", "a-faire", { bloquePar: ["T003"] }),
  ];
  const { tickets, reason } = remainingTickets(queue, { runningId: "T002" });
  assert.deepEqual(tickets.map((t) => t.id), ["T003", "T004"]);
  assert.equal(reason, "Plus aucun ticket à faire.");
});

test("the simulation stops at the first reason the loop would give, and names the tickets that wait for the owner", async () => {
  const { remainingTickets } = await loopView();
  const asking = ticket("T004", "a-faire", { decisionAttendue: "which provider?" });
  const queue = [ticket("T002", "en-cours"), ticket("T003"), asking, ticket("T005", "a-faire", { bloquePar: ["T004"] })];
  const { tickets, reason } = remainingTickets(queue, { runningId: "T002" });
  assert.deepEqual(tickets.map((t) => t.id), ["T003"]);
  assert.match(reason, /T004/);
});

test("a ticket left in progress or blocked that is not running stops the queue at once", async () => {
  const { remainingTickets } = await loopView();
  const stuck = remainingTickets([ticket("T003", "bloque"), ticket("T004")], { runningId: null });
  assert.deepEqual(stuck.tickets, []);
  assert.match(stuck.reason, /T003/);
});

test("a limit on the tickets the loop was asked to take cuts the queue and says so", async () => {
  const { remainingTickets } = await loopView();
  const queue = [ticket("T001", "en-cours"), ticket("T002"), ticket("T003"), ticket("T004")];
  const capped = remainingTickets(queue, { runningId: "T001", limit: 2 });
  assert.deepEqual([capped.tickets.map((t) => t.id), capped.capped], [["T002", "T003"], true]);
  const roomy = remainingTickets(queue, { runningId: "T001", limit: 9 });
  assert.deepEqual([roomy.tickets.length, roomy.capped], [3, false]);
  assert.deepEqual(remainingTickets(queue, { runningId: "T001", limit: 0 }).tickets, []);
});

test("each remaining ticket shows its id and title", async () => {
  const { remainingTickets } = await loopView();
  const { tickets } = remainingTickets([ticket("T001", "en-cours"), ticket("T002")], { runningId: "T001" });
  assert.deepEqual(tickets, [{ id: "T002", titre: "Title of T002" }]);
});

// --- Fin estimée ---

const MINUTE = 60000;

test("the estimated end is the average duration of the finished tickets times what remains, less what the current ticket already took", async () => {
  const { estimateEnd } = await loopView();
  const now = Date.parse(stream.minutesAfter(500));
  const estimate = estimateEnd({ now, durationsMs: [20 * MINUTE, 40 * MINUTE], remaining: 3, elapsedMs: 10 * MINUTE });
  assert.deepEqual(estimate, { at: now + 20 * MINUTE + 3 * 30 * MINUTE, averageMs: 30 * MINUTE });
});

test("the current ticket past the average counts as finished now, and with nothing running only the remaining ones count", async () => {
  const { estimateEnd } = await loopView();
  const now = Date.parse(stream.minutesAfter(500));
  assert.equal(estimateEnd({ now, durationsMs: [10 * MINUTE], remaining: 1, elapsedMs: 50 * MINUTE }).at, now + 10 * MINUTE);
  assert.equal(estimateEnd({ now, durationsMs: [10 * MINUTE], remaining: 2, elapsedMs: null }).at, now + 20 * MINUTE);
});

test("there is no estimated end without a finished ticket to average", async () => {
  const { estimateEnd } = await loopView();
  assert.equal(estimateEnd({ now: 0, durationsMs: [], remaining: 4, elapsedMs: 0 }), null);
});

test("an event whose phase looks like a property of every object changes nothing", async () => {
  const { analyzeEvents } = await loopView();
  const odd = [stream.loopEvent(1, "constructor"), stream.loopEvent(2, "__proto__"), stream.loopEvent(3, "toString")];
  const analysis = analyzeEvents([stream.sessionEvent(0, "T015"), ...odd]);
  assert.deepEqual([analysis.stage, analysis.current.id], ["session", "T015"]);
});
