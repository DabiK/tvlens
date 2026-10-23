import json, re, sys, unicodedata
H4='/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/'
C1='/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/c1/c1-requetes.json'
CACHE='/Users/Dabi/Documents/TVLens-GX10/essais/web-vivant-20261022/'
man={r['url']:r for r in json.load(open(CACHE+'manifeste.json'))}
def txt(u):
    return open(CACHE+'texte/'+man[u]['key']+'.txt').read()
c1={x['id']:x for x in json.load(open(C1)) if x['category'] in ('W','M')}
srch={(r['case'],r['kind']):r for r in (json.loads(l) for l in open(H4+'bruts/recherches.jsonl'))}
def ctx(qid):
    c=c1[qid]['request']['messages'][0]['content']
    i=c.find('<<<TVLENS-'); return c[i:]
def passages(qid):
    c=ctx(qid); j=c.find('{'); 
    end=c.rfind('}')
    try:
        d=json.loads(c[j:end+1])
    except Exception as e:
        # find the json object by balanced decoding
        d=json.JSONDecoder().raw_decode(c[j:])[0]
    return d
qid=sys.argv[1]; vpat=sys.argv[2]; wpat=sys.argv[3]
d=passages(qid)
ps=d['context']['passages']
print(qid,'passages:',[(p['id'],p['startMs']//1000,p['endMs']//1000) for p in ps], 'keys', list(d['context'].keys()))
if vpat!='-':
    for p in ps:
        for m in re.finditer(vpat,p['text'],re.I):
            print('  VIDEO HIT',p['id'],repr(p['text'][max(0,m.start()-80):m.end()+80]))
    # also whole context
    print('  video hits in full ctx:', len(re.findall(vpat,ctx(qid),re.I)))
for kind in ('model','raw'):
    s=srch.get((qid,kind))
    if not s: continue
    print(kind.upper(), s['query'])
    for i,u in enumerate(s['urls']):
        t=txt(u); hits=[m.start() for m in re.finditer(wpat,t,re.I)]
        print('  [%d] %s len=%d hits=%s'%(i,u[:90],len(t),hits[:8]))
        if hits:
            h=hits[0]; print('      first:',repr(t[max(0,h-100):h+150]))
