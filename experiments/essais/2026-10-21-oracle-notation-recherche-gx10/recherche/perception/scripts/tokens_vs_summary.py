"""Relie chaque appel vision (roles.perception.evidence) au passage publié (journal) par l'instant de départ,
puis compare le nombre de jetons générés aux longueurs des champs produits. Lecture seule.
Usage : python3 -I tokens_vs_summary.py <campaign.json>...
"""
import json, sys, math, statistics as st

def corr(a, b):
    ma, mb = st.mean(a), st.mean(b)
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))

rows = []
for f in sys.argv[1:]:
    d = json.load(open(f))
    ev = [e for e in d['roles']['perception']['evidence'] if isinstance(e.get('metrics'), dict) and isinstance(e['metrics'].get('providerTimings'), dict)]
    passages = {}
    for r in d['journal']['revisions']:
        p = r.get('passage') if isinstance(r, dict) else None
        if isinstance(p, dict) and isinstance(p.get('observation'), dict) and 'visual' in p['observation']:
            vs = (p.get('metadata') or {}).get('visionStartedMs')
            if vs is not None:
                passages[round(vs)] = p
    for e in ev:
        s = e.get('startedAtMs')
        best = min(passages, key=lambda k: abs(k - s)) if passages else None
        if best is None or abs(best - s) > 50: continue
        p = passages[best]; o = p['observation']; t = e['metrics']['providerTimings']
        ts = p.get('topicSummary'); tst = ts.get('text') if isinstance(ts, dict) else ''
        rows.append((t['evalTokens'], len(tst or ''), len(o.get('summary') or '') + len(o.get('visual') or '')))
print('appels reliés', len(rows))
evt = [r[0] for r in rows]; tsl = [r[1] for r in rows]; per = [r[2] for r in rows]
print('corr(jetons générés, longueur topicSummary) = %.2f' % corr(evt, tsl))
print('corr(jetons générés, longueur summary+visual) = %.2f' % corr(evt, per))
for lo, hi in [(0, 200), (200, 300), (300, 10000)]:
    sub = [r for r in rows if lo <= r[0] < hi]
    if sub:
        print('jetons [%d,%d) n=%d topicSummary p50=%d car. ; summary+visual p50=%d car.' % (
            lo, hi, len(sub), st.median([r[1] for r in sub]), st.median([r[2] for r in sub])))
