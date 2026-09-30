"""Bounded delivery policy, independent of LG capture and the UI."""
import json
import time
import urllib.request
import urllib.error

class SessionChanged(Exception):
    pass

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
        while not self.stop.is_set() and time.monotonic() < deadline:
            try:
                state = self.request('/v1/session', timeout=max(.1, min(5, deadline-time.monotonic())))
                if state.get('id') != item['sessionId'] or not state.get('accepting'):
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
                if isinstance(error, urllib.error.HTTPError): error.close()
                if isinstance(error, urllib.error.HTTPError) and error.code < 500 and error.code not in (408, 429):
                    self.report['errors'] = (self.report['errors'] + ['HTTP ' + str(error.code)])[-10:]
                    break
                self.report['connection'] = 'reconnecting'
                self.report['retries'] += 1
                self.changed()
                self.stop.wait(min(1, max(0, deadline-time.monotonic())))
        self.report['dropped'] += 1
        self.changed()
        return False
