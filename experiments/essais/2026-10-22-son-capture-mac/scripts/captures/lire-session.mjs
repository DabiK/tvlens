// Reads the newest TVLens session created after a given time: audio tracks of its clips and transcribed passages.
// Usage: node lire-session.mjs <ISO start time> <report.json>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const [since, out] = process.argv.slice(2);
const root = path.join(os.homedir(), 'Library', 'Application Support', 'TVLens', 'sessions');
const sessions = fs.readdirSync(root).map(name => ({ name, at: fs.statSync(path.join(root, name, 'session.json'), { throwIfNoEntry: false })?.birthtimeMs }))
  .filter(s => s.at && s.at >= Date.parse(since)).sort((a, b) => b.at - a.at);
if (!sessions.length) { console.log(JSON.stringify({ session: null })); process.exit(0); }
const dir = path.join(root, sessions[0].name);
const session = JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8'));
const clips = fs.readdirSync(path.join(dir, 'media')).filter(f => f.endsWith('.webm'));
const probe = clip => ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', path.join(dir, 'media', clip)];
const streams = clips.map(clip => execFileSync('ffprobe', probe(clip)).toString().trim().split('\n').join('+'));
// Mean volume of the first clips that carry sound; a clip without an audio track has none to measure.
const volumes = clips.filter((clip, i) => streams[i].includes('opus')).slice(0, 3).map(clip => {
  const run = spawnSync('ffmpeg', ['-nostats', '-i', path.join(dir, 'media', clip), '-af', 'volumedetect', '-vn', '-f', 'null', '-']);
  return Number(run.stderr.toString().match(/mean_volume: (\S+) dB/)?.[1] ?? NaN);
});
const segments = session.segments || [];
const report = {
  session: sessions[0].name, passages: segments.length,
  withAudio: segments.filter(s => s.hasAudio).length,
  transcribed: segments.filter(s => (s.observation?.transcript || '').trim()).length,
  clips: clips.length, clipsWithOpus: streams.filter(s => s.includes('opus')).length,
  meanVolumeDb: volumes,
  transcripts: segments.map(s => (s.observation?.transcript || '').slice(0, 120)).filter(Boolean).slice(0, 4),
};
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, transcripts: report.transcripts.slice(0, 2) }));
