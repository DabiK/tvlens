"""Extract media evidence (CPU-only ASR windows and frames) for the six priority questions on the GX10.

Read-only on the corpus: every output goes to a new run directory. No GPU (whisper-cli -ng), no TVLens call.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

VIDEOS = "/srv/tvlens-gx10/videos"
MODEL = "/srv/tvlens-gx10/poids/ggml-large-v3-turbo.bin"
WHISPER = "/srv/tvlens-gx10/outils/whisper.cpp/build/bin/whisper-cli"
THREADS = "16"

MEDIA = {
    "kennedy": "kennedy-rice-7min.mp4",
    "cuisine": "05-boeuf-bourguignon.mp4",
    "tears": "08-tears-of-steel.mov",
    "artemis": "09-artemis-lancement.mp4",
    "spring": "spring.mp4",
}

# (question, media, language, start s, end s, pose s): the pose is when the question is asked.
AUDIO = [
    ("kennedy-06", "kennedy", "en", 225, 285, 272),
    ("cuisine-07", "cuisine", "fr", 525, 665, 656),
    ("tears-07", "tears", "en", 490, 555, 552),
    ("artemis-07", "artemis", "en", 2020, 2100, 2096),
]

FRAMES = [
    ("cuisine-07", "cuisine", list(range(540, 657, 5))),
    ("tears-07", "tears", list(range(500, 553, 2))),
    ("artemis-07", "artemis", list(range(2040, 2097, 8))),
    ("spring-04", "spring", list(range(240, 269, 2))),
    ("spring-06", "spring", sorted(set(list(range(0, 373, 15)) + [30, 360]))),
]


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(cmd, log):
    started = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    log.append({"cmd": cmd, "code": proc.returncode, "seconds": round(time.time() - started, 3),
                "stderrTail": proc.stderr[-600:]})
    if proc.returncode != 0:
        raise SystemExit(f"command failed: {cmd[0]} ({proc.returncode})")
    return proc


def absolute_segments(json_path, offset):
    data = json.load(open(json_path))
    segments = []
    for seg in data.get("transcription", []):
        start = seg["offsets"]["from"] / 1000 + offset
        end = seg["offsets"]["to"] / 1000 + offset
        segments.append({"startS": round(start, 2), "endS": round(end, 2), "text": seg["text"].strip()})
    return segments


def main(out_dir):
    os.makedirs(out_dir)
    log = []
    manifest = {"startedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "gpuUsed": False,
                "loadavgStart": open("/proc/loadavg").read().strip(), "inputs": {}, "audio": [], "frames": []}
    for key, name in MEDIA.items():
        manifest["inputs"][key] = {"file": name, "sha256": sha256(os.path.join(VIDEOS, name))}
    manifest["inputs"]["model"] = {"file": os.path.basename(MODEL), "sha256": sha256(MODEL)}
    for qid, media, lang, start, end, pose in AUDIO:
        wav = os.path.join(out_dir, f"{qid}.wav")
        run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(start), "-to", str(end), "-i",
             os.path.join(VIDEOS, MEDIA[media]), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], log)
        prefix = os.path.join(out_dir, f"{qid}.asr")
        run([WHISPER, "-ng", "-t", THREADS, "-m", MODEL, "-l", lang, "-ml", "60", "-sow",
             "-oj", "-of", prefix, "-f", wav], log)
        segments = absolute_segments(prefix + ".json", start)
        for seg in segments:
            seg["afterPose"] = seg["startS"] >= pose
        manifest["audio"].append({"questionId": qid, "media": media, "language": lang, "windowS": [start, end],
                                  "poseS": pose, "segments": segments})
        os.remove(wav)
    for qid, media, times in FRAMES:
        for t in times:
            jpg = os.path.join(out_dir, f"{qid}-{t:04d}s.jpg")
            run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(t), "-i", os.path.join(VIDEOS, MEDIA[media]),
                 "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", jpg], log)
            manifest["frames"].append({"questionId": qid, "timeS": t, "file": os.path.basename(jpg),
                                       "sha256": sha256(jpg)})
    manifest["finishedAtUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    manifest["loadavgEnd"] = open("/proc/loadavg").read().strip()
    manifest["commands"] = log
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"out": out_dir, "frames": len(manifest["frames"]), "audio": len(manifest["audio"]),
                      "seconds": sum(c["seconds"] for c in log)}))


if __name__ == "__main__":
    main(sys.argv[1])
