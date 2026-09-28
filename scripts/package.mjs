import { packager } from '@electron/packager';
await packager({
  dir: '.', out: 'dist', name: 'TVLens', platform: 'darwin', arch: 'arm64',
  appBundleId: 'dev.tvlens.capture', overwrite: true,
  asar: { unpackDir: 'node_modules/@img' },
  ignore: [/^\/(?:\.env(?:\.|$)|env\.local$)/, /^\/\.local/, /^\/\.scratch/, /^\/challenge/, /^\/media/, /^\/dist/, /^\/\.git(?:\/|$)/],
  extendInfo: {
    NSAudioCaptureUsageDescription: 'TVLens capture le son des vidéos pour construire leur contexte.',
    NSScreenCaptureUsageDescription: 'TVLens capture la fenêtre vidéo que vous choisissez.'
  }
});
