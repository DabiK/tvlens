"""Replay the exact question requests captured by the proxy on other models, one model at a time, GPU otherwise idle.

Only the "model" field changes (and "think" is dropped if a model refuses it, which is recorded). Each model is first
unloaded-and-loaded (load time measured), warmed up on a request outside the measured set, then measured on every
captured initial request in a fixed shuffled order. A tool call in the reply is recorded, not executed.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import random
import time
import urllib.error
import urllib.request
from pathlib import Path

OLLAMA = "http://127.0.0.1:11434"
LOCKS = ["/home/nvidia/tvlens-setup/night.lock", "/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock",
         "/home/nvidia/tvlens-setup/followup-gpu.lock"]
TIMEOUT_S = 300


def post(path, payload):
    request = urllib.request.Request(OLLAMA + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            body = json.loads(response.read())
            return response.status, body, (time.monotonic() - started) * 1000
    except urllib.error.HTTPError as error:
        return error.code, {"error": error.read().decode(errors="replace")}, (time.monotonic() - started) * 1000


def captured_requests(journals, questions):
    """Initial question request of each scenario question, found by its text in the captured prompt."""
    found = {}
    for journal in journals:
        for line in Path(journal).read_text().splitlines():
            row = json.loads(line)
            if row["role"] != "questions" or row["path"] != "/api/chat" or row["status"] != 200:
                continue
            content = "\n".join(m.get("content", "") for m in row["request"]["messages"])
            for qid, text in questions.items():
                if text in content and qid not in found:
                    found[qid] = {"request": row["request"], "baseline": row["counters"], "journal": journal,
                                  "toolCallsInBaseline": bool((row["response"].get("message") or {}).get("tool_calls"))}
    return found


def call(model, request, think_supported, think=None):
    payload = dict(request, model=model)
    if think is not None:
        payload["think"] = think
    if not think_supported:
        payload.pop("think", None)
    status, body, wall = post("/api/chat", payload)
    return status, body, wall


def measure_model(arm, items, warmup, order, out):
    model, think, label = arm["model"], arm.get("think"), arm["label"]
    post("/api/generate", {"model": model, "keep_alive": 0})
    load_status, load_body, load_wall = post("/api/generate", {"model": model, "prompt": "", "keep_alive": "10m"})
    think_supported = True
    status, body, _ = call(model, warmup, True, think)
    if status != 200 and "think" in json.dumps(body).lower():
        think_supported = False
        status, body, _ = call(model, warmup, False, think)
    out.write(json.dumps({"arm": label, "model": model, "think": think, "event": "loaded", "loadStatus": load_status, "loadWallMs": round(load_wall, 1),
                          "loadDurationNs": load_body.get("load_duration"), "warmupStatus": status,
                          "thinkSupported": think_supported}) + "\n")
    for qid in order:
        status, body, wall = call(model, items[qid]["request"], think_supported, think)
        message = body.get("message") or {}
        out.write(json.dumps({"arm": label, "model": model, "think": think, "questionId": qid, "status": status, "wallMs": round(wall, 1),
                              "counters": {k: body.get(k) for k in ("total_duration", "load_duration", "prompt_eval_count",
                                                                     "prompt_eval_duration", "eval_count", "eval_duration")},
                              "content": message.get("content"), "toolCalls": message.get("tool_calls"),
                              "thinkingChars": len(message.get("thinking") or ""), "error": body.get("error")},
                             ensure_ascii=False) + "\n")
        out.flush()
    post("/api/generate", {"model": model, "keep_alive": 0})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    plan = json.loads(Path(args.plan).read_text())
    out_dir = Path(args.out)
    out_dir.mkdir()
    locks = []
    for path in LOCKS:
        handle = open(path, "a+")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    questions = {}
    for scenario in plan["scenarios"]:
        for q in json.loads(Path(scenario).read_text())["questions"]:
            questions[q["id"]] = q["question"]
    items = captured_requests(plan["journals"], questions)
    missing = sorted(set(questions) - set(items))
    order = sorted(items, key=lambda q: hashlib.sha256((plan["seed"] + q).encode()).hexdigest())
    warmup = dict(items[order[0]]["request"])
    warmup["messages"] = [{"role": "user", "content": "Réponds en JSON : quelle heure est-il ? Dis que tu ne sais pas."}]
    (out_dir / "inputs.json").write_text(json.dumps({"order": order, "missing": missing, "items": items}, ensure_ascii=False))
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (out_dir / "calls.jsonl").open("a") as out:
        for arm in plan["arms"]:
            measure_model(arm, items, warmup, order, out)
    (out_dir / "status.json").write_text(json.dumps({"startedAtUtc": started, "finishedAtUtc":
                                                     datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                                     "questions": len(order), "missing": missing, "status": "finished"}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
