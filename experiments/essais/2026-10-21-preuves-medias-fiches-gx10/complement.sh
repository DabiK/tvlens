set -eu
RUN=$1; mkdir "$RUN"; cd "$RUN"
V=/srv/tvlens-gx10/videos/kennedy-rice-7min.mp4; M=/srv/tvlens-gx10/poids/ggml-large-v3-turbo.bin
W=/srv/tvlens-gx10/outils/whisper.cpp/build/bin/whisper-cli
date -u +%FT%TZ > started.txt; cat /proc/loadavg >> started.txt
for spec in "kennedy-03 90 135" "kennedy-08 315 375"; do set -- $spec
  ffmpeg -nostdin -v error -ss $2 -to $3 -i $V -ac 1 -ar 16000 -c:a pcm_s16le $1.wav
  nice -n 10 $W -ng -t 16 -m $M -l en -ml 60 -sow -oj -of $1.asr -f $1.wav >/dev/null 2>&1
  echo "$1 offset=$2" >> offsets.txt; rm $1.wav
done
P=/home/nvidia/tvlens-setup/reference-2026-10-20/preparation-spring/blocks
for b in 000031 000032; do for k in 0 1 2 3 4; do cp $P/$b/frame-$k.jpg spring-bloc$b-frame$k.jpg; done; done
date -u +%FT%TZ > finished.txt; sha256sum * > sha256.txt
