"""Build the G2 memory-injection requests from the closed E1: for each question, the captured request (A), the same
request with a compact causal journal of older passages (B), and with the six older passages closest to the question (C).

Causality: a block enters only if its perception call finished before the question call started (proxy wall times).
Injected passages keep their moment ids and go before the six recent ones; nothing else in the request changes.
"""
import argparse
import json
import math
import re
import urllib.request
from pathlib import Path

VIDEOS = ["kennedy", "spring", "cnrs-apprentissage", "boeuf-bourguignon", "tears-of-steel", "artemis"]
BLOCK_MS = 8000
JOURNAL_CHAR_CAP = 10000
RETRIEVED = 6
PASSAGE_CHAR_CAP = 1200
TRANSCRIPT = re.compile(r'Transcription locale \(potentiellement imprécise\) : "(.*?)"\. Intervalle (\d+)–(\d+) ms', re.S)
FENCE = re.compile(r"(<<<TVLENS-[0-9a-f]+\n)(.*?)(\nTVLENS-[0-9a-f]+>>>)", re.S)


def blocks_from_journal(rows):
    """One record per perceived block: interval, transcript, summary, visual, topic and publication wall time."""
    blocks = {}
    for row in rows:
        if row["role"] != "vlm" or row["path"] != "/api/chat" or row["status"] != 200:
            continue
        found = TRANSCRIPT.search(row["request"]["messages"][0].get("content", ""))
        if not found:
            continue
        try:
            output = json.loads(row["response"]["message"]["content"])
        except (ValueError, KeyError, TypeError):
            continue
        start = int(found.group(2))
        blocks[start] = {"startMs": start, "endMs": int(found.group(3)), "transcript": found.group(1).strip(),
                         "summary": output.get("summary", ""), "visual": output.get("visual", ""),
                         "topic": output.get("topic", ""), "publishedAt": row["startedAtUnix"] + row["upstreamMs"] / 1000}
    return [blocks[k] for k in sorted(blocks)]


def moment_id(block):
    return "moment-%d" % (block["startMs"] // BLOCK_MS + 1)


def journal_passages(older):
    lines, last_visual = [], None
    for index, block in enumerate(older):
        text = block["transcript"] or "(pas de parole transcrite)"
        if block["visual"] and block["visual"] != last_visual and (last_visual is None or block["topic"] != older[index - 1]["topic"]
                                                                    or index < 2):
            text += "\nImage : " + block["visual"][:300]
            last_visual = block["visual"]
        lines.append({"id": moment_id(block), "startMs": block["startMs"], "endMs": block["endMs"], "text": text,
                      "precision": "compact-journal", "available": True})
    while sum(len(p["text"]) for p in lines) > JOURNAL_CHAR_CAP and len(lines) > 3:
        del lines[2 + (len(lines) - 3) // 2]
    return lines


def embed(texts, model):
    request = urllib.request.Request("http://127.0.0.1:11434/api/embed", data=json.dumps({"model": model, "input": texts}).encode(),
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read())["embeddings"]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)) or 1)


def retrieved_passages(older, question, model):
    if not older:
        return []
    texts = ["\n".join(filter(None, [b["summary"], b["visual"], b["transcript"]]))[:PASSAGE_CHAR_CAP] for b in older]
    vectors = embed([question] + texts, model)
    ranked = sorted(range(len(older)), key=lambda i: -cosine(vectors[0], vectors[i + 1]))[:RETRIEVED]
    return [{"id": moment_id(older[i]), "startMs": older[i]["startMs"], "endMs": older[i]["endMs"], "text": texts[i],
             "precision": "retrieved-older-passage", "available": True} for i in sorted(ranked)]


def inject(request, passages):
    payload = json.loads(json.dumps(request))
    content = payload["messages"][0]["content"]
    fence = FENCE.search(content)
    data = json.loads(fence.group(2))
    context = data["context"]
    context["passages"] = passages + context["passages"]
    context["omittedCount"] = max(0, context.get("omittedCount", 0) - len(passages))
    payload["messages"][0]["content"] = content[:fence.start(2)] + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + content[fence.end(2):]
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--e1", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--embedding-model", default="qwen3-embedding:0.6b")
    args = parser.parse_args()
    e1, out = Path(args.e1), Path(args.out)
    (out / "requetes").mkdir(parents=True)
    cases, audit = [], []
    for video in VIDEOS:
        rows = [json.loads(line) for line in (e1 / "proxy" / (video + "-A-1.jsonl")).read_text().splitlines()]
        blocks = blocks_from_journal(rows)
        scenario = json.loads((e1 / "inputs" / video / "scenario.json").read_text())
        calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat" and r["status"] == 200]
        for question in scenario["questions"]:
            call = next(r for r in calls if question["question"] in r["request"]["messages"][0]["content"])
            recent = {p["id"] for p in json.loads(FENCE.search(call["request"]["messages"][0]["content"]).group(2))["context"]["passages"]}
            older = [b for b in blocks if b["publishedAt"] <= call["startedAtUnix"] and moment_id(b) not in recent
                     and b["endMs"] <= question["atMs"]]
            variants = {"A": call["request"], "B": inject(call["request"], journal_passages(older)),
                        "C": inject(call["request"], retrieved_passages(older, question["question"], args.embedding_model))}
            paths = {}
            for arm, request in variants.items():
                path = out / "requetes" / ("%s-%s.json" % (question["id"], arm))
                path.write_text(json.dumps(request, ensure_ascii=False))
                paths[arm] = str(path)
            cases.append({"kind": "prebuilt", "id": question["id"], "requests": paths})
            audit.append({"questionId": question["id"], "olderBlocks": len(older), "recent": sorted(recent),
                          "journalChars": sum(len(p["text"]) for p in journal_passages(older)),
                          "retrieved": [p["id"] for p in json.loads(FENCE.search(variants["C"]["messages"][0]["content"]).group(2))
                                        ["context"]["passages"] if p.get("precision") == "retrieved-older-passage"]})
    (out / "plan-g2.json").write_text(json.dumps({"experiment": "g2-memoire-injectee", "capSeconds": 2700, "cases": cases,
                                                  "arms": [{"label": "A"}, {"label": "B"}, {"label": "C"}],
                                                  "order": ["A", "B", "C", "C", "B", "A"]}, ensure_ascii=False, indent=1))
    (out / "g2-construction.json").write_text(json.dumps(audit, ensure_ascii=False, indent=1))
    print(len(cases), "questions")


if __name__ == "__main__":
    main()
