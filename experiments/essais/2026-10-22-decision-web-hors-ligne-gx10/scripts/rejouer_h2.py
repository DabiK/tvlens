"""H2: let the question model decide whether a question needs the web and write a self-contained search query, on the
102 questions (oracle v3 and W/M/O) replayed from the requests captured in J2, GPU otherwise idle.

Arms of the short decision call (no tool, JSON format {"web", "query"}), on the 3 most recent passages of the captured
context:
- P: the question and the passages;
- PT: P plus the source title a player would show (YouTube title, or the file name of a local sample).
For every question a decision call marks for the web, the answer call is H1's arm B with the 3 corpus passages
retrieved by the model's query instead of the raw question (arm PQ, or PTQ for PT). Each SearXNG query (the model's,
and the raw question as a reference) is logged with its top result URLs, without opening pages. Every call gets a unique
nonce line against Ollama's prefix cache.

Usage: python3 -I rejouer_h2.py --j2 <J2 results> --questions questions-wmo.json --oracle-v3 oracle-v3.json
       --corpus <corpus dir> --searxng http://127.0.0.1:8888 --out <dir> [--passes 2]
"""
import argparse
import copy
import datetime
import fcntl
import json
import time
import urllib.parse
import urllib.request
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rejouer_h1 as h1  # noqa: E402

TITLES = {
    "kennedy": "kennedy-rice-7min.mp4",
    "spring": "Spring - Blender Open Movie",
    "cnrs": "Comment s'entraîne une intelligence artificielle ? - Formation Découverte de l'IA",
    "cuisine": "Le boeuf bourguignon authentique !!!!",
    "tears": "Tears of Steel - Blender VFX Open Movie",
    "artemis": "Artemis I Launch to the Moon (Official NASA Broadcast) - Nov. 16, 2022",
}
PASSAGE_CHARS, RECENT_PASSAGES, SEARX_TOP = 600, 3, 5
DECIDE_SYSTEM = (
    "Tu prépares la réponse d'un compagnon de visionnage. Le spectateur pose une question pendant la vidéo. Décide si une "
    "bonne réponse a besoin d'une recherche sur le web.\n"
    "- web = true si la réponse demande un fait absent de la vidéo : culture générale, histoire, science, identité d'une "
    "personne ou d'une œuvre, date de publication, actualité ou état actuel (« aujourd'hui », « dernière version »), "
    "chiffre officiel, vérification d'une affirmation. Une question qui mêle un fait de la vidéo et un fait extérieur "
    "demande aussi web = true.\n"
    "- web = false si la réponse se trouve dans ce qui est dit ou montré dans la vidéo, même dans un passage ancien, ou si "
    "la question porte sur l'image (cadrage, couleur, objet ou texte à l'écran).\n"
    "Si web = true, écris dans query une requête de recherche autonome de 3 à 12 mots-clés, dans la langue la plus utile, "
    "qui nomme explicitement le sujet (titre de l'œuvre, nom de la personne, de la mission, du lieu) au lieu de « ce film », "
    "« il » ou « cette nuit-là ». N'y mets pas d'année que tu supposes. Si web = false, query est vide.")
DECIDE_FORMAT = {"type": "object", "properties": {"web": {"type": "boolean"}, "query": {"type": "string"}},
                 "required": ["web", "query"]}


def decision_request(base, question, title):
    context = json.loads(h1.journal_tools.FENCE.search(base["messages"][0]["content"]).group(2))["context"]
    recent = context["passages"][-RECENT_PASSAGES:]
    lines = ["- [%d–%d s] %s" % (p["startMs"] // 1000, p["endMs"] // 1000, (p.get("text") or "")[:PASSAGE_CHARS].replace("\n", " "))
             for p in recent]
    user = ("Question du spectateur : « %s »\n" % question + ("Titre de la source : %s\n" % title if title else "") +
            "Passages récents de la vidéo (du plus ancien au plus récent) :\n" + "\n".join(lines))
    return {"model": base["model"], "stream": False, "think": base.get("think", False), "keep_alive": base.get("keep_alive"),
            "format": DECIDE_FORMAT, "options": dict(base.get("options") or {}, num_predict=80),
            "messages": [{"role": "system", "content": DECIDE_SYSTEM}, {"role": "user", "content": user}]}


def searx(url, query):
    began = time.monotonic()
    try:
        with urllib.request.urlopen("%s/search?%s" % (url, urllib.parse.urlencode({"q": query, "format": "json"})),
                                    timeout=20) as response:
            results = json.loads(response.read())["results"][:SEARX_TOP]
        return {"query": query, "urls": [r.get("url") for r in results], "wallMs": round((time.monotonic() - began) * 1000)}
    except Exception as error:  # a failed search is logged, never fatal
        return {"query": query, "error": type(error).__name__, "wallMs": round((time.monotonic() - began) * 1000)}


def build(args):
    v4 = json.loads(Path(args.questions).read_text())
    v3 = json.loads(Path(args.oracle_v3).read_text())
    cases = []
    for key, run in h1.VIDEOS.items():
        rows = [json.loads(line) for line in (Path(args.j2) / "proxy" / ("%s-%s-1.jsonl" % (run, h1.ARM_LABEL))).read_text().splitlines()]
        calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat" and r["status"] == 200]
        by_pose = {q["poseS"]: q["askedQuestion"] for q in v3[key]["questions"]}
        asked = [(q["questionId"], "v3", q["poseS"], q["askedQuestion"]) for q in v3[key]["questions"]]
        asked += [(q["questionId"], q["category"], q["poseS"], q["askedQuestion"]) for q in v4[key]]
        for qid, category, pose, question in asked:
            original = by_pose[pose]
            call = next(r for r in calls if 'DEMANDE (du spectateur) : "%s"' % original in r["request"]["messages"][0]["content"])
            base = copy.deepcopy(call["request"])
            base["messages"][0]["content"] = base["messages"][0]["content"].replace(
                'DEMANDE (du spectateur) : "%s"' % original, 'DEMANDE (du spectateur) : "%s"' % question)
            cases.append({"id": qid, "category": category, "video": key, "question": question, "base": base})
    return cases


def post_with_nonce(payload):
    nonce, single = uuid.uuid4().hex[:12], copy.deepcopy(payload)
    single["messages"][-1]["content"] = "[rejeu %s]\n" % nonce + single["messages"][-1]["content"]
    began = time.monotonic()
    status, body, _ = h1.captured.post("/api/chat", single)
    return status, body, round((time.monotonic() - began) * 1000, 1), nonce


def main():
    parser = argparse.ArgumentParser()
    for name in ("--j2", "--questions", "--oracle-v3", "--corpus", "--searxng", "--out"):
        parser.add_argument(name, required=True)
    parser.add_argument("--passes", type=int, default=2)
    parser.add_argument("--cap-seconds", type=int, default=2400)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir()
    locks = []
    for path in h1.captured.LOCKS:
        handle = open(path, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    corpus = h1.Corpus(args.corpus)
    cases = build(args)
    deadline, status, queries = time.monotonic() + args.cap_seconds, "finished", set()
    with (out / "calls.jsonl").open("a") as log:
        for pass_index in range(1, args.passes + 1):
            for arm, answer_arm in (("P", "PQ"), ("PT", "PTQ")):
                for case in cases:
                    if time.monotonic() > deadline:
                        status = "cap-reached"
                        break
                    title = TITLES[case["video"]] if arm == "PT" else None
                    st, body, wall, nonce = post_with_nonce(decision_request(case["base"], case["question"], title))
                    content = (body.get("message") or {}).get("content")
                    try:
                        decision = json.loads(content)
                    except (TypeError, ValueError):
                        decision = {"web": False, "query": "", "invalid": True}
                    log.write(json.dumps({"arm": arm, "pass": pass_index, "case": case["id"], "category": case["category"],
                                          "status": st, "wallMs": wall, "decision": decision, "nonce": nonce,
                                          "counters": {k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")},
                                          "error": body.get("error")}, ensure_ascii=False) + "\n")
                    log.flush()
                    query = str(decision.get("query") or "").strip()
                    if not decision.get("web") or not query:
                        continue
                    queries.add(query)
                    pages = corpus.search(query)
                    web_pages = [{"url": p["url"], "title": p["title"], "text": p["text"]} for p in pages]
                    payload = h1.with_context(h1.open_web(case["base"], h1.MODE_PAGES), lambda c, w=web_pages: c.update(webPages=w))
                    st, body, wall, nonce = post_with_nonce(payload)
                    log.write(json.dumps({"arm": answer_arm, "pass": pass_index, "case": case["id"], "category": case["category"],
                                          "status": st, "wallMs": wall, "query": query,
                                          "retrieved": [{"url": p["url"], "score": p["score"]} for p in pages], "nonce": nonce,
                                          "counters": {k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")},
                                          "content": (body.get("message") or {}).get("content"), "error": body.get("error")},
                                         ensure_ascii=False) + "\n")
                    log.flush()
                if status != "finished":
                    break
            if status != "finished":
                break
    # Search engine recall, outside the timed calls: the model's queries, then each raw W/M question as a reference.
    with (out / "searxng.jsonl").open("a") as log:
        for query in sorted(queries):
            log.write(json.dumps(dict(searx(args.searxng, query), kind="model"), ensure_ascii=False) + "\n")
        for case in cases:
            if case["category"] in ("W", "M"):
                log.write(json.dumps(dict(searx(args.searxng, case["question"]), kind="raw", case=case["id"]),
                                     ensure_ascii=False) + "\n")
    (out / "status.json").write_text(json.dumps({"experiment": "h2-decision-et-requete-web", "status": status,
                                                 "startedAtUtc": started,
                                                 "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
