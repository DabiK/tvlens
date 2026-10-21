"""Build blind packets for scoring vision descriptions: per video, each block with its interval, its local transcript
(as given to the model) and the anonymised descriptions of every arm. A separate key maps text ids to arms.

Usage: python3 -I paquet_vision.py --calls calls.jsonl --inputs inputs.json --out DIR
"""
import argparse
import gzip
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

TRANSCRIPT = re.compile(r'Transcription locale \(potentiellement imprécise\) : "(.*?)"\. Intervalle (\d+)–(\d+) ms', re.S)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--calls", required=True)
    parser.add_argument("--inputs", required=True)
    parser.add_argument("--body-root", required=True, help="local folder holding copies of the archived bodies, by file name")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    identities = json.loads(Path(args.inputs).read_text())
    blocks, key = {}, {}
    for block_id, identity in identities.items():
        body = json.loads(gzip.open(Path(args.body_root) / Path(identity["body"]).parent.name / Path(identity["body"]).name).read())
        found = TRANSCRIPT.search(body["messages"][0]["content"])
        blocks[block_id] = {"blockId": block_id, "startS": int(found.group(2)) / 1000, "endS": int(found.group(3)) / 1000,
                            "transcript": found.group(1), "images": len(body["messages"][0].get("images") or []), "texts": {}}
    for line in open(args.calls):
        row = json.loads(line)
        if row.get("event") == "loaded" or row.get("status") != 200:
            continue
        try:
            output = json.loads(row["content"])
            text = {"summary": output.get("summary"), "visual": output.get("visual")}
        except (TypeError, ValueError):
            text = {"invalid": row.get("content")}
        canonical = json.dumps(text, ensure_ascii=False, sort_keys=True)
        text_id = hashlib.sha256((row["block"] + canonical).encode()).hexdigest()[:10]
        blocks[row["block"]]["texts"].setdefault(text_id, {"textId": text_id, **text})
        key.setdefault(text_id, []).append({"block": row["block"], "arm": row["arm"], "model": row["model"]})
    by_video = defaultdict(list)
    for block in blocks.values():
        texts = sorted(block["texts"].values(), key=lambda t: hashlib.sha256(("ordre" + t["textId"]).encode()).hexdigest())
        by_video[block["blockId"].split("@")[0]].append({**{k: v for k, v in block.items() if k != "texts"}, "descriptions": texts})
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for video, items in by_video.items():
        items.sort(key=lambda b: b["startS"])
        (out / ("a-noter-%s.json" % video)).write_text(json.dumps(items, ensure_ascii=False, indent=1))
    (out / "cle.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
    print({v: len(i) for v, i in by_video.items()}, len(key), "textes distincts")


if __name__ == "__main__":
    main()
