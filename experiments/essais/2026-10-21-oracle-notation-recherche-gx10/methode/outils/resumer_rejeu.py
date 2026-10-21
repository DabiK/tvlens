"""Summarise a replay calls.jsonl per arm: calls ok, median wall time, decode speed, output tokens, JSON validity,
filled citations and tool calls. Usage: python3 -I resumer_rejeu.py <calls.jsonl>"""
import collections
import json
import statistics
import sys


def parsed(row):
    try:
        return json.loads(row["content"])
    except (TypeError, ValueError):
        return None


def main():
    arms = collections.OrderedDict()
    for line in open(sys.argv[1]):
        row = json.loads(line)
        arms.setdefault(row["arm"], [])
        if row.get("event") == "loaded" or row.get("warmup"):
            continue
        arms[row["arm"]].append(row)
    for arm, rows in arms.items():
        ok = [r for r in rows if r["status"] == 200]
        if not ok:
            print("%-28s 0/%d ok %s" % (arm, len(rows), (rows[0].get("error") or "")[:100] if rows else ""))
            continue
        speeds = [r["counters"]["eval_count"] / (r["counters"]["eval_duration"] / 1e9) for r in ok if r["counters"].get("eval_duration")]
        outputs = [parsed(r) for r in ok]
        print("%-28s %d/%d | total méd %.1f s | génération %.0f jet/s | sortie méd %d jet | JSON invalide %d | citations %d | outils %d" % (
            arm, len(ok), len(rows), statistics.median(r["wallMs"] for r in ok) / 1000, statistics.median(speeds),
            statistics.median(r["counters"]["eval_count"] for r in ok), sum(1 for o in outputs if o is None),
            sum(1 for o in outputs if isinstance(o, dict) and o.get("citations")), sum(1 for r in ok if r.get("toolCalls"))))


if __name__ == "__main__":
    main()
