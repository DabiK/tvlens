"""Offline estimate, without GPU: for each W/M question, is the oracle extract inside the text the product hands the
model? Variants: page head (the product today), best lexical window, head plus window. Terms: raw question and the
model's query from H2 (PT, first passage), stop words removed. Prints the count of questions whose fact arrives.

Usage: python3 -I simuler_fenetres.py <corpus dir> <oracle-v4.json> <H2 calls.jsonl>
"""
import collections
import json
import re
import sys
import unicodedata

STOP = set("les des une pour dans que qui est sur avec par aux ses son sont the and for with that this from was are its "
           "quel quelle quels comment quand pourquoi elle film video ont ete il".split())


def toks(s):
    s = unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()
    return [(m.group(), m.start()) for m in re.finditer(r"[a-z0-9]+", s)]


def locate(extract, text):
    tt, idx = toks(text), {}
    for i in range(len(tt) - 5):
        idx.setdefault(" ".join(w for w, _ in tt[i:i + 6]), tt[i][1])
    ew = [w for w, _ in toks(extract)]
    grams = [" ".join(ew[i:i + 6]) for i in range(max(1, len(ew) - 5))]
    hits = [idx[g] for g in grams if g in idx]
    return min(hits) if hits and len(hits) >= 0.6 * len(grams) else None


def windows(text, terms, size, k, step=200, start=0):
    t = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    scored = sorted(((sum(1 for x in terms if x in t[s:s + size]), -s, s) for s in range(start, max(start + 1, len(t) - size + 1), step)),
                    reverse=True)
    chosen = []
    for _, _, s in scored:
        if all(abs(s - c) >= size for c in chosen):
            chosen.append(s)
        if len(chosen) == k:
            break
    return chosen


VARIANTS = {
    "début 2500": lambda p, t, T: p < 2500,
    "fenêtre 2500": lambda p, t, T: any(s <= p < s + 2500 for s in windows(t[:20000], T, 2500, 1)),
    "début 1000 + fenêtre 1500": lambda p, t, T: p < 1000 or any(s <= p < s + 1500 for s in windows(t[:20000], T, 1500, 1, start=1000)),
    "début 800 + 2 fenêtres 850": lambda p, t, T: p < 800 or any(s <= p < s + 850 for s in windows(t[:20000], T, 850, 2, start=800)),
}


def main():
    corpus, oracle_path, h2_path = sys.argv[1:4]
    pages = {r["url"]: r for r in json.load(open(corpus + "/manifeste.json"))}
    oracle = json.load(open(oracle_path))
    questions = {q["questionId"]: q for e in oracle.values() for q in e["questions"] if q.get("category") in ("W", "M")}
    queries = {}
    for line in open(h2_path):
        r = json.loads(line)
        if r["arm"] == "PT" and r["pass"] == 1 and r["category"] in ("W", "M"):
            queries[r["case"]] = r["decision"]["query"]
    counts, located = collections.Counter(), 0
    for qid, q in questions.items():
        terms = [w for w, _ in toks(q["askedQuestion"] + " " + queries.get(qid, "")) if len(w) > 2 and w not in STOP]
        found, any_located = collections.Counter(), False
        for source in q.get("sources", []):
            row = pages.get(source["url"])
            if not row or row.get("status") != 200 or not row.get("textChars"):
                continue
            text = open(corpus + "/texte/" + row["key"] + ".txt").read()
            position = locate(source.get("extract", ""), text)
            if position is None:
                continue
            any_located = True
            for name, rule in VARIANTS.items():
                found[name] |= rule(position, text, terms)
        if any_located:
            located += 1
            for name in VARIANTS:
                counts[name] += found[name]
    print("questions W/M avec extrait localisé", located)
    for name, value in counts.items():
        print("  %-28s %d" % (name, value))


if __name__ == "__main__":
    main()
