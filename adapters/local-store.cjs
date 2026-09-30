const fs = require('node:fs/promises');
const path = require('node:path');

class LocalSessionStore {
  constructor(root) { this.root = root; this.serial = Promise.resolve(); this.leases = new Map(); this.pendingRemoval = new Set(); }
  file(id, suffix) {
    if (!/^moment-\d+$/.test(id)) throw new Error('Identifiant de passage invalide.');
    return path.join(this.root, `${id}.${suffix}`);
  }
  async put(id, input) {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await Promise.all([
      fs.writeFile(this.file(id, 'webm'), Buffer.from(input.clip), { mode: 0o600 }),
      fs.writeFile(this.file(id, 'json'), JSON.stringify({ frames: input.frames, audio: input.audio ? Buffer.from(input.audio).toString('base64') : null }), { mode: 0o600 })
    ]);
  }
  async read(id) {
    const data = JSON.parse(await fs.readFile(this.file(id, 'json'), 'utf8'));
    return { frames: data.frames, audio: data.audio ? Buffer.from(data.audio, 'base64') : null };
  }
  async remove(id) {
    if (this.leases.get(id)) { this.pendingRemoval.add(id); return; }
    await Promise.all(['json', 'webm'].map(ext => fs.rm(this.file(id, ext), { force: true })));
  }
  async lease(ids) {
    const held = [];
    const release = async () => { for (const id of held.splice(0)) { const n = this.leases.get(id)-1; if(n) this.leases.set(id,n); else { this.leases.delete(id); if(this.pendingRemoval.delete(id)) await this.remove(id); } } };
    try {
      for (const id of ids) {
        if(this.pendingRemoval.has(id)) throw new Error('Passage expiré.');
        this.leases.set(id,(this.leases.get(id)||0)+1); held.push(id);
        await fs.access(this.file(id,'webm'));
      }
      return release;
    } catch { await release(); throw new Error('Média expiré ou indisponible.'); }
  }
  save(snapshot) {
    const data = JSON.stringify(snapshot, null, 2);
    // Serialize snapshots so older writes can never replace newer state.
    this.serial = this.serial.catch(() => {}).then(async () => {
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
      const target = path.join(this.root, 'session.json');
      await fs.writeFile(target + '.tmp', data, { mode: 0o600 });
      await fs.rename(target + '.tmp', target);
    });
    return this.serial;
  }
  saveResearch(snapshot) {
    const data=JSON.stringify(snapshot,null,2);
    this.serial=this.serial.catch(()=>{}).then(async()=>{
      await fs.mkdir(this.root,{recursive:true,mode:0o700});
      const file=path.join(this.root,'deep-answers.json');
      await fs.writeFile(file+'.tmp',data,{mode:0o600});await fs.rename(file+'.tmp',file);
    });
    return this.serial;
  }
  saveRecap(snapshot) {
    const data=JSON.stringify(snapshot,null,2);
    this.serial=this.serial.catch(()=>{}).then(async()=>{
      await fs.mkdir(this.root,{recursive:true,mode:0o700});
      const file=path.join(this.root,'living-recap.json');
      await fs.writeFile(file+'.tmp',data,{mode:0o600});await fs.rename(file+'.tmp',file);
    });
    return this.serial;
  }
  saveAuto(snapshot){const data=JSON.stringify(snapshot,null,2);this.serial=this.serial.catch(()=>{}).then(async()=>{await fs.mkdir(this.root,{recursive:true});await fs.writeFile(path.join(this.root,'auto.json'),data,{mode:0o600});});return this.serial;}
  async clearRaw() {
    const files = await fs.readdir(this.root).catch(() => []);
    await Promise.all(files.filter(file => /^moment-\d+\.(?:webm|json)$/.test(file)).map(file => fs.rm(path.join(this.root, file), {force:true})));
  }
  async response(id, range) {
    let bytes;
    try { bytes = await fs.readFile(this.file(id, 'webm')); }
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

async function cleanupRawMedia(sessionsRoot) {
  const entries = await fs.readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(sessionsRoot, entry.name);
    await fs.rm(path.join(dir, "thumbnails"), { recursive: true, force: true });
    const files = await fs.readdir(dir);
    await Promise.all(files.filter(file => /^moment-\d+\.(?:webm|json)$/.test(file)).map(file => fs.rm(path.join(dir, file), { force: true })));
  }
}
module.exports = { LocalSessionStore, cleanupRawMedia };
