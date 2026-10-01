import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const teaser = process.argv.includes("--teaser");
const path = teaser ? "out/tvlens-teaser-34s.mp4" : "out/tvlens-promo-1080p.mp4";
const metadata = JSON.parse(
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
    { encoding: "utf8" },
  ),
);
const video = metadata.streams.find((s) => s.codec_type === "video");
const audio = metadata.streams.find((s) => s.codec_type === "audio");
assert.equal(video.width, 1920);
assert.equal(video.height, 1080);
assert.equal(video.codec_name, "h264");
assert.ok(
  ["yuv420p", "yuvj420p"].includes(video.pix_fmt),
  "H.264 must use 8-bit 4:2:0",
);
assert.equal(video.r_frame_rate, "30/1");
assert.equal(Number(video.nb_frames), teaser ? 1020 : 1920);
assert.ok(
  Math.abs(Number(metadata.format.duration) - (teaser ? 34 : 64)) < 0.15,
);
assert.equal(audio.codec_name, "aac");
assert.equal(audio.channels, 2);
execFileSync(
  "ffmpeg",
  ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
  { stdio: "pipe" },
);
const report = {
  checkedAt: new Date().toISOString(),
  path,
  duration: Number(metadata.format.duration),
  frames: Number(video.nb_frames),
  video: `${video.codec_name} ${video.width}x${video.height} ${video.r_frame_rate}`,
  audio: `${audio.codec_name} ${audio.channels} channels`,
  decode: "passed",
};
writeFileSync(
  teaser ? "out/validation-v2.json" : "out/validation.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
