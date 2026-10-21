"""Measuring pass-through proxy between TVLens and Ollama, one listening port per role.

Each request is forwarded unchanged to the upstream Ollama. One JSON line per call records the role, wall and
monotonic times, the request (images replaced by their SHA-256 and size), the full response and Ollama's own
counters (prompt_eval_count/duration, eval_count/duration, load_duration). Nothing is rewritten.
"""
import argparse
import gzip
import hashlib
import itertools
import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM_TIMEOUT_S = 600
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


def make_handler(role, upstream, journal):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def relay(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else None
            started_wall, started = time.time(), time.monotonic()
            request = urllib.request.Request(upstream + self.path, data=body, method=self.command)
            for key in ("Content-Type", "Authorization"):
                if self.headers.get(key):
                    request.add_header(key, self.headers[key])
            try:
                with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT_S) as response:
                    status, data, ctype = response.status, response.read(), response.headers.get("Content-Type")
            except urllib.error.HTTPError as error:
                status, data, ctype = error.code, error.read(), error.headers.get("Content-Type")
            elapsed_ms = (time.monotonic() - started) * 1000
            self.send_response(status)
            self.send_header("Content-Type", ctype or "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            relayed_ms = (time.monotonic() - started) * 1000
            self.record(body, data, status, started_wall, elapsed_ms, relayed_ms)

        def record(self, body, data, status, started_wall, elapsed_ms, relayed_ms):
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
                           "body": journal.keep_body(role, body) if self.command == "POST" else None,
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
    args = parser.parse_args()
    journal = Journal(args.journal, args.body_dir, args.body_role)
    servers = []
    for spec in args.role:
        role, port = spec.split("=")
        server = ThreadingHTTPServer(("127.0.0.1", int(port)), make_handler(role, args.upstream, journal))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
    print(json.dumps({"listening": args.role, "upstream": args.upstream}), flush=True)
    threading.Event().wait()


if __name__ == "__main__":
    main()
