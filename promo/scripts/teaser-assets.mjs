import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "./assets.mjs";
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("./score.mjs", import.meta.url)), "--teaser"],
  { stdio: "inherit" },
);
const output = fileURLToPath(
  new URL("../public/spring-teaser.mp4", import.meta.url),
);
if (!existsSync(output)) {
  const input = fileURLToPath(
    new URL("../../media/samples/spring.mp4", import.meta.url),
  );
  if (!existsSync(input))
    throw new Error(
      "Ajouter le film Spring dans media/samples/spring.mp4 (provenance dans README).",
    );
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "25",
      "-i",
      input,
      "-t",
      "12",
      "-an",
      "-vf",
      "scale=1920:-2",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "fast",
      "-y",
      output,
    ],
    { stdio: "inherit" },
  );
}
