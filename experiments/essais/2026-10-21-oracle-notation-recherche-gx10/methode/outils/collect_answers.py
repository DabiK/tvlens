"""Collect every question answer from replay campaigns into a blind packet and a separate key.

The packet groups answers by question, shuffled by a hash of their id, with no configuration, timing or source.
The key maps each answer id to its campaign, configuration and HTTP latency; it is opened only after scoring.
Identical campaigns copied into several folders are counted once (deduplicated by SHA-256).
"""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def configuration(campaign):
    params = campaign.get("parameters", {})
    config = params.get("config", {})
    roles = campaign.get("roles", {})
    transcription = (roles.get("transcription") or {}).get("parameters") or {}
    preparation = ((campaign.get("provenance") or {}).get("preparation") or {}).get("parameters") or {}
    return {
        "vlmModel": (config.get("localVlm") or {}).get("model"),
        "questionsModel": (config.get("localQuestions") or {}).get("model"),
        "questionsThink": (config.get("localQuestions") or {}).get("think"),
        "questionsNumCtx": (config.get("localQuestions") or {}).get("numCtx"),
        "inspectionModel": (params.get("selectedModels") or {}).get("inspectionModel"),
        "visionDuringAsk": config.get("visionDuringAsk"),
        "whisperModel": Path(transcription.get("model") or "").name or None,
        "framesPerBlock": preparation.get("framesPerBlock"),
    }


def collect(roots):
    seen, items = set(), []
    for root in roots:
        for path in sorted(Path(root).rglob("campaign.json")):
            digest = sha256(path)
            if digest in seen:
                continue
            seen.add(digest)
            try:
                campaign = json.loads(path.read_text(encoding="utf-8"))
            except ValueError:
                continue
            if campaign.get("mode") not in (None, "execute") and campaign.get("status") != "complete":
                continue
            for question in campaign.get("questions", []):
                if not isinstance(question, dict) or "id" not in question or "result" not in question:
                    continue
                result = question.get("result") or {}
                answer_id = hashlib.sha256((digest + question["id"]).encode()).hexdigest()[:12]
                latency = (question.get("latency") or {}).get("submissionToHttpResponseMs")
                items.append({
                    "answerId": answer_id, "questionId": question["id"], "atMs": question.get("atMs"),
                    "question": question.get("question"), "acquired": question.get("acquired") is True,
                    "kind": result.get("kind"), "answer": result.get("answer"),
                    "citations": [{"startMs": c.get("startMs"), "endMs": c.get("endMs")} for c in result.get("citations", [])],
                    "key": {"campaign": str(path), "campaignSha256": digest, "runId": campaign.get("runId"),
                            "status": campaign.get("status"), "latencyMs": latency, **configuration(campaign)},
                })
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", action="append", required=True)
    parser.add_argument("--packet", required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args()
    items = collect(args.root)
    by_question = {}
    for item in items:
        blind = {k: item[k] for k in ("answerId", "kind", "answer", "citations", "acquired")}
        group = by_question.setdefault(item["questionId"], {"questionId": item["questionId"], "atMs": item["atMs"],
                                                             "question": item["question"], "answers": []})
        group["answers"].append(blind)
    for group in by_question.values():
        group["answers"].sort(key=lambda a: hashlib.sha256(("blind" + a["answerId"]).encode()).hexdigest())
    Path(args.packet).write_text(json.dumps(sorted(by_question.values(), key=lambda g: g["questionId"]),
                                            ensure_ascii=False, indent=1), encoding="utf-8")
    Path(args.key).write_text(json.dumps({i["answerId"]: {"questionId": i["questionId"], **i["key"]} for i in items},
                                         ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"answers": len(items), "questions": len(by_question)}))


if __name__ == "__main__":
    main()
