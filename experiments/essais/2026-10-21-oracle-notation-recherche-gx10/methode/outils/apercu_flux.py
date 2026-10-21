"""Quick in-flow comparison of question delays between E1 (reference) and the completed E4 passages.

Usage: python3 -I apercu_flux.py <E1 results dir> <E4 results dir>
"""
import json
import statistics
import sys
from pathlib import Path


def passage(path):
    campaign = json.loads(Path(path).read_text())
    rows = []
    for q in campaign["questions"]:
        result = q.get("result") or {}
        rejected = any("validation des preuves" in l for l in result.get("limits") or [])
        rows.append((q["id"], q["latency"]["submissionToHttpResponseMs"] / 1000, result.get("kind"), rejected))
    return rows


def main():
    e1, e4 = Path(sys.argv[1]), Path(sys.argv[2])
    completed = json.loads((e4 / "completed.json").read_text())
    for entry in completed:
        video, arm = entry["video"], entry["arm"]
        new = passage(e4 / entry["label"] / "run" / "campaign.json")
        ref = passage(e1 / (video + "-A-1") / "run" / "campaign.json")
        print("%-20s %-4s médiane %.1f s (E1 %.1f s) | max %.1f s (E1 %.1f) | sous 15 s %d/5 (E1 %d/5)"
              " | insufficient %d (E1 %d) | rejets validation %d (E1 %d)" % (
            video, arm, statistics.median(r[1] for r in new), statistics.median(r[1] for r in ref), max(r[1] for r in new),
            max(r[1] for r in ref), sum(r[1] < 15 for r in new), sum(r[1] < 15 for r in ref),
            sum(r[2] == "insufficient" for r in new), sum(r[2] == "insufficient" for r in ref),
            sum(r[3] for r in new), sum(r[3] for r in ref)))
        print("      délais :", " ".join("%s=%.1f" % (r[0].rsplit("-", 1)[1], r[1]) for r in new), "| E1 :", " ".join("%.1f" % r[1] for r in ref))


if __name__ == "__main__":
    main()
