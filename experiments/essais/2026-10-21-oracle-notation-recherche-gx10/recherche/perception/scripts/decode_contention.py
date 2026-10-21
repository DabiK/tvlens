"""Part des appels vision ralentis (débit de décodage < seuil) et coût associé (lecture seule).
Usage : python3 -I decode_contention.py <campaign.json>...
"""
import json, sys

def calls(d):
    out = {}
    def find(o):
        if isinstance(o, dict):
            if 'framesSent' in o and isinstance(o.get('providerTimings'), dict):
                t = o['providerTimings']
                out[(t.get('rawNs', {}).get('total_duration'), t.get('evalTokens'))] = (o, t)
            for v in o.values(): find(v)
        elif isinstance(o, list):
            for v in o: find(v)
    find(d)
    return list(out.values())

tot = slow = 0; over8 = 0; slow_over8 = 0; ev_all = []; ev_slow = []
for f in sys.argv[1:]:
    for o, t in calls(json.load(open(f))):
        if not t.get('evalMs'): continue
        rate = t['evalTokens'] / (t['evalMs'] / 1000)
        tot += 1
        is_slow = rate < 45
        slow += is_slow
        if t['totalMs'] > 8000:
            over8 += 1; slow_over8 += is_slow
print(f'appels={tot} décodage<45 tok/s={slow} ({100*slow/tot:.1f} %) ; appels >8 s={over8}, dont ralentis={slow_over8}')
