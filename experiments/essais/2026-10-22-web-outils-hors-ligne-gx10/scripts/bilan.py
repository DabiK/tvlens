"""Join blind judge scores with a packet key, then summarise per arm, per question category and against a reference arm.

Usage: python3 -I bilan.py <workflow output json> <packet dir> <oracle json> <out json> [--ref ARM] [--ages ages.json]
       [--by-source]
--by-source groups flow campaigns (one campaign per video) under their source label, which --ref then names.
Final score: mean of judges 1-2, or median of three when a third judge scored the text. Invention: majority.
Relevant = score >= 2 without invention. Arms are compared on the same question and the same rank of passage within
each arm (an arm's first passage against the reference's first); the sign test is two-sided.
Category: W, M, O from the oracle v4, otherwise the age of the facts ("ancienne", "mixte", "récente") when --ages is given.
"""
import argparse
import json
import math
import statistics
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


def sign_test(wins, losses):
    n, k = wins + losses, min(wins, losses)
    if n == 0:
        return 1.0
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scores")
    parser.add_argument("packets")
    parser.add_argument("oracle")
    parser.add_argument("out")
    parser.add_argument("--ref")
    parser.add_argument("--ages")
    parser.add_argument("--by-source", action="store_true")
    args = parser.parse_args()
    results = json.loads(Path(args.scores).read_text())
    results = results.get("result", results) if isinstance(results, dict) else results
    packets = Path(args.packets)
    key = json.loads((packets / "cle.json").read_text())
    oracle = json.loads(Path(args.oracle).read_text())
    category = {q["questionId"]: q.get("category") for entry in oracle.values() for q in entry["questions"]}
    if args.ages:
        for qid, age in json.loads(Path(args.ages).read_text()).items():
            category[qid] = category.get(qid) or age
    rows = []
    for entry in results:
        members = json.loads((packets / ("membres-%s.json" % entry["video"])).read_text())
        for text_id, final in finals(entry).items():
            for answer_id in members.get(text_id, []):
                k = key[answer_id]
                rows.append({"video": entry["video"], "category": category.get(k["questionId"]) or "-",
                             "relevant": final["score"] >= 2 and not final["invention"], "seconds": k["wallMs"] / 1000,
                             **k, **final})
    Path(args.out).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    arm = (lambda r: r["source"]) if args.by_source else (lambda r: r["source"] + ":" + r["arm"])
    groups = defaultdict(list)
    for row in rows:
        groups[arm(row)].append(row)
    print("| Bras | n | Note moy. | Pertinentes | Inventions | Abst. injustifiées | Délai médian | Pertinentes < 15 s |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for label, items in sorted(groups.items()):
        print("| %s | %d | %.2f | %d | %d | %d | %.1f s | %d |" % (
            label, len(items), statistics.mean(r["score"] for r in items), sum(r["relevant"] for r in items),
            sum(r["invention"] for r in items), sum(r["unjustified"] for r in items),
            statistics.median(r["seconds"] for r in items),
            sum(1 for r in items if r["relevant"] and r["seconds"] < 15)))
    categories = sorted({r["category"] for r in rows})
    print("\n| Pertinentes | " + " | ".join(categories) + " |")
    print("| --- |" + " ---: |" * len(categories))
    for label, items in sorted(groups.items()):
        print("| %s | " % label + " | ".join("%d/%d" % (sum(r["relevant"] for r in items if r["category"] == c),
                                                       sum(1 for r in items if r["category"] == c)) for c in categories) + " |")
    ranks = {label: {p: i for i, p in enumerate(sorted({r.get("pass") or 0 for r in items}))} for label, items in groups.items()}
    pair_key = lambda r: (r["questionId"], ranks[arm(r)][r.get("pass") or 0])
    if args.ref:
        ref = {pair_key(r): r for r in rows if arm(r) == args.ref or arm(r).endswith(":" + args.ref)}
        print("\n| Face à %s | Gagnées | Perdues | p (signes) | Inventions de plus |" % args.ref)
        print("| --- | ---: | ---: | ---: | ---: |")
        for label, items in sorted(groups.items()):
            if label == args.ref or label.endswith(":" + args.ref):
                continue
            pairs = [(r, ref[pair_key(r)]) for r in items if pair_key(r) in ref]
            wins = sum(a["relevant"] and not b["relevant"] for a, b in pairs)
            losses = sum(b["relevant"] and not a["relevant"] for a, b in pairs)
            if pairs:
                print("| %s | %d | %d | %.3f | %+d |" % (label, wins, losses, sign_test(wins, losses),
                                                         sum(a["invention"] for a, _ in pairs) - sum(b["invention"] for _, b in pairs)))


if __name__ == "__main__":
    main()
