"""Combine blind judge scores with the answer key and print the relevance/speed frontier per video and configuration.

Final score of a text: mean of judges 1 and 2; when a third judge scored a disputed text, the median of the three.
Invention: majority of the judges who scored the text. Relevant = final score >= 2 and no invention.
"""
import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

RELEVANT_SCORE = 2


def final_scores(entry):
    by_text = defaultdict(list)
    for judge in entry["judges"]:
        for score in (judge or {}).get("scores", []):
            by_text[score["textId"]].append(score)
    final = {}
    for text_id, scores in by_text.items():
        values = [s["score"] for s in scores]
        value = statistics.median(values) if len(values) >= 3 else statistics.mean(values)
        invention = sum(1 for s in scores if s["invention"]) * 2 > len(scores)
        final[text_id] = {"score": value, "invention": invention, "judges": len(scores),
                          "abstention": scores[0].get("abstention")}
    return final


def config_label(key):
    source = key["campaign"].split("/essais/")[1].split("/")[0]
    whisper = (key.get("whisperModel") or "").replace("ggml-", "").replace(".bin", "")
    return "%s | whisper=%s | pause=%s | q=%s" % (source[11:], whisper, not key.get("visionDuringAsk"), key.get("questionsModel"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scored", required=True)
    parser.add_argument("--notation", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    scored = json.loads(Path(args.scored).read_text())
    key = json.loads((Path(args.notation) / "cle-v0.json").read_text())
    rows = []
    for entry in scored:
        members = json.loads((Path(args.notation) / ("membres-%s.json" % entry["video"])).read_text())
        for text_id, result in final_scores(entry).items():
            for answer_id in members.get(text_id, []):
                k = key[answer_id]
                rows.append({"answerId": answer_id, "textId": text_id, "video": entry["video"], "questionId": k["questionId"],
                             "config": config_label(k), "latencyS": round(k["latencyMs"] / 1000, 3), **result})
    Path(args.out).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    groups = defaultdict(list)
    for row in rows:
        groups[(row["video"], row["config"])].append(row)
    print("| Vidéo | Configuration | n | Note moy. | Pertinentes | < 20 s | < 15 s | Inventions | p50 (s) |")
    print("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for (video, config), items in sorted(groups.items()):
        relevant = [r for r in items if r["score"] >= RELEVANT_SCORE and not r["invention"]]
        print("| %s | %s | %d | %.2f | %d | %d | %d | %d | %.1f |" % (
            video, config, len(items), statistics.mean(r["score"] for r in items), len(relevant),
            sum(1 for r in relevant if r["latencyS"] < 20), sum(1 for r in relevant if r["latencyS"] < 15),
            sum(1 for r in items if r["invention"]), statistics.median(r["latencyS"] for r in items)))


if __name__ == "__main__":
    main()
