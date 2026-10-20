#!/usr/bin/env bash
# Téléchargement du noyau FR/EN : CNRS, cuisine, Tears of Steel et Artemis ; Kennedy et Spring sont transférés depuis le Mac.
# Licences et preuves : corpus-propose.md. Idempotent : un fichier déjà présent et non vide n'est pas retéléchargé.
# Usage : bash telecharger-noyau.sh <racine>
# Sortie : <racine>/videos/NN-slug.ext, les métadonnées yt-dlp (*.info.json), les sous-titres disponibles, et
# <racine>/videos/corpus.json (source, licence, langue, type, empreinte, durée, outil) pour la fiche de campagne.
set -euo pipefail
ROOT=${1:?racine, par exemple /srv/tvlens-gx10}
V="$ROOT/videos"; mkdir -p "$V" "$ROOT/outils"
YTDLP="$ROOT/outils/yt-dlp"
LOG="$V/telechargement.log"
note() { echo "$(date -Is) $*" | tee -a "$LOG"; }

# yt-dlp : binaire officiel de la dernière version, vérifié par la somme publiée avec la version.
if [ ! -x "$YTDLP" ]; then
  base=https://github.com/yt-dlp/yt-dlp/releases/latest/download
  curl -fsSL "$base/yt-dlp_linux_aarch64" -o "$YTDLP.tmp"
  expected=$(curl -fsSL "$base/SHA2-256SUMS" | awk '$2 == "yt-dlp_linux_aarch64" {print $1}')
  echo "$expected  $YTDLP.tmp" | sha256sum -c - >/dev/null
  chmod +x "$YTDLP.tmp" && mv "$YTDLP.tmp" "$YTDLP"
fi
note "yt-dlp : $("$YTDLP" --version)"
# Node 24 est déjà installé ; ce moteur évite le téléchargement Deno inaccessible depuis la GX10.
command -v node >/dev/null

# NN|slug|source|langue|type|licence|section (vide : entière)
IFS= read -r -d '' CORPUS <<'EOF' || true
04|cnrs-entrainement-ia|yt:W_8OhdeQs4Y|fr|cours, texte à l'écran|CC BY (YouTube, CNRS FIDLE)|
05|boeuf-bourguignon|yt:koEDMDuAw0k|fr|tutoriel de cuisine|CC BY (YouTube, Learn With A Champion)|
08|tears-of-steel|url:https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov|en|fiction dialoguée|CC BY 3.0 (Blender Foundation)|
09|artemis-lancement|yt:CMLD0Lp0JBg|en|direct, son bruité|domaine public (NASA)|2:50:00-3:25:00
EOF

youtube() { # $1 id, $2 langue, $3 sortie sans extension, $4 section
  local lang=$2 audio='ba'
  [ "$lang" != none ] && audio="ba[language^=$lang]/ba[format_note*=original]/ba"
  local args=(--js-runtimes node --socket-timeout 20 --retries 2 -f "bv*[height<=720][vcodec^=avc1]+($audio)/b[height<=720]" --merge-output-format mp4 --no-playlist
    --write-info-json --write-subs --sub-format vtt -o "$3.%(ext)s")
  [ "$lang" != none ] && args+=(--sub-langs "$lang.*")
  [ -n "$4" ] && args+=(--download-sections "*$4" --force-keyframes-at-cuts)
  "$YTDLP" "${args[@]}" "https://www.youtube.com/watch?v=$1" >>"$LOG" 2>&1
}
commons() { # $1 nom de fichier, $2 hauteur voulue (0 : original), $3 sortie sans extension
  local api="https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=videoinfo&viprop=url|derivatives&titles=File:$1"
  local json; json=$(curl -fsSL -A "TVLens-GX10-corpus/1.0 (recherche)" "$api")
  local src
  if [ "$2" = 0 ]; then src=$(echo "$json" | jq -r '.query.pages[].videoinfo[0].url')
  else src=$(echo "$json" | jq -r --argjson h "$2" '[.query.pages[].videoinfo[0].derivatives[] | select(.height == $h and (.type | test("webm")))][0].src // empty'); fi
  [ -n "$src" ] || { note "Commons : dérivé $2p introuvable pour $1"; return 1; }
  curl -fsSL -A "TVLens-GX10-corpus/1.0 (recherche)" "$src" -o "$3.webm.tmp" && mv "$3.webm.tmp" "$3.webm"
  echo "$src" > "$3.source.txt"
}

while IFS='|' read -r nn slug source lang kind license section; do
  [ -n "$nn" ] || continue
  out="$V/$nn-$slug"
  present=0; for f in "$out".mp4 "$out".mov "$out".webm; do [ -s "$f" ] && present=1; done
  if [ $present = 1 ]; then note "$nn-$slug : déjà présent"; continue; fi
  note "$nn-$slug : téléchargement ($source${section:+, $section})"
  case "$source" in
    yt:*) youtube "${source#yt:}" "$lang" "$out" "$section" ;;
    url:*) curl -fsSL "${source#url:}" -o "$out.mov.tmp" && mv "$out.mov.tmp" "$out.mov" ;;
    commons:*) rest=${source#commons:}; commons "${rest%:*}" "${rest##*:}" "$out" ;;
    ccc:*) "$YTDLP" -f "bv*+ba/b" --write-info-json --write-subs -o "$out.%(ext)s" "${source#ccc:}" >>"$LOG" 2>&1 ;;
  esac || note "$nn-$slug : ÉCHEC (voir $LOG)"
done <<< "$CORPUS"

# Conférence du CCC : une vidéo par piste audio (mêmes images, trois langues), sans réencodage.
ccc=$(ls "$V"/18-ccc-verlorene-domains.* 2>/dev/null | grep -E '\.(mp4|webm|mkv)$' | head -1 || true)
if [ -n "$ccc" ]; then
  i=0
  for language in $(ffprobe -v error -select_streams a -show_entries stream_tags=language -of csv=p=0 "$ccc"); do
    target="$V/18-ccc-verlorene-domains-$language.mp4"
    [ -s "$target" ] || ffmpeg -nostdin -v error -i "$ccc" -map 0:v:0 -map "0:a:$i" -c copy "$target"
    i=$((i + 1))
  done
fi

# Manifeste du corpus : un enregistrement par fichier vidéo.
{
  echo '['
  first=1
  while IFS='|' read -r nn slug source lang kind license section; do
    [ -n "$nn" ] || continue
    for f in "$V/$nn-$slug".mp4 "$V/$nn-$slug".mov "$V/$nn-$slug".webm "$V/$nn-$slug"-*.mp4; do
      [ -s "$f" ] || continue
      dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
      [ $first = 1 ] || echo ','
      first=0
      jq -n --arg file "$f" --arg nn "$nn" --arg slug "$slug" --arg source "$source" --arg lang "$lang" --arg kind "$kind" \
        --arg license "$license" --arg section "$section" --arg sha "$(sha256sum "$f" | cut -d' ' -f1)" \
        --arg bytes "$(stat -c %s "$f")" --arg duration "$dur" --arg tool "$("$YTDLP" --version)" \
        '{file: $file, id: $nn, slug: $slug, source: $source, language: $lang, kind: $kind, license: $license,
          section: (if $section == "" then null else $section end), sha256: $sha, bytes: ($bytes | tonumber),
          durationS: ($duration | tonumber), ytDlp: $tool}'
    done
  done <<< "$CORPUS"
  echo ']'
} > "$V/corpus.json"
note "corpus : $(jq length "$V/corpus.json") fichiers, $(du -sh "$V" | cut -f1)"
