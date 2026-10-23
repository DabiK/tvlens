import json, gzip, sys, re
H4='/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-web-reel-texte-gx10/'
OR='/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-22-oracle-v4-web-outils-gx10/oracle-v4.json'
C1='/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/c1/c1-requetes.json'
CX='/Users/Dabi/Documents/ISN/tvlens/experiments/essais/2026-10-23-comparatif-codex-local/notation-web/notes.json'
CACHE='/Users/Dabi/Documents/TVLens-GX10/essais/web-vivant-20261022/'
notes=json.load(open(H4+'notation/notes.json'))
v0={n['questionId']:n for n in notes if n['arm']=='V0'}
orc={q['questionId']:q for v in json.load(open(OR)).values() for q in v['questions']}
c1={x['id']:x for x in json.load(open(C1)) if x['category'] in ('W','M')}
calls={r['case']:r for r in (json.loads(l) for l in gzip.open(H4+'bruts/calls.jsonl.gz','rt')) if r['arm']=='V0'}
srch={(r['case'],r['kind']):r for r in (json.loads(l) for l in open(H4+'bruts/recherches.jsonl'))}
cx=json.load(open(CX))
ids=sys.argv[1:] or sorted(k for k,n in v0.items() if not n['relevant'])
for qid in ids:
    q=orc[qid]; n=v0[qid]; call=calls[qid]
    print('='*100); print(qid, q.get('category'), 'fresh=',q.get('freshness'), 'score=',n['score'],'inv=',n['invention'],'unj=',n.get('unjustified'))
    print('Q:',q['askedQuestion']); print('answerable:',q.get('answerableAtPose'))
    for f in q['requiredFacts']: print('  REQ[%s]:'%f.get('modality'), f['fact'][:400])
    print('  s3:',q['rubric'].get('s3')[:400]); print('  s2:',q['rubric'].get('s2')[:400])
    m=srch.get((qid,'model'))
    print('QUERY:', m and m['query']); print('URLS:', m and m['urls'])
    print('GIVEN:', call['pages'])
    print('ANSWER:', call['content'][:1500])
    print('CODEX:', [ (x.get('source'),x.get('arm'),x.get('score'),x.get('relevant')) for x in cx if x['questionId']==qid])
