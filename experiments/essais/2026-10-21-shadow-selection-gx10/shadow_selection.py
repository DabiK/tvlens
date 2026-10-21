#!/usr/bin/env python3
"""Analyse hors ligne de cinq images par bloc, sans appel au modèle."""

import argparse
import hashlib
import json
import time
from pathlib import Path

from PIL import Image, ImageOps


THUMBNAIL_SIZE = (32, 18)
FRAMES_PER_BLOCK = 5
SCENE_THRESHOLD = 0.12
STATIC_THRESHOLD = 0.035
MAX_CONSECUTIVE_SKIP_CANDIDATES = 1


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def thumbnail(path):
    with Image.open(path) as source:
        gray = ImageOps.grayscale(source)
        return gray.resize(THUMBNAIL_SIZE, Image.Resampling.BOX).tobytes()


def distance(first, second):
    return sum(abs(left - right) for left, right in zip(first, second)) / (len(first) * 255)


def choose_images(images):
    anchors = (0, FRAMES_PER_BLOCK - 1)
    interior = range(1, FRAMES_PER_BLOCK - 1)
    third = max(interior, key=lambda index: (min(distance(images[index], images[anchor]) for anchor in anchors), -index))
    return sorted((*anchors, third))


def analyze(preparation, max_blocks=None):
    index = preparation / "blocks.json"
    blocks = json.loads(index.read_text(encoding="utf-8"))["blocks"]
    if max_blocks is not None:
        blocks = blocks[:max_blocks]
    output = []
    previous_last = None
    skip_streak = 0
    for block in blocks:
        started = time.perf_counter_ns()
        frames = sorted((item for item in block["outputs"] if item["path"].endswith(".jpg")),
                        key=lambda item: int(Path(item["path"]).stem.split("-")[-1]))
        if len(frames) != FRAMES_PER_BLOCK:
            raise ValueError(f"Bloc {block['sequence']}: cinq images requises")
        paths = [preparation / item["path"] for item in frames]
        for item, path in zip(frames, paths):
            if sha256(path) != item["sha256"]:
                raise ValueError(f"SHA-256 incorrect: {path}")
        images = [thumbnail(path) for path in paths]
        proposed = choose_images(images)
        intra = max(distance(images[left], images[right]) for left in range(FRAMES_PER_BLOCK)
                    for right in range(left + 1, FRAMES_PER_BLOCK))
        boundary = distance(previous_last, images[0]) if previous_last is not None else None
        static = boundary is not None and max(intra, boundary) < STATIC_THRESHOLD
        skip_candidate = static and skip_streak < MAX_CONSECUTIVE_SKIP_CANDIDATES
        skip_streak = skip_streak + 1 if skip_candidate else 0
        unselected = sorted(set(range(FRAMES_PER_BLOCK)) - set(proposed))
        missed_proxy = [index for index in unselected
                        if min(distance(images[index], images[picked]) for picked in proposed) >= SCENE_THRESHOLD]
        selected = list(range(FRAMES_PER_BLOCK)) if missed_proxy else proposed
        output.append({
            "sequence": block["sequence"],
            "startMs": block["startMs"],
            "endMs": block["endMs"],
            "sourceSha256": [item["sha256"] for item in frames],
            "proposedIndices": proposed,
            "selectedIndices": selected,
            "selectedFrameFraction": len(selected) / FRAMES_PER_BLOCK,
            "fallbackReason": "unselected-change-proxy" if missed_proxy else None,
            "shadowSkipCandidate": skip_candidate,
            "actualVlmCallRemoved": False,
            "maxIntraDifference": round(intra, 6),
            "boundaryDifference": round(boundary, 6) if boundary is not None else None,
            "unselectedChangeProxyIndices": missed_proxy,
            "cpuNs": time.perf_counter_ns() - started,
        })
        previous_last = images[-1]
    return {
        "version": 1,
        "preparation": str(preparation.resolve()),
        "blocksIndexSha256": sha256(index),
        "policy": {
            "thumbnailSize": THUMBNAIL_SIZE,
            "sceneThreshold": SCENE_THRESHOLD,
            "staticThreshold": STATIC_THRESHOLD,
            "maxConsecutiveSkipCandidates": MAX_CONSECUTIVE_SKIP_CANDIDATES,
            "framesPerBlock": FRAMES_PER_BLOCK,
        },
        "blocks": output,
        "summary": {
            "blockCount": len(output),
            "threeFrameBlocks": sum(len(item["selectedIndices"]) == 3 for item in output),
            "fiveFrameFallbackBlocks": sum(len(item["selectedIndices"]) == 5 for item in output),
            "selectedFrameFraction": (sum(len(item["selectedIndices"]) for item in output)
                                      / (len(output) * FRAMES_PER_BLOCK) if output else None),
            "proposedSkipCandidates": sum(item["shadowSkipCandidate"] for item in output),
            "blocksWithUnselectedChangeProxy": sum(bool(item["unselectedChangeProxyIndices"]) for item in output),
            "actualVlmCallsRemoved": 0,
            "cpuNs": sum(item["cpuNs"] for item in output),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preparation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-blocks", type=int)
    args = parser.parse_args()
    if args.max_blocks is not None and args.max_blocks < 1:
        parser.error("--max-blocks doit être positif")
    result = analyze(args.preparation, args.max_blocks)
    if args.output.exists():
        parser.error("Le fichier de sortie existe déjà")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
