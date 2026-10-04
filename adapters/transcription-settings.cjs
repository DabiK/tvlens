const fs = require('node:fs/promises');
const { validateTranscriptionLanguage } = require('../core/transcription-language.cjs');
class TranscriptionSettings {
  constructor(file) { this.file = file; this.language = 'fr'; }
  async load() {
    try { this.language = validateTranscriptionLanguage(JSON.parse(await fs.readFile(this.file, 'utf8')).language); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this.language;
  }
  async save(language) {
    validateTranscriptionLanguage(language);
    await fs.writeFile(this.file + '.tmp', JSON.stringify({ language }), { mode: 0o600 });
    await fs.rename(this.file + '.tmp', this.file);
    this.language = language;
  }
}
module.exports = { TranscriptionSettings };
