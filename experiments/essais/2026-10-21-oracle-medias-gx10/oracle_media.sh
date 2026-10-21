# CPU-only reference material for the automated oracle: full large-v3-turbo transcripts and 640 px frames every 2 s.
set -eu
RUN=$1; mkdir "$RUN"; cd "$RUN"
V=/srv/tvlens-gx10/videos; M=/srv/tvlens-gx10/poids/ggml-large-v3-turbo.bin
W=/srv/tvlens-gx10/outils/whisper.cpp/build/bin/whisper-cli
{ date -u +%FT%TZ; cat /proc/loadavg; sha256sum $M; } > started.txt
for spec in "kennedy kennedy-rice-7min.mp4 en" "cnrs 04-cnrs-entrainement-ia.mp4 fr" "cuisine 05-boeuf-bourguignon.mp4 fr" \
            "tears 08-tears-of-steel.mov en" "artemis 09-artemis-lancement.mp4 en" "spring spring.mp4 none"; do
  set -- $spec; mkdir -p frames/$1
  sha256sum $V/$2 >> media.sha256
  nice -n 10 ffmpeg -nostdin -v error -i $V/$2 -vf "fps=1/2,scale=640:-2" -q:v 4 frames/$1/%05d.jpg
  if [ "$3" != none ]; then
    ffmpeg -nostdin -v error -i $V/$2 -ac 1 -ar 16000 -c:a pcm_s16le $1.wav
    /usr/bin/time -f "$1 asr wall=%e s" -a -o timings.txt nice -n 10 $W -ng -t 16 -m $M -l $3 -ojf -of asr-$1 -f $1.wav >/dev/null 2>asr-$1.log
    rm $1.wav
  fi
  echo "$1 done $(date -u +%T)" >> progress.txt
done
{ date -u +%FT%TZ; cat /proc/loadavg; } > finished.txt
find . -type f ! -name sha256.txt -exec sha256sum {} + | sort -k2 > sha256.txt
