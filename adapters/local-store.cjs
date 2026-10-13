const fs = require('node:fs/promises');
const path = require('node:path');
const { StorageFullError } = require('./disk-guard.cjs');

// Files of one session directory: a name outside this list is never read or written.
const FILES = { session: 'session.json', research: 'deep-answers.json', recap: 'living-recap.json', auto: 'auto.json', surveillance: 'surveillance.json', manifest: 'manifest.json' };
const MEDIA_DIR = 'media', THUMBS_DIR = 'thumbs', LEGACY_THUMBS_DIR = 'thumbnails';
const MEDIA_FILE = /^(moment-\d+)\.(webm|json)$/, THUMB_FILE = /^moment-\d+\.jpg$/;
// A refused write in words a host journal can carry: the files by their name and the code of the system,
// rather than the path its own message spells out.
const refusal = (names, cause) => Object.assign(new Error(`Écriture refusée par le disque (${names.map(name => FILES[name]).join(', ')}) : ${cause?.code || String(cause?.message || cause).slice(0, 120)}`), { code: cause?.code });

class LocalSessionStore {
  // A session keeps its media in media/: the cleanup of a former version only knows the moment-* files
  // at the root of a session directory and its thumbnails/ folder, so it cannot erase them.
  static forSession(root, options = {}) { return new LocalSessionStore(root, { ...options, mediaDir: MEDIA_DIR }); }
  // Without mediaDir the files sit at the root: kept copies of saved moments, tools and former sessions.
  constructor(root, { mediaDir = '', guard = null } = {}) {
    Object.assign(this, { root, guard, mediaRoot: path.join(root, mediaDir) });
    this.serial = Promise.resolve(); this.leases = new Map(); this.pendingRemoval = new Set();
    this.legacy = new Set(); this.writes = new Set(); this.sealed = false;
    // `manifest` is what was asked for; `confirmed` is what manifest.json holds, as last written or read.
    this.manifest = null; this.confirmed = null;
    // Files whose last write was refused, with the reason: each still holds what it held before.
    this.refused = new Map();
    // Volume is accumulated write by write: the directory is listed when a session is opened, never on a tick.
    this.bytes = 0; this.writtenBytes = 0; this.writtenMs = 0;
  }
  file(id, suffix) {
    if (!/^moment-\d+$/.test(id)) throw new Error('Identifiant de passage invalide.');
    // A passage left by a former version is read where it is: nothing is migrated.
    return path.join(this.legacy.has(id) ? this.root : this.mediaRoot, `${id}.${suffix}`);
  }
  // Both files of a passage, at the durable location or where a former version left them.
  async has(id) {
    this.file(id, 'webm');
    const both = dir => Promise.all(['webm', 'json'].map(ext => fs.access(path.join(dir, `${id}.${ext}`)))).then(() => true, () => false);
    if (await both(this.mediaRoot)) { this.legacy.delete(id); return true; }
    if (this.mediaRoot !== this.root && await both(this.root)) { this.legacy.add(id); return true; }
    return false;
  }
  put(id, input) {
    const work = this.write(id, input), done = () => this.writes.delete(work);
    // Sealing waits for the writes in flight: none may land after the directory is gone.
    this.writes.add(work); work.then(done, done);
    return work;
  }
  async write(id, input) {
    this.file(id, 'webm');
    const files = ['webm', 'json'].map(ext => path.join(this.mediaRoot, `${id}.${ext}`));
    const clip = Buffer.from(input.clip);
    // The interval travels with the media: an orphan file can still be placed on the session clock.
    const data = JSON.stringify({ frames: input.frames, audio: input.audio ? Buffer.from(input.audio).toString('base64') : null, startMs: input.startMs, endMs: input.endMs });
    const bytes = clip.length + Buffer.byteLength(data);
    if (this.sealed) throw new Error('Session supprimée.');
    // Admission comes before any write: a refused passage leaves nothing on disk.
    await this.guard?.admit(bytes);
    if (this.sealed) throw new Error('Session supprimée.');
    let failure;
    try { await fs.mkdir(this.mediaRoot, { recursive: true, mode: 0o700 }); } catch (error) { failure = error; }
    failure ||= (await Promise.allSettled([fs.writeFile(files[0], clip, { mode: 0o600 }), fs.writeFile(files[1], data, { mode: 0o600 })])).find(result => result.status === 'rejected')?.reason;
    if (failure) {
      // Both writes have settled: remove the partial pair of this passage, and of this passage only.
      await Promise.all(files.map(file => fs.rm(file, { force: true }).catch(() => {})));
      throw ['ENOSPC', 'EDQUOT'].includes(failure.code) ? this.guard?.trip() || new StorageFullError() : failure;
    }
    this.legacy.delete(id);
    this.bytes += bytes; this.writtenBytes += bytes;
    if (Number.isFinite(input.endMs - input.startMs)) this.writtenMs += Math.max(0, input.endMs - input.startMs);
    return { bytes };
  }
  // Reads at the durable location; a miss looks once for the pair a former version left at the root.
  async content(id, suffix, encoding) {
    try { return await fs.readFile(this.file(id, suffix), encoding); }
    catch (error) {
      if (error.code !== 'ENOENT' || !(await this.has(id))) throw error;
      return fs.readFile(this.file(id, suffix), encoding);
    }
  }
  async read(id) {
    const data = JSON.parse(await this.content(id, 'json', 'utf8'));
    return { frames: data.frames, audio: data.audio ? Buffer.from(data.audio, 'base64') : null };
  }
  // Where a stored passage sits on the session clock, as written with its media. null when nothing says
  // so: a file of a former version (no interval), or one that cannot be read. Never throws.
  async interval(id) {
    try {
      const { startMs, endMs, audio } = JSON.parse(await this.content(id, 'json', 'utf8'));
      // Same bounds as an ingest accepts: anything else is not an interval to build a passage on.
      return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs >= 0 && endMs > startMs && endMs - startMs <= 60000 ? { startMs, endMs, hasAudio: Boolean(audio) } : null;
    } catch { return null; }
  }
  async remove(id) {
    if (this.leases.get(id)) { this.pendingRemoval.add(id); return; }
    this.file(id, 'webm');
    for (const dir of new Set([this.mediaRoot, this.root])) for (const ext of ['json', 'webm']) {
      const file = path.join(dir, `${id}.${ext}`), size = await fs.stat(file).then(stats => stats.size, () => 0);
      await fs.rm(file, { force: true });
      this.bytes = Math.max(0, this.bytes - size);
    }
    this.legacy.delete(id);
  }
  async lease(ids) {
    const held = [];
    const release = async () => { for (const id of held.splice(0)) { const n = this.leases.get(id)-1; if(n) this.leases.set(id,n); else { this.leases.delete(id); if(this.pendingRemoval.delete(id)) await this.remove(id); } } };
    try {
      for (const id of ids) {
        if(this.pendingRemoval.has(id)) throw new Error('Passage expiré.');
        this.leases.set(id,(this.leases.get(id)||0)+1); held.push(id);
        // An inspection reads the clip and the stored audio: a lease on half a passage is refused here, in plain words.
        if (!(await this.has(id))) throw new Error('Média absent.');
      }
      return release;
    } catch { await release(); throw new Error('Média expiré ou indisponible.'); }
  }
  // One listing per location, when a session is opened or listed: never on a tick or a state emission.
  async inventory() {
    const scan = async (dir, pattern) => {
      const names = (await fs.readdir(dir).catch(() => [])).filter(name => pattern.test(name));
      const sizes = await Promise.all(names.map(name => fs.stat(path.join(dir, name)).then(stats => stats.size, () => 0)));
      return names.map((name, i) => ({ name, size: sizes[i] }));
    };
    const [durable, former, thumbs, formerThumbs] = await Promise.all([scan(this.mediaRoot, MEDIA_FILE), this.mediaRoot === this.root ? [] : scan(this.root, MEDIA_FILE),
      scan(path.join(this.root, THUMBS_DIR), THUMB_FILE), scan(path.join(this.root, LEGACY_THUMBS_DIR), THUMB_FILE)]);
    const halves = files => { const seen = new Map(); for (const { name } of files) { const [, id, ext] = MEDIA_FILE.exec(name); seen.set(id, (seen.get(id) || 0) | (ext === 'webm' ? 1 : 2)); } return seen; };
    const now = halves(durable), before = halves(former), ids = new Set(), legacy = new Set();
    for (const [id, both] of now) if (both === 3) ids.add(id);
    for (const [id, both] of before) if (both === 3 && !ids.has(id)) { ids.add(id); legacy.add(id); }
    const sum = files => files.reduce((total, file) => total + file.size, 0);
    const mediaBytes = sum(durable) + sum(former), thumbBytes = sum(thumbs) + sum(formerThumbs);
    return { ids, legacy, partial: [...new Set([...now.keys(), ...before.keys()])].filter(id => !ids.has(id)),
      thumbs: new Set([...thumbs, ...formerThumbs].map(file => file.name.slice(0, -4))), mediaBytes, thumbBytes, bytes: mediaBytes + thumbBytes };
  }
  // Reopening: what is already on disk is counted once here, then every write adds to it. The manifest
  // read from it is, for now, both what is asked for and what is confirmed.
  adopt(inventory, mediaMs = 0, manifest = null) {
    this.legacy = new Set(inventory.legacy); this.bytes = this.writtenBytes = inventory.mediaBytes; this.writtenMs = mediaMs;
    this.manifest = this.confirmed = manifest ? { ...manifest } : null;
  }
  // Reads one saved file of the session; null when it was never written. Nothing is created.
  async load(name = 'session') {
    if (!Object.hasOwn(FILES, name)) throw new Error('Fichier de session inconnu.');
    let raw;
    try { raw = await fs.readFile(path.join(this.root, FILES[name]), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    try { return JSON.parse(raw); } catch { throw new Error('Fichier de session illisible.'); }
  }
  loadResearch() { return this.load('research'); }
  loadSurveillance() { return this.load('surveillance'); }
  // Serialised and atomic: an older write never replaces a newer state, a torn file never replaces a whole one.
  persist(name, snapshot, indent = 2) {
    if (this.sealed) return Promise.resolve();
    const data = JSON.stringify(snapshot, null, indent);
    this.serial = this.serial.catch(() => {}).then(async () => {
      // Checked again when the write runs: a sealed session must never get its directory back.
      if (this.sealed) return;
      try {
        await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
        const target = path.join(this.root, FILES[name]);
        await fs.writeFile(target + '.tmp', data, { mode: 0o600 });
        await fs.rename(target + '.tmp', target);
      } catch (error) {
        // Whoever asked is told, and the refusal outlives the next link of the chain: until a write of this
        // file lands.
        this.refused.set(name, error);
        throw error;
      }
      this.refused.delete(name);
    });
    return this.serial;
  }
  save(snapshot) { return this.persist('session', snapshot); }
  saveResearch(snapshot) { return this.persist('research', snapshot); }
  saveRecap(snapshot) { return this.persist('recap', snapshot); }
  saveAuto(snapshot) { return this.persist('auto', snapshot); }
  // The whole registry, rewritten as often as every second and megabytes at saturation: never indented.
  saveSurveillance(snapshot) { return this.persist('surveillance', snapshot, 0); }
  // Small and merged in memory: a partial update never loses the facts written before it. What was asked
  // for moves at once; what is confirmed only moves when that very content is on disk.
  saveManifest(patch) {
    if (this.sealed) return Promise.resolve();
    const wanted = this.manifest = { ...this.manifest, ...patch };
    return this.persist('manifest', wanted).then(() => { if (!this.sealed) this.confirmed = wanted; }, error => { throw refusal(['manifest'], error); });
  }
  // The barrier before a session is said archived. Settles once every write asked so far has run, and
  // rejects while the last write of a state file was refused. The manifest is not counted: it is written
  // after this, and its own write answers for it.
  async flush() {
    let serial;
    do { serial = this.serial; await serial.catch(() => {}); } while (serial !== this.serial);
    const names = [...this.refused.keys()].filter(name => name !== 'manifest');
    if (!this.sealed && names.length) throw refusal(names, this.refused.get(names[0]));
  }
  // Before the session is deleted: every later save is a no-op, and the writes in flight are awaited.
  async seal() {
    this.sealed = true;
    await Promise.allSettled([...this.writes, this.serial]);
  }
  // Explicit purge of this session's raw media, at both locations; its text stays.
  async clearRaw() {
    for (const dir of new Set([this.mediaRoot, this.root])) {
      const files = await fs.readdir(dir).catch(() => []);
      await Promise.all(files.filter(file => MEDIA_FILE.test(file)).map(file => fs.rm(path.join(dir, file), {force:true})));
    }
    if (this.mediaRoot !== this.root) await fs.rmdir(this.mediaRoot).catch(() => {});
    this.bytes = 0; this.legacy.clear();
  }
  async response(id, range) {
    let bytes;
    try { bytes = await this.content(id, 'webm'); }
    catch { return new Response('Passage expiré ou indisponible.', { status: 404 }); }
    const headers = { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
      const start = Number(match[1]), end = Math.min(match[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1);
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } });
      return new Response(bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1) } });
    }
    return new Response(bytes, { headers: { ...headers, 'Content-Length': String(bytes.length) } });
  }
}

// Sweep of a former version: every session at once, limited to the layout that version wrote (moment-*
// files at the root of a session directory and its thumbnails/ folder). Nothing in this tree calls it
// for durable sessions any more; it stays exported for the hosts that still import it.
async function cleanupRawMedia(sessionsRoot) {
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(sessionsRoot, entry.name);
    await fs.rm(path.join(dir, LEGACY_THUMBS_DIR), { recursive: true, force: true });
    const files = await fs.readdir(dir);
    await Promise.all(files.filter(file => /^moment-\d+\.(?:webm|json)$/.test(file)).map(file => fs.rm(path.join(dir, file), { force: true })));
  }
}
module.exports = { LocalSessionStore, cleanupRawMedia, MEDIA_DIR, THUMBS_DIR, LEGACY_THUMBS_DIR };
