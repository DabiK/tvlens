"""C1: ask Codex the 102 questions with the exact context the local model received (c1-requetes.json), web search on,
as the product's Codex path does (live web search, low reasoning effort), and log answer, wall time and token usage.
The local prompt's mode and web rule lines are swapped for the Codex ones; nothing else changes. A weekly quota
ceiling stops the run.
Usage: python3 -I codex_c1.py <c1-requetes.json> <out dir> [--only id,id] [--workers 4] [--ceiling 27]
"""
import argparse
import concurrent.futures
import glob
import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

MODE_OLD = "MODE LOCAL : seulement search_moments, get_transcript et inspect_clip. Aucun accès web ni délégation à un autre agent."
RULE_OLD = "Si la demande exige une source web, réponds kind=insufficient et indique explicitement cette limite ; sources=[]."
MODE_CODEX = ("MODE CODEX : recherche web intégrée ouverte pour ce tour. Les outils vidéo search_moments, get_transcript et "
              "inspect_clip ne sont pas disponibles ici : appuie-toi sur les passages fournis. N'exécute aucune commande.")
RULE_CODEX = ("Si la demande exige une source web, cherche et ouvre les pages avec ta recherche web : kind=external, chaque URL "
              "citée dans sources avec une phrase de la page en evidence. Si elles ne suffisent pas, réponds kind=insufficient et "
              "dis-le ; ne présente jamais un fait du web comme dit dans la vidéo.")
MODEL, EFFORT = "gpt-6-luna", "low"
lock = threading.Lock()


def weekly_used():
    files = sorted(glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/rollout-*.jsonl")), key=os.path.getmtime)
    for path in reversed(files[-5:]):
        lines = [l for l in open(path) if '"rate_limits"' in l]
        if lines:
            limits = json.loads(lines[-1])["payload"].get("rate_limits") or {}
            return (limits.get("primary") or {}).get("used_percent")
    return None


def ask(row, out, schema):
    content = row["request"]["messages"][0]["content"]
    if MODE_OLD not in content or RULE_OLD not in content:
        return {"id": row["id"], "error": "PROMPT_LINES_NOT_FOUND"}
    prompt = content.replace(MODE_OLD, MODE_CODEX).replace(RULE_OLD, RULE_CODEX)
    answer_file = out / ("%s.json" % row["id"])
    with tempfile.TemporaryDirectory() as work:
        began = time.monotonic()
        proc = subprocess.run(
            ["codex", "exec", "--skip-git-repo-check", "-m", MODEL, "-c", 'model_reasoning_effort="%s"' % EFFORT,
             "-c", 'web_search="live"', "-c", "mcp_servers={}", "-c", "notify=[]", "-s", "read-only", "-C", work,
             "--output-schema", str(schema), "-o", str(answer_file), "--json", "-"],
            input=prompt, capture_output=True, text=True, timeout=300)
        wall = time.monotonic() - began
    events = [json.loads(l) for l in proc.stdout.splitlines() if l.startswith("{")]
    usage = next((e.get("usage") for e in reversed(events) if e.get("usage")), None)
    searches = sum(1 for e in events if "web_search" in json.dumps(e.get("item") or {}) and e.get("type") == "item.completed")
    return {"id": row["id"], "category": row["category"], "video": row["video"], "status": proc.returncode,
            "wallMs": round(wall * 1000), "usage": usage, "webSearches": searches,
            "content": answer_file.read_text() if answer_file.exists() else None, "stderr": proc.stderr[-400:]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("requests")
    parser.add_argument("out")
    parser.add_argument("--only")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--ceiling", type=float, default=27.0)
    args = parser.parse_args()
    rows = json.loads(Path(args.requests).read_text())
    if args.only:
        keep = set(args.only.split(","))
        rows = [r for r in rows if r["id"] in keep]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    schema = out / "schema.json"
    schema.write_text(json.dumps(rows[0]["request"]["format"]))
    done = {json.loads(l)["id"] for l in open(out / "calls.jsonl")} if (out / "calls.jsonl").exists() else set()
    rows = [r for r in rows if r["id"] not in done]
    stop = threading.Event()

    def task(row):
        if stop.is_set():
            return None
        used = weekly_used()
        if used is not None and used >= args.ceiling:
            stop.set()
            print("plafond atteint", used, flush=True)
            return None
        result = ask(row, out, schema)
        with lock, (out / "calls.jsonl").open("a") as log:
            log.write(json.dumps(dict(result, weeklyUsedBefore=used), ensure_ascii=False) + "\n")
        print(row["id"], result.get("status"), result.get("wallMs"), "ms", result.get("webSearches"), "recherches", used, "%", flush=True)
        return result

    with concurrent.futures.ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(task, rows))
    print("quota hebdomadaire après :", weekly_used(), "%")


if __name__ == "__main__":
    main()
