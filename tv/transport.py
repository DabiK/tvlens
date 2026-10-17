"""Bounded delivery policy, independent of LG capture and the UI."""
import json
import time
import urllib.request
import urllib.error

class SessionChanged(Exception):
    """The capture must stop: what it holds belongs to a session the server no longer feeds."""
    reason = 'session-changed'

class StorageFull(SessionChanged):
    """The server has no room left. A clean stop that says so; never reported as a network cut."""
    reason = 'storage-full'

class ReadOnly(SessionChanged):
    """The loaded session is an archive open for reading: nothing may be captured into it."""
    reason = 'read-only'

STORAGE_FULL = 'Stockage plein sur le serveur : libère de la place, puis relance la capture.'
READ_ONLY = 'Session ouverte en lecture seule. Choisis Reprendre la capture ou Nouvelle session.'

def refusal(error):
    """(status, code, message) of a request the server refused; three None for anything else (network, parsing)."""
    if not isinstance(error, urllib.error.HTTPError): return None, None, None
    try: body = json.loads(error.read(4096) or b'{}')
    except (OSError, ValueError): body = {}
    finally: error.close()
    if not isinstance(body, dict): body = {}
    return error.code, body.get('code'), body.get('error')

def drop(report, reason, count=1):
    """A lost block keeps its cause next to the total already shown by the panel."""
    report['dropped'] += count
    reasons = report.setdefault('dropReasons', {})
    reasons[reason] = reasons.get(reason, 0) + count

class Transport:
    def __init__(self, config, stop, report, changed=lambda: None):
        self.url = config['url'].rstrip('/')
        self.token = config['token']
        self.stop, self.report, self.changed = stop, report, changed

    def request(self, route, data=None, timeout=5):
        body = json.dumps(data, separators=(',', ':')).encode() if data is not None else None
        request = urllib.request.Request(self.url + route, data=body,
            headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)

    def deliver(self, item, created, ttl=30):
        deadline = created + ttl
        reason = 'deliveryExpired'
        while not self.stop.is_set() and time.monotonic() < deadline:
            try:
                state = self.request('/v1/session', timeout=max(.1, min(5, deadline-time.monotonic())))
                if state.get('id') == item['sessionId']:
                    # The server paused this very session and says why: the cause is kept, not folded into "changed".
                    if (state.get('storage') or {}).get('state') == 'blocked':
                        drop(self.report, 'storageFull')
                        raise StorageFull(STORAGE_FULL)
                    if state.get('readOnly'):
                        drop(self.report, 'readOnly')
                        raise ReadOnly(READ_ONLY)
                if state.get('id') != item['sessionId'] or not state.get('accepting'):
                    drop(self.report, 'sessionChanged')
                    raise SessionChanged('Session serveur changée ou suspendue. Redémarrage manuel requis.')
                if self.stop.is_set() or time.monotonic() >= deadline:
                    break
                self.request('/v1/segments', item, timeout=max(.1, min(5, deadline-time.monotonic())))
                self.report['connection'] = 'connected'
                self.report['sent'] += 1
                self.changed()
                return True
            except SessionChanged:
                raise
            except (OSError, ValueError) as error:
                status, code, _ = refusal(error)
                if status is not None:
                    self.report['lastRefusal'] = {'status': status, 'code': code}
                # Un refus storage-full, ou un 507 ancien sans code, exige de libérer de l'espace :
                # le retenter afficherait une coupure réseau. Un autre code sur 507 garde la reprise des 5xx.
                if code == 'storage-full' or (status == 507 and not code):
                    drop(self.report, 'storageFull')
                    raise StorageFull(STORAGE_FULL) from None
                if status == 409 and code == 'read-only':
                    drop(self.report, 'readOnly')
                    raise ReadOnly(READ_ONLY) from None
                if status is not None and status < 500 and status not in (408, 429):
                    self.report['errors'] = (self.report['errors'] + ['HTTP ' + str(status)])[-10:]
                    reason = 'deliveryRejected'
                    break
                self.report['connection'] = 'reconnecting'
                self.report['retries'] += 1
                self.changed()
                self.stop.wait(min(1, max(0, deadline-time.monotonic())))
        drop(self.report, 'stopped' if self.stop.is_set() else reason)
        self.changed()
        return False
