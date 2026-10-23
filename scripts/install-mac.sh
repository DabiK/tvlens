#!/bin/bash
# Compatible with the Bash 3.2 shipped by macOS. No repository or Node.js required.
set -euo pipefail

APP_RELEASE='v0.1.0-mac-preview.4'
APP_SHA256='364336b7fe5f1d11e319855f9a161ced71653784bb1637c067ca9b3f0be42323'
MODEL_SHA256='60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
APP_URL="https://github.com/DabiK/tvlens/releases/download/$APP_RELEASE/TVLens-mac-arm64.zip"
MODEL_URL='https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
SIGNING_REQUIREMENT='=anchor apple generic and certificate leaf[subject.OU] = "NNBW4BZ8T4" and identifier "dev.tvlens.capture"'
WORK_DIR=''
STAGE_DIR=''
BACKUP=''
TARGET=''
MODEL_TEMP=''
LOCK_DIR=''
APP_ONLY=false
NO_OPEN=false
ASSUME_YES=false
DESTINATION=''

say() { printf '%s\n' "$*"; }
fail() { say "Erreur [$1] : $2" >&2; exit 1; }

usage() {
  cat <<'HELP'
Installer TVLens sur un Mac Apple Silicon (macOS 15 ou plus récent).
Usage : bash install-mac.sh [options]
  --app-only           Installer seulement TVLens, sans outils ni modèle
  --no-open            Ne pas demander l’ouverture de TVLens
  --yes                Accepter la préparation annoncée, sans modifier les protections macOS
  --destination DIR    Dossier Applications alternatif (chemin absolu)
  --help               Afficher cette aide
Par défaut : app, outils manquants (Homebrew, Codex, FFmpeg, Whisper) et modèle base.
Aucune connexion Apple. La connexion Codex et les autorisations macOS restent personnelles.
HELP
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --app-only) APP_ONLY=true ;;
      --no-open) NO_OPEN=true ;;
      --yes) ASSUME_YES=true ;;
      --destination)
        [ "$#" -ge 2 ] || fail ARGUMENT 'Précise un dossier après --destination.'
        DESTINATION="$2"
        shift
        ;;
      --help) usage; exit 0 ;;
      *) fail ARGUMENT "Option inconnue : $1" ;;
    esac
    shift
  done
}

check_platform() {
  [ "$(uname -s)" = Darwin ] || fail PLATFORM 'Cet installateur est réservé à macOS.'
  [ "$(uname -m)" = arm64 ] || fail ARCH 'Utilise Terminal sans Rosetta sur un Mac avec puce Apple.'
  [ "$(id -u)" -ne 0 ] || fail ROOT 'Lance ce script avec ton compte habituel, sans sudo.'
  local major
  major="$(sw_vers -productVersion)"
  major="${major%%.*}"
  [ "$major" -ge 15 ] || fail MACOS 'Ce parcours nécessite macOS 15 ou plus récent.'
}

cleanup() {
  local status=$?
  trap - EXIT
  if [ -n "$BACKUP" ] && [ -e "$BACKUP" ] && [ ! -e "$TARGET" ]; then
    if ! mv "$BACKUP" "$TARGET"; then
      say "Restauration impossible : l’ancienne app est conservée dans $BACKUP" >&2
      STAGE_DIR=''
    fi
  fi
  [ -z "$MODEL_TEMP" ] || rm -f "$MODEL_TEMP"
  [ -z "$STAGE_DIR" ] || rm -rf "$STAGE_DIR"
  [ -z "$WORK_DIR" ] || rm -rf "$WORK_DIR"
  [ -z "$LOCK_DIR" ] || rmdir "$LOCK_DIR"
  exit "$status"
}

prepare() {
  if [ -z "$DESTINATION" ]; then
    DESTINATION='/Applications'
    [ -w "$DESTINATION" ] || DESTINATION="$HOME/Applications"
  fi
  case "$DESTINATION" in
    /*) ;;
    *) fail DESTINATION 'Le dossier de destination doit être un chemin absolu.' ;;
  esac
  TARGET="$DESTINATION/TVLens.app"
  if [ -e "$TARGET" ] && [ ! -d "$TARGET" ]; then
    fail DESTINATION "La destination TVLens.app existe mais n’est pas un dossier d’application."
  fi
  [ ! -L "$TARGET" ] || fail DESTINATION 'La destination TVLens.app est un lien symbolique.'
  say "TVLens $APP_RELEASE → $TARGET"
  if ! "$APP_ONLY"; then
    say 'Préparation : outils manquants via Homebrew (Codex, FFmpeg, Whisper) et modèle vocal (~142 Mio).'
    say 'Homebrew peut demander ton mot de passe Mac et les outils de développement Apple.'
    say "Les outils et modèles déjà présents sont conservés. Aucun compte ni réglage TVLens n’est modifié."
  fi
  say "Le paquet est signé, sans notarisation : macOS peut encore demander une autorisation d’ouverture."
  if ! "$ASSUME_YES"; then
    local answer
    printf 'Continuer ? [o/N] '
    read -r answer || fail CANCELLED 'Installation annulée.'
    case "$answer" in
      o|O|oui|Oui|y|Y|yes) ;;
      *) fail CANCELLED 'Installation annulée.' ;;
    esac
  fi
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tvlens-install.XXXXXX")"
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir -p "$DESTINATION"
  if mkdir "$DESTINATION/.tvlens-install-lock" 2>/dev/null; then
    LOCK_DIR="$DESTINATION/.tvlens-install-lock"
  else
    fail LOCK 'Une installation est déjà en cours, ou son verrou subsiste. Voir le guide de dépannage.'
  fi
}

download() {
  curl --fail --location --proto '=https' --proto-redir '=https' \
    --connect-timeout 30 --max-time 900 --retry 2 --output "$2" "$1"
}

verify_hash() {
  local actual
  actual="$(shasum -a 256 "$1")"
  actual="${actual%% *}"
  [ "$actual" = "$2" ] || fail CHECKSUM 'Empreinte inattendue : le fichier téléchargé ne sera pas installé.'
}

app_is_valid() {
  /usr/bin/codesign --verify --deep --strict --test-requirement "$SIGNING_REQUIREMENT" "$1"
}

verify_app() {
  app_is_valid "$1" ||
    fail SIGNATURE "Le paquet n’a pas la signature TVLens attendue. Installation arrêtée."
}

extract_archive() { /usr/bin/ditto -x -k "$1" "$2"; }
copy_app() { /usr/bin/ditto "$1" "$2"; }

fetch_app() {
  say '1/4 — Téléchargement et vérification de TVLens…'
  download "$APP_URL" "$WORK_DIR/TVLens.zip"
  verify_hash "$WORK_DIR/TVLens.zip" "$APP_SHA256"
  extract_archive "$WORK_DIR/TVLens.zip" "$WORK_DIR/unpacked"
  verify_app "$WORK_DIR/unpacked/TVLens.app"
}

find_tool() {
  local name="$1" candidate
  candidate="$(command -v "$name" || true)"
  if [ -n "$candidate" ] && [ -f "$candidate" ] && [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  for candidate in "$HOME/.local/bin/$name" "/opt/homebrew/bin/$name" "/usr/local/bin/$name"; do
    if [ -f "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_brew() {
  if ! BREW="$(find_tool brew)"; then
    say 'Installation de Homebrew depuis son dépôt officiel…'
    download 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh' "$WORK_DIR/homebrew.sh"
    /bin/bash "$WORK_DIR/homebrew.sh"
    BREW="$(find_tool brew)" || fail HOMEBREW 'Homebrew reste introuvable. Relance le script après son installation.'
  fi
}

prepare_tools() {
  say '2/4 — Préparation des outils…'
  if "$APP_ONLY"; then
    say 'Outils conservés tels quels (--app-only).'
    return
  fi
  local name missing=false
  for name in codex whisper-cli ffmpeg; do
    find_tool "$name" >/dev/null || missing=true
  done
  if "$missing"; then
    ensure_brew
    if ! find_tool codex >/dev/null; then
      HOMEBREW_NO_AUTO_UPDATE=1 "$BREW" install --cask codex
    fi
    if ! find_tool whisper-cli >/dev/null; then
      HOMEBREW_NO_AUTO_UPDATE=1 "$BREW" install whisper.cpp
    fi
    if ! find_tool ffmpeg >/dev/null; then
      HOMEBREW_NO_AUTO_UPDATE=1 "$BREW" install ffmpeg
    fi
  fi
  for name in codex whisper-cli ffmpeg; do
    find_tool "$name" >/dev/null || fail TOOL_MISSING "Outil introuvable après préparation : $name"
  done
  say "Outils présents ; l’assistant vérifiera leur fonctionnement et la connexion Codex."
}

prepare_model() {
  say '3/4 — Préparation du modèle vocal…'
  "$APP_ONLY" && return 0
  local directory model
  directory="$HOME/Library/Application Support/TVLens/models"
  model="$directory/ggml-base.bin"
  if [ -s "$model" ]; then
    say "Modèle existant conservé ; aucun modèle personnalisé n’est remplacé."
    return
  fi
  mkdir -p "$directory"
  MODEL_TEMP="$(mktemp "$directory/.base-download.XXXXXX")"
  download "$MODEL_URL" "$MODEL_TEMP"
  verify_hash "$MODEL_TEMP" "$MODEL_SHA256"
  mv "$MODEL_TEMP" "$model"
  MODEL_TEMP=''
}

app_running() {
  pgrep -f '/TVLens.app/Contents/MacOS/TVLens' >/dev/null
}

install_app() {
  say "4/4 — Installation de l’application…"
  if [ -d "$TARGET" ] &&
    cmp -s "$TARGET/Contents/Resources/app.asar" "$WORK_DIR/unpacked/TVLens.app/Contents/Resources/app.asar" &&
    app_is_valid "$TARGET" 2>/dev/null; then
    say 'Cette version est déjà installée et sa signature est valide.'
    return
  fi
  app_running && fail RUNNING "Quitte TVLens puis relance le script pour remplacer l’application."
  mkdir -p "$DESTINATION"
  STAGE_DIR="$(mktemp -d "$DESTINATION/.tvlens-install.XXXXXX")"
  copy_app "$WORK_DIR/unpacked/TVLens.app" "$STAGE_DIR/TVLens.app"
  verify_app "$STAGE_DIR/TVLens.app"
  if [ -e "$TARGET" ]; then
    BACKUP="$STAGE_DIR/previous.app"
    mv "$TARGET" "$BACKUP"
  fi
  mv "$STAGE_DIR/TVLens.app" "$TARGET"
  say "Application installée : $TARGET"
}

finish() {
  say 'Ouvre TVLens → Préparons ce Mac pour terminer la connexion Codex et les autorisations écran/son.'
  say 'Si macOS bloque : Réglages Système → Confidentialité et sécurité → Ouvrir quand même.'
  say "Aucune protection macOS n’a été désactivée. Une ouverture demandée ne garantit pas une ouverture autorisée."
  if ! "$NO_OPEN"; then
    /usr/bin/open "$TARGET" || say "Ouverture refusée : ouvre $TARGET depuis le Finder et suis l’aide ci-dessus."
  fi
}

main() {
  parse_args "$@"
  check_platform
  prepare
  fetch_app
  prepare_tools
  prepare_model
  install_app
  finish
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
