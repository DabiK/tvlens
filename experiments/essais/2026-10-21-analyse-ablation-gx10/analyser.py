"""Résume les deux ablations nocturnes scellées sans leur attribuer de note qualité."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from pathlib import Path


ESSAIS = Path(__file__).resolve().parent.parent
SOURCE = (
    ESSAIS
    / "2026-10-20-nuit-gx10"
    / "rapatriements"
    / "nuit-20261020T210107Z"
    / "results"
)
RUNS = ("01-A", "02-B", "03-B", "04-A")


def percentile(values: list[float], proportion: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * proportion
    low = math.floor(position)
    high = math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def distribution(values: list[float]) -> dict[str, float | int | None]:
    return {
        "count": len(values),
        "median": statistics.median(values) if values else None,
        "p95": percentile(values, 0.95),
        "mean": statistics.fmean(values) if values else None,
        "minimum": min(values) if values else None,
        "maximum": max(values) if values else None,
    }


def read_campaign(experiment: str, run: str) -> tuple[dict, dict]:
    path = SOURCE / experiment / run / "run" / "campaign.json"
    data = path.read_bytes()
    return json.loads(data), {
        "path": str(path.relative_to(ESSAIS)),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def perception_run(data: dict) -> dict:
    cases = {}
    for case in data["cases"]:
        if case["status"] != "succeeded":
            raise ValueError(f"cas de perception non acquis : {case['id']}")
        metrics = case["result"]["metrics"]
        timing = metrics["providerTimings"]
        cases[case["id"]] = {
            "startMs": case["input"]["startMs"],
            "endMs": case["input"]["endMs"],
            "framesSent": metrics["framesSent"],
            "elapsedMs": case["result"]["elapsedMs"],
            "providerTotalMs": timing["totalMs"],
            "promptEvalMs": timing["promptEvalMs"],
            "generationMs": timing["evalMs"],
            "promptTokens": timing["promptTokens"],
            "generatedTokens": timing["evalTokens"],
        }
    if len(cases) != 12:
        raise ValueError("l'ablation perception doit avoir 12 cas distincts par passage")
    return {
        "cases": cases,
        "elapsedMs": distribution([c["elapsedMs"] for c in cases.values()]),
        "providerTotalMs": distribution([c["providerTotalMs"] for c in cases.values()]),
        "promptEvalMs": distribution([c["promptEvalMs"] for c in cases.values()]),
        "generationMs": distribution([c["generationMs"] for c in cases.values()]),
        "promptTokens": distribution([c["promptTokens"] for c in cases.values()]),
        "generatedTokens": distribution([c["generatedTokens"] for c in cases.values()]),
    }


def vision_run(data: dict) -> dict:
    if not data["complete"]:
        raise ValueError("replay vision incomplet")
    questions = {}
    for question in data["questions"]:
        if not question["acquired"] or question["status"] != "done":
            raise ValueError(f"question non acquise : {question['id']}")
        latency = question["latency"]
        evidence = latency["internal"]["evidence"]
        questions[question["id"]] = {
            "atMs": question["atMs"],
            "question": question["question"],
            "httpMs": latency["submissionToHttpResponseMs"],
            "evidenceAgeMs": evidence["anchorMs"] - evidence["analyzedThroughMs"],
            "contextLagMs": evidence["lagAtStartMs"],
            "unanalyzedTailMs": evidence["unanalyzedTailMs"],
        }
    if len(questions) != 5:
        raise ValueError("le replay vision doit avoir cinq questions distinctes")
    summary = data["summary"]
    return {
        "questions": questions,
        "httpMs": distribution([q["httpMs"] for q in questions.values()]),
        "evidenceAgeMs": distribution([q["evidenceAgeMs"] for q in questions.values()]),
        "contextLagMs": distribution([q["contextLagMs"] for q in questions.values()]),
        "under15s": sum(q["httpMs"] < 15000 for q in questions.values()),
        "under20s": sum(q["httpMs"] < 20000 for q in questions.values()),
        "visionPublications": summary["publications"]["vision"],
        "visionCoveragePercent": summary["coverage"]["vision"]["percent"],
        "visionLossCounts": summary["lossCounters"],
    }


def compare(left: dict, right: dict, field: str, identity: str) -> dict:
    if set(left) != set(right):
        raise ValueError(f"identifiants non appariés pour {field}")
    paired = []
    for key in sorted(left):
        for checked in ("startMs", "endMs") if identity == "perception" else ("atMs", "question"):
            if left[key][checked] != right[key][checked]:
                raise ValueError(f"entrée différente : {key}/{checked}")
        paired.append({
            "id": key,
            "left": left[key][field],
            "right": right[key][field],
            "rightMinusLeft": right[key][field] - left[key][field],
        })
    deltas = [item["rightMinusLeft"] for item in paired]
    return {"pairs": paired, "delta": distribution(deltas), "rightLowerCount": sum(x < 0 for x in deltas)}


def main() -> None:
    results = {"readyForScoring": False, "sources": {}, "perception": {}, "vision": {}}
    for experiment, converter, result_key in (
        ("trial-perception", perception_run, "perception"),
        ("trial-vision", vision_run, "vision"),
    ):
        for run in RUNS:
            data, source = read_campaign(experiment, run)
            results["sources"][f"{experiment}/{run}"] = source
            results[result_key][run] = converter(data)
    perception = results["perception"]
    vision = results["vision"]
    results["perceptionPairs"] = {
        "firstPass_B_minus_A": compare(perception["01-A"]["cases"], perception["02-B"]["cases"], "elapsedMs", "perception"),
        "secondPass_B_minus_A": compare(perception["04-A"]["cases"], perception["03-B"]["cases"], "elapsedMs", "perception"),
    }
    results["visionPairs"] = {
        "firstPass_B_minus_A": compare(vision["01-A"]["questions"], vision["02-B"]["questions"], "httpMs", "vision"),
        "secondPass_B_minus_A": compare(vision["04-A"]["questions"], vision["03-B"]["questions"], "httpMs", "vision"),
        "firstPassEvidenceAge_B_minus_A": compare(vision["01-A"]["questions"], vision["02-B"]["questions"], "evidenceAgeMs", "vision"),
        "secondPassEvidenceAge_B_minus_A": compare(vision["04-A"]["questions"], vision["03-B"]["questions"], "evidenceAgeMs", "vision"),
    }
    output = Path(__file__).with_name("resultats.json")
    output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    print(output)


if __name__ == "__main__":
    main()
