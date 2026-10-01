// Original deterministic instrumental score. No samples or third-party music.
// 120 BPM, 34 or 64 seconds. Scene edits align to whole beats.
import { writeFileSync, mkdirSync } from "node:fs";
const sr = 44100;
const teaser = process.argv.includes("--teaser");
const seconds = teaser ? 34 : 64;
const left = new Float32Array(sr * seconds);
const right = new Float32Array(sr * seconds);
const tau = Math.PI * 2;
const hz = (note) => 440 * 2 ** ((note - 69) / 12);
let seed = 491;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
function add(at, duration, fn, pan = 0) {
  const start = Math.round(at * sr);
  for (let i = 0; i < duration * sr && start + i < left.length; i++) {
    const t = i / sr;
    const value = fn(t, duration);
    left[start + i] += value * Math.sqrt((1 - pan) / 2);
    right[start + i] += value * Math.sqrt((1 + pan) / 2);
  }
}
// Warm suspended voicings; subtle detuning, soft attack and release.
const chords = [
  [50, 57, 60, 64],
  [46, 53, 57, 60],
  [53, 60, 64, 67],
  [48, 55, 58, 62],
];
for (let bar = 0; bar < seconds / 4; bar++) {
  const chord = chords[bar % 4];
  for (let j = 0; j < chord.length; j++) {
    const freq = hz(chord[j]);
    add(
      bar * 4,
      4.8,
      (t, d) =>
        0.042 *
        Math.min(1, t / 0.65) *
        Math.min(1, (d - t) / 1.2) *
        (Math.sin(tau * freq * t) + 0.25 * Math.sin(tau * freq * 1.002 * t)),
      (j - 1.5) / 3,
    );
  }
  for (let step = 0; step < 8; step++) {
    const at = bar * 4 + step * 0.5;
    const freq = hz(chord[[0, 2, 1, 3, 2, 1, 3, 1][step]] + 12);
    const amp = teaser ? 0.075 : at < 6 ? 0.09 : at >= 58 ? 0.065 : 0.11;
    add(
      at,
      1.4,
      (t) =>
        amp *
        Math.min(1, t / 0.006) *
        Math.exp(-t * 5) *
        (Math.sin(tau * freq * t) + 0.23 * Math.sin(tau * freq * 2 * t)),
      step % 2 ? 0.4 : -0.4,
    );
    add(
      at + 0.375,
      0.9,
      (t) =>
        amp *
        0.2 *
        Math.min(1, t / 0.005) *
        Math.exp(-t * 7) *
        Math.sin(tau * freq * t),
      step % 2 ? -0.6 : 0.6,
    );
  }
}
// Pulse enters with the product reveal, drops out for the final signature.
for (let beat = teaser ? 0 : 12; beat < (teaser ? seconds * 2 : 116); beat++) {
  const at = beat * 0.5;
  const energy = teaser ? 1.7 : at < 12 || at >= 48 ? 0.6 : 1;
  add(
    at,
    0.35,
    (t) =>
      0.22 *
      energy *
      Math.exp(-t * 13) *
      Math.sin(tau * (48 * t + 4.5 * (1 - Math.exp(-t * 38)))),
  );
  if (beat % 2)
    add(at, 0.13, (t) => noise() * 0.065 * energy * Math.exp(-t * 28));
  add(
    at + 0.25,
    0.055,
    (t) => noise() * 0.035 * energy * Math.exp(-t * 90),
    0.25,
  );
}
// Restrained transition swells, all synthesis.
for (const end of teaser
  ? [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 30]
  : [6, 12, 22, 30, 40, 48, 58]) {
  add(end - 0.5, 0.5, (t, d) => noise() * 0.025 * (t / d) ** 2);
  add(
    end,
    1.4,
    (t) => 0.05 * Math.exp(-t * 4) * Math.sin(tau * hz(86) * t),
    0.1,
  );
}
if (teaser) {
  for (let beat = 0; beat < seconds * 2; beat++) {
    const at = beat * 0.5;
    const freq = hz(chords[Math.floor(at / 4) % 4][0] - 12);
    add(
      at + 0.125,
      0.28,
      (t) =>
        0.16 *
        Math.min(1, t / 0.004) *
        Math.exp(-t * 8) *
        (Math.sin(tau * freq * t) + 0.3 * Math.sin(tau * freq * 2 * t)),
    );
    if (beat % 4 === 3)
      for (let j = 0; j < 3; j++)
        add(
          at + j * 0.125,
          0.04,
          (t) => noise() * 0.055 * Math.exp(-t * 100),
          j % 2 ? -0.4 : 0.4,
        );
  }
}
let peak = 0;
for (let i = 0; i < left.length; i++) {
  const t = i / sr;
  const env = Math.min(
    1,
    t / (teaser ? 0.008 : 1.2),
    (seconds - t) / (teaser ? 0.6 : 2.0),
  );
  left[i] = Math.tanh(left[i] * 1.3) * env;
  right[i] = Math.tanh(right[i] * 1.3) * env;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const wav = Buffer.alloc(44 + left.length * 4);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(left.length * 4, 40);
const gain = 0.7 / peak;
for (let i = 0; i < left.length; i++) {
  wav.writeInt16LE(Math.round(left[i] * gain * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(right[i] * gain * 32767), 46 + i * 4);
}
mkdirSync("public", { recursive: true });
writeFileSync(
  teaser ? "public/teaser-score-34s.wav" : "public/tvlens-score.wav",
  wav,
);
console.log(`Original score: ${seconds}s, stereo ${sr}Hz, peak -3.1 dBFS`);
