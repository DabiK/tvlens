#!/usr/bin/env bash
# Téléchargement du corpus des campagnes GX10 (accord du propriétaire du 19/10/2026 : 20 vidéos, environ 3,7 Go, yt-dlp).
# Licences et preuves : corpus-propose.md. Idempotent : un fichier déjà présent et non vide n'est pas retéléchargé.
# Usage : bash telecharger-corpus.sh /srv/tvlens-gx10
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
# YouTube demande désormais un moteur JavaScript à yt-dlp : Deno (installeur officiel) s'il manque.
if ! command -v deno >/dev/null && [ ! -x "$HOME/.deno/bin/deno" ]; then curl -fsSL https://deno.land/install.sh | sh -s -- -y >/dev/null; fi
export PATH="$HOME/.deno/bin:$PATH"

# NN|slug|source|langue|type|licence|section (vide : entière)
IFS= read -r -d '' CORPUS <<'EOF' || true
01|ayrault-discours|yt:CN_I9Vz8-IM|fr|discours|CC BY (YouTube, MEAE) + Licence Ouverte 2.0|
02|meae-table-ronde-ukraine|yt:-eZfMUpHq98|fr|débat à plusieurs voix|CC BY (YouTube, MEAE)|
03|meae-archeologie|yt:Ip_YkwwaIwc|fr|reportage|CC BY (YouTube, MEAE)|
04|cnrs-entrainement-ia|yt:W_8OhdeQs4Y|fr|cours, texte à l'écran|CC BY (YouTube, CNRS FIDLE)|
05|boeuf-bourguignon|yt:koEDMDuAw0k|fr|tutoriel de cuisine|CC BY (YouTube, Learn With A Champion)|
06|age-de-pierre|yt:AiGRoqLzxLs|fr|fiction dialoguée|CC BY (YouTube, BADNEWS)|
07|parlement-europeen-discours|yt:eLxccS62hAQ|en|discours|CC BY (YouTube, Commission européenne) + avis juridique du PE|
08|tears-of-steel|url:https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov|en|fiction dialoguée|CC BY 3.0 (Blender Foundation)|
09|artemis-lancement|yt:CMLD0Lp0JBg|en|direct, son bruité|domaine public (NASA)|2:50:00-3:25:00
10|big-buck-bunny|yt:aqz-KE-bpKQ|none|animation sans dialogue|CC BY (YouTube, Blender Foundation)|
11|dvorak-marine-band|yt:husEu45eI7g|none|musique|domaine public (œuvre fédérale des États-Unis)|
12|voyage-dans-la-lune|commons:Le_Voyage_dans_la_Lune_(1902).webm:480|none|film muet|domaine public (Commons)|
13|nosferatu|commons:Nosferatu_(1922).webm:480|none|film muet, intertitres allemands|domaine public (Commons)|
14|bustinduy-discours|yt:doxpm89aRPk|es|discours|CC BY (YouTube, ministère espagnol)|
15|nasa-iss-visite|yt:0JU4z-iLmGQ|es|visite guidée, gestes|domaine public (NASA en Español)|
16|unican-diapositives|yt:xKQ-9yVGOBg|es|cours avec diapositives|CC BY (YouTube, Universidad de Cantabria)|
17|terrax-klimafaktoren|commons:Die_wichtigsten_Klimafaktoren_(ZDF,_Terra_X)_720p_50FPS.webm:0|de|documentaire|CC BY 4.0 (ZDF Terra X, Commons)|
18|ccc-verlorene-domains|ccc:https://media.ccc.de/v/39c3-verlorene-domains-offene-turen-was-alte-behordendomains-verraten|de|conférence, interprétation EN et FR|CC BY 4.0 (media.ccc.de)|
19|chigi-conseil-ministres|yt:y3PHD7Pi2_M|it|conférence de presse à plusieurs voix|CC BY (YouTube, Palazzo Chigi) + CC BY 3.0|
20|draghi-scholz|yt:Fy76KZUxrjw|it|déclarations, changement de langue (it, de)|CC BY (YouTube, Palazzo Chigi) + CC BY 3.0|
EOF

youtube() { # $1 id, $2 langue, $3 sortie sans extension, $4 section
  local lang=$2 audio='ba'
  [ "$lang" != none ] && audio="ba[language^=$lang]/ba[format_note*=original]/ba"
  local args=(-f "bv*[height<=720][vcodec^=avc1]+($audio)/b[height<=720]" --merge-output-format mp4 --no-playlist
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
