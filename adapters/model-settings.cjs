const fs = require('node:fs/promises');
const path = require('node:path');
const defaults = { codexModel: '', observationModel: 'gpt-6-luna', inspectionModel: 'gpt-6-luna' };
function validateSettings(value) {
  if (!value || typeof value !== 'object') throw new Error('Réglages invalides.');
  const result = {};
  for (const key of Object.keys(defaults)) {
    const text = value[key];
    if (typeof text !== 'string' || text.length > 160 || (text && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(text)) || (key !== 'codexModel' && !text)) throw new Error(`Modèle invalide : ${key}`);
    result[key] = text;
  }
  return result;
}
class ModelSettings {
  constructor(file) { this.file = file; }
  async load(fallback = {}) { try { return validateSettings(JSON.parse(await fs.readFile(this.file, 'utf8'))); } catch (e) { if(e.code !== 'ENOENT') throw e; return {...defaults,...fallback}; } }
  async save(value) { const result = validateSettings(value); await fs.mkdir(path.dirname(this.file),{recursive:true}); await fs.writeFile(this.file+'.tmp',JSON.stringify(result),{mode:0o600}); await fs.rename(this.file+'.tmp',this.file); return result; }
}
async function modelChoices(authHome) {
  try {const data=JSON.parse(await fs.readFile(path.join(authHome||process.env.CODEX_HOME||path.join(require('node:os').homedir(),'.codex'),'models_cache.json'),'utf8'));
    return (data.models||[]).filter(m=>typeof m.slug==='string'&&m.slug!=='codex-auto-review').map(m=>({id:m.slug,name:typeof m.display_name==='string'?m.display_name:m.slug}));
  }catch{return [];}
}
module.exports = { ModelSettings, validateSettings, modelChoices };
