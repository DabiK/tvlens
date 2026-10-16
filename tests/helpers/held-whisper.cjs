const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { bounded, until } = require('./wait.cjs');
const { LocalTranscriber } = require('../../adapters/local-transcriber.cjs');

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function heldWhisper(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-held-whisper-'));
  const log = path.join(dir, 'events.log'), binary = path.join(dir, 'whisper.cjs'), model = path.join(dir, 'model.bin');
  const runs = [];
  const records = async () => {
    const text = await fs.readFile(log, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return text.trim().split('\n').filter(Boolean).map(line => {
      const [event, pid] = line.split(' ');
      return { event, pid: Number(pid) };
    });
  };
  const exited = pid => until(() => !alive(pid), `Whisper PID ${pid} disappeared`);
  t.after(async () => {
    // Libérer aussi un enfant dont le démarrage est encore en vol après une assertion échouée.
    await fs.writeFile(path.join(dir, 'release-all'), '');
    const settled = await bounded(Promise.allSettled(runs));
    if (!Array.isArray(settled)) {
      for (const { event, pid } of await records()) {
        if (event === 'start' && alive(pid)) process.kill(pid, 'SIGKILL');
      }
      assert.ok(Array.isArray(await bounded(Promise.allSettled(runs))), 'Whisper runs settled during cleanup');
    }
    for (const { event, pid } of await records()) {
      if (event === 'start') await exited(pid);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(model, 'm');
  await fs.writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const dir = ${JSON.stringify(dir)}, log = ${JSON.stringify(log)};
const args = process.argv.slice(2), out = args[args.indexOf('-of') + 1];
const RELEASE_POLL_MS = 2;
let finished = false;
function finish() {
  if (finished || !(fs.existsSync(path.join(dir, 'release-' + process.pid)) || fs.existsSync(path.join(dir, 'release-all')))) return;
  finished = true;
  fs.writeFileSync(out + '.json', JSON.stringify({ transcription: [{ text: ' Bonjour ' }] }));
  fs.appendFileSync(log, 'end ' + process.pid + '\\n');
  clearInterval(releasePoll);
}
const releasePoll = setInterval(finish, RELEASE_POLL_MS);
fs.appendFileSync(log, 'start ' + process.pid + '\\n');
finish();
`, { mode: 0o700 });
  const transcriber = new LocalTranscriber({ binary, model, threads: 1, getLanguage: () => 'fr' });
  const run = transcriber.run.bind(transcriber);
  transcriber.run = (...args) => {
    const pending = run(...args);
    runs.push(pending);
    pending.catch(() => {});
    return pending;
  };
  return {
    transcriber, records, exited,
    started: count => until(async () => (await records()).filter(row => row.event === 'start')[count - 1]?.pid,
      `Whisper process ${count} started with a PID`),
    release: pid => fs.writeFile(path.join(dir, 'release-' + pid), ''),
  };
}

module.exports = { heldWhisper };
