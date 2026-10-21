"""Extrait, en lecture seule, les métriques fournisseur des appels de perception d'un campaign.json.
Usage : python3 -I vision_tokens.py <campaign.json>...
"""
import json, sys, statistics as st

def find(o, out, path=''):
    if isinstance(o, dict):
        if 'framesSent' in o and 'providerTimings' in o and isinstance(o.get('providerTimings'), dict):
            out.append((path, o))
        for k, v in o.items():
            find(v, out, path + '/' + k)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            find(v, out, path + f'[{i}]')

def q(xs, p):
    xs = sorted(xs)
    if not xs: return None
    r = (len(xs) - 1) * p
    lo = int(r); hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (r - lo)

for f in sys.argv[1:]:
    d = json.load(open(f))
    out = []
    find(d, out)
    seen = {}
    for path, m in out:
        t = m['providerTimings']
        key = (t.get('rawNs', {}).get('total_duration'), t.get('promptTokens'), t.get('evalTokens'))
        seen.setdefault(key, m)
    ms = list(seen.values())
    def col(fn):
        return [fn(m) for m in ms if fn(m) is not None]
    ev = col(lambda m: m['providerTimings'].get('evalTokens'))
    pt = col(lambda m: m['providerTimings'].get('promptTokens'))
    pe = col(lambda m: m['providerTimings'].get('promptEvalMs'))
    em = col(lambda m: m['providerTimings'].get('evalMs'))
    tot = col(lambda m: m['providerTimings'].get('totalMs'))
    req = col(lambda m: (m.get('clientTimings') or {}).get('requestMs'))
    fr = col(lambda m: m.get('framesSent'))
    att = col(lambda m: (m.get('language') or {}).get('attempts'))
    cc = col(lambda m: m.get('contextChars'))
    print(f)
    images = dict((x, fr.count(x)) for x in sorted(set(fr)))
    attempts = dict((x, att.count(x)) for x in sorted(set(att)))
    print(f'  appels uniques={len(ms)} images={images} tentatives langue={attempts}')
    series = [('evalTokens', ev), ('promptTokens', pt), ('promptEvalMs', pe), ('evalMs', em), ('totalMs', tot),
              ('requestMs', req), ('contextChars', cc)]
    for name, xs in series:
        if xs:
            print(f'  {name:13s} n={len(xs):3d} min={min(xs):8.0f} p50={q(xs,.5):8.0f} p90={q(xs,.9):8.0f} max={max(xs):8.0f}')
    rates = [m['providerTimings']['evalTokens'] / (m['providerTimings']['evalMs'] / 1000) for m in ms if m['providerTimings'].get('evalMs')]
    if rates: print(f'  decode tok/s p50={q(rates,.5):.1f} min={min(rates):.1f}')
