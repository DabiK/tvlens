#!/usr/bin/env node
// Offline Whisper bench for a target host and real retained clips: wall time, whisper.cpp timings and transcript
// for every file x threads x encoder context, each reduced context compared with the full one of the same threads.
// No network, no model download. It measures THIS machine. By default the report holds the transcripts: keep it
// private. With --no-text (use it on real speech) the transcripts only serve the comparison and never leave the
// process: the report keeps durations, word counts, differing-word counts and parameters.
//   node scripts/bench-whisper.cjs --model <ggml.bin> [--binary whisper-cli] [--language fr] [--threads 2,4]
//        [--audio-ctx 0,768,512,auto] [--repeats 3] [--no-gpu] [--no-text] [--out file.json] <a.wav> [b.wav…]
// Progress goes to stderr, the table to stdout; without --out the raw JSON follows the table on stdout.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { executable } = require('../adapters/system-paths.cjs');
const { whisperDiagnostics } = require('../adapters/whisper-diagnostics.cjs');
const { autoAudioCtx } = require('../adapters/local-transcriber.cjs');
const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');

const USAGE = 'Usage : node scripts/bench-whisper.cjs --model <ggml.bin> [--binary whisper-cli] [--language fr] [--threads 2,4] [--audio-ctx 0,768,512,auto] [--repeats 3] [--no-gpu] [--no-text] [--out fichier.json] <a.wav> [b.wav…]';
const VALUED = ['--model', '--binary', '--language', '--threads', '--audio-ctx', '--repeats', '--out'];
const round = value => Math.round(value * 10) / 10;
const median = values => { const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const numbers = value => [...new Set(String(value).split(',').map(v => v.trim()))].map(v => v === 'auto' ? v : v === '' ? NaN : Number(v));
const words = text => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
// Word-level edit distance: substituted, missing and extra words all count once.
function wordDistance(a, b) {
  const x = words(a), y = words(b);
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (x[i - 1] !== y[j - 1]));
    row = next;
  }
  return row[y.length];
}

function parse(argv) {
  const options = {}, files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUED.includes(arg)) { if (argv[i + 1] === undefined) throw Error(`Valeur manquante pour ${arg}.`); options[arg] = argv[++i]; }
    else if (arg === '--no-gpu' || arg === '--no-text') options[arg] = true;
    else if (arg.startsWith('-')) throw Error(`Option inconnue : ${arg}.\n${USAGE}`);
    else files.push(arg);
  }
  if (!options['--model']) throw Error(`Modèle requis : --model <ggml.bin>.\n${USAGE}`);
  if (!files.length) throw Error(`Aucun fichier audio.\n${USAGE}`);
  const threads = numbers(options['--threads'] ?? '2,4'), contexts = numbers(options['--audio-ctx'] ?? '0,768,512,auto'), repeats = Number(options['--repeats'] ?? 3);
  if (threads.some(t => !Number.isInteger(t) || t < 1 || t > 16)) throw Error('Whisper : nombre de threads invalide (1–16).');
  if (contexts.some(c => c !== 0 && c !== 'auto' && !(Number.isInteger(c) && c >= 64 && c <= 1500))) throw Error('Whisper : contexte audio invalide (0, auto ou 64–1500).');
  if (!Number.isInteger(repeats) || repeats < 1) throw Error('Nombre de répétitions invalide (entier ≥ 1).');
  return { model: options['--model'], binary: options['--binary'] || executable('whisper-cli'), language: validateTranscriptionLanguage(options['--language'] ?? 'fr'),
    threads, contexts, repeats, noGpu: Boolean(options['--no-gpu']), noText: Boolean(options['--no-text']), out: options['--out'], files };
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
    child.once('error', () => reject(Error(`Whisper indisponible : ${binary}`)));
    child.once('close', code => resolve({ wallMs: performance.now() - started, code, stderr }));
  });
}

function table(summary) {
  const label = s => s.requested === 'auto' ? `auto→${s.audioCtx}` : String(s.audioCtx);
  const lines = [['fichier', 'threads', 'ctx', 'ok', 'médiane ms', 'min–max ms', 'encode ms', 'gain', 'identique', 'mots ≠'],
    ...summary.map(s => [path.basename(s.file), s.threads, label(s), `${s.runs - s.failed}/${s.runs}`, s.wallMs.median ?? '—', s.wallMs.median === null ? '—' : `${s.wallMs.min}–${s.wallMs.max}`, s.encodeMs ?? '—',
      s.speedup === undefined ? '—' : `×${s.speedup}`, s.identical === undefined ? '—' : s.identical ? 'oui' : 'non', (s.differingWords === undefined ? '—' : `${s.differingWords}/${s.referenceWords}`) + (s.stable ? '' : ' *')].map(String))];
  const widths = lines[0].map((_, column) => Math.max(...lines.map(line => line[column].length)));
  return lines.map(line => line.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd()).join('\n')
    + (summary.some(s => !s.stable) ? '\n* transcription différente d’une répétition à l’autre' : '');
}

async function main() {
  if (process.argv.slice(2).some(arg => arg === '--help' || arg === '-h')) return console.log(USAGE);
  const { model, binary, language, threads, contexts, repeats, noGpu, noText, out, files } = parse(process.argv.slice(2));
  await fs.access(model, fs.constants.R_OK).catch(() => { throw Error(`Modèle Whisper introuvable ou illisible : ${model}`); });
  const clips = [];
  for (const file of files) {
    const bytes = await fs.readFile(file).catch(() => { throw Error(`Fichier audio introuvable ou illisible : ${file}`); });
    clips.push({ file, bytes: bytes.length, autoAudioCtx: autoAudioCtx(bytes) });
  }
  const plan = clips.flatMap(clip => threads.flatMap(count => contexts.map(requested => ({ file: clip.file, threads: count, requested, audioCtx: requested === 'auto' ? clip.autoAudioCtx : requested }))));
  const rows = [], dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tvlens-whisper-bench-')), output = path.join(dir, 'speech');
  try {
    for (let repeat = 0; repeat < repeats; repeat++) {
      // Alternating the order keeps warm caches and thermal drift from always favouring the same configuration.
      for (const item of repeat % 2 ? [...plan].reverse() : plan) {
        const { wallMs, code, stderr } = await run(binary, ['-m', model, '-f', item.file, '-l', language, '-oj', '-of', output, '-t', String(item.threads),
          ...(item.audioCtx ? ['-ac', String(item.audioCtx)] : []), ...(noGpu ? ['-ng'] : [])]);
        const text = code === 0 ? await fs.readFile(output + '.json', 'utf8').then(json => (JSON.parse(json).transcription || []).map(s => s.text.trim()).filter(Boolean).join(' ')).catch(() => null) : null;
        await fs.rm(output + '.json', { force: true }); // a failed run must never read the previous transcript
        rows.push({ ...item, repeat, wallMs: round(wallMs), code, timings: whisperDiagnostics(stderr), text });
        console.error(`[${rows.length}/${plan.length * repeats}] ${path.basename(item.file)} threads=${item.threads} ctx=${item.requested === 'auto' ? 'auto→' : ''}${item.audioCtx} : ${text === null ? 'échec' : Math.round(wallMs) + ' ms'}`);
      }
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  const summary = plan.map(item => {
    const runs = rows.filter(r => r.file === item.file && r.threads === item.threads && r.requested === item.requested), ok = runs.filter(r => r.text !== null), wall = ok.map(r => r.wallMs);
    return { ...item, runs: runs.length, failed: runs.length - ok.length, wallMs: { median: ok.length ? round(median(wall)) : null, min: ok.length ? Math.min(...wall) : null, max: ok.length ? Math.max(...wall) : null },
      encodeMs: ok.some(r => Number.isFinite(r.timings.encodeMs)) ? round(median(ok.map(r => r.timings.encodeMs).filter(Number.isFinite))) : null, text: ok[0]?.text ?? null, stable: new Set(ok.map(r => r.text)).size <= 1 };
  });
  for (const s of summary) {
    const full = summary.find(f => f.file === s.file && f.threads === s.threads && !f.audioCtx && f.text !== null);
    if (s.audioCtx && s.text !== null && full) Object.assign(s, { identical: s.text === full.text, differingWords: wordDistance(full.text, s.text), referenceWords: words(full.text).length, speedup: Math.round(full.wallMs.median / s.wallMs.median * 100) / 100 });
  }
  // Numbers only: every comparison above is done, the transcripts are replaced by their word counts.
  const counted = ({ text, ...entry }) => ({ ...entry, words: text === null ? null : words(text).length });
  const report = { date: new Date().toISOString(), node: process.version, host: { platform: `${os.platform()} ${os.arch()}`, cpu: os.cpus()[0]?.model || null, parallelism: os.availableParallelism(), loadAverage: os.loadavg().map(round) },
    binary, model, language, noGpu, noText, repeats, files: clips, summary: noText ? summary.map(counted) : summary, rows: noText ? rows.map(counted) : rows };
  console.log(table(summary));
  if (out) { await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true }); await fs.writeFile(out, JSON.stringify(report, null, 1)); console.log(`Mesures brutes : ${out}`); }
  else console.log(JSON.stringify(report, null, 1));
  const failed = rows.filter(r => r.text === null).length;
  if (failed) { console.error(`${failed} exécution(s) Whisper en échec sur ${rows.length}.`); process.exitCode = 1; }
}
main().catch(error => { console.error(error.message); process.exit(1); });
