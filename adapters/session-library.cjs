const fs = require('node:fs/promises');
const path = require('node:path');
const { LocalSessionStore } = require('./local-store.cjs');
const { restorable, recoveredPassage } = require('../core/session.cjs');

const MANIFEST_FORMAT = 'tvlens-session', MANIFEST_VERSION = 1;
// Session directories are named by randomUUID(): anything else is neither listed, opened nor deleted.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
// A session has no name of its own: its start date, in the host's time zone, is what the viewer recognises.
function sessionTitle(at) {
  const date = new Date(at), two = value => String(value).padStart(2, '0');
  if (Number.isNaN(date.getTime())) return 'Session sans date';
  return `Session du ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}
// A manifest a runtime can build on without guessing. Like a saved state of another shape, one that
// parses but is shaped otherwise is refused in plain words instead of failing half-way on a TypeError.
const optional = (value, valid) => value == null || valid(value);
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const readableManifest = manifest => manifest == null || (record(manifest)
  && ['title', 'state'].every(key => optional(manifest[key], value => typeof value === 'string'))
  && ['createdAt', 'updatedAt', 'closedAt', 'elapsedMs', 'capturedThroughMs', 'passages'].every(key => optional(manifest[key], Number.isFinite))
  && optional(manifest.media, record) && optional(manifest.captures, value => Array.isArray(value) && value.every(record)));
const passagesOf = snapshot => [...(snapshot.history || []), ...snapshot.segments];
const firstTopic = passages => passages.find(passage => passage.observation?.topic)?.observation.topic || null;
// The retentions a saved state names since sessions are durable (core/session.cjs). A state that names
// one was written by a version that writes a manifest too; one written before manifests names none.
const RETENTIONS = ['rolling', 'until-deleted'];

// What a list shows for one session. From the manifest when there is one; otherwise it is described
// from its saved state, which is never rewritten. Without a manifest, a state of before manifests is
// the archive it always was. A newer one never got its manifest on disk: nothing says that the session
// was closed, so it is live in memory or cut short, and no closing date is made up for it.
function describe({ id, manifest, snapshot, savedAt, inventory, current = null }) {
  if (manifest) return {
    id, title: manifest.title || sessionTitle(manifest.createdAt), firstTopic: manifest.firstTopic || null, host: manifest.host ?? null,
    createdAt: manifest.createdAt ?? null, updatedAt: manifest.updatedAt ?? null, closedAt: manifest.closedAt ?? null,
    // Still "live" on disk without being the session in memory: it was cut short (crash, power loss).
    state: manifest.state === 'archived' ? 'archived' : id === current ? 'live' : 'interrupted',
    elapsedMs: manifest.elapsedMs || 0, passages: manifest.passages || 0,
    media: { stored: manifest.media?.stored || 0, missing: manifest.media?.missing || 0, bytes: manifest.media?.bytes || 0 }, legacy: false };
  const passages = passagesOf(snapshot), stored = passages.filter(passage => inventory.ids.has(passage.id)).length;
  const former = !RETENTIONS.includes(snapshot.retention);
  return { id, title: sessionTitle(savedAt), firstTopic: firstTopic(passages), host: null, createdAt: savedAt, updatedAt: savedAt, closedAt: former ? savedAt : null,
    state: former ? 'archived' : id === current ? 'live' : 'interrupted',
    elapsedMs: snapshot.elapsedMs || 0, passages: passages.length, media: { stored, missing: passages.length - stored, bytes: inventory.bytes }, legacy: former };
}
const unreadable = id => ({ id, title: 'Session illisible', firstTopic: null, host: null, createdAt: null, updatedAt: null, closedAt: null, state: 'unreadable',
  elapsedMs: 0, passages: 0, media: { stored: 0, missing: 0, bytes: 0 }, legacy: false, error: 'Archive illisible.' });
const number = id => Number(id.slice(7));

async function treeBytes(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    // Links are counted as links, never followed.
    total += entry.isDirectory() ? await treeBytes(target) : (await fs.lstat(target)).size;
  }
  return total;
}

// Saved sessions of one host: listing and reading never write, and the only deletion is one whole session.
class SessionLibrary {
  constructor({ root, guard = null }) { Object.assign(this, { root: path.resolve(root), guard }); }

  // The only way to a session directory: an identifier supplied by a client can never name another path.
  dir(id) {
    if (typeof id !== 'string' || !SESSION_ID.test(id)) throw new Error('Identifiant de session invalide.');
    return path.join(this.root, id);
  }
  // A real directory, direct child of the root: never a link that would lead a read or a deletion elsewhere.
  async folder(id) {
    const dir = this.dir(id), stats = await fs.lstat(dir).catch(() => null);
    if (!stats?.isDirectory() || path.dirname(dir) !== this.root) throw new Error('Session introuvable.');
    return dir;
  }
  async manifest(store, id) {
    const manifest = await store.load('manifest').catch(() => null);
    if (manifest?.format !== MANIFEST_FORMAT || manifest.id !== id) return null;
    // The manifest of this very session, but of another shape: listed as unreadable, refused at opening.
    if (!readableManifest(manifest)) throw new Error('Archive illisible.');
    return manifest;
  }

  // The state to reopen, read without writing anything: what was saved, completed by what the disk holds.
  // A session cut short keeps media its saved state does not know, or was not saved at all yet (its
  // very first passage): none of it may become unreachable. Each such passage whose media carries its
  // interval is put back in observation order, unanalysed and replayable; the others are only reported.
  async state(store, id, manifest, inventory) {
    let snapshot = await store.load('session').catch(() => undefined), savedAt;
    if (snapshot === null) {
      // Never saved. Rebuilt empty only when the directory proves it is a session: a manifest or stored media.
      if (!manifest && !inventory.ids.size) throw new Error('Archive illisible.');
      snapshot = { id, accepting: false, elapsedMs: manifest?.elapsedMs || 0, retentionMs: null, retention: manifest?.media?.retention || 'until-deleted', history: [], segments: [], questions: [] };
      savedAt = manifest?.updatedAt ?? Math.round((await fs.stat(store.root)).mtimeMs);
    } else {
      if (!restorable(snapshot) || snapshot.id !== id) throw new Error('Archive illisible.');
      savedAt = Math.round((await fs.stat(path.join(store.root, 'session.json'))).mtimeMs);
    }
    const known = new Set(passagesOf(snapshot).map(passage => passage.id)), recovered = [];
    // One file at a time: a session cut after many unsaved passages must not be read into memory at once.
    for (const passage of [...inventory.ids].filter(passage => !known.has(passage)).sort((a, b) => number(a) - number(b))) {
      const interval = await store.interval(passage);
      if (interval) { recovered.push(recoveredPassage({ id: passage, ...interval })); known.add(passage); }
    }
    if (recovered.length) snapshot = { ...snapshot,
      // The clock reopens past every passage put back: a resumed capture continues after them, never inside.
      elapsedMs: Math.max(Number.isFinite(snapshot.elapsedMs) ? snapshot.elapsedMs : 0, ...recovered.map(passage => passage.endMs)),
      segments: [...snapshot.segments, ...recovered].sort((a, b) => a.startMs - b.startMs || number(a.id) - number(b.id)) };
    inventory.recovered = recovered.map(passage => passage.id);
    // Still unknown to the reopened state (no interval, or half a pair): counted, reported, never erased here.
    inventory.orphans = [...inventory.ids, ...inventory.partial].filter(passage => !known.has(passage));
    return { snapshot, savedAt };
  }

  // `current` is the session in memory, if any: its manifest is "live" for a good reason.
  async list({ current = null } = {}) {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => []);
    const ids = entries.filter(entry => entry.isDirectory() && SESSION_ID.test(entry.name)).map(entry => entry.name);
    const sessions = await Promise.all(ids.map(async id => {
      try {
        const store = LocalSessionStore.forSession(path.join(this.root, id)), manifest = await this.manifest(store, id);
        // With a manifest, the saved state (megabytes after a film) is not read at all.
        if (manifest) return describe({ id, manifest, current });
        const inventory = await store.inventory(), { snapshot, savedAt } = await this.state(store, id, null, inventory);
        return describe({ id, snapshot, savedAt, inventory, current });
      } catch { return unreadable(id); }
    }));
    return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  // Everything a host needs to reopen a session, read once. Nothing is created or modified.
  async read(id, { current = null } = {}) {
    const store = LocalSessionStore.forSession(await this.folder(id));
    const optional = name => store.load(name).catch(() => null);
    const [manifest, chat, recap, auto, surveillance, inventory] = await Promise.all([this.manifest(store, id), optional('research'), optional('recap'),
      optional('auto'), optional('surveillance'), store.inventory()]);
    // `snapshot` is the state to reopen: the saved one, plus the passages put back from media it did not know.
    const { snapshot, savedAt } = await this.state(store, id, manifest, inventory);
    return { summary: describe({ id, manifest, snapshot, savedAt, inventory, current }), manifest, snapshot, chat, recap, auto, surveillance, inventory };
  }

  // Deletes this session and nothing else. A session in memory must be stopped and sealed by its host first.
  async remove(id) {
    const dir = await this.folder(id), freedBytes = await treeBytes(dir);
    await fs.rm(dir, { recursive: true });
    // The freed space counts at once: a capture refused for lack of room can be resumed.
    await this.guard?.check({ force: true });
    return { id, freedBytes };
  }

  async usage(sessions) {
    sessions ||= await this.list();
    const disk = this.guard ? await this.guard.check() : { state: 'unknown', freeBytes: null, minFreeBytes: null, warnFreeBytes: null };
    return { sessions: sessions.length, bytes: sessions.reduce((sum, session) => sum + session.media.bytes, 0),
      freeBytes: disk.freeBytes, minFreeBytes: disk.minFreeBytes, warnFreeBytes: disk.warnFreeBytes, state: disk.state };
  }
}

module.exports = { SessionLibrary, sessionTitle, readableManifest, MANIFEST_FORMAT, MANIFEST_VERSION, SESSION_ID };
