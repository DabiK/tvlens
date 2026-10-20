cd /var/lib/tvlens/data/sessions || exit 1
python3 - 5c07dc06-8d31-48cf-b7b5-8d08e2b29d13 78b2173e-3992-4261-b7a2-29c26733a96e <<'PY'
import json,sys,os
out={}
for sid in sys.argv[1:]:
    d=sid; r={}
    s=json.load(open(os.path.join(d,'session.json')))
    m=json.load(open(os.path.join(d,'manifest.json')))
    ps=(s.get('history') or [])+(s.get('segments') or [])
    r['manifest']={k:m.get(k) for k in ('state','createdAt','closedAt','elapsedMs','capturedThroughMs','passages','host')}
    r['passages']=len(ps); r['ready']=sum(1 for p in ps if p.get('status')=='ready')
    r['topics']=len({(p.get('observation') or {}).get('topic') for p in ps if (p.get('observation') or {}).get('topic')})
    for k in ('latency','coverage','gaps','audioGaps','visionGaps','analysisLagMs','lastError','apiCalls'):
        r[k]=s.get(k)
    try:
        jobs=json.load(open(os.path.join(d,'deep-answers.json')))['jobs']
        r['questions']=[{'question':j['question'],'status':j['status'],'kind':(j.get('result') or {}).get('kind'),
          'citations':len((j.get('result') or {}).get('citations') or []),'elapsedMs':(j.get('result') or {}).get('elapsedMs'),
          'firstUsefulMs':(j['firstUsefulAt']-j['createdAt']) if j.get('firstUsefulAt') else None,
          'model':(j.get('result') or {}).get('model')} for j in jobs]
    except FileNotFoundError: r['questions']=[]
    if os.path.exists(os.path.join(d,'surveillance.json')):
        v=json.load(open(os.path.join(d,'surveillance.json')))
        r['surveillance']={'instruction':v['activation']['instruction'],'counts':v['counts'],'coverage':v['coverage'],
          'claims':[{'id':c['id'],'status':c['status'],'reason':c.get('reason'),'sources':len(c.get('sources') or [])} for c in v['claims']],
          'cards':[{'label':c.get('label'),'text':c.get('text'),'sources':[x.get('publisher') or x.get('title') for x in c.get('sources') or []]} for c in v['overlay']['cards']],
          'metrics':v['metrics']}
    out[sid]=r
print(json.dumps(out,ensure_ascii=False,indent=2))
PY
