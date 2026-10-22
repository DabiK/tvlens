"""H2b: answer the 30 W/M questions with the model's query logged by H2's PT arm (per passage), GPU otherwise idle.
Arms, answer call as H1's arm B and H2's PTQ:
- FQ: the passages of two retrievals merged, the model's query and the raw question, alternated from the model's side
  and deduplicated by URL up to 3 passages;
- PH: the product's page text. The 3 first distinct pages that the model's query retrieves, each handed from its
  beginning, 2 500 characters, as the SearXNG and frozen-corpus adapters do;
- PW: the same pages, each as its first 1 000 characters plus the 1 500-character window, within its first 20 000,
  that holds the most terms of the raw question and the model's query.
PH against PW isolates the choice of page text; FQ against H2's PTQ isolates the merged retrieval.

Usage: python3 -I rejouer_h2b.py --j2 <J2 results> --questions questions-wmo.json --oracle-v3 oracle-v3.json
       --corpus <corpus dir> --h2 <H2 calls.jsonl> --out <dir>
"""
import argparse
import datetime
import fcntl
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rejouer_h2 as h2  # noqa: E402

h1 = h2.h1


def merged(first, second, limit=h1.TOP_K):
    kept, urls = [], set()
    for pair in zip(first, second):
        for page in pair:
            if page["url"] not in urls:
                kept.append(page)
                urls.add(page["url"])
    for page in first + second:
        if page["url"] not in urls:
            kept.append(page)
            urls.add(page["url"])
    return kept[:limit]


HEAD, WINDOW, READ, STEP, PAGE_CANDIDATES = 1000, 1500, 20000, 200, 12
STOP = set("les des une pour dans que qui est sur avec par aux ses son sont the and for with that this from was are its "
           "quel quelle quels comment quand pourquoi elle film video ont ete il".split())


def folded(text):
    return unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()


def terms_of(*texts):
    return sorted({w for t in texts for w in re.findall(r"[a-z0-9]+", folded(t)) if len(w) > 2 and w not in STOP})


def windowed(text, terms):
    """First HEAD characters, then the WINDOW holding the most terms within the first READ characters."""
    if len(text) <= HEAD + WINDOW:
        return text
    lower, best = folded(text[:READ]), (-1, HEAD)
    for start in range(HEAD, max(HEAD + 1, min(len(text), READ) - WINDOW + 1), STEP):
        score = sum(1 for term in terms if term in lower[start:start + WINDOW])
        if score > best[0]:
            best = (score, start)
    return text[:HEAD] + "\n[…]\n" + text[best[1]:best[1] + WINDOW]


def first_pages(corpus, texts, query):
    """The first distinct pages the dense retrieval ranks for the query, as a search engine would list them."""
    vector = h1.embed([query])[0]
    ranked = sorted(range(len(corpus.chunks)), key=lambda i: -h1.cosine(vector, corpus.vectors[i]))
    pages, seen = [], set()
    for i in ranked[:PAGE_CANDIDATES * 3]:
        chunk = corpus.chunks[i]
        if chunk["url"] not in seen and chunk["url"] in texts:
            seen.add(chunk["url"])
            pages.append({"url": chunk["url"], "title": chunk["title"], "text": texts[chunk["url"]]})
        if len(pages) == h1.TOP_K:
            break
    return pages


def main():
    parser = argparse.ArgumentParser()
    for name in ("--j2", "--questions", "--oracle-v3", "--corpus", "--h2", "--out"):
        parser.add_argument(name, required=True)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir()
    locks = []
    for path in h1.captured.LOCKS:
        handle = open(path, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    queries = {}
    for line in open(args.h2):
        row = json.loads(line)
        if row["arm"] == "PT" and row["category"] in ("W", "M") and row["decision"].get("web"):
            queries[(row["case"], row["pass"])] = row["decision"]["query"]
    corpus = h1.Corpus(args.corpus)
    texts = {row["url"]: (Path(args.corpus) / "texte" / (row["key"] + ".txt")).read_text()
             for row in json.loads((Path(args.corpus) / "manifeste.json").read_text())
             if row.get("status") == 200 and (row.get("textChars") or 0) >= h1.MIN_PAGE_CHARS}
    cases = [c for c in h2.build(args) if c["category"] in ("W", "M")]
    with (out / "calls.jsonl").open("a") as log:
        for pass_index in (1, 2):
            for arm in ("FQ", "PH", "PW"):
                for case in cases:
                    query = queries.get((case["id"], pass_index))
                    if not query:
                        continue
                    if arm == "FQ":
                        pages = merged(corpus.search(query), corpus.search(case["question"]))
                        web_pages = [{"url": p["url"], "title": p["title"], "text": p["text"]} for p in pages]
                    else:
                        pages = first_pages(corpus, texts, query)
                        terms = terms_of(case["question"], query)
                        web_pages = [{"url": p["url"], "title": p["title"],
                                      "text": p["text"][:HEAD + WINDOW] if arm == "PH" else windowed(p["text"], terms)} for p in pages]
                    payload = h1.with_context(h1.open_web(case["base"], h1.MODE_PAGES), lambda c, w=web_pages: c.update(webPages=w))
                    st, body, wall, nonce = h2.post_with_nonce(payload)
                    log.write(json.dumps({"arm": arm, "pass": pass_index, "case": case["id"], "category": case["category"],
                                          "status": st, "wallMs": wall, "query": query,
                                          "retrieved": [{"url": p["url"], "score": p.get("score")} for p in pages],
                                          "textChars": [len(w["text"]) for w in web_pages], "nonce": nonce,
                                          "counters": {k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")},
                                          "content": (body.get("message") or {}).get("content"), "error": body.get("error")},
                                         ensure_ascii=False) + "\n")
                    log.flush()
    (out / "status.json").write_text(json.dumps({"experiment": "h2b-recuperation-fusionnee", "status": "finished",
                                                 "startedAtUtc": started,
                                                 "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
