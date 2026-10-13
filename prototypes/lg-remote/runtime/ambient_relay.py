"""Key relay of the ambient display, called from the mapper input loop (experimental profiles only).

While an ambient card holds the keyboard focus, the first key announces the close, closes the card, checks
that it is gone, then lets the loop forward that key. Two rules carry everything else:

- One transmission. The hook never writes to the output device. It returns None (the loop forwards the
  event as it is, once) or 'swallow'. A key cannot be doubled, and nothing forwarded is read back.
- Write yours, then read the other's. The key state is published BEFORE the gate is read; the supervisor
  writes the gate BEFORE it reads the key state again. One of the two always sees the other.

A failed close never keeps a key, the hook never blocks beyond its budget, and any exception gives the key
back. The pointer does not come through this device: it is not covered (docs/lg-ambient.md, I10).
"""
from __future__ import print_function

import json
import os
import subprocess
import time

from panel import parse_reply

BACK, POWER, SYN_DROPPED = 412, 116, 3
BUDGET = 2.5          # longest a key is held with the default guard
BUDGET_CEILING = 4.8  # only reached by the guard values of the native sweep (settleMs above 700)
PURSUIT = 6.0         # a window launched in flight is chased this long after the first key
RELEASE_GAP = 0.08    # same gap as the clean Back replay of the mapper
PUBLISH_EVERY = 0.5   # repeats and wheel steps are not written one by one


class Budget(Exception):
    pass


def luna_call(endpoint, payload, timeout):
    wait_ms = max(100, int(timeout * 1000) - 200)
    done = subprocess.run(["/usr/bin/luna-send", "-t", "1", "-w", str(wait_ms), "luna://" + endpoint, json.dumps(payload)],
                          capture_output=True, timeout=timeout)
    return parse_reply(done.stdout.decode("utf-8", "replace"), done.stderr.decode("utf-8", "replace"))


def luna_fire(endpoint, payload):
    """Sent and not waited for: the power key must never be delayed by a card."""
    return subprocess.Popen(["/usr/bin/luna-send", "-t", "1", "-w", "3000", "luna://" + endpoint, json.dumps(payload)],
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def write_json(path, value):
    # One writer (this process, one thread): a private temporary name and a rename are enough.
    temporary = "%s.%d.tmp" % (path, os.getpid())
    with open(temporary, "w") as handle:
        json.dump(value, handle)
    os.rename(temporary, path)


class Relay(object):
    def __init__(self, run_dir=None, luna=luna_call, clock=time.monotonic, sleep=time.sleep, exempt=(), fire=luna_fire):
        root = run_dir or os.environ.get("TVLENS_AMBIENT_RUN") or "/tmp"
        self.gate_path = os.path.join(root, "tvlens-ambient-gate.json")
        self.keys_path = os.path.join(root, "tvlens-ambient-keys.json")
        self.notice_path = os.path.join(root, "tvlens-ambient-dismiss-relay.json")
        self.luna, self.fire, self.clock, self.sleep = luna, fire, clock, sleep
        self.exempt = set(code for code in exempt if type(code) is int and code != BACK)
        self.started = clock()
        self.down, self.seq, self.last_event, self.syn_dropped = {}, 0, 0, 0
        self.published_at = float("-inf")
        self.nonce, self.first_at, self.dismissed = None, 0, False
        self.swallowed, self.press_sent, self.fired = set(), {}, []
        # Written once at start: the supervisor learns that a relay lives, and since when.
        try:
            self.publish_keys()
        except (IOError, OSError):
            pass

    # --- what the supervisor reads ------------------------------------------------------------------------
    def publish_keys(self):
        self.published_at = self.clock()
        write_json(self.keys_path, {"v": 1, "pid": os.getpid(), "startedMono": self.started, "seq": self.seq,
                                    "down": dict((str(code), at) for code, at in self.down.items()),
                                    "lastEventMono": self.last_event, "synDropped": self.syn_dropped})

    def notice(self, nonce, phase, started, code, **more):
        value = {"nonce": nonce, "phase": phase, "atMono": started, "code": code}
        value.update(more)
        write_json(self.notice_path, value)

    def read_gate(self):
        """The closed gate of a window of ours, or None. An unreadable gate never keeps a key."""
        try:
            with open(self.gate_path) as handle:
                gate = json.load(handle)
            if gate.get("v") == 2 and gate.get("state") in ("armed", "shown", "closing") \
                    and isinstance(gate.get("nonce"), str) and isinstance(gate.get("app"), str):
                return gate
        except (IOError, OSError, ValueError, AttributeError):
            pass
        return None

    # --- Luna, always inside the budget -------------------------------------------------------------------
    def close(self, app, timeout):
        if timeout <= 0:
            raise Budget()
        try:
            return bool(self.luna("com.webos.surfacemanager/closeByAppId", {"id": app}, timeout).get("returnValue"))
        except Exception:
            return False

    def listed(self, app, timeout):
        """True or False when Luna answered, None when it did not: an unknown is never an absence."""
        if timeout <= 0:
            raise Budget()
        try:
            reply = self.luna("com.webos.surfacemanager/getForegroundWindowInfo", {}, timeout)
        except Exception:
            return None
        if not reply.get("returnValue"):
            return None
        return any(isinstance(window, dict) and window.get("appId") == app for window in reply.get("windows") or [])

    def announce(self, gate, code, started):
        """Written before any Luna call: from here the supervisor refuses the paint for this card."""
        self.notice(gate["nonce"], "intent", started, code)

    def dismiss(self, gate, code, started, verify=True):
        """Announce, close, wait, check again. The key leaves afterwards whatever happened here."""
        nonce, app = gate["nonce"], gate["app"]
        settle = gate.get("settleMs", 700)
        settle = min(3000, max(0, settle if type(settle) in (int, float) else 700)) / 1000.0
        budget = max(BUDGET, min(BUDGET_CEILING, settle + 1.8))
        deadline = started + budget
        steps = [["intent", started]]
        closed, failed = False, None
        left = lambda: deadline - self.clock()
        mark = lambda name: steps.append([name, self.clock()])
        self.announce(gate, code, started)
        try:
            if gate.get("closeVia") == "page" and verify:
                # The page closes itself as soon as its wait answers: it is given 600 ms before the surface is closed.
                gone, until = False, min(deadline, started + 0.6)
                while not gone and self.clock() < until:
                    gone = self.listed(app, min(0.5, left())) is False
                    if not gone:
                        self.sleep(0.1)
                mark("page")
                if not gone and not self.close(app, min(1.2, left())):
                    failed = "close"
            elif not self.close(app, min(1.2, left())):
                failed = "close"
            mark("close")
            if verify:
                if settle > 0:
                    self.sleep(max(0, min(settle, left())))
                mark("settled")
                listed = self.listed(app, min(1.0, left()))
                mark("checked")
                if listed:
                    self.close(app, min(1.2, left()))
                    self.sleep(max(0, min(0.3, left())))
                    listed = self.listed(app, min(1.0, left()))
                    mark("checked-again")
                    if listed:
                        failed = "still-listed"
                if listed is False:
                    closed, failed = True, None
                elif listed is None:
                    failed = failed or "close"
            else:
                closed = failed is None
        except Budget:
            failed = "budget"
        if not closed and self.clock() - started >= budget:
            failed = "budget"
        self.notice(nonce, "done", started, code, closed=closed, failed=failed,
                    elapsedMs=int((self.clock() - started) * 1000), steps=steps)

    def pursue(self, gate, code, started):
        """A launch was in flight when the first key came: the window may be born after the close."""
        app = gate["app"]
        try:
            if self.listed(app, 1.0):
                self.dismiss(gate, code, started)
        except Budget:
            pass

    # --- the hook -----------------------------------------------------------------------------------------
    def on_event(self, event_type, code, value):
        """None: the loop forwards the event, once. 'swallow': it does not. Never raises."""
        try:
            return self.handle(event_type, code, value)
        except Exception:
            return None

    def handle(self, event_type, code, value):
        now = self.clock()
        if event_type == 0:
            if code == SYN_DROPPED:
                # The kernel queue overflowed while nobody read: events are lost, the key state is unknown.
                # A release may be among them: nothing stays marked as swallowed or as just pressed, or the
                # next Back, pressed with no card on screen, would be kept from the video application.
                self.syn_dropped += 1
                self.down.clear()
                self.swallowed.clear()
                self.press_sent.clear()
                self.publish_keys()
            return None
        if event_type not in (1, 2):
            return None
        key = event_type == 1
        # 1. Bookkeeping first, published before the gate is read.
        if key and value == 0:
            self.down.pop(code, None)
        elif key:
            self.down[code] = now
        self.last_event = now
        self.seq += 1
        if (key and value in (0, 1)) or now - self.published_at >= PUBLISH_EVERY:
            self.publish_keys()
        # A press swallowed for a card keeps its repeats and its release, even once the gate has reopened:
        # the mapper would otherwise replay a clean Back that the viewer meant for the card.
        # A new press of that code means its release was never seen: it is a key of its own, decided below.
        if key and value == 1:
            self.swallowed.discard(code)
        if key and code in self.swallowed:
            if value == 0:
                self.swallowed.discard(code)
            return "swallow"
        # 2. The gate.
        gate = self.read_gate()
        if gate is None:
            if key and value == 0:
                self.press_sent.pop(code, None)
            return None
        if gate["nonce"] != self.nonce:
            self.nonce, self.first_at, self.dismissed = gate["nonce"], now, False
        back = key and code == BACK
        relay = gate.get("profile") == "relay"
        if key and code in self.exempt:
            return None
        if back and relay and gate.get("element") != "pill" and not self.dismissed:
            # Back on a card closes it and stops there: the only key the relay does not forward, by decision.
            # A pill is not worth a key: there Back closes and is forwarded like any other.
            self.dismissed = True
            self.dismiss(gate, code, now, verify=False)
            if value != 0:
                self.swallowed.add(code)
            return "swallow"
        if not relay or (key and code == POWER):
            # Passthrough: the window holds no focus, only Back closes it, and Back is never swallowed.
            # Power: announced and closed without waiting, then forwarded at once.
            if not self.dismissed and (back or relay):
                self.dismissed = True
                self.announce(gate, code, now)
                self.fired = [child for child in self.fired if child.poll() is None]
                self.fired.append(self.fire("com.webos.surfacemanager/closeByAppId", {"id": gate["app"]}))
            return None
        if not self.dismissed:
            self.dismissed = True
            self.dismiss(gate, code, now)
        elif now - self.first_at <= PURSUIT and ((key and value == 1) or event_type == 2):
            # Presses and wheel steps only: a release held here would turn a short press of a bound key
            # (Rakuten) into a long one.
            self.pursue(gate, code, now)
        if key and value == 1:
            self.press_sent[code] = self.clock()
        elif key and value == 0:
            # A release queued right behind a held press: the application still sees a real keypress.
            sent = self.press_sent.pop(code, None)
            if sent is not None and self.clock() - sent < RELEASE_GAP:
                self.sleep(RELEASE_GAP - (self.clock() - sent))
        return None
