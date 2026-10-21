"""Join blind judge scores with a packet key and summarise relevance and speed per (source, arm), overall and per video.

Usage: python3 -I bilan_notation.py <workflow output json> <packet dir> <out json>
Final score: mean of judges 1-2, or median of three when a third judge scored the text. Invention: majority.
Relevant = score >= 2 without invention. "Kept" = relevant and, for raw replays, a filled citations field (TVLens
rejects an answer without citations).
"""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def finals(entry):
    texts = defaultdict(list)
    for judge in entry["judges"]:
        for score in (judge or {}).get("scores", []):
            texts[score["textId"]].append(score)
    out = {}
    for text_id, scores in texts.items():
        values = [s["score"] for s in scores]
        out[text_id] = {"score": statistics.median(values) if len(values) >= 3 else statistics.mean(values),
                        "invention": sum(s["invention"] for s in scores) * 2 > len(scores),
                        "unjustified": scores[0]["abstention"] == "unjustified"}
    return out


def main():
    results = json.loads(Path(sys.argv[1]).read_text())
    results = results.get("result", results) if isinstance(results, dict) else results
    packets = Path(sys.argv[2])
    key = json.loads((packets / "cle.json").read_text())
    rows = []
    for entry in results:
        members = json.loads((packets / ("membres-%s.json" % entry["video"])).read_text())
        for text_id, final in finals(entry).items():
            for answer_id in members.get(text_id, []):
                k = key[answer_id]
                relevant = final["score"] >= 2 and not final["invention"]
                kept = relevant and k.get("citationsFilled", True)
                rows.append({"video": entry["video"], "source": k["source"], "arm": k["arm"], "questionId": k["questionId"],
                             "seconds": k["wallMs"] / 1000, "relevant": relevant, "kept": kept, **final})
    Path(sys.argv[3]).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    groups = defaultdict(list)
    for row in rows:
        label = row["source"] + ":" + (row["arm"] if row["source"] != "E1" else "flux")
        groups[label].append(row)
    print("| Bras | n | Note moy. | Pertinentes | Gardées par TVLens | Inventions | Abstentions injustifiées | Délai médian | Pertinentes < 15 s |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for label, items in groups.items():
        print("| %s | %d | %.2f | %d | %d | %d | %d | %.1f s | %d |" % (
            label, len(items), statistics.mean(r["score"] for r in items), sum(r["relevant"] for r in items),
            sum(r["kept"] for r in items), sum(r["invention"] for r in items), sum(r["unjustified"] for r in items),
            statistics.median(r["seconds"] for r in items), sum(1 for r in items if r["kept"] and r["seconds"] < 15)))
    print()
    videos = sorted({r["video"] for r in rows})
    print("Gardées par vidéo : | Bras | " + " | ".join(videos) + " |")
    for label, items in groups.items():
        print("| %s | " % label + " | ".join("%d/%d" % (sum(r["kept"] for r in items if r["video"] == v),
                                                        sum(1 for r in items if r["video"] == v)) for v in videos) + " |")


if __name__ == "__main__":
    main()
