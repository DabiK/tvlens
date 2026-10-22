"""H4: answer the 30 W/M questions from real web pages, opened by the product's SearXNG adapter and cached (cache_web.cjs),
with several ways of choosing the text handed to the model. Same captured J2 requests and answer call as H1's arm B.
Arms (a question the model did not mark for the web gets the captured local request in every arm, as in the product):
- V0 product: the first 3 pages of the model's query, each from its beginning, 2 500 characters;
- V1 window: the same pages, each its first 1 000 characters plus the 1 500-character lexical window (T315);
- V2 merged: pages of the model's query and of the raw question alternated, deduplicated, first 3, as V1;
- V3 lexical passages: every cached page of both searches, read up to 20 000 characters, cut in 700-character
  windows; the 5 best by a BM25 score on the terms of the question and the query, at most 2 per page;
- V4 dense passages: the same windows ranked by the local embedding model (qwen3-embedding) against question + query.
Usage: python3 -I rejouer_h4.py --j2 <J2 results> --questions questions-wmo.json --oracle-v3 oracle-v3.json
       --cache <cache dir> --h2 <H2 calls.jsonl> --out <dir> [--arms V0,V1,V2,V3,V4]
"""
import argparse
import datetime
import fcntl
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rejouer_h2 as h2  # noqa: E402
import rejouer_h2b as h2b  # noqa: E402

h1 = h2.h1
PAGES, PAGE_CHARS, READ = 3, 2500, 20000
PASSAGE, PASSAGE_STEP, PASSAGES, PER_PAGE = 700, 350, 5, 2


def tokens(text):
    return [w for w in re.findall(r"[a-z0-9]+", h2b.folded(text)) if len(w) > 2 and w not in h2b.STOP]


def windows_of(pages):
    rows = []
    for page in pages:
        text = page["text"][:READ]
        for start in range(0, max(1, len(text) - PASSAGE // 2), PASSAGE_STEP):
            rows.append({"url": page["url"], "title": page["title"], "start": start, "text": text[start:start + PASSAGE]})
    return rows


def bm25(rows, terms, k1=1.2, b=0.75):
    docs = [Counter(tokens(r["text"])) for r in rows]
    average = sum(sum(d.values()) for d in docs) / max(1, len(docs))
    df = Counter(t for d in docs for t in set(d))
    scores = []
    for d in docs:
        length = sum(d.values())
        score = 0.0
        for t in set(terms):
            if d[t]:
                idf = math.log(1 + (len(docs) - df[t] + 0.5) / (df[t] + 0.5))
                score += idf * d[t] * (k1 + 1) / (d[t] + k1 * (1 - b + b * length / max(1, average)))
        scores.append(score)
    return scores


def dense(rows, query, cache):
    missing = [r["text"] for r in rows if r["text"] not in cache]
    for start in range(0, len(missing), 64):
        for text, vector in zip(missing[start:start + 64], h1.embed(missing[start:start + 64])):
            cache[text] = vector
    vector = h1.embed([query])[0]
    return [h1.cosine(vector, cache[r["text"]]) for r in rows]


def best_passages(rows, scores):
    kept, per_page = [], Counter()
    for score, row in sorted(zip(scores, rows), key=lambda pair: -pair[0]):
        if per_page[row["url"]] < PER_PAGE and all(not (k["url"] == row["url"] and abs(k["start"] - row["start"]) < PASSAGE)
                                                   for k in kept):
            kept.append(row)
            per_page[row["url"]] += 1
        if len(kept) == PASSAGES:
            break
    pages = {}
    for row in sorted(kept, key=lambda r: (r["url"], r["start"])):
        page = pages.setdefault(row["url"], {"url": row["url"], "title": row["title"], "parts": []})
        page["parts"].append(row["text"])
    return [{"url": p["url"], "title": p["title"], "text": "\n[…]\n".join(p["parts"])} for p in pages.values()]


def main():
    parser = argparse.ArgumentParser()
    for name in ("--j2", "--questions", "--oracle-v3", "--cache", "--h2", "--out"):
        parser.add_argument(name, required=True)
    parser.add_argument("--arms", default="V0,V1,V2,V3,V4")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir()
    locks = []
    for path in h1.captured.LOCKS:
        handle = open(path, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cache = Path(args.cache)
    manifest = {row["url"]: row for row in json.loads((cache / "manifeste.json").read_text())}
    text = {url: (cache / "texte" / (row["key"] + ".txt")).read_text() for url, row in manifest.items()}
    searches = {}
    for line in open(cache / "recherches.jsonl"):
        row = json.loads(line)
        searches[(row["case"], row["kind"])] = row
    page = lambda url: {"url": url, "title": manifest[url]["title"], "text": text[url]}
    cases = [c for c in h2.build(args) if c["category"] in ("W", "M")]
    vectors = {}
    with (out / "calls.jsonl").open("a") as log:
        for arm in args.arms.split(","):
            for case in cases:
                model = searches.get((case["id"], "model"))
                raw = searches.get((case["id"], "raw"))
                if not model:
                    payload, web_pages = case["base"], None
                else:
                    query = model["query"]
                    terms = tokens(case["question"] + " " + query)
                    model_pages = [page(u) for u in model["urls"]]
                    raw_pages = [page(u) for u in raw["urls"]] if raw else []
                    if arm == "V0":
                        web_pages = [dict(p, text=p["text"][:PAGE_CHARS]) for p in model_pages[:PAGES]]
                    elif arm == "V1":
                        web_pages = [dict(p, text=h2b.windowed(p["text"], terms)) for p in model_pages[:PAGES]]
                    elif arm == "V2":
                        merged = h2b.merged(model_pages, raw_pages, limit=PAGES)
                        web_pages = [dict(p, text=h2b.windowed(p["text"], terms)) for p in merged]
                    else:
                        unique = list({p["url"]: p for p in model_pages + raw_pages}.values())
                        rows = windows_of(unique)
                        scores = bm25(rows, terms) if arm == "V3" else dense(rows, case["question"] + " " + query, vectors)
                        web_pages = best_passages(rows, scores)
                    payload = h1.with_context(h1.open_web(case["base"], h1.MODE_PAGES), lambda c, w=web_pages: c.update(webPages=w))
                st, body, wall, nonce = h2.post_with_nonce(payload)
                log.write(json.dumps({"arm": arm, "pass": 1, "case": case["id"], "category": case["category"], "status": st,
                                      "wallMs": wall, "searchMs": (model or {}).get("wallMs"),
                                      "pages": [{"url": p["url"], "chars": len(p["text"])} for p in web_pages or []],
                                      "nonce": nonce,
                                      "counters": {k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")},
                                      "content": (body.get("message") or {}).get("content"), "error": body.get("error")},
                                     ensure_ascii=False) + "\n")
                log.flush()
    (out / "status.json").write_text(json.dumps({"experiment": "h4-web-reel-selection-du-texte", "status": "finished",
                                                 "startedAtUtc": started,
                                                 "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
