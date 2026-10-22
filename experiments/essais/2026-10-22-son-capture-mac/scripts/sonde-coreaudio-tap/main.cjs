const { app, BrowserWindow, desktopCapturer, session, systemPreferences, ipcMain } = require('electron');
const path = require('node:path');
// CoreAudio Tap left enabled for comparison.
app.whenReady().then(async () => {
  console.log('screen-permission', systemPreferences.getMediaAccessStatus('screen'));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => callback({ video: sources[0], audio: 'loopback' }));
  ipcMain.on('report', (event, report) => { console.log('report', JSON.stringify(report)); app.quit(); });
  const win = new BrowserWindow({ width: 300, height: 200, show: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  await win.loadFile(path.join(__dirname, 'index.html'));
  setTimeout(() => { console.log('timeout'); app.quit(); }, 20000);
});
