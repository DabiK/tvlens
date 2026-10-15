"""Rakuten-only binding using the reviewed, pinned Magic Mapper input loop."""
import os, subprocess, sys
import managed_mapper as mapper

def open_panel(_):
    log = open('/tmp/tvlens-panel.log', 'w')
    subprocess.Popen([sys.executable or "/usr/bin/python3", os.path.join(os.path.dirname(__file__), 'panel.py')],
                     stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    log.close()

mapper.upstream.tvlens_open = open_panel
if __name__ == '__main__':
    mapper.main()
