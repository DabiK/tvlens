"""Measuring pass-through proxy between TVLens and Ollama, one listening port per role.

Each request is forwarded unchanged to the upstream Ollama, unless a prototype rewrite is enabled for a role with
--rewrite role=two-phase: on the first turn of a question (format and tools present, no tool result yet) the JSON
format is dropped so that the model may call its tools; if it answers without a tool call, the original request is
sent again and that answer is returned. With --rewrite role=journal (or journal+two-phase), every question request
also receives a compact journal of the older passages seen by the vision role of the same proxy (transcript, plus a
visual line when the topic changes), placed before the recent passages. With --rewrite vlm=no-topic-summary, the
cumulative topicSummary field is removed from the vision schema and its paragraph from the prompt (TVLens then
stores no topic summary). Every rewrite decision is journalled. One JSON line per call records the role, wall and
monotonic times, the request (images replaced by their SHA-256 and size), the full response and Ollama's own
counters (prompt_eval_count/duration, eval_count/duration, load_duration). Nothing is rewritten.
"""
import argparse
import gzip
import hashlib
import itertools
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_TIMEOUT_S = 600
BLOCK_MS = 8000
JOURNAL_CHAR_CAP = 10000
TRANSCRIPT = re.compile(r'Transcription locale \(potentiellement imprécise\) : "(.*?)"\. Intervalle (\d+)–(\d+) ms', re.S)
FENCE = re.compile(r"(<<<TVLENS-[0-9a-f]+\n)(.*?)(\nTVLENS-[0-9a-f]+>>>)", re.S)
PERCEIVED = {}
PERCEIVED_LOCK = threading.Lock()


def remember_block(body, data):
    """Keep what the vision role saw for each block, so that a later question can receive the older passages."""
    try:
        request, output = json.loads(body), json.loads(json.loads(data)["message"]["content"])
        found = TRANSCRIPT.search(request["messages"][0].get("content", ""))
    except (TypeError, ValueError, KeyError):
        return
    if found:
        with PERCEIVED_LOCK:
            PERCEIVED[int(found.group(2))] = {"startMs": int(found.group(2)), "endMs": int(found.group(3)),
                                              "transcript": found.group(1).strip(), "visual": output.get("visual", ""),
                                              "topic": output.get("topic", "")}


TOPIC_RULE = ("Le champ distinct topicSummary", "recopié dans summary, visual ou transcript.")


def without_topic_summary(body):
    """Drop the cumulative topicSummary from the vision schema and prompt; return (body, changed)."""
    try:
        payload = json.loads(body)
        schema = payload["format"]
        message = payload["messages"][0]
    except (TypeError, ValueError, KeyError):
        return body, False
    schema.get("properties", {}).pop("topicSummary", None)
    schema["required"] = [name for name in schema.get("required", []) if name != "topicSummary"]
    content = message.get("content", "")
    start = content.find(TOPIC_RULE[0])
    end = content.find(TOPIC_RULE[1], start) if start >= 0 else -1
    if start >= 0 and end >= 0:
        message["content"] = content[:start] + content[end + len(TOPIC_RULE[1]):]
    return json.dumps(payload, ensure_ascii=False).encode(), start >= 0 and end >= 0


def with_journal(body):
    """Insert the compact journal of older perceived blocks into the question context; return (body, injected count)."""
    try:
        payload = json.loads(body)
        content = payload["messages"][0]["content"]
        fence = FENCE.search(content)
        data = json.loads(fence.group(2))
    except (TypeError, ValueError, KeyError, AttributeError):
        return body, 0
    context = data["context"]
    recent = {p["id"] for p in context.get("passages", [])}
    with PERCEIVED_LOCK:
        older = [b for k, b in sorted(PERCEIVED.items()) if b["endMs"] <= context.get("anchorMs", 0)
                 and "moment-%d" % (k // BLOCK_MS + 1) not in recent]
    lines, previous_topic = [], None
    for index, block in enumerate(older):
        text = block["transcript"] or "(pas de parole transcrite)"
        if block["visual"] and (index < 2 or block["topic"] != previous_topic):
            text += "\nImage : " + block["visual"][:300]
        previous_topic = block["topic"]
        lines.append({"id": "moment-%d" % (block["startMs"] // BLOCK_MS + 1), "startMs": block["startMs"], "endMs": block["endMs"],
                      "text": text, "precision": "compact-journal", "available": True})
    while sum(len(p["text"]) for p in lines) > JOURNAL_CHAR_CAP and len(lines) > 3:
        del lines[2 + (len(lines) - 3) // 2]
    context["passages"] = lines + context.get("passages", [])
    context["omittedCount"] = max(0, context.get("omittedCount", 0) - len(lines))
    payload["messages"][0]["content"] = content[:fence.start(2)] + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + \
        content[fence.end(2):]
    return json.dumps(payload, ensure_ascii=False).encode(), len(lines)
COUNTERS = ("total_duration", "load_duration", "prompt_eval_count", "prompt_eval_duration", "eval_count",
            "eval_duration")


def strip_images(payload):
    """Replace base64 images by digests so the log stays small but proves which frames were sent."""
    for message in payload.get("messages", []) if isinstance(payload, dict) else []:
        images = message.get("images")
        if isinstance(images, list):
            message["images"] = [{"sha256": hashlib.sha256(i.encode()).hexdigest(), "chars": len(i)} for i in images]
    return payload


class Journal:
    def __init__(self, path, body_dir=None, body_roles=()):
        self.lock = threading.Lock()
        self.handle = open(path, "a", buffering=1)
        self.body_dir, self.body_roles = body_dir, set(body_roles)
        self.counter = itertools.count(1)
        if body_dir:
            os.makedirs(body_dir, exist_ok=True)

    def keep_body(self, role, body):
        """Archive the exact request (images included) so a component can be replayed on another model."""
        if not body or not self.body_dir or role not in self.body_roles:
            return None
        name = "%s-%06d.json.gz" % (role, next(self.counter))
        with gzip.open(os.path.join(self.body_dir, name), "wb") as handle:
            handle.write(body)
        return {"file": name, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}

    def write(self, record):
        with self.lock:
            self.handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def forward(upstream, method, path, body, headers):
    request = urllib.request.Request(upstream + path, data=body, method=method)
    for key in ("Content-Type", "Authorization"):
        if headers.get(key):
            request.add_header(key, headers[key])
    try:
        with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT_S) as response:
            return response.status, response.read(), response.headers.get("Content-Type")
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers.get("Content-Type")


def two_phase(upstream, path, body, headers):
    """Prototype: first question turn without the JSON format; fall back to the original request if no tool is called."""
    try:
        payload = json.loads(body)
    except (TypeError, ValueError):
        return forward(upstream, "POST", path, body, headers) + ({"rewrite": "none"},)
    first_turn = payload.get("format") and payload.get("tools") and not any(m.get("role") == "tool" for m in payload.get("messages", []))
    if not first_turn:
        return forward(upstream, "POST", path, body, headers) + ({"rewrite": "none"},)
    free = dict(payload)
    free.pop("format")
    status, data, ctype = forward(upstream, "POST", path, json.dumps(free).encode(), headers)
    try:
        calls = (json.loads(data).get("message") or {}).get("tool_calls")
    except ValueError:
        calls = None
    if status == 200 and calls:
        return status, data, ctype, {"rewrite": "format-dropped", "toolCalls": len(calls)}
    status, data, ctype = forward(upstream, "POST", path, body, headers)
    return status, data, ctype, {"rewrite": "fallback-original", "freeStatus": status}


def make_handler(role, upstream, journal, rewrite=None):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def relay(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else None
            started_wall, started = time.time(), time.monotonic()
            decision, sent = None, body
            modes = set((rewrite or "").split("+"))
            if "no-topic-summary" in modes and self.command == "POST" and self.path == "/api/chat":
                sent, changed = without_topic_summary(body)
                decision = {"topicSummaryRemoved": changed}
            if "journal" in modes and self.command == "POST" and self.path == "/api/chat":
                sent, injected = with_journal(body)
                decision = {"journalPassages": injected}
            if "two-phase" in modes and self.command == "POST" and self.path == "/api/chat":
                status, data, ctype, phase = two_phase(upstream, self.path, sent, self.headers)
                decision = {**(decision or {}), **phase}
            else:
                status, data, ctype = forward(upstream, self.command, self.path, sent, self.headers)
            if role == "vlm" and self.command == "POST" and status == 200:
                remember_block(body, data)
            elapsed_ms = (time.monotonic() - started) * 1000
            self.send_response(status)
            self.send_header("Content-Type", ctype or "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            relayed_ms = (time.monotonic() - started) * 1000
            self.record(body, data, status, started_wall, elapsed_ms, relayed_ms, decision)

        def record(self, body, data, status, started_wall, elapsed_ms, relayed_ms, decision=None):
            try:
                request_json = strip_images(json.loads(body)) if body else None
            except ValueError:
                request_json = {"unparsed": len(body)}
            try:
                response_json = json.loads(data)
            except ValueError:
                response_json = {"unparsed": len(data)}
            counters = {k: response_json.get(k) for k in COUNTERS} if isinstance(response_json, dict) else {}
            journal.write({"role": role, "method": self.command, "path": self.path, "status": status,
                           "startedAtUnix": started_wall, "upstreamMs": round(elapsed_ms, 3),
                           "relayedMs": round(relayed_ms, 3), "counters": counters,
                           "body": journal.keep_body(role, body) if self.command == "POST" else None, "rewrite": decision,
                           "request": request_json, "response": response_json})

        do_GET = do_POST = do_DELETE = do_HEAD = relay

    return Handler


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", default="http://127.0.0.1:11434")
    parser.add_argument("--journal", required=True)
    parser.add_argument("--role", action="append", required=True, help="role=port, e.g. questions=11502")
    parser.add_argument("--body-dir", help="archive full request bodies of --body-role roles here")
    parser.add_argument("--body-role", action="append", default=[])
    parser.add_argument("--rewrite", action="append", default=[], help="role=two-phase (prototype)")
    args = parser.parse_args()
    journal = Journal(args.journal, args.body_dir, args.body_role)
    rewrites = dict(spec.split("=", 1) for spec in args.rewrite)
    servers = []
    for spec in args.role:
        role, port = spec.split("=")
        server = ThreadingHTTPServer(("127.0.0.1", int(port)), make_handler(role, args.upstream, journal, rewrites.get(role)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
    print(json.dumps({"listening": args.role, "upstream": args.upstream}), flush=True)
    threading.Event().wait()


if __name__ == "__main__":
    main()
