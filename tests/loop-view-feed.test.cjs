const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const stream = require("./helpers/loop-stream.cjs");
const { QUOTA_EVENTS } = require("./helpers/codex-session.cjs");

const feedModule = () => import(pathToFileURL(path.join(__dirname, "..", "scripts/loop-view/feed.mjs")).href);
const kinds = (entries) => entries.map((entry) => (entry.k === "phase" ? `phase:${entry.label}` : entry.k));
const { codexEvent, codexItem } = stream;
const command = (type, id, text, extra = {}) => codexItem(type, { id, type: "command_execution", command: text, ...extra });
const toolResult = (id, content, isError = false) =>
  JSON.stringify({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] } });

test("the Codex feed shows the quota retry announcement without copying provider URLs", async () => {
  const { emptyFeed, foldFeed, feedSince } = await feedModule();
  const feed = foldFeed(emptyFeed(), QUOTA_EVENTS.map(event => JSON.stringify(event)), { engine: "codex" });
  const shown = feedSince(feed, "codex", 0).entries;
  assert.deepEqual(shown.map(entry => entry.k), ["warn", "warn"]);
  for (const entry of shown) {
    assert.match(entry.text, /Quota Codex épuisé/);
    assert.ok(entry.text.includes("Oct 22nd, 2026 8:41 AM"));
  }
  assert.doesNotMatch(JSON.stringify(shown), /https?:|chatgpt\.com|You’ve/);
});

test("a Codex stream reads like a terminal: phases, messages, commands with their output, written files", async () => {
  const { emptyFeed, foldFeed, feedSince, feedAgents } = await feedModule();
  const lines = [
    codexEvent("thread.started", { thread_id: "thread-example" }), codexEvent("turn.started"),
    codexItem("item.completed", { id: "m1", type: "agent_message", text: "Je lis le ticket." }),
    command("item.started", "c1", "/bin/zsh -lc 'cat CLAUDE.md'", { status: "in_progress" }),
    command("item.completed", "c1", "/bin/zsh -lc 'cat CLAUDE.md'", { status: "completed", exit_code: 0, aggregated_output: "# Rules\nline two\n" }),
    codexItem("item.completed", { id: "p1", type: "file_change", changes: [{ path: "/work/core/example.cjs", kind: "update" }] }),
    command("item.completed", "c2", "node --test tests/example.test.cjs", { exit_code: 1, aggregated_output: "not ok 1" }),
  ];
  const feed = foldFeed(emptyFeed(), lines, { engine: "codex", root: "/work" });
  assert.deepEqual(feedAgents(feed), ["codex"]);
  const { entries } = feedSince(feed, "codex", 0);
  assert.deepEqual(kinds(entries), ["phase:Exploration", "say", "cmd", "phase:Implémentation", "edit", "cmd"]);
  assert.deepEqual([entries[2].cmd, entries[2].out, entries[2].total, entries[2].exit], ["cat CLAUDE.md", ["# Rules", "line two"], 2, 0]);
  assert.deepEqual(entries[4].paths, ["core/example.cjs"]);
  assert.equal(entries[5].exit, 1);
});

test("a running command stays open, and a client asking from its open line gets the completed line in its place", async () => {
  const { emptyFeed, foldFeed, feedSince } = await feedModule();
  const started = foldFeed(emptyFeed(), [codexEvent("turn.started"), command("item.started", "check", "node scripts/check.mjs")], { engine: "codex" });
  const running = feedSince(started, "codex", 0);
  assert.equal(running.entries.at(-1).open, true);
  assert.equal(running.entries.at(-2).label, "Contrôle complet");
  const firstOpen = running.entries.findIndex((entry) => entry.open);
  const completion = command("item.completed", "check", "node scripts/check.mjs", { exit_code: 0, aggregated_output: "ok" });
  const done = foldFeed(started, [completion], { engine: "codex" });
  const update = feedSince(done, "codex", firstOpen);
  assert.equal(update.from, firstOpen);
  assert.deepEqual(update.entries.map((entry) => [entry.k, entry.open, entry.out]), [["cmd", false, ["ok"]]]);
  assert.equal(update.total, running.total, "the completion replaced the line instead of adding one");
});

test("a client that asks past a line still open receives it again from that line", async () => {
  const { emptyFeed, foldFeed, feedSince } = await feedModule();
  const message = codexItem("item.completed", { id: "m", type: "agent_message", text: "En attente." });
  const feed = foldFeed(emptyFeed(), [command("item.started", "c1", "sleep 9"), message], { engine: "codex" });
  const page = feedSince(feed, "codex", 2);
  assert.deepEqual([page.from, page.entries.map((entry) => entry.k)], [0, ["cmd", "say"]]);
});

test("a long output keeps its first lines and says how many there were", async () => {
  const { emptyFeed, foldFeed, feedSince, OUTPUT_LINES } = await feedModule();
  const output = Array.from({ length: 50 }, (_, index) => `line ${index}`).join("\n");
  const feed = foldFeed(emptyFeed(), [command("item.completed", "c1", "seq 50", { exit_code: 0, aggregated_output: output })], { engine: "codex" });
  const [entry] = feedSince(feed, "codex", 0).entries;
  assert.equal(entry.out.length, OUTPUT_LINES);
  assert.equal(entry.total, 50);
});

test("the shell wrapper of a Codex command is removed, quotes included", async () => {
  const { emptyFeed, foldFeed, feedSince } = await feedModule();
  const feed = foldFeed(emptyFeed(), [command("item.completed", "c1", "/bin/zsh -lc 'echo '\"'\"'hi'\"'\"''", { exit_code: 0 })], { engine: "codex" });
  assert.equal(feedSince(feed, "codex", 0).entries[0].cmd, "echo 'hi'");
});

test("a Claude session gives each sub-agent its own feed and the orchestrator sees whom it launched", async () => {
  const { emptyFeed, foldFeed, feedSince, feedAgents } = await feedModule();
  const session = stream.fullSession();
  const lines = [
    ...session.exploration.slice(0, 2), toolResult("r1", "---\nid: T015\n"), session.exploration[2],
    ...session.implementation, stream.assistant([{ type: "text", text: "Tout est relu." }]), ...session.end,
  ];
  const feed = foldFeed(emptyFeed(), lines, { engine: "claude", root: "/work" });
  assert.deepEqual(feedAgents(feed), ["orchestrateur", "explorateur", "implementeur"]);
  const orchestrator = feedSince(feed, "orchestrateur", 0).entries;
  assert.deepEqual(kinds(orchestrator), ["spawn", "spawn", "say", "turn"]);
  assert.equal(orchestrator[0].agent, "explorateur");
  const explorer = feedSince(feed, "explorateur", 0).entries;
  assert.deepEqual(kinds(explorer), ["phase:explorateur · Explore T015", "tool", "turn"]);
  assert.deepEqual([explorer[1].name, explorer[1].target, explorer[1].out], ["Read", stream.TICKET, ["---", "id: T015"]]);
  assert.equal(explorer[1].open, false);
});

test("folding a stream in two increments gives the same feed as folding it at once", async () => {
  const { emptyFeed, foldFeed } = await feedModule();
  const session = stream.fullSession();
  const lines = [...session.exploration, ...session.implementation, ...session.review1, ...session.check];
  const once = foldFeed(emptyFeed(), lines, { engine: "claude", root: "/work" });
  const twice = foldFeed(foldFeed(emptyFeed(), lines.slice(0, 3), { engine: "claude", root: "/work" }), lines.slice(3), { engine: "claude", root: "/work" });
  assert.deepEqual(twice, once);
});

test("folding never changes the feed it was given", async () => {
  const { emptyFeed, foldFeed, feedSince } = await feedModule();
  const before = foldFeed(emptyFeed(), [command("item.started", "c1", "sleep 1")], { engine: "codex" });
  foldFeed(before, [command("item.completed", "c1", "sleep 1", { exit_code: 0 })], { engine: "codex" });
  assert.equal(feedSince(before, "codex", 0).entries[0].open, true);
});

test("a feed keeps its last entries only, and a client behind the kept window starts again from the first kept one", async () => {
  const { emptyFeed, foldFeed, feedSince, MAX_ENTRIES } = await feedModule();
  const messages = Array.from({ length: MAX_ENTRIES + 25 }, (_, index) =>
    codexItem("item.completed", { id: `m${index}`, type: "agent_message", text: `Message ${index}` }));
  const feed = foldFeed(emptyFeed(), messages, { engine: "codex" });
  const page = feedSince(feed, "codex", 3);
  assert.equal(page.total, MAX_ENTRIES + 25);
  assert.equal(page.from, 25);
  assert.equal(page.entries.length, MAX_ENTRIES);
  assert.equal(page.entries[0].text, "Message 25");
});

test("an unknown agent has an empty feed", async () => {
  const { emptyFeed, feedSince } = await feedModule();
  assert.deepEqual(feedSince(emptyFeed(), "relecteur", 0), { from: 0, total: 0, entries: [] });
});
