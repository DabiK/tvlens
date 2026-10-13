"""Ambient supervisor: sourced surveillance cards, bottom-left, while the panel is closed.

Root child of the local controller. It reads the server on a separate thread, decides when a card may
show, owns the display gate (one writer, under a kernel lock), grants a page the right to paint, and
launches and closes org.tvlens.ambient. It never touches video geometry and never probes the panel lock.
Shipped profile is focus "off": no window, no closed gate, nothing on the key path, until the native
protocol of docs/lg-ambient.md has been run on the TV.
"""
import argparse
import fcntl
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
import luna as luna_module

APP = 'org.tvlens.ambient'
PANEL_APP = 'org.tvlens.sidebarprobe'
YOUTUBE = 'youtube.leanback.v4'
FULL_SCREEN = {'x': 0, 'y': 0, 'width': 3840, 'height': 2160}
SCREEN = (1920, 1080)
# Logical 1920x1080 boxes, decided here and nowhere else: the page places itself with params.box.
BOXES = {'card': {'raised': (48, 628, 760, 272), 'low': (48, 768, 760, 272)},
         'pill': {'raised': (48, 844, 440, 56), 'low': (48, 984, 440, 56)}}
RECT_MARGIN = 12
# Design choices, to be tuned after the native measures (docs/lg-ambient.md).
ACK_WAIT = 5            # a launch without a paint request within this is unconfirmed
ABANDON_GRACE = 5       # a window still in flight is chased this long after an abandoned launch
DISPLAY_DEFAULT_MS, DISPLAY_CAP_MS, DISPLAY_CHOICES = 14000, 20000, (8000, 14000, 20000)
PAGE_LIFE = 21.5        # the longest a page keeps itself on screen
PILL_BRIEF, PILL_EVERY = 4, 90
GAP = 1.5
GUARD = .5
STUCK = 10
RECENT_KEY, STALE_KEY, MAPPER_BOOT, MAPPER_FRESH = 4, 20, 5, 6
PANEL_NOTICE, PANEL_RESUME, CONTEXT_STABLE = 10, 3, 8
WATCHDOG_MUTE, WATCHDOG_KILL = 15, 45
GATE_RENEW, GATE_STALE = 5, 30
QUEUE_MAX, FRESH_MS = 4, 180000
TOAST_HOLD, TOAST_EVERY = 8, 60
TOAST_TEXT = 'TV Lens · résultat sourcé disponible · Rakuten'
LIFE = 21600
OFF_AFTER = 60
# A transient refusal is retried after a bounded wait, a bounded number of times; then it sticks.
PROBATION = (30, 120, 600)
# The remote may have been taken from the viewer: never retried without an explicit restart.
FOCUS_ANOMALIES = ('relay-failed', 'key-lost-at-launch', 'relay-lossy', 'stuck-window')
GATE_STATES = ('armed', 'shown', 'closing', 'clear')
DEFAULT_CONFIG = {'focus': 'off', 'fallback': 'off', 'app': APP, 'settleMs': 700, 'closeVia': 'surface',
                  'relay': {'exempt': []}, 'trial': False, 'mapperStatus': '/tmp/tvlens-remote-state/status.json'}
DEFAULT_SETTINGS = {'alerts': True, 'displayMs': DISPLAY_DEFAULT_MS, 'activity': True, 'position': 'raised'}
COUNTERS = ('shown', 'notShown', 'skippedStale', 'skippedOverflow', 'skippedUnsourced', 'freshnessUnknown',
            'dismissedByKey', 'unconfirmed', 'keysLostToPage', 'closedUnexpectedly', 'synDropped', 'staleKeyDown',
            'pills', 'toasts')
MESSAGES = {
    'profile-off': 'Affichage panneau fermé non activé sur cette TV : validation native requise.',
    'alerts-off': 'Alertes à l’écran coupées : la surveillance continue, les résultats restent dans le panneau.',
    'app-missing': 'Application d’alertes absente de la TV : rien ne s’affiche panneau fermé.',
    'launch-unconfirmed': 'L’alerte ne s’est pas affichée : lancement non confirmé.',
    'no-relay': 'Relais de la télécommande indisponible : alertes panneau fermé suspendues.',
    'panel-outdated': 'Lanceur du panneau à mettre à jour : alertes panneau fermé suspendues.',
    'relay-failed': 'Une touche n’a pas été rendue proprement à la vidéo : alertes panneau fermé désactivées.',
    'key-lost-at-launch': 'Une touche est tombée pendant le lancement d’une alerte : alertes panneau fermé désactivées.',
    'relay-lossy': 'Le système a perdu des touches pendant une alerte : alertes panneau fermé désactivées.',
    'stuck-window': 'Une alerte ne se ferme pas : images recadrées, alertes désactivées. Touche Accueil pour la fermer.',
    'server-unsupported': 'Serveur à mettre à jour : il ne publie pas encore les alertes.',
    'server-unreachable': 'Serveur injoignable : les alertes attendent son retour.',
    'capture-not-gated': 'Capture en cours sans protection des images : aucune alerte tant qu’elle tourne.',
    'panel': 'Panneau ouvert : les alertes s’y affichent.',
    'not-fullscreen': 'Vidéo hors plein écran : alertes en pause.',
    'foreign-app': 'Alertes en pause hors de YouTube.',
    'media-transition': 'Changement de vidéo ou publicité : alertes en pause.',
    'recent-key': 'Télécommande en cours d’usage : alerte différée.',
    'key-held': 'Touche maintenue : alerte différée.',
    'luna-unavailable': 'Système de la TV muet : alerte différée.',
    'clock-unshared': 'Horloge du système non partagée entre processus : alertes panneau fermé désactivées.',
    'surveillance-off': 'Surveillance arrêtée.',
    'stopped': 'Alertes panneau fermé arrêtées.',
    'parent': 'Contrôleur TV arrêté : alertes panneau fermé arrêtées.',
    'duration': 'Durée maximale atteinte : alertes panneau fermé arrêtées.',
}
CAPTURE_ENDED = 'Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer.'
TRIAL_TEXT = 'Essai TV Lens : cette alerte se ferme seule.'

def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)

def shared_clock():
    """Key times, gate times and beats are compared across processes: that only holds when time.monotonic()
    is system-wide. It is on Linux (clock_gettime(CLOCK_MONOTONIC), the TV), and on macOS from Python 3.10;
    older macOS builds count from the start of each process, and anything else is not assumed."""
    try: implementation = time.get_clock_info('monotonic').implementation
    except (ValueError, AttributeError): return False
    return implementation.startswith('clock_gettime') or (implementation.startswith('mach_absolute_time') and sys.version_info >= (3, 10))

def read_json(path):
    try: value = json.loads(Path(path).read_text())
    except (OSError, ValueError): return None
    return value if isinstance(value, dict) else None

def write_json_atomic(path, value):
    """Readers never see a partial file: private temporary name, then rename."""
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(value, separators=(',', ':')))
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

class AmbientPaths:
    """Every runtime trace of the ambient mode. TVLENS_AMBIENT_RUN moves the whole set (tests, native trial)."""
    def __init__(self, run_dir=None, panel_layout='/tmp/tvlens-panel-layout-state.json', capture_report='/tmp/tvlens-capture-report.json'):
        root = self.root = Path(run_dir or os.environ.get('TVLENS_AMBIENT_RUN') or '/tmp')
        self.lock, self.screen = root/'tvlens-ambient.lock', root/'tvlens-screen.lock'
        self.gate, self.state = root/'tvlens-ambient-gate.json', root/'tvlens-ambient-state.json'
        self.generation, self.beat = root/'tvlens-ambient-generation', root/'tvlens-ambient-beat'
        self.ack, self.pagekey = root/'tvlens-ambient-ack.json', root/'tvlens-ambient-pagekey.json'
        self.seen, self.test = root/'tvlens-ambient-seen.json', root/'tvlens-ambient-test.json'
        self.dismiss_relay, self.dismiss_panel = root/'tvlens-ambient-dismiss-relay.json', root/'tvlens-ambient-dismiss-panel.json'
        self.keys = root/'tvlens-ambient-keys.json'
        # Written by the installed panel launcher and by capture.py: read here, never moved by the run directory.
        self.panel_layout, self.capture_report = Path(panel_layout), Path(capture_report)

def clean_config(raw):
    """ambient.json, field by field. Anything absent, unreadable or unknown falls back to the shipped default: off."""
    raw = raw if isinstance(raw, dict) else {}
    config = dict(DEFAULT_CONFIG, relay={'exempt': []})
    if raw.get('focus') in ('off', 'relay', 'passthrough'): config['focus'] = raw['focus']
    if raw.get('fallback') in ('off', 'toast'): config['fallback'] = raw['fallback']
    app = raw.get('app')
    # The panel application is never launched from here: its identifier would be mistaken for an open panel.
    if isinstance(app, str) and re.fullmatch(r'org\.tvlens\.[a-z0-9.]{1,48}', app) and app != PANEL_APP: config['app'] = app
    if number(raw.get('settleMs')): config['settleMs'] = int(min(3000, max(0, raw['settleMs'])))
    if raw.get('closeVia') in ('surface', 'page'): config['closeVia'] = raw['closeVia']
    exempt = (raw.get('relay') or {}).get('exempt') if isinstance(raw.get('relay'), dict) else None
    if isinstance(exempt, list): config['relay'] = {'exempt': [code for code in exempt if type(code) is int]}
    config['trial'] = raw.get('trial') is True
    if isinstance(raw.get('mapperStatus'), str) and raw['mapperStatus']: config['mapperStatus'] = raw['mapperStatus']
    # Probe options only travel in trial mode, and only to a probe package: the production page ignores them anyway.
    if config['trial'] and isinstance(raw.get('probe'), dict): config['probe'] = raw['probe']
    return config

def load_config(path):
    return clean_config(read_json(path) if path else None)

def clean_settings(raw):
    raw = raw if isinstance(raw, dict) else {}
    settings = dict(DEFAULT_SETTINGS)
    for key in ('alerts', 'activity'):
        if isinstance(raw.get(key), bool): settings[key] = raw[key]
    # Hard ceiling whatever the stored value says: a corrupt setting never keeps a card on screen.
    if number(raw.get('displayMs')) and raw['displayMs'] > 0: settings['displayMs'] = int(min(DISPLAY_CAP_MS, max(1000, raw['displayMs'])))
    if raw.get('position') in ('raised', 'low'): settings['position'] = raw['position']
    return settings

def load_settings(path):
    return clean_settings(read_json(path) if path else None)

def read_gate(path):
    """The display gate as a reader sees it. Anything that is not a well-formed v2 record is 'unreadable'."""
    try: raw = Path(path).read_text()
    except FileNotFoundError: return {'state': 'absent', 'epoch': 0}
    except OSError: return {'state': 'unreadable'}
    try:
        gate = json.loads(raw)
        if gate.get('v') != 2 or gate.get('state') not in GATE_STATES or type(gate.get('epoch')) is not int: raise ValueError
        rect = gate.get('rect')
        if rect is not None and not (all(type(rect.get(k)) is int and rect[k] >= 0 for k in ('x', 'y', 'width', 'height')) and rect['width'] and rect['height']): raise ValueError
        return gate
    except (ValueError, AttributeError, TypeError):
        return {'state': 'unreadable'}

def take_lock(path, wait=0, clock=time.monotonic, sleep=time.sleep):
    """Exclusive flock, never blocking. Held means its owner lives: the kernel drops it with the last
    descriptor, hence at death, and Python descriptors are not inherited by the children started here."""
    deadline = clock() + wait
    while True:
        handle = open(path, 'a')
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return handle
        except OSError:
            handle.close()
        if clock() >= deadline: return None
        sleep(.2)

class GateWriter:
    """The gate has one writer: whoever holds the owner lock. Every write moves the epoch."""
    def __init__(self, paths, lock, pid=None):
        if lock is None or lock.closed: raise RuntimeError('The display gate is only written under the owner lock')
        self.paths, self.lock, self.pid = paths, lock, pid or os.getpid()
        self.record = read_gate(paths.gate)
        # An unreadable file hides its epoch: restart far above any counter so that no two writes share one.
        self.epoch = self.record['epoch'] if 'epoch' in self.record else int(time.time())
    def write(self, state, **fields):
        if self.lock.closed: raise RuntimeError('The display gate is only written under the owner lock')
        self.epoch += 1
        record = {'v': 2, 'epoch': self.epoch, 'state': state, 'pid': self.pid}
        record.update(fields)
        write_json_atomic(self.paths.gate, record)
        self.record = record
        return record

def host_of(source):
    """Hosts only, never an address; same reading as the application (surveillance-overlay.js)."""
    if not isinstance(source, dict): return ''
    raw = source['host'] if isinstance(source.get('host'), str) else source.get('url')
    if not isinstance(raw, str): return ''
    match = re.match(r'^(?:[a-z][a-z0-9+.-]*://)?(?:[^@/?#\s]*@)?([^:/?#\s]+)', raw.strip(), re.I)
    host = re.sub(r'^www\.', '', match.group(1).lower()).rstrip('.') if match else ''
    return host if re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?', host) and host.find('.') > 0 else ''

def source_hosts(card):
    """(host, title) of every usable source; the first occurrence of a host wins."""
    hosts = []
    for source in card.get('sources') if isinstance(card.get('sources'), list) else []:
        host = host_of(source)
        if host and all(host != known for known, _ in hosts):
            hosts.append((host, source.get('title') if isinstance(source.get('title'), str) else ''))
    return hosts

def reduce_card(card, more=0):
    """What the page receives of a card: text, interval and at most three hosts. Never a URL."""
    hosts = source_hosts(card)
    text = card.get('text') if isinstance(card.get('text'), str) else ''
    interval = card.get('interval') if isinstance(card.get('interval'), dict) else {}
    return {'id': str(card.get('id') or '')[:80], 'kind': card.get('kind'), 'label': str(card.get('label') or '')[:60],
            'text': text if len(text) <= 600 else text[:599] + '…',
            'interval': {'startMs': interval.get('startMs'), 'endMs': interval.get('endMs')} if number(interval.get('startMs')) and number(interval.get('endMs')) else None,
            'sources': [{'title': title[:120], 'host': host} for host, title in hosts[:3]], 'sourceCount': len(hosts),
            'claimCount': min(99, len(card.get('claimIds') or [])) if isinstance(card.get('claimIds'), list) else 0, 'more': max(0, min(99, more))}

class AmbientQueue:
    """Which sourced cards are still owed to the screen. Same rules as the panel-open queue of the application
    (tests/fixtures/tv-overlay-queue-cases.json): signals never enter, an unsourced card is refused and counted."""
    def __init__(self, limit=QUEUE_MAX, fresh_ms=FRESH_MS):
        self.limit, self.fresh_ms = limit, fresh_ms
        self.session, self.known, self.unsettled = None, False, False
        self.cursor = {'overlay': 0, 'signals': 0}
        self.seq = self.signal_seq = 0
        # When the server was last asked, and when the cursor was placed on the session being read.
        self.asked = self.since = float('-inf')
        # Declarations of the panel: the last one taken per kind, and those the server has not settled yet.
        self.heard, self.told = {}, {}
        self.items = []
        self.counts = {name: 0 for name in ('notShown', 'skippedStale', 'skippedOverflow', 'skippedUnsourced', 'freshnessUnknown')}

    def ingest(self, data, at, show=True, checked=None):
        """One answer of GET /v1/surveillance/overlay, received at local time `at` (seconds) and confirmed
        unchanged by the server at `checked` (a later revalidation), both taken when the request left."""
        overlay = data.get('overlay') if isinstance(data.get('overlay'), dict) else {}
        signals = data.get('signals') if isinstance(data.get('signals'), dict) else {}
        seq = self.seq = overlay.get('seq') if type(overlay.get('seq')) is int else 0
        self.signal_seq = signals.get('seq') if type(signals.get('seq')) is int else 0
        self.asked = max(at, checked) if number(checked) else at
        # While the server reads the registry saved with the session, its sequences are not final (activity
        # 'restoring'): the history it then brings back was published before, it is not news.
        restoring = isinstance(data.get('activity'), dict) and data['activity'].get('state') == 'restoring'
        if not self.known or data.get('sessionId') != self.session or restoring or self.unsettled:
            # First reading of a session, or first one of its restored registry: nothing published so far is
            # replayed, and what the panel declared up to here is covered by the cursor placed now. Within one
            # session, what still waited here is counted before it goes.
            if self.known and data.get('sessionId') == self.session: self.flush()
            self.session, self.known, self.unsettled, self.items, self.told, self.heard, self.since = data.get('sessionId'), True, restoring, [], {}, {}, at
            self.cursor = {'overlay': seq, 'signals': self.signal_seq}
            return
        # Only overlay.cards are candidates: the signals block is counted for the panel, never displayed.
        if seq < self.cursor['overlay']: self.cursor['overlay'] = seq
        self.settle()
        cards = [c for c in overlay.get('cards') or [] if isinstance(c, dict) and type(c.get('seq')) is int and self.cursor['overlay'] < c['seq'] <= seq]
        cards.sort(key=lambda c: (c.get('finishedAt') if number(c.get('finishedAt')) else 0, c['seq']))
        # The server only returns its last cards: what fell in the hole was never received, and is counted.
        self.counts['skippedOverflow'] += max(0, seq - self.cursor['overlay'] - len(cards))
        now_ms = data.get('serverNowMs')
        for card in cards:
            if card.get('kind') != 'verification' or not source_hosts(card): self.counts['skippedUnsourced'] += 1; continue
            if not show: self.counts['notShown'] += 1; continue
            # Both readings come from the server clock; the TV clock only measures the time waited since.
            known = number(now_ms) and number(card.get('finishedAt'))
            age = max(0, now_ms - card['finishedAt']) if known else 0
            if not known: self.counts['freshnessUnknown'] += 1
            if age > self.fresh_ms: self.counts['skippedStale'] += 1; continue
            self.items.append({'card': card, 'age': age, 'at': at})
            if len(self.items) > self.limit: self.items.pop(0); self.counts['skippedOverflow'] += 1
        self.cursor['overlay'] = max(self.cursor['overlay'], seq)

    def seen(self, kind, session, seq, at):
        """The panel says, at local time `at`, that it showed the cards of `session` up to `seq` itself: never
        replayed here, and not counted. The numbering starts over with each session, so the declaration names
        its session and is only heard for the one being read: another session, or none, moves nothing here
        (a card skipped on a foreign word would be neither shown nor counted). Its time still places it
        within the session (settle)."""
        if not self.known or not isinstance(session, str) or session != self.session: return
        if kind not in self.cursor or type(seq) is not int or not number(at): return
        if self.heard.get(kind) == (seq, at): return
        self.heard[kind] = (seq, at)
        # Said before this reader placed its cursor on this session: already covered by it.
        if at < self.since: return
        self.told[kind] = (seq, at)
        self.settle()

    def settle(self):
        """A declaration holds once the server itself has published that far in this session; the panel may
        be ahead of this reader, so it waits. A reading asked for after it and still short of it proves it
        spoke of another numbering (a registry started over under the same session): it is dropped, and no
        card is skipped on its word."""
        reached = {'overlay': self.seq, 'signals': self.signal_seq}
        for kind, (seq, at) in list(self.told.items()):
            if reached[kind] >= seq:
                self.cursor[kind] = max(self.cursor[kind], seq)
                if kind == 'overlay': self.items = [item for item in self.items if item['card']['seq'] > seq]
            elif self.asked < at: continue
            del self.told[kind]

    def head(self, now):
        """Oldest card still fresh; a stale one met on the way is counted. Freshness keeps running while paused."""
        while self.items:
            item = self.items[0]
            if item['age'] + (now - item['at']) * 1000 <= self.fresh_ms: return item
            self.items.pop(0); self.counts['skippedStale'] += 1
        return None

    def take(self, item):
        if item in self.items: self.items.remove(item)

    def flush(self):
        """Display went away for good: what waited is counted as not shown."""
        self.counts['notShown'] += len(self.items); self.items = []

def running_captures(proc_root='/proc', default_report='/tmp/tvlens-capture-report.json'):
    """capture.py processes, found by their command line. Their lock is never probed."""
    found = []
    try: entries = sorted(Path(proc_root).iterdir())
    except OSError: return found
    for entry in entries:
        if not entry.name.isdigit(): continue
        try: args = [part.decode('utf-8', 'replace') for part in (entry/'cmdline').read_bytes().split(b'\0') if part]
        except OSError: continue
        if not any(os.path.basename(arg) == 'capture.py' for arg in args[1:4]): continue
        report = args[args.index('--report') + 1] if '--report' in args[:-1] else default_report
        found.append({'pid': int(entry.name), 'report': report})
    return found

def video_reason(luna):
    """(reason, MAIN video status). The card only lives over full-screen YouTube, the layout the panel also requires."""
    try: reply = luna.call('com.webos.service.videooutput/getStatus', {})
    except Exception: return 'luna-unavailable', None
    video = next((v for v in reply.get('video') or [] if isinstance(v, dict) and v.get('sink') == 'MAIN'), {})
    if video.get('appId') != YOUTUBE or not video.get('connected'): return 'foreign-app', video
    if video.get('displayOutput') != FULL_SCREEN: return 'not-fullscreen', video
    return None, video

def panel_reason(paths, now, panel_at=None):
    """The panel is open, announced itself less than 10 s ago, or closed less than 3 s ago.
    Its own lock is never probed: a probing flock would make a starting panel.py leave in silence."""
    layout, notice = read_json(paths.panel_layout) or {}, read_json(paths.dismiss_panel) or {}
    if layout.get('active') or (number(notice.get('atMono')) and 0 <= now - notice['atMono'] < PANEL_NOTICE): return 'panel'
    return 'panel' if panel_at is not None and now - panel_at < PANEL_RESUME else None

def key_reason(paths, now):
    keys = read_json(paths.keys)
    if keys is None: return None
    down = keys.get('down') if isinstance(keys.get('down'), dict) else {}
    # A mapper that just started does not know which keys are down.
    if number(keys.get('startedMono')) and now - keys['startedMono'] < MAPPER_BOOT: return 'recent-key'
    if any(number(at) and now - at <= STALE_KEY for at in down.values()): return 'key-held'
    return 'recent-key' if number(keys.get('lastEventMono')) and now - keys['lastEventMono'] < RECENT_KEY else None

def blocking_reason(luna, paths, clock=time.monotonic, panel_at=None, keys=True):
    """Why no card may be armed right now, or None, with the video status when Luna was asked.
    File conditions come first: Luna is only called when they all pass."""
    now = clock()
    reason = panel_reason(paths, now, panel_at) or (key_reason(paths, now) if keys else None)
    return (reason, None) if reason else video_reason(luna)

def app_listed(luna, app):
    """True or False when Luna answered, None when it could not be asked: an unknown is never an absence."""
    try: reply = luna.call('com.webos.surfacemanager/getForegroundWindowInfo', {})
    except Exception: return None
    if not reply.get('returnValue'): return None
    return any(isinstance(w, dict) and w.get('appId') == app for w in reply.get('windows') or [])

def close_app(luna, app):
    try: return bool(luna.call('com.webos.surfacemanager/closeByAppId', {'id': app}).get('returnValue'))
    except Exception: return False

def recover(luna, paths, lock, clock=time.monotonic, sleep=time.sleep, observed=None, patience=30):
    """Reopen a gate left closed by a dead owner. The caller holds the owner lock: without it nothing is written.

    Returns 'clear' (nothing to do), 'cleared', 'changed' (the gate is no longer the one observed: left alone)
    or 'stuck' (the window is still listed or Luna is mute: the gate stays closed, frames stay cropped).
    """
    gate = read_gate(paths.gate)
    if gate['state'] in ('clear', 'absent'): return 'clear'
    nonce = gate.get('nonce')
    if observed is not None and nonce != observed: return 'changed'
    writer = GateWriter(paths, lock)
    unreadable = gate['state'] == 'unreadable'
    app = gate.get('app') if isinstance(gate.get('app'), str) and gate.get('app') != PANEL_APP else APP
    started = clock()
    if not unreadable and gate.get('rect') is None:
        # A toast: no window of ours to close, it leaves by itself.
        until = (gate['shownMono'] if number(gate.get('shownMono')) else started) + TOAST_HOLD
        while clock() < until: sleep(.5)
    else:
        seen, absent, closed_at = False, 0, None
        while absent < 2:
            now = clock()
            if now - started > patience: return 'stuck'
            # Looked at before it is closed: a window seen leaving needs no safety deadline afterwards.
            listed = app_listed(luna, app)
            if listed: seen, absent = True, 0
            elif listed is False: absent += 1
            else: absent = 0
            if listed is not False and (closed_at is None or now - closed_at >= 1): close_app(luna, app); closed_at = now
            if absent < 2: sleep(.25)
        sleep(GUARD)
        if not seen:
            # A launch may still be in flight for a window nobody saw: wait out the life a page allows itself
            # (granted), or the grace of an abandoned launch, chasing a late window meanwhile.
            until = started + PAGE_LIFE if unreadable else gate['shownMono'] + PAGE_LIFE if number(gate.get('shownMono')) \
                else (gate['closingMono'] if number(gate.get('closingMono')) else started) + ABANDON_GRACE
            while clock() < until:
                if app_listed(luna, app): close_app(luna, app)
                sleep(.5)
            if app_listed(luna, app) is not False: return 'stuck'
    # Written only if the gate is still the one the decision was taken on.
    current = read_gate(paths.gate)
    if current.get('nonce') != nonce or current.get('epoch') != gate.get('epoch'): return 'changed'
    writer.write('clear', lastNonce=nonce, recovered=True, clearedMono=clock())
    return 'cleared'

def recovery_decision(lock_obtained, beat, generation, now_mono):
    """What the watchdog does this second. Ages are monotonic: neither a clock jump nor the wall time counts.

    exit: another generation owns the display. recover: the lock was free, so the owner is dead.
    close: the owner lives but has been mute for 15 s - close the window, never write the gate.
    kill: mute for 45 s. wait: nothing.
    """
    beat = beat if isinstance(beat, dict) else {}
    if beat.get('generation') != generation: return 'exit'
    if lock_obtained: return 'recover'
    if not number(beat.get('mono')): return 'wait'
    age = now_mono - beat['mono']
    return 'kill' if age > WATCHDOG_KILL else 'close' if age > WATCHDOG_MUTE else 'wait'

def owned_supervisor(pid, proc_root='/proc'):
    """Only a process whose command line names ambient.py is ever signalled."""
    try: args = (Path(proc_root)/str(int(pid))/'cmdline').read_bytes().split(b'\0')
    except (OSError, ValueError, TypeError): return False
    return int(pid) > 1 and any(os.path.basename(arg) == b'ambient.py' for arg in args[1:4]) and b'watchdog' not in args

def watchdog(generation, paths, luna, clock=time.monotonic, sleep=time.sleep, kill=os.kill, proc_root='/proc', rounds=None):
    """Separate session. It writes the gate only if it obtains the owner lock, that is only if the supervisor is dead."""
    closed_at = None
    while rounds is None or rounds > 0:
        if rounds is not None: rounds -= 1
        try: current = paths.generation.read_text()
        except OSError: current = None
        lock = take_lock(paths.lock)
        beat = dict(read_json(paths.beat) or {}, generation=current)
        decision = recovery_decision(lock is not None, beat, generation, clock())
        if decision == 'recover':
            try: return recover(luna, paths, lock, clock, sleep, observed=read_gate(paths.gate).get('nonce'))
            finally: lock.close()
        if lock is not None: lock.close()
        if decision == 'exit': return 'exit'
        if decision in ('close', 'kill') and (closed_at is None or clock() - closed_at >= 5):
            # The owner is alive: the window is closed, the gate is left exactly as it is.
            gate = read_gate(paths.gate)
            close_app(luna, gate.get('app') if isinstance(gate.get('app'), str) and gate.get('app') != PANEL_APP else APP)
            closed_at = clock()
        if decision == 'kill' and owned_supervisor(beat.get('pid'), proc_root):
            try:
                kill(int(beat['pid']), signal.SIGTERM); sleep(3)
                if owned_supervisor(beat.get('pid'), proc_root): kill(int(beat['pid']), signal.SIGKILL)
            except OSError: pass
        sleep(1)
    return 'wait'

def spawn_detached(command, env=None):
    """A helper that outlives its parent: own session, no inherited descriptor (the owner lock stays behind)."""
    return subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True, close_fds=True, env=env)

class Feed:
    """Server reader on its own thread: a slow server or a stuck name resolution never delays a close or a beat."""
    def __init__(self, connection, clock=time.monotonic, opener=urllib.request.urlopen):
        self.url, self.token = connection['url'].rstrip('/') + '/v1/surveillance/overlay', connection['token']
        self.clock, self.opener = clock, opener
        self.value, self.etag, self.interval, self.failures = None, None, 10, 0
        self.stop = threading.Event()
    def snapshot(self): return self.value
    def pace(self, seconds): self.interval = seconds
    def poll(self):
        headers = {'Authorization': 'Bearer ' + self.token}
        if self.etag: headers['If-None-Match'] = self.etag
        now = self.clock()
        try:
            with self.opener(urllib.request.Request(self.url, headers=headers), timeout=5) as response:
                data = json.load(response)
                if not isinstance(data, dict): raise ValueError('Unexpected overlay answer')
                self.etag = response.headers.get('ETag')
                self.value, self.failures = {'ok': True, 'data': data, 'at': now, 'checked': now}, 0
        except urllib.error.HTTPError as error:
            error.close()
            if error.code == 304 and self.value and self.value.get('ok'): self.value, self.failures = dict(self.value, checked=now), 0
            # The deployed server may predate the route: said as such, not as a network failure.
            elif error.code == 404: self.value, self.etag, self.failures = {'ok': False, 'reason': 'server-unsupported', 'checked': now}, None, self.failures + 1
            else: self.value, self.etag, self.failures = {'ok': False, 'reason': 'server-unreachable', 'detail': 'HTTP ' + str(error.code), 'checked': now}, None, self.failures + 1
        except (OSError, ValueError) as error:
            self.value, self.etag, self.failures = {'ok': False, 'reason': 'server-unreachable', 'detail': type(error).__name__, 'checked': now}, None, self.failures + 1
    def run(self):
        while not self.stop.is_set():
            self.poll()
            self.stop.wait(min(15, self.interval * (1 + self.failures)) if self.failures else self.interval)

class Supervisor:
    """One card at a time: arm the gate, launch, grant, show, close, verify, reopen. step() never sleeps."""
    def __init__(self, luna, fetch, clock=time.monotonic, sleep=time.sleep, paths=None, settings=None, config=None, lock=None,
                 wall=time.time, proc_root='/proc', control='http://127.0.0.1:8788', token=None, parent_pid=0, ppid=os.getppid,
                 generation=None, pace=None, pid=None, shared=None):
        self.luna, self.fetch, self.clock, self.sleep, self.wall = luna, fetch, clock, sleep, wall
        self.paths, self.config = paths or AmbientPaths(), clean_config(config)
        self.settings_source, self.settings = settings or (lambda: None), dict(DEFAULT_SETTINGS)
        self.gate = GateWriter(self.paths, lock, pid)
        self.lock, self.pid = lock, pid or os.getpid()
        self.proc_root, self.control, self.token = proc_root, control, token or (lambda: secrets.token_hex(16))
        self.parent_pid, self.ppid, self.generation, self.pace = parent_pid, ppid, generation or uuid.uuid4().hex, pace or (lambda seconds: None)
        self.focus = self.config['focus']
        self.shared = shared_clock() if shared is None else shared
        self.queue = AmbientQueue()
        self.counts = {name: 0 for name in COUNTERS}
        self.card = self.screen = self.sticky = self.probation = self.exit_reason = self.last_shown = None
        self.strikes, self.notices, self.stale_seen = {}, [], set()
        self.status, self.reason = 'idle', None
        self.started = clock()
        self.next_at = self.panel_at = self.context_at = self.probed_at = self.beat_at = self.published_at = self.pill_at = self.toast_at = self.capture_at = float('-inf')
        self.context = self.server = self.feed = self.activity = self.test_id = self.off_since = self.pill_due = None
        self.enabled = self.accepting = self.focus_violation = self.toast_failed = self.capture_noticed = False
        self.storage = None
        self.unconfirmed_run = 0
        self.capture = {'active': False, 'gated': None, 'stopReason': None, 'stopMessage': None, 'overlay': {'cropped': 0, 'withheld': 0}, 'gateStale': False, 'limits': None}
        self.published = None
        self.block = self.last = None
        # Without a clock common to the mapper, the panel and this process, no card may ever be armed.
        if self.focus != 'off' and not self.shared: self.sticky = 'clock-unshared'

    # --- life ---------------------------------------------------------------------------------------------
    def declare(self):
        """Generation and first beat. The watchdog leaves at once when the file names another generation than
        its own: both are written before it is started, never after."""
        self.paths.generation.write_text(self.generation)
        self.beat(force=True)

    def start(self):
        """A gate inherited closed (dead owner, earlier profile) is reopened before anything else, off included."""
        self.declare()
        if read_gate(self.paths.gate)['state'] not in ('clear', 'absent'):
            recover(self.wrapped(), self.paths, self.lock, self.clock, self.sleep)
            self.gate = GateWriter(self.paths, self.lock, self.pid)
        self.publish(force=True)

    def wrapped(self):
        """Luna as recover() sees it: every blocking call is preceded by a beat."""
        owner = self
        class Beating:
            def call(self, endpoint, payload): owner.beat(force=True); return owner.luna.call(endpoint, payload)
        return Beating()

    def exit(self, reason):
        if not self.exit_reason: self.exit_reason = reason

    def run(self):
        self.start()
        # Shipped profile: nothing can be due, so the loop only keeps the counters and the state fresh.
        rest = 2 if self.focus == 'off' and self.config['fallback'] != 'toast' else .5
        while not self.exit_reason:
            self.step()
            self.sleep(.1 if self.card else rest)
        self.shutdown()

    def shutdown(self, patience=8):
        """Every exit takes the same path: close the card, check it is gone, reopen the gate, give the screen back.
        Bounded: what cannot be verified in time is left closed for `ambient.py recover`, never opened on a guess."""
        deadline = self.clock() + patience
        if self.card and self.card['phase'] not in ('closing', 'toast'): self.close(self.clock(), 'exit')
        while self.card and self.clock() < deadline:
            self.advance(self.clock())
            if self.card: self.sleep(.25)
        if self.screen: self.screen.close(); self.screen = None
        self.status, self.reason = 'stopped', self.exit_reason or 'stopped'
        self.publish(force=True)
        try: self.paths.generation.write_text('')
        except OSError: pass

    def beat(self, force=False):
        """Proves the loop advances, not only that the process lives (the lock already proves that)."""
        now = self.clock()
        if not force and now - self.beat_at < 1: return
        self.beat_at = now
        try: write_json_atomic(self.paths.beat, {'generation': self.generation, 'mono': now, 'pid': self.pid})
        except OSError: pass

    # --- one turn -----------------------------------------------------------------------------------------
    def step(self):
        now = self.clock()
        self.beat()
        self.inputs(now)
        if self.card: self.advance(now)
        elif not self.exit_reason: self.consider(now)
        self.publish()

    def inputs(self, now):
        self.settings = clean_settings(self.settings_source())
        if self.parent_pid and self.ppid() != self.parent_pid: self.exit('parent')
        if now - self.started >= LIFE: self.exit('duration')
        # What the panel declared, session by session, read before the server: a declaration ahead of this
        # reader is settled by the very reading that follows. The queue only hears the session it reads; a file
        # without sessions (an earlier controller) says nothing. The time is the controller's: without a clock
        # common to both processes it cannot be placed, and a result counted though the panel showed it is
        # better than one skipped in silence.
        seen = (read_json(self.paths.seen) or {}) if self.shared else {}
        for session, record in (seen['sessions'] if isinstance(seen.get('sessions'), dict) else {}).items():
            said = record.get('atMono') if isinstance(record, dict) and isinstance(record.get('atMono'), dict) else {}
            for kind in ('overlay', 'signals'): self.queue.seen(kind, session, record.get(kind) if isinstance(record, dict) else None, said.get(kind))
        if not self.config['trial']: self.absorb(self.fetch(), now)
        test = read_json(self.paths.test) or {}
        if test.get('id') and test['id'] != self.test_id:
            self.test_id = test['id']
            # A request older than this run was meant for another supervisor.
            if number(test.get('atMono')) and test['atMono'] >= self.started - 30 and self.mode(now) != 'off':
                self.notices.append({'element': 'notice', 'local': 'test', 'card': {'id': 'essai-' + str(test['id'])[:12], 'kind': 'notice', 'label': 'TV Lens', 'text': TRIAL_TEXT}})
        if now - self.capture_at >= (2 if self.card or self.mode(now) != 'off' else 10):
            self.capture_at = now
            self.capture = self.capture_view()
            ended = self.enabled and not self.config['trial'] and not self.capture['active']
            # Announced once per end, and only by the profiles that display: profile off says it in the state alone.
            if ended and not self.capture_noticed and self.mode(now) == 'card':
                self.notices.append({'element': 'notice', 'local': 'capture', 'card': {'id': 'capture', 'kind': 'notice', 'label': 'TV Lens', 'text': CAPTURE_ENDED}})
            self.capture_noticed = ended
        self.late_reports(now)
        if not self.accepts(): self.queue.flush()
        self.counts.update(self.queue.counts)

    def late_reports(self, now):
        """The relay may finish, and a page key may arrive, after the gate has reopened: still a focus anomaly."""
        last = self.last
        if not last: return
        relay, pagekey = read_json(self.paths.dismiss_relay) or {}, read_json(self.paths.pagekey) or {}
        if not last['relay'] and relay.get('nonce') == last['nonce'] and relay.get('phase') == 'done':
            last['relay'] = True
            if relay.get('failed'): self.fail('relay-failed', now)
        if not last['pagekey'] and pagekey.get('nonce') == last['nonce']:
            last['pagekey'] = True
            self.counts['keysLostToPage'] += 1
            if not last['granted']: self.fail('key-lost-at-launch', now)
            elif self.focus == 'passthrough': self.focus, self.focus_violation = 'relay', True
            else: self.fail('relay-failed', now)

    def absorb(self, feed, now):
        if not feed: return
        if not feed.get('ok'):
            self.server = feed.get('reason') or 'server-unreachable'
            return
        self.server = None
        data = feed['data']
        if feed is not self.feed:
            self.feed = feed
            self.queue.ingest(data, feed.get('at', now), show=self.accepts(), checked=feed.get('checked'))
            activity = data.get('activity') if isinstance(data.get('activity'), dict) else {}
            before = self.activity or {}
            # Relay profile: a brief pill when verification starts, and once when the activity turns late.
            if activity.get('state') == 'verifying' and before.get('state') != 'verifying' and now - self.pill_at >= PILL_EVERY: self.pill_due = now
            if activity.get('late') and not before.get('late'): self.pill_due = now
            self.activity = activity
            self.enabled, self.accepting = bool(data.get('enabled')) and bool(data.get('sessionId')), bool(data.get('accepting'))
            self.storage = (data.get('storage') or {}).get('state') if isinstance(data.get('storage'), dict) else None
        # Outside trial mode nothing keeps this process alive once the surveillance is off.
        if self.enabled: self.off_since = None
        elif self.off_since is None: self.off_since = now
        elif now - self.off_since >= OFF_AFTER and not self.card and not self.notices: self.exit('surveillance-off')

    def capture_view(self):
        """What the capture says of itself. A running capture must read this very gate, or nothing is displayed."""
        running = [(c, read_json(c['report']) or {}) for c in running_captures(self.proc_root, str(self.paths.capture_report))]
        report = running[0][1] if running else read_json(self.paths.capture_report) or {}
        gated = all(r.get('gate') == 1 and r.get('pid') == c['pid'] and r.get('gatePath') == str(self.paths.gate) for c, r in running) if running else None
        # A capture that runs but that the server refuses feeds nothing: said as an end, with its cause.
        reason = report.get('stopReason') or 'stopped' if not running else None
        if self.storage == 'blocked': reason = 'storage-full'
        elif running and self.enabled and not self.accepting: reason = 'session-paused'
        return {'active': bool(running) and reason is None, 'gated': gated, 'stopReason': reason, 'stopMessage': report.get('stopMessage') if not running else None,
                'overlay': {'cropped': report.get('framesCropped') or 0, 'withheld': report.get('framesWithheld') or 0},
                'gateStale': bool(report.get('gateStale')), 'limits': report.get('limits') if isinstance(report.get('limits'), dict) else None}

    # --- deciding -----------------------------------------------------------------------------------------
    def accepts(self):
        """Whether a new card has any chance to reach the screen; otherwise it is counted as not shown."""
        capable = self.focus in ('relay', 'passthrough') and not self.sticky
        return self.settings['alerts'] and (capable or (self.config['fallback'] == 'toast' and not self.toast_failed))

    def mode(self, now):
        if self.probation and now >= self.probation['until']: self.probation = None
        if not self.settings['alerts']: return 'off'
        if self.focus in ('relay', 'passthrough') and not self.sticky and not self.probation: return 'card'
        return 'toast' if self.config['fallback'] == 'toast' and not self.toast_failed else 'off'

    def fail(self, reason, now):
        """Focus anomalies stick until an explicit restart. The others get a bounded probation, then stick too."""
        strike = self.strikes.get(reason, 0)
        if reason in FOCUS_ANOMALIES or strike >= len(PROBATION):
            self.sticky = self.sticky or reason
            self.queue.flush()
            return
        self.strikes[reason] = strike + 1
        self.probation = {'reason': reason, 'until': now + PROBATION[strike], 'strike': strike + 1, 'max': len(PROBATION)}

    def rest(self, status, reason=None):
        self.status, self.reason = status, reason

    def candidate(self, now, mode):
        if self.notices: return self.notices[0]
        if not self.server and not self.config['trial']:
            item = self.queue.head(now)
            if item: return {'element': 'card', 'item': item, 'card': item['card']}
        activity = self.activity or {}
        if mode != 'card' or not self.settings['activity'] or self.server or self.config['trial'] or not activity.get('label'): return None
        active = activity.get('state') in ('detecting', 'verifying', 'late')
        # Passthrough keeps the pill while something runs; relay only flashes it, or it would hold the focus.
        if self.focus == 'passthrough': return {'element': 'pill', 'persistent': True} if active else None
        if self.pill_due is not None and now - self.pill_due <= 10: return {'element': 'pill', 'persistent': False}
        return None

    def consider(self, now):
        if not self.settings['alerts']: return self.rest('disabled', 'alerts-off')
        mode = self.mode(now)
        why = self.sticky or (self.probation or {}).get('reason') or ('profile-off' if self.focus == 'off' else None)
        # Off: the server is still read (slowly) so that the panel can say how many results were not shown.
        if mode == 'off': self.pace(10); return self.rest('disabled', why)
        self.pace(2)
        item = self.candidate(now, mode)
        if not item:
            if self.server and not self.config['trial']: return self.rest('paused' if self.server == 'server-unreachable' else 'disabled', self.server)
            return self.rest('idle', why if mode == 'toast' else None)
        if now < self.next_at: return
        reason = self.blocked(now, mode)
        if reason:
            if reason == 'foreign-app': self.pace(10)
            return self.rest('disabled' if reason == (self.probation or {}).get('reason') or reason == self.sticky else 'paused', reason)
        if mode == 'toast': return self.toast(now, item)
        self.arm(now, item)

    def blocked(self, now, mode):
        """Pauses lift by themselves. Luna is asked once a second at most, and only when something is due."""
        if now - self.probed_at < 1 and self.block: return self.block
        self.probed_at = now
        self.block = self.block_reason(now, mode)
        return self.block

    def block_reason(self, now, mode):
        if mode == 'card':
            status = read_json(self.config['mapperStatus']) or {}
            fresh = number(status.get('updatedMono')) and 0 <= now - status['updatedMono'] <= MAPPER_FRESH
            capable = status.get('active') and fresh and number(status.get('ambientRelay')) and status['ambientRelay'] >= 2 and read_json(self.paths.keys) is not None
            relay = 'no-relay' if not capable else None if status.get('panelYield') == 1 else 'panel-outdated'
            if relay: self.fail(relay, now); return relay
        # Looked up again right before a card or a toast: a capture started since the last look must read this
        # very gate, or its frames would carry what is about to be displayed.
        self.capture = self.capture_view()
        if self.capture['gated'] is False: return 'capture-not-gated'
        if self.panel_active(now): self.panel_at = now
        self.keys(now)
        self.beat(force=True)
        # A toast takes no focus: keys do not defer it.
        reason, video = blocking_reason(self.luna, self.paths, self.clock, self.panel_at, keys=mode == 'card')
        if not reason:
            if self.context is not None and video.get('context') != self.context: self.context_at = now
            self.context = video.get('context')
            if now - self.context_at < CONTEXT_STABLE: reason = 'media-transition'
        return reason

    def panel_noticed(self, now):
        notice = read_json(self.paths.dismiss_panel) or {}
        return number(notice.get('atMono')) and 0 <= now - notice['atMono'] < PANEL_NOTICE

    def panel_active(self, now):
        return bool((read_json(self.paths.panel_layout) or {}).get('active')) or self.panel_noticed(now)

    def keys(self, now):
        """Key state published by the mapper relay. An entry of `down` silent for 20 s is a missed release: ignored, counted."""
        raw = read_json(self.paths.keys) or {}
        down = {}
        for code, at in (raw.get('down') if isinstance(raw.get('down'), dict) else {}).items():
            if number(at) and now - at <= STALE_KEY: down[code] = at
            elif (code, at) not in self.stale_seen: self.stale_seen.add((code, at)); self.counts['staleKeyDown'] += 1
        if number(raw.get('synDropped')): self.counts['synDropped'] = raw['synDropped']
        return {'down': down, 'last': raw.get('lastEventMono') if number(raw.get('lastEventMono')) else 0, 'seq': raw.get('seq'),
                'started': raw.get('startedMono') if number(raw.get('startedMono')) else 0, 'syn': raw.get('synDropped') if number(raw.get('synDropped')) else 0}

    # --- one card -----------------------------------------------------------------------------------------
    def arm(self, now, item):
        screen = take_lock(self.paths.screen)
        if screen is None: self.panel_at = now; return self.rest('paused', 'panel')   # the panel holds the screen
        self.screen = screen
        element = item['element']
        x, y, width, height = BOXES['pill' if element == 'pill' else 'card'][self.settings['position']]
        box = {'x': x, 'y': y, 'width': width, 'height': height}
        left, top = max(0, x - RECT_MARGIN), max(0, y - RECT_MARGIN)
        rect = {'x': left, 'y': top, 'width': min(SCREEN[0], x + width + RECT_MARGIN) - left, 'height': min(SCREEN[1], y + height + RECT_MARGIN) - top}
        nonce = self.token()
        fields = {'nonce': nonce, 'app': self.config['app'], 'element': element, 'profile': self.focus, 'settleMs': self.config['settleMs'],
                  'closeVia': self.config['closeVia'], 'rect': rect, 'armedMono': now}
        # Closed BEFORE any launch: from here every frame is cropped above the box.
        self.gate.write('armed', **fields)
        keys = self.keys(self.clock())
        self.card = {'item': item, 'element': element, 'nonce': nonce, 'fields': fields, 'phase': 'armed', 'armed': now, 'launched': False,
                     'seen': False, 'seq': keys['seq'], 'syn': keys['syn'], 'renewed': now, 'probed': float('-inf'), 'fail': None}
        self.rest('arming')
        # The mapper publishes its keys before reading the gate; the gate is written before the keys are read
        # again here. One of the two saw the other: a key around the arming aborts before any launch.
        late = self.clock()
        if keys['down'] or late - keys['last'] < RECENT_KEY or self.panel_active(late):
            return self.finish(late, 'key-held' if keys['down'] else 'panel' if self.panel_active(late) else 'recent-key')
        display = PILL_BRIEF * 1000 if element == 'pill' and not item.get('persistent') else DISPLAY_CAP_MS if element == 'pill' else self.settings['displayMs']
        self.card['display'] = min(DISPLAY_CAP_MS, display) / 1000
        params = {'v': 1, 'nonce': nonce, 'control': self.control, 'element': element, 'profile': self.focus, 'box': box, 'displayMs': int(self.card['display'] * 1000)}
        activity = self.activity or {}
        if activity.get('label'): params['activity'] = {'label': str(activity['label'])[:160], 'waiting': activity.get('waiting') if type(activity.get('waiting')) is int else 0, 'late': bool(activity.get('late'))}
        if element != 'pill': params['card'] = item['card'] if item.get('local') else reduce_card(item['card'], max(0, len(self.queue.items) - 1))
        if self.config.get('probe'): params['probe'] = self.config['probe']
        self.beat(force=True)
        self.card['launch'] = self.luna.spawn('com.webos.applicationManager/launch', {'id': self.config['app'], 'params': params})
        self.card['launched'], self.card['phase'] = True, 'launched'

    def grant(self, now):
        """The right to paint. Whoever decides is whoever writes: no reading-then-deciding across two processes."""
        card = self.card
        self.gate.write('shown', **dict(card['fields'], shownMono=now))
        card.update(phase='showing', shown=now, renewed=now)
        item = card['item']
        if item in self.notices: self.notices.remove(item)
        if item.get('item'): self.queue.take(item['item'])
        if card['element'] == 'pill': self.counts['pills'] += 1; self.pill_at, self.pill_due = now, None
        elif not item.get('local'):
            self.counts['shown'] += 1
            self.last_shown = {'id': item['card'].get('id'), 'seq': item['card'].get('seq'), 'atMs': int(self.wall() * 1000)}
        self.rest('showing')
        # The page asked, so its window exists. Seen listed now, it will need no safety deadline when it leaves.
        self.beat(force=True)
        if app_listed(self.luna, self.config['app']): card['seen'] = True

    def close(self, now, reason, fail=None):
        card = self.card
        card.update(phase='closing', reason=reason, closing=now, absent=0, closed_at=now, fail=card.get('fail') or fail)
        card.pop('absent_at', None)
        self.gate.write('closing', **dict(card['fields'], closingMono=now, **({'shownMono': card['shown']} if 'shown' in card else {})))
        self.beat(force=True)
        close_app(self.luna, self.config['app'])

    def advance(self, now):
        card = self.card
        if card['phase'] == 'toast':
            if now >= card['until']: self.finish(now, 'elapsed')
            return
        if card['phase'] == 'closing': return self.verify(now)
        nonce = card['nonce']
        relay, pagekey = read_json(self.paths.dismiss_relay) or {}, read_json(self.paths.pagekey) or {}
        keys = self.keys(now)
        if card['phase'] == 'launched':
            launch = card['launch'].result()
            if launch is not None and launch.get('returnValue') is False: return self.close(now, 'app-missing', 'app-missing')
            # Any of these refuses the paint: the window still in flight is born empty and closes itself.
            if relay.get('nonce') == nonce: return self.close(now, 'key')
            if pagekey.get('nonce') == nonce: self.counts['keysLostToPage'] += 1; card['pagekey'] = True; return self.close(now, 'page-key', 'key-lost-at-launch')
            if keys['seq'] != card['seq'] or keys['last'] >= card['armed'] or keys['down']: return self.close(now, 'key')
            if self.panel_active(now): return self.close(now, 'panel')
            ack = read_json(self.paths.ack) or {}
            if ack.get('nonce') == nonce and now - card['armed'] <= ACK_WAIT: return self.grant(now)
            if now - card['armed'] >= ACK_WAIT: self.counts['unconfirmed'] += 1; return self.close(now, 'unconfirmed')
            return
        # showing
        if relay.get('nonce') == nonce:
            self.counts['dismissedByKey'] += 1
            return self.close(now, 'key', 'relay-failed' if relay.get('failed') else None)
        if pagekey.get('nonce') == nonce:
            # The page got a key YouTube should have had. Passthrough is disproved: fall back to the relay, for good.
            self.counts['keysLostToPage'] += 1; card['pagekey'] = True
            if self.focus == 'passthrough': self.focus, self.focus_violation = 'relay', True; return self.close(now, 'page-key')
            return self.close(now, 'page-key', 'relay-failed')
        if self.panel_active(now): return self.close(now, 'panel')
        if not self.settings['alerts']: return self.close(now, 'alerts-off')
        if now >= card['shown'] + card['display']: return self.close(now, 'elapsed')
        item = card['item']
        if card['element'] == 'pill' and item.get('persistent') and ((self.activity or {}).get('state') not in ('detecting', 'verifying', 'late') or self.notices or self.queue.head(now)):
            return self.close(now, 'elapsed')
        if now - card['renewed'] >= GATE_RENEW:
            card['renewed'] = now
            self.gate.write('shown', **dict(card['fields'], shownMono=card['shown'], renewedMono=now))
        if self.capture['gated'] is False: return self.close(now, 'capture-not-gated')
        if now - card['probed'] < 1: return
        card['probed'] = now
        self.beat(force=True)
        reason, video = video_reason(self.luna)
        if reason in ('foreign-app', 'not-fullscreen'): return self.close(now, reason)
        if video is not None and self.context is not None and video.get('context') != self.context:
            # Advertisement or next video: closed at this very check, without waiting for the display time.
            self.context, self.context_at = video.get('context'), now
            return self.close(now, 'media-transition')
        self.beat(force=True)
        listed = app_listed(self.luna, self.config['app'])
        if listed: card['seen'] = True
        elif listed is False and card['seen']:
            # Gone without being asked: a key the page took, the Home key, or a crash. Not a proof of a clean hand-back.
            self.counts['closedUnexpectedly'] += 1
            return self.close(now, 'vanished', 'relay-failed' if self.focus == 'relay' else None)

    def verify(self, now):
        """Reopened only after: closeByAppId, two absences in a row, the guard, and the safety deadline of a
        launch whose window nobody saw. While the window is listed the gate stays closed."""
        card = self.card
        if now - card['probed'] < (.5 if 'absent_at' in card else .25): return
        card['probed'] = now
        self.beat(force=True)
        listed = app_listed(self.luna, self.config['app']) if card['launched'] else False
        if listed is not False:
            card['absent'] = 0; card.pop('absent_at', None)
            if listed:
                card['seen'] = True
                if now - card['closed_at'] >= 1: card['closed_at'] = now; self.beat(force=True); close_app(self.luna, self.config['app'])
            if now - card['closing'] >= STUCK:
                # Nothing more is shown; the gate stays closed, so frames stay cropped, and the state says why.
                self.sticky = 'stuck-window'; self.queue.flush(); self.rest('disabled', 'stuck-window')
            return
        card['absent'] += 1
        if card['absent'] < 2 and card['launched']: return
        card.setdefault('absent_at', now)
        if card['launched'] and now - card['absent_at'] < GUARD: return
        if card['launched'] and not card['seen']:
            if now < (card['shown'] + PAGE_LIFE if 'shown' in card else card['closing'] + ABANDON_GRACE): return
        self.finish(now, card['reason'])

    def finish(self, now, reason):
        card, self.card = self.card, None
        self.gate.write('clear', lastNonce=card['nonce'], clearedMono=now)
        if self.screen: self.screen.close(); self.screen = None
        self.next_at = now + GAP
        if card.get('phase') == 'toast': return
        keys = self.keys(now)
        relay = read_json(self.paths.dismiss_relay) or {}
        mine = relay.get('nonce') == card['nonce']
        done = mine and relay.get('phase') == 'done'
        if done and relay.get('failed'): card['fail'] = card['fail'] or 'relay-failed'
        # The kernel dropped events while the relay was blocking: a loss is declared, never assumed harmless.
        if mine and keys['syn'] > card['syn']: card['fail'] = card['fail'] or 'relay-lossy'
        self.last = {'nonce': card['nonce'], 'granted': 'shown' in card, 'relay': done, 'pagekey': bool(card.get('pagekey'))}
        if reason == 'unconfirmed':
            self.unconfirmed_run += 1
            if self.unconfirmed_run >= 3: self.unconfirmed_run = 0; card['fail'] = card['fail'] or 'launch-unconfirmed'
        elif reason == 'elapsed': self.unconfirmed_run, self.strikes = 0, {}
        self.rest('paused', reason) if reason in ('panel', 'key-held', 'recent-key', 'media-transition', 'foreign-app', 'not-fullscreen', 'capture-not-gated') else self.rest('idle')
        if reason == 'panel': self.panel_at = now
        if card['fail']: self.fail(card['fail'], now)
        if self.sticky or self.probation: self.rest('disabled', self.sticky or self.probation['reason'])

    def toast(self, now, item):
        """Fallback, off by default: a system toast that only says a result waits in the panel. Its position is
        unknown, so the gate closes without a rectangle: frames taken meanwhile are withheld and declared."""
        if now - self.toast_at < TOAST_EVERY: return self.rest('idle', self.reason)
        nonce = self.token()
        fields = {'nonce': nonce, 'app': None, 'element': 'toast', 'profile': self.focus, 'rect': None, 'armedMono': now}
        self.gate.write('armed', **fields)
        self.beat(force=True)
        try: accepted = bool(self.luna.call('com.webos.notification/createToast', {'sourceId': 'tvlens', 'message': TOAST_TEXT}).get('returnValue'))
        except Exception: accepted = False
        if not accepted:
            # Refused: last rung, display off with an explicit state. No toast was drawn, the gate reopens at once.
            self.toast_failed = True
            self.gate.write('clear', lastNonce=nonce, clearedMono=self.clock())
            return self.rest('disabled', self.sticky or 'profile-off')
        self.gate.write('shown', **dict(fields, shownMono=now))
        self.card = {'phase': 'toast', 'nonce': nonce, 'until': now + TOAST_HOLD, 'fail': None}
        self.toast_at = now
        self.counts['toasts'] += 1
        if item in self.notices: self.notices.remove(item)
        # One toast announces every result waiting: none of them was shown, and each is counted as such.
        self.queue.flush()
        self.rest('showing')

    # --- published state ----------------------------------------------------------------------------------
    def snapshot(self, now):
        mode = 'off' if self.exit_reason else self.mode(now)
        reason = self.reason
        if self.status == 'disabled' and not reason: reason = self.sticky or 'profile-off'
        return {'v': 2, 'pid': self.pid, 'status': self.status, 'reason': reason, 'message': MESSAGES.get(reason, ''),
                'focus': self.focus, 'configured': self.config['focus'], 'mode': mode, 'trial': self.config['trial'], 'windowApp': self.config['app'],
                'sessionId': self.queue.session, 'cursor': dict(self.queue.cursor), 'queue': len(self.queue.items),
                'counts': dict(self.counts), 'lastShown': self.last_shown, 'capture': self.capture,
                # Signals never reach this display: only their number is told, for the panel to show them.
                'signalsInPanel': max(0, self.queue.signal_seq - self.queue.cursor['signals']),
                'probation': dict(self.probation, remainingMs=int(max(0, self.probation['until'] - now) * 1000)) if self.probation else None,
                'sticky': self.sticky, 'focusViolation': self.focus_violation, 'server': self.server, 'storage': self.storage}

    def publish(self, force=False):
        now = self.clock()
        state = self.snapshot(now)
        comparable = dict(state, probation=self.probation)
        if not force and comparable == self.published and now - self.published_at < 5: return
        self.published, self.published_at = comparable, now
        try: write_json_atomic(self.paths.state, dict(state, updatedAt=int(self.wall())))
        except OSError: pass

def recover_entry(paths=None, luna=luna_module):
    """`ambient.py recover`: run by the controller when its child is gone and the gate is not clear."""
    paths = paths or AmbientPaths()
    lock = take_lock(paths.lock)
    if lock is None: return 0   # an owner lives: the gate is his
    try: recover(luna, paths, lock)
    finally: lock.close()
    return 0

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    os.umask(0o077)
    if argv[:1] == ['watchdog'] and len(argv) == 2:
        watchdog(argv[1], AmbientPaths(), luna_module); return 0
    if argv == ['recover']: return recover_entry()
    parser = argparse.ArgumentParser(description='TV Lens ambient supervisor')
    parser.add_argument('--config', required=True)
    parser.add_argument('--ambient-config', default=None)
    parser.add_argument('--settings', default=None)
    parser.add_argument('--parent-pid', type=int, default=0)
    parser.add_argument('--control-port', type=int, default=8788)
    args = parser.parse_args(argv)
    paths = AmbientPaths()
    # A recovery may be finishing: retried for a while, never blocking, never forced.
    lock = take_lock(paths.lock, wait=10)
    if lock is None: return 1
    base = Path(args.config).parent
    config = load_config(args.ambient_config or base/'ambient.json')
    settings_path = args.settings or base/'ambient-settings.json'
    feed = None
    if not config['trial']:
        # Trial mode never reads the distant server: its connection file may point nowhere.
        feed = Feed(json.loads(Path(args.config).read_text()))
        threading.Thread(target=feed.run, daemon=True).start()
    supervisor = Supervisor(luna_module, feed.snapshot if feed else (lambda: None), paths=paths, settings=lambda: read_json(settings_path), config=config, lock=lock,
                            control='http://127.0.0.1:%d' % args.control_port, parent_pid=args.parent_pid, pace=feed.pace if feed else None)
    signal.signal(signal.SIGTERM, lambda *_: supervisor.exit('stopped'))
    signal.signal(signal.SIGINT, lambda *_: supervisor.exit('stopped'))
    # Shipped profile: no window is ever launched, so nothing needs watching and no extra process runs.
    if config['focus'] != 'off' or config['fallback'] == 'toast':
        supervisor.declare()
        spawn_detached([sys.executable or '/usr/bin/python3', os.path.abspath(__file__), 'watchdog', supervisor.generation])
    try: supervisor.run()
    except BaseException:
        supervisor.exit('error'); supervisor.shutdown()
        raise
    finally:
        if feed: feed.stop.set()
        lock.close()
    return 0

if __name__ == '__main__':
    sys.exit(main())
