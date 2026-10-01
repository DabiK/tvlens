import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nonEmpty = (values) =>
  Object.fromEntries(
    Object.entries(values).filter(([, v]) => typeof v === "string" && v.trim()),
  );
const envFile = (p) =>
  existsSync(p) ? nonEmpty(parseEnv(readFileSync(p, "utf8"))) : {};
const config = {
  ...envFile(join(root, "..", "env.local")),
  ...envFile(join(root, "..", ".env.local")),
  ...envFile(join(root, ".env.local")),
  ...nonEmpty(process.env),
};
const selection = JSON.parse(
  readFileSync(join(root, "scripts/voice-selection.json"), "utf8"),
);
const args = new Set(process.argv.slice(2));
const script = JSON.parse(
  readFileSync(join(root, "scripts/voiceover.json"), "utf8"),
);
const apiKey = config.ELEVENLABS_API_KEY;
const voiceId = config.ELEVENLABS_VOICE_ID || selection.voiceId;
const model = config.ELEVENLABS_MODEL_ID || selection.modelId;
const api = "https://api.elevenlabs.io";
const cache = join(root, ".cache", "elevenlabs");
const output = join(root, "public", "audio");

function probe(file) {
  return Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        file,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
}
async function request(path, options = {}) {
  const response = await fetch(api + path, {
    ...options,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    let status = "request_failed";
    try {
      const body = await response.json();
      status = body.detail?.status || status;
    } catch {}
    if (response.status === 402 && status === "payment_required") {
      throw new Error(
        "ElevenLabs refuses this catalog voice via API on the current plan (402 payment_required). Select an eligible ElevenLabs plan, or generate clips in the ElevenLabs app and import them. No narration was replaced.",
      );
    }
    // Never echo request headers, environment variables or arbitrary API error text.
    throw new Error(
      `ElevenLabs HTTP ${response.status} (${String(status).replace(/[^a-zA-Z0-9_ -]/g, "")}).`,
    );
  }
  return response;
}
function validateScript() {
  const names = new Set();
  let lastEnd = 0;
  for (const clip of script) {
    if (!/^[a-z]+$/.test(clip.name) || names.has(clip.name))
      throw new Error("Invalid or duplicate clip name.");
    if (
      !Number.isInteger(clip.from) ||
      !Number.isInteger(clip.durationInFrames) ||
      clip.durationInFrames <= 0 ||
      clip.from < lastEnd ||
      clip.from + clip.durationInFrames > 1740
    )
      throw new Error(`Invalid timing: ${clip.name}`);
    if (typeof clip.text !== "string" || !clip.text.trim())
      throw new Error(`Empty text: ${clip.name}`);
    names.add(clip.name);
    lastEnd = clip.from + clip.durationInFrames;
  }
}
async function main() {
  validateScript();
  if (args.has("--dry-run")) {
    console.log(
      `Selected voice: ${selection.name} (${voiceId}), model: ${model}`,
    );
    console.table(
      script.map((c) => ({
        clip: c.name,
        start: (c.from / 30).toFixed(2),
        window: (c.durationInFrames / 30).toFixed(2),
        text: c.text,
      })),
    );
    console.log(
      `${script.length} clips, ${script.reduce((n, c) => n + c.text.length, 0)} text characters. No API request made.`,
    );
    return;
  }
  if (!apiKey) throw new Error("Add ELEVENLABS_API_KEY to film/.env.local.");
  if (args.has("--list-voices")) {
    let token;
    do {
      const query = new URLSearchParams({
        page_size: "100",
        ...(token ? { next_page_token: token } : {}),
      });
      const data = await (await request(`/v2/voices?${query}`)).json();
      for (const v of data.voices)
        console.log(
          JSON.stringify({
            id: v.voice_id,
            name: v.name,
            labels: v.labels,
            preview: v.preview_url,
          }),
        );
      token = data.has_more ? data.next_page_token : undefined;
    } while (token);
    return;
  }
  if (!voiceId)
    throw new Error(
      "Set ELEVENLABS_VOICE_ID in film/.env.local (npm run voice:voices lists available voices).",
    );
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  mkdirSync(cache, { recursive: true });
  mkdirSync(output, { recursive: true });
  const staged = [];
  for (let i = 0; i < script.length; i++) {
    const clip = script[i];
    const body = {
      text: clip.text,
      model_id: model,
      voice_settings: selection.voiceSettings,
      previous_text: script[i - 1]?.text,
      next_text: script[i + 1]?.text,
      seed: 7400 + i,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify({ voiceId, body }))
      .digest("hex")
      .slice(0, 20);
    const raw = join(cache, `${clip.name}-${hash}.mp3`);
    if (!existsSync(raw)) {
      console.log(`Generating ${clip.name}…`);
      const response = await request(
        `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100)
        throw new Error(`Empty audio returned for ${clip.name}.`);
      writeFileSync(raw + ".part", bytes);
      renameSync(raw + ".part", raw);
    } else console.log(`Cached: ${clip.name}`);
    const rawDuration = probe(raw);
    const window = clip.durationInFrames / 30 - 0.025;
    if (!Number.isFinite(rawDuration) || rawDuration <= 0)
      throw new Error(`Invalid audio duration: ${clip.name}`);
    const speed = Math.max(1, rawDuration / window);
    if (speed > 1.18)
      throw new Error(
        `${clip.name} lasts ${rawDuration.toFixed(2)}s for a ${window.toFixed(2)}s slot. Shorten its text in scripts/voiceover.json; cached clips will be reused.`,
      );
    const wav = join(cache, `${clip.name}-${hash}.wav`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      raw,
      "-af",
      `atempo=${speed},loudnorm=I=-18:TP=-2:LRA=9,afade=t=in:d=0.015,afade=t=out:st=${Math.max(0, rawDuration / speed - 0.035)}:d=0.035`,
      "-ar",
      "48000",
      "-ac",
      "1",
      wav,
    ]);
    const finalDuration = probe(wav);
    if (finalDuration > clip.durationInFrames / 30)
      throw new Error(`Audio exceeds timing: ${clip.name}`);
    staged.push({
      ...clip,
      provider: "ElevenLabs",
      voiceId,
      model,
      rawDuration,
      duration: finalDuration,
      speed,
      wav,
    });
    console.log(
      `${clip.name}: ${finalDuration.toFixed(2)}s / ${(clip.durationInFrames / 30).toFixed(2)}s`,
    );
  }
  // Switch the composition only after all clips have been generated and measured.
  for (const clip of staged)
    copyFileSync(clip.wav, join(output, `${clip.name}.wav`));
  writeFileSync(
    join(output, "voiceover.json"),
    JSON.stringify(
      staged.map(({ wav, ...rest }) => rest),
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(root, "src/voiceover-state.ts"),
    `// Generated by scripts/elevenlabs.mjs\nexport const voiceoverReady = true;\n`,
  );
  console.log(
    "ElevenLabs narration ready. Remotion Studio reloads automatically.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
