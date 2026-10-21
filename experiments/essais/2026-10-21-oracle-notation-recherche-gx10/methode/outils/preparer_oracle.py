"""Turn the full large-v3-turbo transcripts into readable timestamped text, one file per video, for the oracle review.

Usage: python3 -I preparer_oracle.py --media <oracle-medias dir> --out <dir>
Writes <out>/<video>.transcript.txt with lines "[mm:ss.s – mm:ss.s] text" (absolute media times).
"""
import argparse
import json
from pathlib import Path

VIDEOS = ["kennedy", "cnrs", "cuisine", "tears", "artemis"]


def stamp(seconds):
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return ("%d:%02d:%04.1f" % (hours, minutes, secs)) if hours else ("%02d:%04.1f" % (minutes, secs))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--media", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for video in VIDEOS:
        data = json.loads((Path(args.media) / ("asr-%s.json" % video)).read_text(encoding="utf-8"))
        lines = []
        for segment in data.get("transcription", []):
            start = segment["offsets"]["from"] / 1000
            end = segment["offsets"]["to"] / 1000
            lines.append("[%s – %s] %s" % (stamp(start), stamp(end), segment["text"].strip()))
        (out / ("%s.transcript.txt" % video)).write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(video, len(lines), "segments")


if __name__ == "__main__":
    main()
