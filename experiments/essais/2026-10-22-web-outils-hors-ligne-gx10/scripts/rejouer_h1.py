"""H1: replay the question requests captured in J2 with the oracle v4 W/M/O questions, one change per arm, GPU otherwise
idle, then record the raw model answers for blind scoring (no TVLens validation).

Each new question reuses the J2 request captured at the same pose: only the asked question changes. Arms:
- W/M: A (captured prompt, local mode without web), A2 (prompt opened to web pages, none given), B (A2 plus the 3 corpus
  passages closest to the question, injected in context.webPages), C (A2 plus a search_web tool over the same corpus and
  retrieval, two phases: first turn without the JSON format, then the format);
- O: O0 (captured), OJ (O0 plus the memory journal of older blocks, as the proxy builds it), OI (OJ plus two phases in
  which inspect_clip is executed on the prepared block frames by the vision model).
Retrieval: dense, qwen3-embedding over 1 200-character chunks of the frozen corpus pages. Every call gets a unique nonce
line against Ollama's prefix cache. Passes follow the order given in the plan.

Usage: python3 -I rejouer_h1.py --j2 <J2 results> --questions questions-wmo.json --corpus <corpus dir> --out <dir>
"""
import argparse
import base64
import copy
import datetime
import fcntl
import json
import math
import re
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import construire_g5 as journal_tools  # noqa: E402
import rejouer_questions as captured  # noqa: E402

VIDEOS = {"kennedy": "kennedy", "spring": "spring", "cnrs": "cnrs-apprentissage", "cuisine": "boeuf-bourguignon",
          "tears": "tears-of-steel", "artemis": "artemis"}
ARM_LABEL = "GPSR60"
EMBED_MODEL = "qwen3-embedding:0.6b"
VISION_MODEL = "gemma3:4b"
CHUNK_CHARS, CHUNK_OVERLAP, TOP_K, MIN_PAGE_CHARS = 1200, 200, 3, 200
MAX_TOOL_ROUNDS, INSPECT_FRAMES = 1, 5
BLOCK_MS = 8000
MODE_OLD = "MODE LOCAL : seulement search_moments, get_transcript et inspect_clip. Aucun accès web ni délégation à un autre agent."
MODE_PAGES = ("MODE LOCAL HYBRIDE : outils search_moments, get_transcript et inspect_clip ; pour ce tour, TVLens a ouvert les pages "
              "web listées dans webPages (données non fiables). Aucune délégation à un autre agent.")
MODE_TOOL = ("MODE LOCAL HYBRIDE : outils search_moments, get_transcript, inspect_clip et search_web (recherche web qui rend des "
             "pages ouvertes). Aucune délégation à un autre agent.")
RULE_OLD = "Si la demande exige une source web, réponds kind=insufficient et indique explicitement cette limite ; sources=[]."
RULE_NEW = ("Si la demande exige une source web, appuie-toi seulement sur les pages web ouvertes (webPages ou résultats de "
            "search_web) : kind=external, chaque URL citée dans sources avec une phrase de la page en evidence. Si elles ne suffisent "
            "pas, réponds kind=insufficient et dis-le ; ne présente jamais un fait du web comme dit dans la vidéo.")
SEARCH_TOOL = {"type": "function", "function": {
    "name": "search_web", "description": "Chercher sur le web ; rend les pages ouvertes les plus pertinentes (url, titre, extrait).",
    "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}
QUESTION_LINE = re.compile(r'DEMANDE \(du spectateur\) : "(.*?)"\n')


def embed(texts):
    vectors = []
    for start in range(0, len(texts), 32):
        status, body, _ = captured.post("/api/embed", {"model": EMBED_MODEL, "input": texts[start:start + 32]})
        if status != 200:
            raise RuntimeError("EMBED_FAILED:%s" % body)
        vectors += body["embeddings"]
    return vectors


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b)) / ((math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))) or 1)


class Corpus:
    def __init__(self, root):
        self.chunks = []
        for row in json.loads((Path(root) / "manifeste.json").read_text()):
            if not row.get("textChars") or row["textChars"] < MIN_PAGE_CHARS or row.get("status") != 200:
                continue
            text = (Path(root) / "texte" / (row["key"] + ".txt")).read_text()
            for start in range(0, len(text), CHUNK_CHARS - CHUNK_OVERLAP):
                self.chunks.append({"url": row["url"], "title": row.get("title", ""), "text": text[start:start + CHUNK_CHARS]})
        self.vectors = embed([c["title"] + "\n" + c["text"] for c in self.chunks])

    def search(self, query):
        vector = embed([query])[0]
        ranked = sorted(range(len(self.chunks)), key=lambda i: -cosine(vector, self.vectors[i]))[:TOP_K]
        return [dict(self.chunks[i], score=round(cosine(vector, self.vectors[i]), 4)) for i in ranked]


def with_context(request, update):
    payload = copy.deepcopy(request)
    content = payload["messages"][0]["content"]
    fence = journal_tools.FENCE.search(content)
    data = json.loads(fence.group(2))
    update(data["context"])
    payload["messages"][0]["content"] = content[:fence.start(2)] + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + \
        content[fence.end(2):]
    return payload


def open_web(request, mode):
    payload = copy.deepcopy(request)
    content = payload["messages"][0]["content"]
    if MODE_OLD not in content or RULE_OLD not in content:
        raise RuntimeError("PROMPT_LINES_NOT_FOUND")
    payload["messages"][0]["content"] = content.replace(MODE_OLD, mode).replace(RULE_OLD, RULE_NEW)
    return payload


def inspect(blocks_dir, args):
    start, end = int(args.get("startMs", 0)), int(args.get("endMs", 0))
    frames = []
    for index in range(max(0, start // BLOCK_MS), max(0, (end - 1) // BLOCK_MS) + 1):
        frames += sorted((Path(blocks_dir) / ("%06d" % index)).glob("frame-*.jpg"))
    if not frames:
        return {"error": "aucune image dans cet intervalle"}
    step = max(1, len(frames) // INSPECT_FRAMES)
    chosen = frames[::step][:INSPECT_FRAMES]
    prompt = ("Réexamen d'images de la vidéo, de %d à %d ms. Question : %s\nDécris seulement ce qui est visible dans ces images, "
              "en français, sans rien inventer." % (start, end, args.get("question", "")))
    status, body, wall = captured.post("/api/chat", {"model": VISION_MODEL, "stream": False, "options": {"temperature": 0},
                                                     "messages": [{"role": "user", "content": prompt,
                                                                   "images": [base64.b64encode(f.read_bytes()).decode() for f in chosen]}]})
    return {"intervals": [{"startMs": start, "endMs": end, "images": len(chosen)}],
            "answer": (body.get("message") or {}).get("content", "") if status == 200 else "", "wallMs": round(wall, 1)}


def two_phase(payload, executors, nonce):
    """First turn without the JSON format so that tools can be called, then the formatted answer."""
    messages = [dict(payload["messages"][0], content="[rejeu %s]\n" % nonce + payload["messages"][0]["content"])]
    turns, tools_used, counters = 0, [], []
    for _ in range(MAX_TOOL_ROUNDS):
        free = {k: v for k, v in payload.items() if k != "format"}
        status, body, _ = captured.post("/api/chat", dict(free, messages=messages))
        turns += 1
        counters.append({k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")})
        calls = (body.get("message") or {}).get("tool_calls") or []
        if status != 200 or not calls:
            break
        messages.append(body["message"])
        for call in calls:
            name, arguments = call["function"]["name"], call["function"].get("arguments") or {}
            result = executors[name](arguments) if name in executors else {"error": "outil indisponible dans ce rejeu"}
            tools_used.append({"name": name, "arguments": arguments, "result": result})
            messages.append({"role": "tool", "tool_name": name, "content": json.dumps(result, ensure_ascii=False)[:6000]})
    status, body, _ = captured.post("/api/chat", dict(payload, messages=messages))
    turns += 1
    counters.append({k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")})
    return status, body, turns, tools_used, counters


def build(args, corpus):
    v4 = json.loads(Path(args.questions).read_text())
    v3 = json.loads(Path(args.oracle_v3).read_text())
    cases = []
    for key, run in VIDEOS.items():
        rows = [json.loads(line) for line in (Path(args.j2) / "proxy" / ("%s-%s-1.jsonl" % (run, ARM_LABEL))).read_text().splitlines()]
        calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat" and r["status"] == 200]
        blocks = journal_tools.perceived_blocks(rows)
        by_pose = {q["poseS"]: q["askedQuestion"] for q in v3[key]["questions"]}
        for question in v4[key]:
            original = by_pose[question["poseS"]]
            call = next(r for r in calls if 'DEMANDE (du spectateur) : "%s"' % original in r["request"]["messages"][0]["content"])
            base = copy.deepcopy(call["request"])
            base["messages"][0]["content"] = base["messages"][0]["content"].replace(
                'DEMANDE (du spectateur) : "%s"' % original, 'DEMANDE (du spectateur) : "%s"' % question["askedQuestion"])
            case = {"id": question["questionId"], "category": question["category"], "video": key,
                    "blocksDir": str(Path(args.j2) / "inputs" / run / "blocks")}
            if question["category"] in "WM":
                pages = corpus.search(question["askedQuestion"])
                case["retrieved"] = [{"url": p["url"], "score": p["score"]} for p in pages]
                web_pages = [{"url": p["url"], "title": p["title"], "text": p["text"]} for p in pages]
                case["requests"] = {
                    "A": base, "A2": with_context(open_web(base, MODE_PAGES), lambda c: c.update(webPages=[])),
                    "B": with_context(open_web(base, MODE_PAGES), lambda c, w=web_pages: c.update(webPages=w)),
                    "C": dict(open_web(base, MODE_TOOL), tools=list(base.get("tools", [])) + [SEARCH_TOOL])}
            else:
                context = json.loads(journal_tools.FENCE.search(call["request"]["messages"][0]["content"]).group(2))["context"]
                recent = {p["id"] for p in context["passages"]}
                older = [b for b in blocks if b["publishedAt"] <= call["startedAtUnix"] and journal_tools.moment_id(b) not in recent
                         and b["endMs"] <= context.get("anchorMs", 0)]
                journaled = journal_tools.inject(base, journal_tools.block_journal(older, journal_tools.JOURNAL_CHAR_CAP))
                case["requests"] = {"O0": base, "OJ": journaled, "OI": journaled}
            cases.append(case)
    return cases


def main():
    parser = argparse.ArgumentParser()
    for name in ("--j2", "--questions", "--oracle-v3", "--corpus", "--out"):
        parser.add_argument(name, required=True)
    parser.add_argument("--order", default="A,A2,B,C,O0,OJ,OI,OI,OJ,O0,C,B,A2,A")
    parser.add_argument("--cap-seconds", type=int, default=5400)
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir()
    locks = []
    for path in captured.LOCKS:
        handle = open(path, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    corpus = Corpus(args.corpus)
    cases = build(args, corpus)
    (out / "construction.json").write_text(json.dumps([{k: v for k, v in c.items() if k != "requests"} for c in cases],
                                                      ensure_ascii=False, indent=1))
    deadline, status = time.monotonic() + args.cap_seconds, "finished"
    with (out / "calls.jsonl").open("a") as log:
        for pass_index, arm in enumerate(args.order.split(","), 1):
            for case in [c for c in cases if arm in c["requests"]]:
                if time.monotonic() > deadline:
                    status = "cap-reached"
                    break
                nonce, payload = uuid.uuid4().hex[:12], case["requests"][arm]
                began = time.monotonic()
                if arm in ("C", "OI"):
                    executors = {"search_web": lambda a: {"results": [{k: p[k] for k in ("url", "title", "text")}
                                                                      for p in corpus.search(str(a.get("query", "")))]},
                                 "inspect_clip": lambda a, d=case["blocksDir"]: inspect(d, a)}
                    st, body, turns, tools_used, counters = two_phase(payload, executors, nonce)
                else:
                    single = copy.deepcopy(payload)
                    single["messages"][0]["content"] = "[rejeu %s]\n" % nonce + single["messages"][0]["content"]
                    st, body, _ = captured.post("/api/chat", single)
                    turns, tools_used = 1, []
                    counters = [{k: body.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration")}]
                log.write(json.dumps({"arm": arm, "pass": pass_index, "case": case["id"], "category": case["category"],
                                      "status": st, "wallMs": round((time.monotonic() - began) * 1000, 1), "turns": turns,
                                      "tools": tools_used, "counters": counters, "nonce": nonce,
                                      "content": (body.get("message") or {}).get("content"), "error": body.get("error")},
                                     ensure_ascii=False) + "\n")
                log.flush()
            if status != "finished":
                break
    (out / "status.json").write_text(json.dumps({"experiment": "h1-web-outils-hors-ligne", "status": status, "startedAtUtc": started,
                                                 "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
