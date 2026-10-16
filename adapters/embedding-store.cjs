const fs = require('node:fs/promises');
const path = require('node:path');
// Append-only log: one header line naming the model, then one line per vector. A live session
// indexes a passage every few seconds: rewriting every vector each time cost the square of its length.
class EmbeddingStore {
  constructor(file, model) { this.file = file; this.model = model; this.entries = {}; this.byText = new Map(); this.serial = Promise.resolve(); this.restart = true; this.loaded = this.load(); }
  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8'), lines = raw.split('\n').filter(Boolean), head = JSON.parse(lines[0]);
      if (head.model !== this.model) return;
      // The former layout held every entry in one object: read it, then start a log at the first write.
      const items = head.entries ? Object.entries(head.entries).map(([id, entry]) => ({ id, ...entry }))
        : lines.slice(1).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); // a torn last line is skipped
      for (const { id, text, vector } of items) if (typeof id === 'string' && typeof text === 'string' && Array.isArray(vector)) this.remember(id, text, vector);
      // A torn last line (crash, full disk) would glue itself to the next append: rewrite the log once instead.
      this.restart = Boolean(head.entries) || !raw.endsWith('\n');
    } catch {
      // Ce cache dérivé ne doit pas empêcher la recherche : get rend null pour les vecteurs
      // manquants, que MomentIndex redemande au fournisseur. Les entrées déjà lues restent
      // en mémoire et restart impose une réécriture au prochain put ; le refus n'est pas signalé.
    }
  }
  remember(id, text, vector) { this.entries[id] = { text, vector }; this.byText.set(text, vector); }
  async get(id, text) { await this.loaded; return this.entries[id]?.text === text ? this.entries[id].vector : this.byText.get(text)||null; }
  put(id, text, vector) { return this.putMany([{ id, text, vector }]); }
  async putMany(items) {
    await this.loaded; if (!items.length) return;
    for (const { id, text, vector } of items) this.remember(id, text, vector);
    const line = ({ id, text, vector }) => JSON.stringify({ id, text, vector }) + '\n';
    // Serialised so lines never interleave; each call writes its own vectors only.
    this.serial = this.serial.catch(() => {}).then(async () => {
      // Checked when the write runs: a late vector must never give a deleted session its directory back.
      if (this.sealed) return;
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
