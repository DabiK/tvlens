#!/bin/bash
set -euo pipefail
SOURCE='/Users/Dabi/.codex/worktrees/inspection-readable-images/tvlens/dist/TVLens-darwin-arm64/TVLens.app'
DEST='/Applications/TVLens.app'
STAGING='/Applications/TVLens-update-a57d1b0.app'
BACKUP="$HOME/Library/Application Support/TVLens-update-backups/before-a57d1b0/TVLens.app"
test ! -e "$STAGING"
test ! -e "$BACKUP"
/usr/bin/osascript -e 'tell application "TVLens" to quit'
for attempt in {1..30}; do
  if ! /usr/bin/pgrep -f '^/Applications/TVLens.app/Contents/MacOS/TVLens' >/dev/null; then break; fi
  sleep 1
done
if /usr/bin/pgrep -f '^/Applications/TVLens.app/Contents/MacOS/TVLens' >/dev/null; then
  echo 'Application encore active : installation arrêtée.' >&2
  exit 1
fi
/usr/bin/ditto "$SOURCE" "$STAGING"
/usr/bin/codesign --verify --deep --strict "$STAGING"
mkdir -p "$(dirname "$BACKUP")"
mv "$DEST" "$BACKUP"
if ! mv "$STAGING" "$DEST"; then
  mv "$BACKUP" "$DEST"
  exit 1
fi
/usr/bin/codesign --verify --deep --strict "$DEST"
/usr/bin/shasum -a 256 "$DEST/Contents/Resources/app.asar"
/usr/bin/open "$DEST"
printf 'Installed: %s\nBackup: %s\n' "$DEST" "$BACKUP"
