const path = require('node:path');

function showConfigWelcome({ BrowserWindow, ipcMain, restore }) {
  const window = new BrowserWindow({ width: 660, height: 490, minWidth: 580, minHeight: 440,
    title: 'Bienvenue dans TVLens', backgroundColor: '#181818',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      additionalArguments: ['--config-welcome'] } });
  let settled = false;
  let busy = false;
  let finish;
  const choice = new Promise(resolve => { finish = resolve; });
  const channel = 'config:welcome';
  ipcMain.handle(channel, async (event, action) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('Unauthorized');
    if (busy || settled) return { error: 'Une opération est déjà en cours.' };
    if (!['restore', 'skip'].includes(action)) return { error: 'Choix inconnu.' };
    busy = true;
    try {
      const config = action === 'restore' ? await restore() : null;
      settled = true;
      finish(config);
      return { ready: true };
    } catch {
      return { error: 'Impossible de déverrouiller les réglages. Tu peux réessayer ou continuer sans eux. Rien n’a été supprimé.' };
    } finally { busy = false; }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { ipcMain.removeHandler(channel); });
  const ready = window.loadFile(path.join(__dirname, 'config-welcome.html'));
  return { window, choice: ready.then(() => choice) };
}

function explainConfigImport(dialog, window) {
  return dialog.showMessageBox(window, {
    type: 'info', title: 'Protéger les réglages importés',
    message: 'Comment utiliser ces réglages ?',
    detail: 'Pour les retrouver lors d’une prochaine ouverture, TVLens les chiffre sur ce Mac. '
      + 'macOS peut demander l’accès à « TVLens Safe Storage » et le mot de passe de ta session Mac. '
      + 'Ce mot de passe se saisit uniquement dans la fenêtre macOS. '
      + 'Tu peux aussi utiliser le fichier pour cette ouverture seulement, sans accéder au trousseau ni remplacer les réglages enregistrés.',
    buttons: ['Enregistrer de façon protégée', 'Pour cette ouverture seulement', 'Annuler'], defaultId: 1, cancelId: 2,
  }).then(({ response }) => ['save', 'temporary', 'cancel'][response] || 'cancel');
}
module.exports = { showConfigWelcome, explainConfigImport };
