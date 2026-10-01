// Low-disk fallback: concatenate seventeen already-rendered 60-frame segments.
// Explicit durations discard AAC padding from each intermediate container.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
writeFileSync(
  "out/teaser-parts-exact.txt",
  Array.from(
    { length: 17 },
    (_, i) =>
      `file 'teaser-part-${String(i).padStart(2, "0")}.mp4'\nduration 2\n`,
  ).join(""),
);
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "out/teaser-parts-exact.txt",
    "-i",
    "public/teaser-score-34s.wav",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-af",
    "afade=t=out:st=33.6:d=0.4",
    "-c:a",
    "aac",
    "-t",
    "34",
    "-movflags",
    "+faststart",
    "-y",
    "out/tvlens-teaser-34s.mp4",
  ],
  { stdio: "inherit" },
);
