import json,gzip,sys
def load(dirp):
    cle=json.load(open(dirp+'cle.json'))
    import glob
    mem={}
    for f in glob.glob(dirp+'membres-*.json'):
        for t,ids in json.load(open(f)).items(): mem[t]=ids[0]
    d=json.load(gzip.open(dirp+'notation-brute.json.gz','rt'))
    out={}
    def walk(o,path=''):
        if isinstance(o,dict):
            if 'textId' in o and 'rationale' in o:
                tid=o['textId']
                full=[mem[tid]] if tid in mem else []
                if full:
                    m=cle[full[0]]; out.setdefault((m['source'] if 'source' in m else m.get('arm'),m.get('arm'),m['questionId']),[]).append((path,o['score'],o['invention'],o['rationale']))
            for k,v in o.items(): walk(v,path+'/'+k if k in('judges','arbiter','third','final') else path)
        elif isinstance(o,list):
            for v in o: walk(v,path)
    walk(d)
    return out
H4=load('/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/notation/')
C1=load('/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-23-comparatif-codex-local/notation-web/')
cx={r['id']:r for r in (json.loads(l) for l in gzip.open('/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-23-comparatif-codex-local/bruts/codex-calls.jsonl.gz','rt'))}
for q in sys.argv[1:]:
    print('='*90,q)
    for k,v in H4.items():
        if k[2]==q and k[1]=='V0':
            for r in v: print('  H4-V0',r[1],r[2],r[3][:500])
    for k,v in C1.items():
        if k[2]==q:
            for r in v: print('  C1',k[0],r[1],r[2],r[3][:500])
    c=cx.get(q)
    if c: print('  CODEX web=',c['webSearches'],'ANSWER:',(c['content'] or '')[:900])
