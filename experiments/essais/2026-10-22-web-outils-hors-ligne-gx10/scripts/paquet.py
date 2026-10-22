"""Build blind scoring packets (one per video) from replay call logs and/or flow campaigns, with a separate key.

Usage: python3 -I paquet.py --out DIR --oracle oracle.json [--calls LABEL=calls.jsonl ...] [--campaigns LABEL=dir ...]
       [--only-questions ids.json] [--skip-arms A,B]
Generalises paquet_rejeux.py: replay rows may name the question "questionId" or "case" and carry one counter per turn
(two-phase arms); answers keep their sources and limits, which the web/tool rubrics grade. Identical texts of a question
are merged so that duplicates cannot reveal an arm. Each packet lists the questions of the video in oracle order.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

def tokens(counters):
    rows = counters if isinstance(counters, list) else [counters or {}]
    return sum(row.get("eval_count") or 0 for row in rows)


def from_calls(label, path):
    items = []
    for line in open(path):
        row = json.loads(line)
        if row.get("event") == "loaded" or row.get("warmup") or row.get("status") != 200:
            continue
        qid = row.get("questionId") or row.get("case")
        try:
            content = json.loads(row["content"])
            answer, kind = content.get("answer"), content.get("kind")
            citations, sources, limits = content.get("citations") or [], content.get("sources") or [], content.get("limits") or []
        except (TypeError, ValueError):
            answer, kind, citations, sources, limits = row.get("content"), "json-invalide", [], [], []
        items.append({"questionId": qid, "answer": answer, "kind": kind, "citations": citations, "sources": sources,
                      "limits": limits,
                      "key": {"source": label, "arm": row["arm"], "pass": row.get("pass"), "wallMs": row["wallMs"],
                              "tokens": tokens(row.get("counters")), "turns": row.get("turns", 1),
                              "tools": row.get("tools") or [], "category": row.get("category"),
                              "citationsFilled": bool(citations)}})
    return items


def from_campaigns(label, folder):
    items = []
    for path in sorted(Path(folder).glob("*.json")):
        campaign = json.loads(path.read_text())
        for q in campaign["questions"]:
            result = q.get("result") or {}
            items.append({"questionId": q["id"], "answer": result.get("answer"), "kind": result.get("kind"),
                          "citations": result.get("citations") or [], "sources": result.get("sources") or [],
                          "limits": result.get("limits") or [],
                          "key": {"source": label, "arm": path.stem, "wallMs": q["latency"]["submissionToHttpResponseMs"],
                                  "retrieval": result.get("retrieval")}})
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--oracle", required=True)
    parser.add_argument("--calls", action="append", default=[])
    parser.add_argument("--campaigns", action="append", default=[])
    parser.add_argument("--only-questions")
    parser.add_argument("--skip-arms", default="")
    args = parser.parse_args()
    oracle = json.loads(Path(args.oracle).read_text())
    order = {q["questionId"]: (video, i, q["askedQuestion"]) for video, entry in oracle.items()
             for i, q in enumerate(entry["questions"])}
    keep = set(json.loads(Path(args.only_questions).read_text())) if args.only_questions else None
    skip = set(filter(None, args.skip_arms.split(",")))
    items = []
    for spec in args.calls:
        label, path = spec.split("=", 1)
        items += from_calls(label, path)
    for spec in args.campaigns:
        label, path = spec.split("=", 1)
        items += from_campaigns(label, path)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    key, packets, members = {}, defaultdict(lambda: defaultdict(dict)), defaultdict(lambda: defaultdict(list))
    for item in items:
        qid = item["questionId"]
        if qid not in order or (keep is not None and qid not in keep) or item["key"]["arm"] in skip:
            continue
        video = order[qid][0]
        visible = {k: item[k] for k in ("kind", "answer", "citations", "sources", "limits")}
        text_id = hashlib.sha256((qid + json.dumps(visible, ensure_ascii=False, sort_keys=True)).encode()).hexdigest()[:10]
        answer_id = hashlib.sha256((text_id + json.dumps(item["key"], sort_keys=True) + str(len(key))).encode()).hexdigest()[:12]
        key[answer_id] = {"questionId": qid, **item["key"]}
        packets[video][qid][text_id] = {"textId": text_id, **visible}
        members[video][text_id].append(answer_id)
    for video, questions in packets.items():
        rows = [{"questionId": qid, "question": order[qid][2],
                 "answers": sorted(texts.values(), key=lambda t: t["textId"])}
                for qid, texts in sorted(questions.items(), key=lambda kv: order[kv[0]][1])]
        (out / ("a-noter-%s.json" % video)).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
        (out / ("membres-%s.json" % video)).write_text(json.dumps(members[video], indent=1))
        print(video, len(rows), "questions,", sum(len(r["answers"]) for r in rows), "textes")
    (out / "cle.json").write_text(json.dumps(key, ensure_ascii=False, indent=1))
    print(len(key), "réponses")


if __name__ == "__main__":
    main()
