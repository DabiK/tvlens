"""Build the G5 journal-variant requests from the closed N2 run (GPS with vision lacking topicSummary).

For each question, the captured question request (A) and four journals of the older passages, each differing from B
in one respect: B is the journal injected by the proxy in N3 (transcript of every older block, a visual line when
the topic changes, 10 000 characters at most, placed before the recent passages); C keeps one entry per topic run;
D caps B at 3 000 characters; E places B after the recent passages.

Causality: a block enters only if its perception call finished before the question call started (proxy wall times)
and ended before the question's anchor, as in the proxy.
"""
import argparse
import json
import re
from pathlib import Path

VIDEOS = ["kennedy", "spring", "cnrs-apprentissage", "boeuf-bourguignon", "tears-of-steel", "artemis"]
ARM_LABEL = "GPSR"
BLOCK_MS = 8000
JOURNAL_CHAR_CAP = 10000
SHORT_JOURNAL_CHAR_CAP = 3000
TOPIC_TEXT_CHARS = 400
VISUAL_CHARS = 300
TRANSCRIPT = re.compile(r'Transcription locale \(potentiellement imprécise\) : "(.*?)"\. Intervalle (\d+)–(\d+) ms', re.S)
FENCE = re.compile(r"(<<<TVLENS-[0-9a-f]+\n)(.*?)(\nTVLENS-[0-9a-f]+>>>)", re.S)


def perceived_blocks(rows):
    """What the vision role saw for each block, with the wall time at which it was available."""
    blocks = {}
    for row in rows:
        if row["role"] != "vlm" or row["path"] != "/api/chat" or row["status"] != 200:
            continue
        found = TRANSCRIPT.search(row["request"]["messages"][0].get("content", ""))
        try:
            output = json.loads(row["response"]["message"]["content"])
        except (ValueError, KeyError, TypeError):
            continue
        if found:
            start = int(found.group(2))
            blocks[start] = {"startMs": start, "endMs": int(found.group(3)), "transcript": found.group(1).strip(),
                             "visual": output.get("visual", ""), "topic": output.get("topic", ""),
                             "publishedAt": row["startedAtUnix"] + row["upstreamMs"] / 1000}
    return [blocks[k] for k in sorted(blocks)]


def moment_id(block):
    return "moment-%d" % (block["startMs"] // BLOCK_MS + 1)


def thin(lines, cap):
    while sum(len(p["text"]) for p in lines) > cap and len(lines) > 3:
        del lines[2 + (len(lines) - 3) // 2]
    return lines


def block_journal(older, cap):
    """Same journal as the proxy's `with_journal`."""
    lines, previous_topic = [], None
    for index, block in enumerate(older):
        text = block["transcript"] or "(pas de parole transcrite)"
        if block["visual"] and (index < 2 or block["topic"] != previous_topic):
            text += "\nImage : " + block["visual"][:VISUAL_CHARS]
        previous_topic = block["topic"]
        lines.append({"id": moment_id(block), "startMs": block["startMs"], "endMs": block["endMs"], "text": text,
                      "precision": "compact-journal", "available": True})
    return thin(lines, cap)


def topic_journal(older):
    """One entry per run of blocks sharing a topic: the topic, the start of its speech and its first visual line."""
    runs = []
    for block in older:
        if runs and runs[-1][-1]["topic"] == block["topic"]:
            runs[-1].append(block)
        else:
            runs.append([block])
    lines = []
    for run in runs:
        speech = " ".join(b["transcript"] for b in run if b["transcript"])[:TOPIC_TEXT_CHARS]
        text = "Sujet : %s\n%s" % (run[0]["topic"] or "(sans sujet)", speech or "(pas de parole transcrite)")
        if run[0]["visual"]:
            text += "\nImage : " + run[0]["visual"][:VISUAL_CHARS]
        lines.append({"id": moment_id(run[0]), "startMs": run[0]["startMs"], "endMs": run[-1]["endMs"], "text": text,
                      "precision": "compact-journal", "available": True})
    return thin(lines, JOURNAL_CHAR_CAP)


def inject(request, passages, after=False):
    payload = json.loads(json.dumps(request))
    content = payload["messages"][0]["content"]
    fence = FENCE.search(content)
    data = json.loads(fence.group(2))
    context = data["context"]
    context["passages"] = context["passages"] + passages if after else passages + context["passages"]
    context["omittedCount"] = max(0, context.get("omittedCount", 0) - len(passages))
    payload["messages"][0]["content"] = content[:fence.start(2)] + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + \
        content[fence.end(2):]
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n2", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    n2, out = Path(args.n2), Path(args.out)
    (out / "requetes").mkdir(parents=True)
    cases, audit = [], []
    for video in VIDEOS:
        rows = [json.loads(line) for line in (n2 / "proxy" / ("%s-%s-1.jsonl" % (video, ARM_LABEL))).read_text().splitlines()]
        blocks = perceived_blocks(rows)
        scenario = json.loads((n2 / "inputs" / video / "scenario.json").read_text())
        calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat" and r["status"] == 200]
        for question in scenario["questions"]:
            call = next(r for r in calls if question["question"] in r["request"]["messages"][0]["content"])
            context = json.loads(FENCE.search(call["request"]["messages"][0]["content"]).group(2))["context"]
            recent = {p["id"] for p in context["passages"]}
            older = [b for b in blocks if b["publishedAt"] <= call["startedAtUnix"] and moment_id(b) not in recent
                     and b["endMs"] <= context.get("anchorMs", 0)]
            journals = {"B": block_journal(older, JOURNAL_CHAR_CAP), "C": topic_journal(older),
                        "D": block_journal(older, SHORT_JOURNAL_CHAR_CAP)}
            variants = {"A": call["request"], "B": inject(call["request"], journals["B"]),
                        "C": inject(call["request"], journals["C"]), "D": inject(call["request"], journals["D"]),
                        "E": inject(call["request"], journals["B"], after=True)}
            paths = {}
            for arm, request in variants.items():
                path = out / "requetes" / ("%s-%s.json" % (question["id"], arm))
                path.write_text(json.dumps(request, ensure_ascii=False))
                paths[arm] = str(path)
            cases.append({"kind": "prebuilt", "id": question["id"], "requests": paths})
            audit.append({"questionId": question["id"], "olderBlocks": len(older), "recent": sorted(recent),
                          **{"journal%sPassages" % k: len(v) for k, v in journals.items()},
                          **{"journal%sChars" % k: sum(len(p["text"]) for p in v) for k, v in journals.items()}})
    (out / "plan-g5.json").write_text(json.dumps({"experiment": "g5-variantes-journal", "capSeconds": 7200, "cases": cases,
                                                  "arms": [{"label": a} for a in "ABCDE"],
                                                  "order": list("ABCDEEDCBA")}, ensure_ascii=False, indent=1))
    (out / "g5-construction.json").write_text(json.dumps(audit, ensure_ascii=False, indent=1))
    print(len(cases), "questions")


if __name__ == "__main__":
    main()
