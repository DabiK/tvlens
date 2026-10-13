// Phase D of the native validation protocol (docs/lg-ambient.md): does the text of an ambient card ever
// enter a frame sent for analysis? This is a temporary receiver that stands in for the inference server
// during a bounded trial capture. It keeps nothing but counts: no model, no provider, no production data.
//
//   node scripts/probe-tv-ambient-capture.mjs --host <address the TV reaches> [--seconds 330] [--keep]
//       prints the path of a trial connection file ({url, token}) to hand to the trial capture.py on the TV
//   node scripts/probe-tv-ambient-capture.mjs --witness <capture.png> [--crop x,y,width,height]
//       positive control: counts the marker in one manual capture taken while a probe card is on screen
//   node scripts/probe-tv-ambient-capture.mjs --self-test
//       loopback run with synthetic blocks; proves this script, never the TV
//
// The probe card draws a 48 px magenta square inside its box. A frame that reaches this receiver with
// marker pixels is a frame the capture gate failed to crop or withhold.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
// Same validation as the real server, declarations of cropped and withheld images included.
const { validateRemote } = require('../adapters/remote-media.cjs');
const BODY_LIMIT = 13000000;

// Pure magenta survives the capture scaling and a PNG round trip; the thresholds leave room for blending at
// the edges of the square. Counted on the pixels the server would keep: same extraction and resize as
// RemoteMedia.assemble, before the JPEG encoding that would smear the colour.
async function markerPixels(buffer, crop) {
  let image = sharp(buffer, { limitInputPixels: 1920 * 1080 });
  if (crop) image = image.extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height });
  const { data, info } = await image.resize({ width: 1280, height: 720, fit: 'inside', withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] >= 200 && data[i + 1] <= 80 && data[i + 2] >= 200) count++;
  return { marker: count, width: info.width, height: info.height };
}

export function createReceiver({ token = crypto.randomBytes(32).toString('hex'), keepDir = null, now = Date.now } = {}) {
  const session = { id: crypto.randomUUID(), startedAt: now() };
  const report = { sessionId: session.id, blocks: [], rejected: [], unauthorized: 0 };
  const expected = Buffer.from(`Bearer ${token}`);
  const server = http.createServer(async (request, response) => {
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    try {
      const given = Buffer.from(request.headers.authorization || '');
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) { report.unauthorized++; return send(401, { error: 'Appareil non authentifié.' }); }
      const route = new URL(request.url, 'http://receiver').pathname;
      if (request.method === 'GET' && route === '/v1/session') return send(200, { id: session.id, accepting: true, readOnly: false, storage: { state: 'ok' } });
      if (request.method !== 'POST') return send(404, { error: 'Route inconnue.' });
      const chunks = [];
      let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > BODY_LIMIT) return send(413, { error: 'Requête trop volumineuse.' }); chunks.push(chunk); }
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      if (route === '/v1/session/start') return send(200, { id: session.id, elapsedMs: now() - session.startedAt, accepting: true, readOnly: false });
      if (route !== '/v1/segments') return send(404, { error: 'Route inconnue.' });
      try {
        validateRemote(body);
        if (body.sessionId !== session.id) throw Error('Session obsolète.');
      } catch (error) {
        report.rejected.push({ sequence: body && body.sequence, error: error.message });
        return send(400, { error: error.message });
      }
      const frames = [];
      for (const [index, frame] of body.frames.entries()) {
        const buffer = Buffer.from(frame.data, 'base64');
        const counted = await markerPixels(buffer, frame.crop);
        if (keepDir) fs.writeFileSync(path.join(keepDir, `block-${report.blocks.length}-frame-${index}${counted.marker ? '-MARKER' : ''}.png`), buffer, { mode: 0o600 });
        frames.push({ atMs: frame.atMs, crop: frame.crop || null, overlay: frame.overlay || null, ...counted });
      }
      const audio = typeof body.audio === 'string' ? Buffer.from(body.audio, 'base64') : null;
      report.blocks.push({ sequence: body.sequence, startMs: body.startMs, endMs: body.endMs, frames,
        // T10: `overlay` at the top of the block; `ingest.overlay` is the first wording of the design, read too.
        declared: body.overlay || (body.ingest && body.ingest.overlay) || null,
        audioBytes: audio ? audio.length : 0, audioWav: Boolean(audio && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE') });
      return send(200, { id: `moment-${report.blocks.length}` });
    } catch (error) {
      return send(400, { error: error instanceof SyntaxError ? 'JSON invalide.' : error.message });
    }
  });
  return { server, token, session, report };
}

// The criterion of phase D.5, stated per measure so that a failure names what failed.
export function summarize(report) {
  const frames = report.blocks.flatMap(block => block.frames);
  const flagged = frames.filter(frame => frame.overlay === 'cropped').length;
  const declaredCropped = report.blocks.reduce((sum, block) => sum + (block.declared ? block.declared.cropped || 0 : 0), 0);
  const withheld = report.blocks.reduce((sum, block) => sum + (block.declared ? block.declared.withheld || 0 : 0), 0);
  const marked = frames.filter(frame => frame.marker > 0);
  const undeclared = report.blocks.filter(block => block.frames.some(frame => frame.overlay === 'cropped') && !block.declared).length;
  const silent = report.blocks.filter(block => !block.audioWav).length;
  const summary = {
    blocks: report.blocks.length, frames: frames.length, framesFlaggedCropped: flagged, declaredCropped, declaredWithheld: withheld,
    framesWithMarker: marked.length, markerPixels: marked.reduce((sum, frame) => sum + frame.marker, 0), blocksWithoutDeclaration: undeclared, blocksWithoutAudio: silent,
    rejected: report.rejected.length, unauthorized: report.unauthorized,
  };
  summary.criteria = {
    'aucun pixel marqueur dans les images reçues': summary.framesWithMarker === 0,
    'au moins une image recadrée (une carte a bien été affichée pendant la capture)': flagged > 0 || declaredCropped > 0,
    'déclaration présente sur chaque bloc recadré': undeclared === 0,
    'son présent dans tous les blocs': summary.blocks > 0 && silent === 0,
  };
  summary.passed = Object.values(summary.criteria).every(Boolean);
  return summary;
}

function parse(argv) {
  const out = { host: '127.0.0.1', seconds: 330, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i], value = () => { if (argv[i + 1] === undefined) throw Error(`Valeur attendue après ${name}.`); return argv[++i]; };
    if (name === '--host') out.host = value();
    else if (name === '--seconds') out.seconds = Number(value());
    else if (name === '--keep') out.keep = true;
    else if (name === '--witness') out.witness = path.resolve(value());
    else if (name === '--crop') out.crop = value();
    else if (name === '--self-test') out.selfTest = true;
    else throw Error(`Option inconnue : ${name}`);
  }
  if (!Number.isFinite(out.seconds) || out.seconds < 1 || out.seconds > 7200) throw Error('Durée invalide (1 à 7200 secondes).');
  return out;
}
const listen = (server, host) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, () => resolve(server.address().port)); });
const close = server => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); });

async function witness(file, cropText) {
  let crop = null;
  if (cropText) {
    const [x, y, width, height] = cropText.split(',').map(Number);
    if (![x, y, width, height].every(Number.isInteger)) throw Error('Cadrage attendu : x,y,width,height.');
    crop = { x, y, width, height };
  }
  const counted = await markerPixels(fs.readFileSync(file), crop);
  console.log(JSON.stringify({ file, crop, ...counted, detectorSeesMarker: counted.marker > 0 }, null, 2));
  if (!counted.marker) { console.error('Témoin négatif : aucun pixel marqueur dans cette capture. Le compteur ne prouve rien tant que ce témoin ne voit pas la carte de sonde.'); process.exitCode = 1; }
}

async function serve(args) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-ambient-capture-'));
  const keepDir = args.keep ? path.join(work, 'frames') : null;
  if (keepDir) fs.mkdirSync(keepDir, { mode: 0o700 });
  const { server, token, report } = createReceiver({ keepDir });
  const port = await listen(server, args.host);
  // The token is random and dies with this process; it goes to a file, not to the terminal.
  const connection = path.join(work, 'connection.json');
  fs.writeFileSync(connection, JSON.stringify({ url: `http://${args.host}:${port}`, token }) + '\n', { mode: 0o600 });
  console.log(`Récepteur d’essai sur http://${args.host}:${port} pendant ${args.seconds} s (port éphémère, jeton aléatoire).\nConfiguration d’essai à remettre à la capture d’essai : ${connection}\nArrêt : Ctrl-C ou échéance. Rien n’est transmis ailleurs.`);
  const finish = async () => {
    await close(server);
    const summary = summarize(report);
    fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify({ summary, report }, null, 2) + '\n', { mode: 0o600 });
    fs.rmSync(connection, { force: true });
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Détail par bloc : ${path.join(work, 'report.json')}${keepDir ? `\nImages reçues : ${keepDir}` : ''}`);
    process.exit(summary.passed ? 0 : 1);
  };
  const timer = setTimeout(finish, args.seconds * 1000);
  process.once('SIGINT', () => { clearTimeout(timer); finish(); });
  process.once('SIGTERM', () => { clearTimeout(timer); finish(); });
}

// Synthetic blocks through real HTTP on the loopback: a clean cropped frame with its declaration, a frame
// that still shows the marker, and malformed input. It checks the counting and the criteria of this script.
async function selfTest() {
  const { server, token, session, report } = createReceiver();
  const port = await listen(server, '127.0.0.1');
  const call = async (route, body, auth = token) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const png = async marker => (await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#20384c' } })
    .composite(marker ? [{ input: { create: { width: 32, height: 32, channels: 3, background: '#ff00ff' } }, left: 32, top: 419 }] : []).png().toBuffer()).toString('base64');
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(32)]).toString('base64');
  const block = (sequence, frames, extra = {}) => ({ sessionId: session.id, sequence, startMs: sequence * 8000, endMs: sequence * 8000 + 8000, frames, audio: wav, ...extra });
  try {
    assert.equal((await call('/v1/session', undefined, 'wrong')).status, 401);
    const started = await call('/v1/session/start', {});
    assert.deepEqual([started.status, started.body.id, started.body.accepting], [200, session.id, true]);
    assert.deepEqual((await call('/v1/session')).body, { id: session.id, accepting: true, readOnly: false, storage: { state: 'ok' } });
    // The card box sits at the bottom left: the gate keeps what is above it, the marker row (y 419 in capture pixels) is cut off.
    const cropped = await call('/v1/segments', block(1, [{ atMs: 8000, data: await png(true), crop: { x: 0, y: 0, width: 1280, height: 410 }, overlay: 'cropped' }, { atMs: 10000, data: await png(false), crop: { x: 0, y: 0, width: 1280, height: 720 } }], { overlay: { cropped: 1, withheld: 2 } }));
    assert.equal(cropped.status, 200);
    let summary = summarize(report);
    assert.deepEqual([summary.blocks, summary.frames, summary.framesFlaggedCropped, summary.declaredCropped, summary.declaredWithheld, summary.framesWithMarker, summary.blocksWithoutAudio], [1, 2, 1, 1, 2, 0, 0]);
    assert.equal(summary.passed, true, 'a cropped, declared block with sound passes');
    // Same picture sent whole: the detector must see the marker, and the run must fail.
    assert.equal((await call('/v1/segments', block(2, [{ atMs: 16000, data: await png(true), crop: { x: 0, y: 0, width: 1280, height: 720 } }]))).status, 200);
    summary = summarize(report);
    assert.equal(summary.framesWithMarker, 1);
    assert.equal(summary.markerPixels, 32 * 32);
    assert.equal(summary.criteria['aucun pixel marqueur dans les images reçues'], false);
    assert.equal(summary.passed, false, 'one marker pixel fails the run');
    // What the real server refuses is refused here too, and counted.
    assert.equal((await call('/v1/segments', block(3, [{ atMs: 24000, data: await png(false), overlay: 'withheld' }]))).status, 400);
    assert.equal((await call('/v1/segments', block(4, [{ atMs: 32000, data: await png(false) }], { overlay: { cropped: 9, withheld: 0 } }))).status, 400);
    assert.equal((await call('/v1/segments', { ...block(5, [{ atMs: 40000, data: await png(false) }]), sessionId: 'other' })).status, 400);
    assert.equal((await call('/v1/segments', block(6, [{ atMs: 48000, data: await png(false), crop: { x: 0, y: 0, width: 1280, height: 410 }, overlay: 'cropped' }], { audio: undefined, overlay: { cropped: 1, withheld: 0 } }))).status, 200);
    summary = summarize(report);
    assert.deepEqual([summary.rejected, summary.unauthorized, summary.blocksWithoutAudio, summary.blocksWithoutDeclaration], [3, 1, 1, 0]);
    // A cropped image whose block says nothing: accepted by the server, but named here as a missing declaration.
    assert.equal((await call('/v1/segments', block(7, [{ atMs: 56000, data: await png(false), crop: { x: 0, y: 0, width: 1280, height: 410 }, overlay: 'cropped' }]))).status, 200);
    summary = summarize(report);
    assert.equal(summary.blocksWithoutDeclaration, 1);
    assert.equal(summary.criteria['déclaration présente sur chaque bloc recadré'], false);
    console.log(JSON.stringify(summary, null, 2));
    console.log('PASS (auto-test local sur boucle locale) : comptage du marqueur, déclarations, refus. Aucune TV, aucune capture réelle.');
  } finally {
    await close(server);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
  try {
    const args = parse(process.argv.slice(2));
    if (args.selfTest) await selfTest();
    else if (args.witness) await witness(args.witness, args.crop);
    else await serve(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
