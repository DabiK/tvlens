"""Replay captured requests under single-change arms (format, tools, options, schema, prompt), GPU otherwise idle.

Cases are captured question requests (found in proxy journals by question id) or archived perception bodies. An arm
applies exactly one declared transform. Every call gets a unique nonce line at the head of its first message so that
Ollama's prefix cache never favours a repeated request. Passes follow the preregistered order (e.g. A B C C B A);
each model change is preceded by an unload and a warm-up call that is recorded and excluded. Three consecutive errors
or the time cap stop the run; partial outputs are kept.
"""
import argparse
import copy
import datetime
import fcntl
import gzip
import json
import time
import sys
import uuid
from pathlib import Path

# Isolated mode (python3 -I) does not put the script's folder on the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import rejouer_questions as captured  # noqa: E402

LOCKS = ["/home/nvidia/tvlens-setup/night.lock", "/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock",
         "/home/nvidia/tvlens-setup/followup-gpu.lock"]
MAX_CONSECUTIVE_ERRORS = 3


def transform(request, arm, nonce):
    payload = copy.deepcopy(request)
    if arm.get("model"):
        payload["model"] = arm["model"]
    for key in arm.get("dropKeys", []):
        payload.pop(key, None)
    if arm.get("options"):
        payload["options"] = {**payload.get("options", {}), **arm["options"]}
    schema = payload.get("format") if isinstance(payload.get("format"), dict) else None
    for name in arm.get("schemaDrop", []):
        if schema:
            schema.get("properties", {}).pop(name, None)
            schema["required"] = [r for r in schema.get("required", []) if r != name]
    for name, limit in arm.get("schemaMaxLength", {}).items():
        if schema and name in schema.get("properties", {}):
            schema["properties"][name]["maxLength"] = limit
    first = payload["messages"][0]
    for start, end in arm.get("promptCut", []):
        content = first.get("content", "")
        i = content.find(start)
        j = content.find(end, i) if i >= 0 else -1
        if i >= 0 and j >= 0:
            first["content"] = content[:i] + content[j + len(end):]
    first["content"] = "[rejeu %s]\n" % nonce + first.get("content", "")
    return payload


def load_cases(plan):
    cases = []
    question_cases = [c for c in plan["cases"] if c["kind"] == "question"]
    if question_cases:
        texts = {}
        for scenario in plan["scenarios"]:
            for q in json.loads(Path(scenario).read_text())["questions"]:
                texts[q["id"]] = q["question"]
        found = captured.captured_requests(plan["journals"], texts)
    for case in plan["cases"]:
        if case["kind"] == "question":
            cases.append({"id": case["id"], "request": found[case["id"]]["request"]})
        elif case["kind"] == "prebuilt":
            requests = {arm: json.loads(Path(path).read_text()) for arm, path in case["requests"].items()}
            cases.append({"id": case["id"], "request": next(iter(requests.values())), "requests": requests})
        else:
            cases.append({"id": case["id"], "request": json.loads(gzip.open(case["body"]).read())})
    return cases


def run_call(arm, case, out, pass_index, warmup=False):
    nonce = uuid.uuid4().hex[:12]
    base = case.get("requests", {}).get(arm["label"], case["request"])
    payload = transform(base, arm, nonce)
    status, body, wall = captured.post("/api/chat", payload)
    message = body.get("message") or {}
    out.write(json.dumps({"arm": arm["label"], "pass": pass_index, "case": case["id"], "warmup": warmup, "nonce": nonce,
                          "status": status, "wallMs": round(wall, 1), "model": payload["model"],
                          "counters": {k: body.get(k) for k in ("total_duration", "load_duration", "prompt_eval_count",
                                                                 "prompt_eval_duration", "eval_count", "eval_duration")},
                          "doneReason": body.get("done_reason"), "content": message.get("content"),
                          "toolCalls": message.get("tool_calls"), "thinkingChars": len(message.get("thinking") or ""),
                          "error": body.get("error")}, ensure_ascii=False) + "\n")
    out.flush()
    return status == 200


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
    arms = {arm["label"]: arm for arm in plan["arms"]}
    cases = load_cases(plan)
    deadline = time.monotonic() + plan["capSeconds"]
    status, errors, current_model = "finished", 0, None
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (out_dir / "calls.jsonl").open("a") as out:
        for pass_index, label in enumerate(plan["order"], 1):
            arm = arms[label]
            model = arm.get("model") or cases[0]["request"]["model"]
            if model != current_model:
                if current_model:
                    captured.post("/api/generate", {"model": current_model, "keep_alive": 0})
                run_call(arm, cases[0], out, pass_index, warmup=True)
                current_model = model
            for case in cases:
                if time.monotonic() > deadline:
                    status = "cap-reached"
                    break
                errors = 0 if run_call(arm, case, out, pass_index) else errors + 1
                if errors >= MAX_CONSECUTIVE_ERRORS:
                    status = "stopped-errors"
                    break
            if status != "finished":
                break
    if current_model:
        captured.post("/api/generate", {"model": current_model, "keep_alive": 0})
    (out_dir / "status.json").write_text(json.dumps({"experiment": plan["experiment"], "status": status, "startedAtUtc": started,
                                                     "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
