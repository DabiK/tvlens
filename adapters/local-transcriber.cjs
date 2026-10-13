const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');
const { executable } = require('./system-paths.cjs');
const { whisperDiagnostics } = require('./whisper-diagnostics.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

// Whisper encodes 1500 positions of 20 ms (30 s) whatever the clip length. 'auto' keeps the clip plus a margin;
// 0 (full context) whenever the RIFF header does not describe the bytes held, since a short context truncates speech.
function autoAudioCtx(wav) {
  const bytes = Buffer.isBuffer(wav) ? wav : Buffer.from(wav);
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return 0;
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (id === 'fmt ' && size >= 16 && at + 20 <= bytes.length) byteRate = bytes.readUInt32LE(at + 16);
    if (id === 'data') return byteRate && size && at + 8 + size <= bytes.length ? Math.min(1500, Math.max(256, Math.ceil(size / byteRate * 50) + 112)) : 0;
    at += 8 + size + (size & 1);
  }
  return 0;
}

class LocalTranscriber {
  constructor({ binary = executable('whisper-cli'), model, getLanguage = () => 'auto',
    threads = Math.min(4, os.availableParallelism()), audioCtx = 0 } = {}) {
    if (!Number.isInteger(threads) || threads < 1 || threads > 16) throw Error('Whisper : nombre de threads invalide (1–16).');
    if (audioCtx !== 0 && audioCtx !== 'auto' && !(Number.isInteger(audioCtx) && audioCtx >= 64 && audioCtx <= 1500)) throw Error('Whisper : contexte audio invalide (0, auto ou 64–1500).');
    Object.assign(this, { binary, model, getLanguage, threads, audioCtx });
    this.cache = new Map();
    this.running = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  async transcribe(audio, signal) {
    if (!audio?.length) return { text: '', limits: ['Aucune piste audio.'] };
    signal?.throwIfAborted();
    const started = performance.now();
    const language = validateTranscriptionLanguage(this.getLanguage());
    const bytes = Buffer.from(audio);
    const audioCtx = this.audioCtx === 'auto' ? autoAudioCtx(bytes) : this.audioCtx;
    const digest = createHash('sha256').update(language).update(bytes).digest('hex');
    // A full-context result and a reduced-context one never share an entry.
    const key = audioCtx ? digest + ':' + audioCtx : digest;
    if (this.cache.has(key)) {
      this.hits++;
      const cached = this.cache.get(key);
      return { ...cached, cacheHit: true, metrics: { threads: this.threads, audioCtx, elapsedMs: performance.now() - started } };
    }
    // The background lane and a re-inspection can ask for the same audio at once: one Whisper run serves both,
    // and it is only killed once every caller has given up.
    let run = this.running.get(key);
    if (!run) {
      this.misses++;
      const controller = new AbortController();
      run = { controller, waiting: 0 };
      // Identity-checked: an abandoned run settling late must not unregister the run that replaced it.
      run.result = this.run({ bytes, language, audioCtx, key, started }, controller.signal).finally(() => { if (this.running.get(key) === run) this.running.delete(key); });
      run.result.catch(() => {});
      this.running.set(key, run);
    }
    run.waiting++;
    return new Promise((resolve, reject) => {
      // A run abandoned by all its callers is forgotten at once: a later caller starts its own.
      const leave = () => { if (--run.waiting === 0) { if (this.running.get(key) === run) this.running.delete(key); run.controller.abort(signal.reason); } reject(signal.reason); };
      signal?.addEventListener('abort', leave, { once: true });
      run.result.then(resolve, reject).finally(() => signal?.removeEventListener('abort', leave));
    });
  }

  async run({ bytes, language, audioCtx, key, started }, signal) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-speech-'));
    let diagnostic = '';
    try {
      await fs.access(this.model);
      const input = path.join(dir, 'audio.wav'), output = path.join(dir, 'speech');
      await fs.writeFile(input, bytes, { mode: 0o600 });
      signal?.throwIfAborted();
      await new Promise((resolve, reject) => {
        const child = spawn(this.binary, ['-m', this.model, '-f', input, '-l', language,
          '-oj', '-of', output, '-t', String(this.threads), ...(audioCtx ? ['-ac', String(audioCtx)] : [])], { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
        // Drain stderr continuously, retain a bounded tail, never persist raw text.
        child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-65536); });
        const abort = () => child.kill('SIGKILL');
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        child.once('error', () => {
          signal?.removeEventListener('abort', abort);
          reject(Error('Whisper local indisponible.'));
        });
        child.once('close', code => {
          signal?.removeEventListener('abort', abort);
          if (signal?.aborted) reject(signal.reason);
          else if (code) reject(Error('Transcription locale échouée.'));
          else resolve();
        });
      });
      const data = JSON.parse(await fs.readFile(output + '.json', 'utf8'));
      const text = (data.transcription || []).map(s => s.text.trim()).filter(Boolean).join(' ');
      const value = { text, language, limits: ['Transcription automatique locale ; elle peut contenir des erreurs.'] };
      this.cache.set(key, value);
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
      return { ...value, cacheHit: false, metrics: { ...whisperDiagnostics(diagnostic), threads: this.threads, audioCtx, elapsedMs: performance.now() - started } };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { text: '', limits: ['Transcription locale indisponible : vérifie Whisper et son modèle.'],
        metrics: { ...whisperDiagnostics(diagnostic), threads: this.threads, audioCtx, elapsedMs: performance.now() - started, failed: true } };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
module.exports = { LocalTranscriber, autoAudioCtx };
