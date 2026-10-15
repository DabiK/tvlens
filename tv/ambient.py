"""Primitives de lecture du gate encore utilisées par la capture."""
import json
import os
from pathlib import Path

# Géométrie conservée pour les fixtures du lecteur de gate.
BOXES = {'card': {'raised': (48, 628, 760, 272), 'low': (48, 768, 760, 272)},
         'pill': {'raised': (48, 844, 440, 56), 'low': (48, 984, 440, 56)}}
RECT_MARGIN = 12
GATE_STALE = 30
GATE_STATES = ('armed', 'shown', 'closing', 'clear')

class AmbientPaths:
    def __init__(self, run_dir=None):
        root = Path(run_dir or os.environ.get('TVLENS_AMBIENT_RUN') or '/tmp')
        self.gate = root/'tvlens-ambient-gate.json'

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
