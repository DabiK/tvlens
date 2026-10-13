"""Luna calls for the TV-side helpers. The process runner is injectable: tests never spawn luna-send."""
import json
import subprocess
import threading

def parse_reply(stdout, stderr):
    # Timing mode prefixes stderr and may pretty-print the JSON across lines.
    for stream in (stderr, stdout):
        marker = stream.find('timingServiceResponse')
        candidate = stream[marker:] if marker >= 0 else stream
        start = candidate.find('{')
        if start < 0: continue
        try:
            value, _ = json.JSONDecoder().raw_decode(candidate[start:])
            if isinstance(value, dict) and 'returnValue' in value: return value
        except json.JSONDecodeError:
            continue
    raise ValueError('No complete Luna response received')

def command(endpoint, payload, wait_ms=3000):
    # Called by name, like capture.py: a fake executable ahead in PATH stands in for the TV.
    return ['luna-send', '-t', '1', '-w', str(wait_ms), 'luna://' + endpoint, json.dumps(payload)]

def call(endpoint, payload, wait_ms=3000, timeout=5, runner=subprocess.run):
    r = runner(command(endpoint, payload, wait_ms), capture_output=True, timeout=timeout)
    return parse_reply(r.stdout.decode('utf-8', 'replace'), r.stderr.decode('utf-8', 'replace'))

class Pending:
    """A call in flight. result() is None until it settles, then the reply.

    returnValue False is a refusal by Luna; returnValue None means no reply came (timeout, missing binary):
    the caller must not read a refusal into a silence.
    """
    def __init__(self, reply=None): self.reply = reply
    def result(self): return self.reply

def spawn(endpoint, payload, wait_ms=3000, timeout=5, popen=subprocess.Popen):
    """Start a call without waiting for it: a launch must never hold the loop that closes cards."""
    pending = Pending()
    try:
        child = popen(command(endpoint, payload, wait_ms), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as error:
        return Pending({'returnValue': None, 'errorText': str(error)})
    def reap():
        try:
            out, err = child.communicate(timeout=timeout)
            pending.reply = parse_reply(out.decode('utf-8', 'replace'), err.decode('utf-8', 'replace'))
        except subprocess.TimeoutExpired:
            # Hard deadline: the child is killed and reaped, the launch counts as unanswered.
            child.kill(); child.communicate()
            pending.reply = {'returnValue': None, 'errorText': 'timeout'}
        except (ValueError, OSError) as error:
            pending.reply = {'returnValue': None, 'errorText': str(error)}
    threading.Thread(target=reap, daemon=True).start()
    return pending
