const fs = require('node:fs/promises');
const path = require('node:path');
class VerificationArchive {
  constructor(root) { this.root = root; }
  async save(job) {
    if (!/^verification-\d+$/.test(job.id) || !Number.isFinite(job.createdAt)) throw new Error('Archive invalide.');
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const target = path.join(this.root, `${job.createdAt}-${job.id}.json`);
    await fs.writeFile(target + '.tmp', JSON.stringify(job, null, 2), { mode: 0o600 });
    await fs.rename(target + '.tmp', target);
  }
}
module.exports = { VerificationArchive };
