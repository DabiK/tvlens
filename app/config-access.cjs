const fs = require('node:fs/promises');
const path = require('node:path');
const { loadConfig } = require('../adapters/config.cjs');

// The storage capability is obtained only after a choice. Even an availability probe may ask macOS for access.
function createConfigAccess({ userData, environment, getStorage, chooseStored, explainImport }) {
  const options = { userData, environment };
  const temporary = configPath => loadConfig({ ...options, configPath, protectedAccess: false });
  const protectedConfig = async configPath => {
    try {
      return await loadConfig({ ...options, configPath, safeStorage: getStorage(), strict: true });
    } catch {
      throw Object.assign(new Error('Les réglages protégés n’ont pas pu être ouverts ou enregistrés. '
        + 'Tu peux réessayer ou continuer sans les charger. Ils sont conservés sur ce Mac.'), { code: 'TVLENS_CONFIG_LOCKED' });
    }
  };
  async function startup(configPath) {
    if (configPath) return temporary(configPath);
    let exists;
    try { exists = (await fs.stat(path.join(userData, 'provider.enc'))).isFile(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      exists = false;
    }
    if (!exists) return temporary();
    const selected = await chooseStored(() => protectedConfig());
    return selected || { ...await temporary(), protectedSettingsSkipped: true };
  }
  async function importFile(configPath) {
    const choice = await explainImport();
    if (choice === 'save') return protectedConfig(configPath);
    if (choice === 'temporary') return temporary(configPath);
    return null;
  }
  return { startup, importFile };
}
module.exports = { createConfigAccess };
