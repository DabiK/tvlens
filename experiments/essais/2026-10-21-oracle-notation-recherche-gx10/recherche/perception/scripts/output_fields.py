"""Longueur en caractères des champs produits par la perception (lecture seule).
Usage : python3 -I output_fields.py <campaign.json>...
"""
import json, sys

def q(xs, p):
    xs = sorted(xs)
    r = (len(xs) - 1) * p; lo = int(r); hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (r - lo)

for f in sys.argv[1:]:
    d = json.load(open(f))
    seen = {}
    def find(o):
        if isinstance(o, dict):
            obs = o.get('observation')
            if isinstance(obs, dict) and 'visual' in obs and 'summary' in obs and o.get('id'):
                ts = o.get('topicSummary')
                tst = ts.get('text') if isinstance(ts, dict) else (ts if isinstance(ts, str) else '')
                seen[o['id']] = (obs, tst or '')
            for v in o.values(): find(v)
        elif isinstance(o, list):
            for v in o: find(v)
    find(d)
    print(f, 'moments avec observation visuelle :', len(seen))
    fields = ['summary', 'visual', 'topic', 'uncertainty']
    for k in fields:
        xs = [len(o.get(k) or '') for o, _ in seen.values()]
        print(f'  {k:12s} p50={q(xs,.5):6.0f} p90={q(xs,.9):6.0f} max={max(xs):6.0f}')
    xs = [len(t) for _, t in seen.values()]
    print(f'  topicSummary p50={q(xs,.5):6.0f} p90={q(xs,.9):6.0f} max={max(xs):6.0f}')
