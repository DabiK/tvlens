"""Rakuten-only binding using the reviewed, pinned Magic Mapper input loop."""
import json, os, subprocess, sys
import managed_mapper as mapper

AMBIENT_CONFIG = '/media/developer/tvlens-companion/ambient.json'

def open_panel(_):
    log = open('/tmp/tvlens-panel.log', 'w')
    subprocess.Popen([sys.executable or "/usr/bin/python3", os.path.join(os.path.dirname(__file__), 'panel.py')],
                     stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    log.close()

def install_ambient(path=None):
    """Put the ambient relay on the key path only when ambient.json asks for an experimental profile.

    Absent, unreadable or focus "off" (shipped default): no hook, the loop is the one of before. Whatever goes
    wrong here leaves the remote exactly as it was. panelYield tells the supervisor that this panel launcher
    knows the screen lock and the ambient notice.
    """
    mapper.key_hook, mapper.status_extra = None, {'ambientRelay': 0, 'panelYield': 1}
    try:
        with open(path or os.environ.get('TVLENS_AMBIENT_CONFIG') or AMBIENT_CONFIG) as handle:
            config = json.load(handle)
        if config.get('focus') not in ('relay', 'passthrough'): return False
        from ambient_relay import Relay
        exempt = (config.get('relay') or {}).get('exempt') or []
        mapper.key_hook = Relay(exempt=exempt if isinstance(exempt, list) else []).on_event
        mapper.status_extra = {'ambientRelay': 2, 'panelYield': 1}
        return True
    except Exception:
        mapper.key_hook, mapper.status_extra = None, {'ambientRelay': 0, 'panelYield': 1}
        return False

mapper.upstream.tvlens_open = open_panel
if __name__ == '__main__':
    install_ambient()
    mapper.main()
