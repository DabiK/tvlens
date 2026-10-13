const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CodexSurveillanceAgent } = require('../adapters/codex-surveillance-agent.cjs');

// The service unit bounds the number of tasks (threads of every process) of the server. The bound has to follow
// what the code can keep alive at once: on 2026-10-13 a unit left at 128 made the server crash on a real TV
// session as soon as a surveillance started (fork rejected by the pids controller; with no task left, concurrent
// image work in the server process ends in SIGSEGV — reproduced in an isolated unit).
const unit = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'tvlens.service'), 'utf8');
const setting = name => { const found = unit.split('\n').filter(line => line.startsWith(name + '=')); assert.equal(found.length, 1, `${name} is set once`); return found[0].slice(name.length + 1); };
// Measured on the server (Codex 0.158.0, npm launcher, 2 vCPU, no model turn): five roles connected at once held
// 163 tasks with their host, nine held 347 — about 38 each. With TasksMax=256 only 8 of the 9 could connect.
// Budgeted higher than measured: a role in a turn starts helpers and blocking threads.
const TASKS_PER_CODEX_ROLE = 45;
// Node (17 threads at the time of the crash), one Whisper and one ffmpeg child with their threads.
const TASKS_OF_THE_HOST = 48;

test('the service unit leaves room for every Codex role the server keeps alive, and for the overlap of a restart of the surveillance', () => {
  // The most verification workers the code accepts: one more is refused, so the count below is the real ceiling.
  const noClient = () => ({ prepare: async () => {}, close: async () => {} });
  let workers = 0;
  for (let n = 1; n <= 8; n++) { try { new CodexSurveillanceAgent({ workers: n, clientFactory: noClient }); workers = n; } catch { break; } }
  assert.equal(workers, 3, 'the sizing below assumes at most three verification workers');
  // What the server keeps alive: chat, passage description, re-examination, surveillance reading, and the
  // workers. (Recap and manual check are roles of the Mac host only: server/main.cjs never loads them.)
  const persistent = 4 + workers;
  assert.equal(persistent, 7);
  // A surveillance stopped and started again: closing a role does not wait for its process to end, so the old
  // ones overlap the new ones for a few seconds. Two more process trees at the worst: the limit covers that peak.
  const roles = persistent + 2;
  const needed = roles * TASKS_PER_CODEX_ROLE + TASKS_OF_THE_HOST;
  assert.equal(needed, 453);
  const tasksMax = Number(setting('TasksMax'));
  assert.ok(Number.isInteger(tasksMax), 'TasksMax is a number, never left to the default of the host');
  assert.ok(tasksMax >= needed, `TasksMax=${tasksMax} is below the ${needed} tasks ${roles} process trees (${persistent} roles and two closing) may need`);
  // Still a bound: a runaway spawn loop must hit it long before the host does.
  assert.ok(tasksMax <= 1024);
  // The crash it prevents restarts the server: the unit must keep restarting it, and keep killing the whole group
  // so that no Codex child outlives the server and its count.
  assert.equal(setting('Restart'), 'on-failure');
  assert.equal(setting('KillMode'), 'control-group');
});
