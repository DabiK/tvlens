"""H4b: the effect of the source title on real web retrieval, in the product's own requests. For each W/M question the
product searched in F1, replay F1's captured answer request with its pages replaced by the pages that the
title-aware query of H2 (arm PT) opens on the real web (cached by cache_web_pt.cjs), each reduced like the product
does since T315 (beginning plus the best lexical window). The only difference with F1 is the search query.
Usage: python3 -I rejouer_h4b.py --f1 <F1 results> --cache <PT cache dir> --questions questions-wmo.json --out <dir>
"""
import argparse
import copy
import datetime
import fcntl
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rejouer_h2 as h2  # noqa: E402
import rejouer_h2b as h2b  # noqa: E402

h1 = h2.h1


def main():
    parser = argparse.ArgumentParser()
    for name in ("--f1", "--cache", "--questions", "--out"):
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
    cache = Path(args.cache)
    manifest = {row["url"]: row for row in json.loads((cache / "manifeste.json").read_text())}
    searches = {json.loads(l)["case"]: json.loads(l) for l in open(cache / "recherches.jsonl")}
    wmo = json.loads(Path(args.questions).read_text())
    with (out / "calls.jsonl").open("a") as log:
        for key, run in h1.VIDEOS.items():
            rows = [json.loads(line) for line in (Path(args.f1) / "proxy" / ("%s-GPSR102W-1.jsonl" % run)).read_text().splitlines()]
            calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat" and r["status"] == 200]
            for q in [q for q in wmo[key] if q["category"] in ("W", "M")]:
                marker = 'DEMANDE (du spectateur) : "%s"' % q["askedQuestion"]
                answer_calls = [r for r in calls if marker in r["request"]["messages"][0]["content"] and r["request"].get("format")]
                search = searches.get(q["questionId"])
                if not answer_calls or not search:
                    log.write(json.dumps({"case": q["questionId"], "skipped": "no F1 answer call or no PT search"}) + "\n")
                    continue
                request = copy.deepcopy(answer_calls[-1]["request"])
                content = request["messages"][0]["content"]
                fence = h1.journal_tools.FENCE.search(content)
                data = json.loads(fence.group(2))
                if "webPages" not in data:
                    log.write(json.dumps({"case": q["questionId"], "skipped": "F1 did not search"}) + "\n")
                    continue
                terms = h2b.terms_of(q["askedQuestion"], search["query"])
                data["webPages"] = [{"url": u, "title": manifest[u]["title"],
                                     "text": h2b.windowed((cache / "texte" / (manifest[u]["key"] + ".txt")).read_text(), terms)}
                                    for u in search["urls"][:h1.TOP_K]]
                request["messages"][0]["content"] = content[:fence.start(2)] + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + content[fence.end(2):]
                st, body, wall, nonce = h2.post_with_nonce(request)
                log.write(json.dumps({"arm": "PTF1", "pass": 1, "case": q["questionId"], "category": q["category"], "status": st,
                                      "wallMs": wall, "query": search["query"], "pages": search["urls"][:h1.TOP_K], "nonce": nonce,
                                      "counters": {k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")},
                                      "content": (body.get("message") or {}).get("content"), "error": body.get("error")},
                                     ensure_ascii=False) + "\n")
                log.flush()
    (out / "status.json").write_text(json.dumps({"experiment": "h4b-titre-de-la-source", "status": "finished", "startedAtUtc": started,
                                                 "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
