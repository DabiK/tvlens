const fs = require('node:fs/promises');
const path = require('node:path');

const STORAGE_FULL = 'TVLENS_STORAGE_FULL';
const GIB = 1024 ** 3, MIB = 1024 ** 2;
// Rounded up, so that freeing what the message asks for is always enough.
const size = bytes => bytes < GIB ? `${Math.ceil(bytes / MIB)} Mo` : `${(Math.ceil(bytes / GIB * 10) / 10).toLocaleString('fr-FR')} Go`;

// The session core only reads `code`: it stops capture on it without knowing anything about disks.
class StorageFullError extends Error {
  // `neededBytes` is what must be freed for capture to come back. The message states that single figure:
  // free space and floor side by side round to the same value just under the floor ("1 Go libres, 1 Go requis").
  constructor({ freeBytes = null, minFreeBytes = null, neededBytes = null } = {}) {
    if (!Number.isFinite(neededBytes)) neededBytes = Number.isFinite(freeBytes) && Number.isFinite(minFreeBytes) ? minFreeBytes - freeBytes : null;
    // A write refused by the system while the measurement shows room (quota) has no figure to give.
    if (!(neededBytes > 0)) neededBytes = null;
    const room = neededBytes === null ? '' : ` Il manque environ ${size(neededBytes)} d’espace libre.`;
    super(`Espace disque insuffisant : la capture est suspendue pour ne rien supprimer.${room} Supprime une session ou libère de l’espace, puis reprends.`);
    Object.assign(this, { name: 'StorageFullError', code: STORAGE_FULL, freeBytes, minFreeBytes, neededBytes });
  }
}

// The data directory may not exist before the first session: its nearest existing ancestor is on the
// same filesystem. Always the data path, never the temporary directory (a private mount on the server).
async function measureFree(target) {
  for (let dir = path.resolve(target); ; dir = path.dirname(dir)) {
    try { const stats = await fs.statfs(dir); return stats.bavail * stats.bsize; }
    catch (error) { if (error.code !== 'ENOENT' || dir === path.dirname(dir)) throw error; }
  }
}

// Durable retention never deletes to make room: below the floor, capture is refused and says why.
class DiskGuard {
  constructor({ path: target, minFreeBytes = GIB, warnFreeBytes = 2 * GIB, resumeMarginBytes = 256 * 1024 ** 2, maxAgeMs = 5000, freeBytes = measureFree, now = Date.now }) {
    if (![minFreeBytes, warnFreeBytes, resumeMarginBytes].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Seuils d’espace disque invalides.');
    Object.assign(this, { path: target, minFreeBytes, warnFreeBytes: Math.max(warnFreeBytes, minFreeBytes), resumeMarginBytes, maxAgeMs, measure: freeBytes, now });
    this.free = null; this.blocked = false; this.checkedAt = null; this.measuring = null;
  }

  // One measurement at a time, reused for maxAgeMs: a write every few seconds, a state poll or a tick
  // never becomes a filesystem call of its own.
  check({ force = false } = {}) {
    if (!force && this.checkedAt !== null && this.now() - this.checkedAt < this.maxAgeMs) return Promise.resolve(this.snapshot());
    return this.measuring ||= (async () => {
      try {
        // Called inside an async function: a measurement that throws synchronously is a failed measurement
        // like any other, settled after `measuring` is assigned, so the next check measures again.
        const free = await (async () => this.measure(this.path))();
        if (!Number.isFinite(free)) throw new Error('Mesure invalide.');
        this.free = free;
        // Hysteresis: capture only comes back with a margin above the floor, so it cannot flap around it.
        if (free < this.minFreeBytes) this.blocked = true;
        else if (free >= this.minFreeBytes + this.resumeMarginBytes) this.blocked = false;
      } catch {
        // Unknown is reported and never blocks: the write itself stays protected by its own failure.
        this.free = null;
      }
      this.checkedAt = this.now(); this.measuring = null;
      return this.snapshot();
    })();
  }

  async admit(bytes = 0) {
    await this.check();
    if (this.free === null) return;
    if (this.blocked || this.free - bytes < this.minFreeBytes) { this.blocked = true; throw this.error(); }
    // Debit what is about to be written: several writes between two measurements cannot overshoot the floor.
    this.free -= bytes;
  }

  // Start or resume of a capture: decided on a fresh measurement, not on the cached one.
  async assertRoom() { await this.check({ force: true }); await this.admit(0); }

  // A write really failed for lack of space (ENOSPC, EDQUOT): same refusal as a measured shortage.
  trip() { this.blocked = true; return this.error(); }
  // Once refused, capture only comes back with the margin above the floor: that is the room to free.
  error() {
    return new StorageFullError({ freeBytes: this.free, minFreeBytes: this.minFreeBytes,
      neededBytes: this.free === null ? null : this.minFreeBytes + this.resumeMarginBytes - this.free });
  }

  snapshot() {
    return { state: this.free === null ? 'unknown' : this.blocked ? 'blocked' : this.free < this.warnFreeBytes ? 'low' : 'ok',
      freeBytes: this.free, minFreeBytes: this.minFreeBytes, warnFreeBytes: this.warnFreeBytes, checkedAt: this.checkedAt };
  }
}

module.exports = { DiskGuard, StorageFullError, STORAGE_FULL, measureFree };
