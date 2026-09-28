const fs = require('node:fs/promises');
const path = require('node:path');
class EmbeddingStore {
  constructor(file, model) { this.file = file; this.model = model; this.entries = {}; this.byText = new Map(); this.serial = Promise.resolve(); this.loaded = this.load(); }
  async load() { try { const data = JSON.parse(await fs.readFile(this.file, 'utf8')); if (data.model === this.model) {this.entries = data.entries;for(const entry of Object.values(this.entries))this.byText.set(entry.text,entry.vector);} } catch {} }
  async get(id, text) { await this.loaded; return this.entries[id]?.text === text ? this.entries[id].vector : this.byText.get(text)||null; }
  async put(id, text, vector) {
    await this.loaded; this.entries[id] = { text, vector }; this.byText.set(text,vector);
    const data = JSON.stringify({ model: this.model, entries: this.entries });
    this.serial = this.serial.catch(() => {}).then(async () => { await fs.mkdir(path.dirname(this.file), { recursive:true, mode:0o700 }); await fs.writeFile(this.file+'.tmp', data, { mode:0o600 }); await fs.rename(this.file+'.tmp', this.file); });
    await this.serial;
  }
}
module.exports = { EmbeddingStore };
