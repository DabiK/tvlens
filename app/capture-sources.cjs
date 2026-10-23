const fs = require('node:fs/promises');
const path = require('node:path');

// Doit égaler le titre de la BrowserWindow créée dans app/main.cjs pour exclure la fenêtre de l'application.
const OWN_WINDOW_NAME = 'TVLens';
const SOURCE_PREVIEW_SIZE = { width: 480, height: 270 };

async function createCaptureSources({ smoke, desktopCapturer, systemPreferences, shell, preferenceFile }) {
  let sources = [];
  let lastSource = await fs.readFile(preferenceFile, 'utf8').then(JSON.parse).catch(() => null);
  let selectedId;
  let capturedSource = null;
  return {
    sources: async (options = {}) => {
      const permission = smoke ? 'granted' : systemPreferences.getMediaAccessStatus('screen');
      const previews = options?.previews === true && permission === 'granted';
      const thumbnailSize = previews ? SOURCE_PREVIEW_SIZE : { width: 0, height: 0 };
      sources = smoke ? [{ id: 'test-source', name: 'Vidéo de démonstration' }]
        : await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize });
      const available = sources.filter(source => source.name !== OWN_WINDOW_NAME).map(source => {
        const item = { id: source.id, name: source.name };
        const thumbnail = previews ? previewDataURL(source.thumbnail) : null;
        if (thumbnail) item.thumbnail = thumbnail;
        return item;
      });
      // Window IDs can be recycled: only preselect when both ID and title still match.
      const preferred = available.find(source => source.id === lastSource?.id && source.name === lastSource?.name);
      return {
        permission: smoke ? 'granted' : systemPreferences.getMediaAccessStatus('screen'),
        sources: available,
        preferredSourceId: preferred?.id || null,
      };
    },
    select: async id => {
      const source = sources.find(source => source.id === id && source.name !== OWN_WINDOW_NAME);
      if (!source) throw new Error('Source indisponible');
      selectedId = id;
      lastSource = { id, name: source.name };
      capturedSource = source.name;
      await fs.mkdir(path.dirname(preferenceFile), { recursive: true });
      await fs.writeFile(preferenceFile, JSON.stringify(lastSource), { mode: 0o600 });
    },
    settings: () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'),
    takeSelectedSource: () => {
      const source = sources.find(source => source.id === selectedId);
      selectedId = undefined;
      return source;
    },
    capturedSourceName: () => capturedSource,
  };
}

function previewDataURL(image) {
  try {
    return image && !image.isEmpty() ? image.toDataURL() : null;
  } catch {
    // One window may close during conversion: keep the source list usable with its unavailable-preview fallback.
    return null;
  }
}

module.exports = { createCaptureSources };
