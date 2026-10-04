const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');
const { executable } = require('./system-paths.cjs');
const { whisperDiagnostics } = require('./whisper-diagnostics.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');

class LocalTranscriber {
  constructor({ binary = executable('whisper-cli'), model, getLanguage = () => 'auto',
    threads = Math.min(4, os.availableParallelism()) } = {}) {
    if (!Number.isInteger(threads) || threads < 1 || threads > 16) throw Error('Whisper : nombre de threads invalide (1–16).');
    Object.assign(this, { binary, model, getLanguage, threads });
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  async transcribe(audio, signal) {
    if (!audio?.length) return { text: '', limits: ['Aucune piste audio.'] };
    signal?.throwIfAborted();
    const started = performance.now();
    const language = validateTranscriptionLanguage(this.getLanguage());
    const bytes = Buffer.from(audio);
    const key = createHash('sha256').update(language).update(bytes).digest('hex');
    if (this.cache.has(key)) {
      this.hits++;
      const cached = this.cache.get(key);
      return { ...cached, cacheHit: true, metrics: { threads: this.threads, elapsedMs: performance.now() - started } };
    }
    this.misses++;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-speech-'));
    let diagnostic = '';
    try {
      await fs.access(this.model);
      const input = path.join(dir, 'audio.wav'), output = path.join(dir, 'speech');
      await fs.writeFile(input, bytes, { mode: 0o600 });
      signal?.throwIfAborted();
      await new Promise((resolve, reject) => {
        const child = spawn(this.binary, ['-m', this.model, '-f', input, '-l', language,
          '-oj', '-of', output, '-t', String(this.threads)], { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
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
      return { ...value, cacheHit: false, metrics: { ...whisperDiagnostics(diagnostic), threads: this.threads, elapsedMs: performance.now() - started } };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { text: '', limits: ['Transcription locale indisponible : vérifie Whisper et son modèle.'],
        metrics: { ...whisperDiagnostics(diagnostic), threads: this.threads, elapsedMs: performance.now() - started, failed: true } };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
module.exports = { LocalTranscriber };
