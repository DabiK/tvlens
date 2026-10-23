import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const folder = path.dirname(fileURLToPath(import.meta.url));
const phase = process.argv[2];
if (!['paused', 'archived', 'reopened'].includes(phase)) throw Error('Phase attendue : paused, archived ou reopened.');
const root = path.join(os.homedir(), 'Library/Application Support/TVLens/sessions');
const before = new Set(JSON.parse(fs.readFileSync(path.join(folder, 'preuves/avant.json'))).existingSessionDirectories);
const added = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && !before.has(entry.name));
if (added.length !== 1) throw Error(`Une nouvelle session attendue, ${added.length} trouvées.`);
const id = added[0].name;
if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Identifiant de session inattendu.');
const directory = path.join(root, id);
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const session = read('session.json'), manifest = read('manifest.json');
const jobs = read('deep-answers.json').jobs;
const passages = [...(session.history || []), ...(session.segments || [])];
const media = path.join(directory, 'media');
const clips = fs.readdirSync(media).filter(name => /^moment-\d+\.webm$/.test(name)).sort();
const probe = clips.length ? probeClip(path.join(media, clips[0])) : null;
const report = {
  phase, recordedAt: new Date().toISOString(), session: id, source: manifest.source,
  state: { accepting: session.accepting, elapsedMs: session.elapsedMs, manifest: manifest.state, closedAt: manifest.closedAt },
  clips: { count: clips.length, names: clips, first: probe },
  passages: passages.map(item => ({ id: item.id, startMs: item.startMs, endMs: item.endMs,
    status: item.status, hasAudio: item.hasAudio, audioStatus: item.audioStatus, visionStatus: item.visionStatus,
    transcript: item.observation?.transcript, summary: item.observation?.summary, visual: item.observation?.visual })),
  questions: jobs.map(job => ({ id: job.id, question: job.question, status: job.status, createdAt: job.createdAt,
    startedAt: job.startedAt, finishedAt: job.finishedAt, answer: job.result?.answer, citations: job.result?.citations })),
};
fs.writeFileSync(path.join(folder, 'preuves', `session-${phase}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ phase, session: id, passages: passages.length, clips: clips.length,
  transcribed: passages.filter(item => item.observation?.transcript?.trim()).length,
  visualReady: passages.filter(item => item.visionStatus === 'ready').length,
  questionStates: jobs.map(job => job.status), manifest: manifest.state }));

function probeClip(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw Error('Inspection du clip refusée.');
  const volume = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 10000 });
  if (volume.status !== 0) throw Error('Mesure du son refusée.');
  return { streams: JSON.parse(result.stdout).streams, meanVolumeDb: volume.stderr.match(/mean_volume:\s+(\S+)\s+dB/)?.[1] };
}
