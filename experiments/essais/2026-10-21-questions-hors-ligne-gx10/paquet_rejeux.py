"""Build blind scoring packets (one per video) from replay outputs and/or campaigns, with a separate key.

Usage: python3 -I paquet_rejeux.py --out DIR [--calls LABEL=calls.jsonl ...] [--campaigns LABEL=dir ...]
A replay answer is the "answer" field of the model's JSON content (raw, without TVLens validation); invalid JSON is
kept as raw text. Identical texts of a question are merged so that duplicates cannot reveal an arm.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def from_calls(label, path):
    items = []
    for line in open(path):
        row = json.loads(line)
        if row.get("event") == "loaded" or row.get("warmup") or row.get("status") != 200:
            continue
        qid = row.get("questionId") or row.get("case")
        try:
            content = json.loads(row["content"])
            answer, kind, citations = content.get("answer"), content.get("kind"), content.get("citations") or []
        except (TypeError, ValueError):
            answer, kind, citations = row.get("content"), "json-invalide", []
        items.append({"questionId": qid, "answer": answer, "kind": kind, "citations": citations,
                      "key": {"source": label, "arm": row["arm"], "pass": row.get("pass"), "wallMs": row["wallMs"],
                              "tokens": row["counters"].get("eval_count"), "citationsFilled": bool(citations)}})
    return items


def from_campaigns(label, folder):
    items = []
    for path in sorted(Path(folder).glob("*.json")):
        campaign = json.loads(path.read_text())
        for q in campaign["questions"]:
            result = q.get("result") or {}
            items.append({"questionId": q["id"], "answer": result.get("answer"), "kind": result.get("kind"),
                          "citations": result.get("citations") or [],
                          "key": {"source": label, "arm": path.stem, "wallMs": q["latency"]["submissionToHttpResponseMs"]}})
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--calls", action="append", default=[])
    parser.add_argument("--campaigns", action="append", default=[])
    args = parser.parse_args()
    items = []
    for spec in args.calls:
        label, path = spec.split("=", 1)
        items += from_calls(label, path)
    for spec in args.campaigns:
        label, path = spec.split("=", 1)
        items += from_campaigns(label, path)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    key, groups = {}, defaultdict(dict)
    for index, item in enumerate(items):
        answer_id = hashlib.sha256(("%d" % index + json.dumps(item["key"], sort_keys=True)).encode()).hexdigest()[:12]
        key[answer_id] = {"questionId": item["questionId"], **item["key"]}
        text = (item["answer"] or "").strip()
        text_id = hashlib.sha256((item["questionId"] + str(item["kind"]) + text).encode()).hexdigest()[:10]
        entry = groups[item["questionId"]].setdefault(text_id, {"textId": text_id, "kind": item["kind"], "answer": text or None,
                                                                "citations": item["citations"], "members": []})
        entry["members"].append(answer_id)
    by_video = defaultdict(list)
    for qid, entries in groups.items():
        ordered = sorted(entries.values(), key=lambda e: hashlib.sha256(("ordre" + e["textId"]).encode()).hexdigest())
        by_video[qid.rsplit("-", 1)[0]].append({"questionId": qid, "answers": ordered})
    for video, questions in by_video.items():
        questions.sort(key=lambda q: q["questionId"])
        public = [{**q, "answers": [{k: v for k, v in e.items() if k != "members"} for e in q["answers"]]} for q in questions]
        (out / ("a-noter-%s.json" % video)).write_text(json.dumps(public, ensure_ascii=False, indent=1))
        (out / ("membres-%s.json" % video)).write_text(json.dumps({e["textId"]: e["members"] for q in questions for e in q["answers"]}))
    (out / "cle.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
    print(len(items), "réponses ;", sum(len(g) for g in groups.values()), "textes distincts")


if __name__ == "__main__":
    main()
