const fs = require('node:fs/promises');
const path = require('node:path');
const PROVIDER_NOTICE = 'nouveaux appels au fournisseur possibles pour les vecteurs demandés.';
const LOAD_MESSAGES = {
  total: 'Cache d’embeddings inutilisable : reconstruction nécessaire ; ' + PROVIDER_NOTICE,
  partial: 'Récupération partielle du cache d’embeddings : reconstruction partielle nécessaire ; ' + PROVIDER_NOTICE,
  missing: 'Cache d’embeddings absent : création normale nécessaire ; ' + PROVIDER_NOTICE,
  'model-mismatch': 'Modèle du cache d’embeddings différent : reconstruction nécessaire ; ' + PROVIDER_NOTICE,
  'legacy-format': 'Ancien format du cache d’embeddings : réécriture nécessaire au prochain enregistrement ; vecteurs conservés.',
};
// Append-only log: one header line naming the model, then one line per vector. A live session
// indexes a passage every few seconds: rewriting every vector each time cost the square of its length.
class EmbeddingStore {
  constructor(file, model, { onDiagnostic = () => {}, readFile = fs.readFile, assertIdentity = () => {}, identityScoped = false } = {}) {
    this.file = file;
    this.model = model;
    this.onDiagnostic = onDiagnostic;
    this.readFile = readFile;
    this.assertIdentity = assertIdentity;
    this.identityScoped = identityScoped;
    this.entries = {};
    this.byText = new Map();
    this.serial = Promise.resolve();
    this.restart = true;
    this.loaded = this.load();
  }
  async load() {
    let raw;
    try {
      raw = await this.readFile(this.file, 'utf8');
    } catch (error) {
      this.diagnose(error?.code === 'ENOENT' ? await this.missingCause() : 'read-failed');
      return;
    }
    this.loadLog(raw);
  }
  async missingCause() {
    if (!this.identityScoped) return 'missing';
    try {
      const files = await fs.readdir(path.dirname(this.file));
      return files.some(file => /^embeddings(?:-[a-f0-9]{64})?\.json$/.test(file)) ? 'model-mismatch' : 'missing';
    } catch {
      // Un répertoire absent ne nécessite ni écriture ni reconstruction à l'ouverture.
      return 'missing';
    }
  }
  loadLog(raw) {
    const lines = raw.split('\n').filter(Boolean);
    let head;
    try {
      head = JSON.parse(lines[0]);
    } catch {
      this.diagnose('invalid-header');
      return;
    }
    if (!head || typeof head.model !== 'string') return this.diagnose('invalid-header');
    if (head.model !== this.model) return this.diagnose('model-mismatch');
    let cause;
    try {
      cause = this.loadEntries(head, lines);
      // A torn last line (crash, full disk) would glue itself to the next append: rewrite the log once instead.
      this.restart = Boolean(head.entries) || !raw.endsWith('\n');
    } catch {
      // Une structure qui interrompt la lecture garde les vecteurs déjà lus et impose la réécriture existante.
      cause = 'invalid-entry';
    }
    if (cause) this.diagnose(cause);
  }
  loadEntries(head, lines) {
    let cause = head.entries ? 'legacy-format' : null;
    // L'ancien format se lit toujours ; les lignes JSON déchirées restent ignorées dans le log.
    const items = head.entries
      ? Object.entries(head.entries).map(([id, entry]) => ({ id, ...entry }))
      : lines.slice(1).flatMap(line => {
        try {
          return [JSON.parse(line)];
        } catch {
          cause = 'invalid-json-line';
          return [];
        }
      });
    for (const { id, text, vector } of items) {
      if (typeof id === 'string' && typeof text === 'string' && Array.isArray(vector)) this.remember(id, text, vector);
      else cause = 'invalid-entry';
    }
    return cause;
  }
  diagnose(cause) {
    let rebuild = this.byText.size ? 'partial' : 'total';
    if (cause === 'legacy-format') rebuild = 'rewrite';
    try {
      this.onDiagnostic({
        code: 'TVLENS_EMBEDDING_CACHE_LOAD', cause, rebuild,
        providerCallsPossible: rebuild !== 'rewrite', message: LOAD_MESSAGES[cause] || LOAD_MESSAGES[rebuild],
      });
    } catch {
      // Le journal ne doit ni empêcher la recherche ni relancer le diagnostic.
    }
  }
  remember(id, text, vector) { this.entries[id] = { text, vector }; this.byText.set(text, vector); }
  async get(id, text) {
    this.assertIdentity();
    await this.loaded;
    this.assertIdentity();
    return this.entries[id]?.text === text ? this.entries[id].vector : this.byText.get(text)||null;
  }
  put(id, text, vector) { return this.putMany([{ id, text, vector }]); }
  async putMany(items) {
    await this.loaded; if (!items.length) return;
    this.assertIdentity();
    for (const { id, text, vector } of items) this.remember(id, text, vector);
    const line = ({ id, text, vector }) => JSON.stringify({ id, text, vector }) + '\n';
    // Serialised so lines never interleave; each call writes its own vectors only.
    this.serial = this.serial.catch(() => {}).then(async () => {
      // Checked when the write runs: a late vector must never give a deleted session its directory back.
      if (this.sealed) return;
      this.assertIdentity();
      await fs.mkdir(path.dirname(this.file), { recursive:true, mode:0o700 });
      if (!this.restart) { try { return await fs.appendFile(this.file, items.map(line).join(''), { mode:0o600 }); } catch (error) { this.restart = true; throw error; } }
      // No usable log yet (new file, other model, former layout): write everything known once, atomically.
      const all = Object.entries(this.entries).map(([id, entry]) => line({ id, ...entry })).join('');
      await fs.writeFile(this.file+'.tmp', JSON.stringify({ model: this.model }) + '\n' + all, { mode:0o600 }); await fs.rename(this.file+'.tmp', this.file);
      this.restart = false;
    });
    await this.serial;
  }
  // Before the session is deleted: vectors still arriving stay in memory, the write in flight is awaited.
  async seal() { this.sealed = true; await this.serial.catch(() => {}); }
}
module.exports = { EmbeddingStore };
