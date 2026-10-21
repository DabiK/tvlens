"""Build the E2 (questions) and E3 (vision) replay plans from the closed E1 results, deterministically.

E2: every captured initial question request of the six passages. E3: six perception requests per video, taken at
evenly spaced positions (k/7, k = 1..6) among the archived bodies, the first body of each video being excluded.
"""
import argparse
import gzip
import json
import re
from pathlib import Path

VIDEOS = ["kennedy", "spring", "cnrs-apprentissage", "boeuf-bourguignon", "tears-of-steel", "artemis"]
STAMPS = re.compile(r"horodatées \[([0-9,]+)\]")
QUESTION_ARMS = [
    {"label": "ref-debut", "model": "qwen3.8:27b", "think": False},
    {"label": "dense-mtp", "model": "qwen3.8:27b-mtp-q4_K_M", "think": False},
    {"label": "moe-qwen", "model": "qwen3.6:35b-a3b-q4_K_M", "think": False},
    {"label": "moe-qwen-mtp", "model": "qwen3.6:35b-a3b-mtp-q4_K_M", "think": False},
    {"label": "moe-gemma", "model": "gemma4:26b-a4b-it-q4_K_M", "think": False},
    {"label": "moe-qwen-mtp-raisonnement", "model": "qwen3.6:35b-a3b-mtp-q4_K_M", "think": True},
    {"label": "ref-fin", "model": "qwen3.8:27b", "think": False},
]
VISION_ARMS = [
    {"label": "ref-debut", "model": "gemma3:4b"},
    {"label": "qwen3vl-2b", "model": "qwen3-vl:2b-instruct-q4_K_M"},
    {"label": "qwen3vl-4b-bf16", "model": "qwen3-vl:4b-instruct-bf16"},
    {"label": "qwen3vl-8b", "model": "qwen3-vl:8b-instruct-q4_K_M"},
    {"label": "gemma4-e4b", "model": "gemma4:e4b-it-q4_K_M"},
    {"label": "qwen3vl-30b-a3b", "model": "qwen3-vl:30b-a3b-instruct-q4_K_M"},
    {"label": "ref-3-images", "model": "gemma3:4b", "keepImages": [0, 2, 4]},
    {"label": "ref-fin", "model": "gemma3:4b"},
]


def first_stamp(path):
    request = json.loads(gzip.open(path).read())
    for message in request["messages"]:
        found = STAMPS.search(message.get("content", ""))
        if found:
            return int(found.group(1).split(",")[0])
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--e1", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    e1, out = Path(args.e1), Path(args.out)
    journals = [str(e1 / "proxy" / (v + "-A-1.jsonl")) for v in VIDEOS]
    scenarios = [str(e1 / "inputs" / v / "scenario.json") for v in VIDEOS]
    (out / "plan-e2.json").write_text(json.dumps({"experiment": "questions-hors-ligne", "seed": "e2-2026-10-21",
                                                  "journals": journals, "scenarios": scenarios, "arms": QUESTION_ARMS}, indent=1))
    blocks, warmup = [], None
    for video in VIDEOS:
        bodies = sorted((e1 / "proxy" / (video + "-A-1-bodies")).glob("vlm-*.json.gz"))
        if warmup is None:
            warmup = str(bodies[0])
        for k in range(1, 7):
            body = bodies[1:][min(len(bodies) - 2, round(k * (len(bodies) - 1) / 7))]
            blocks.append({"id": "%s@%s" % (video, first_stamp(body)), "body": str(body)})
    (out / "plan-e3.json").write_text(json.dumps({"experiment": "vision-hors-ligne", "warmupBody": warmup,
                                                  "blocks": blocks, "arms": VISION_ARMS}, indent=1))
    print(len(journals), "journaux ;", len(blocks), "blocs vision")


if __name__ == "__main__":
    main()
