"""Replay archived perception requests (images included) on other vision models, one arm at a time, GPU otherwise idle.

An arm changes the model and, optionally, keeps a subset of the five images; the timestamp list written in the prompt
is reduced to the same subset so that the request stays self-consistent. Each arm is loaded (load time measured),
warmed up on a request outside the measured set, then measured on every selected block in a fixed order.
"""
import argparse
import datetime
import fcntl
import gzip
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

OLLAMA = "http://127.0.0.1:11434"
LOCKS = ["/home/nvidia/tvlens-setup/night.lock", "/home/nvidia/tvlens-setup/reference-2026-10-20/execution.lock",
         "/home/nvidia/tvlens-setup/followup-gpu.lock"]
TIMEOUT_S = 300
STAMPS = re.compile(r"horodatées \[([0-9,]+)\]")


def post(path, payload):
    request = urllib.request.Request(OLLAMA + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return response.status, json.loads(response.read()), (time.monotonic() - started) * 1000
    except urllib.error.HTTPError as error:
        return error.code, {"error": error.read().decode(errors="replace")}, (time.monotonic() - started) * 1000


def adapt(request, model, keep):
    payload = json.loads(json.dumps(request))
    payload["model"] = model
    if keep is None:
        return payload
    for message in payload["messages"]:
        images = message.get("images")
        if images:
            message["images"] = [images[i] for i in keep]
        stamps = STAMPS.search(message.get("content", ""))
        if stamps:
            values = stamps.group(1).split(",")
            kept = ",".join(values[i] for i in keep)
            message["content"] = message["content"].replace(stamps.group(0), "horodatées [%s]" % kept)
    return payload


def measure(arm, items, warmup, out):
    model, keep = arm["model"], arm.get("keepImages")
    post("/api/generate", {"model": model, "keep_alive": 0})
    load_status, load_body, load_wall = post("/api/generate", {"model": model, "prompt": "", "keep_alive": "10m"})
    warm_status, _, _ = post("/api/chat", adapt(warmup, model, keep))
    out.write(json.dumps({"arm": arm["label"], "model": model, "event": "loaded", "loadStatus": load_status,
                          "loadWallMs": round(load_wall, 1), "loadDurationNs": load_body.get("load_duration"),
                          "warmupStatus": warm_status}) + "\n")
    for item in items:
        status, body, wall = post("/api/chat", adapt(item["request"], model, keep))
        message = body.get("message") or {}
        out.write(json.dumps({"arm": arm["label"], "model": model, "block": item["id"], "status": status,
                              "wallMs": round(wall, 1),
                              "counters": {k: body.get(k) for k in ("total_duration", "load_duration", "prompt_eval_count",
                                                                     "prompt_eval_duration", "eval_count", "eval_duration")},
                              "content": message.get("content"), "error": body.get("error")}, ensure_ascii=False) + "\n")
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
    items, identities = [], {}
    for entry in plan["blocks"]:
        raw = gzip.open(entry["body"]).read()
        identities[entry["id"]] = {"body": entry["body"], "sha256": hashlib.sha256(raw).hexdigest()}
        items.append({"id": entry["id"], "request": json.loads(raw)})
    warmup = json.loads(gzip.open(plan["warmupBody"]).read())
    (out_dir / "inputs.json").write_text(json.dumps(identities, indent=1))
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (out_dir / "calls.jsonl").open("a") as out:
        for arm in plan["arms"]:
            measure(arm, items, warmup, out)
    (out_dir / "status.json").write_text(json.dumps({"startedAtUtc": started, "status": "finished", "blocks": len(items),
                                                     "finishedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat()}))
    for handle in locks:
        handle.close()


if __name__ == "__main__":
    main()
