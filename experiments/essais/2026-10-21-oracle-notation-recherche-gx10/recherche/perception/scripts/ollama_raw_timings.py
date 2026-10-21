"""Résume prompt_eval/eval d'Ollama dans des response.raw.txt (sonde Qwen3-VL-4B F16). Lecture seule.
Usage : python3 -I ollama_raw_timings.py <dossier ollama-full>
"""
import json, glob, os, sys, statistics as st
rows = []
for f in sorted(glob.glob(os.path.join(sys.argv[1], 'pass-*/response.raw.txt'))):
    s = open(f).read()
    try:
        d = json.loads(s)
    except Exception:
        d = json.loads(s.strip().splitlines()[-1])
    rows.append((os.path.basename(os.path.dirname(f)), d['prompt_eval_count'], d['prompt_eval_duration'] / 1e9, d['eval_count'], d['eval_duration'] / 1e9))
for r in rows: print('%s promptTok=%d prefill=%.2fs evalTok=%d decode=%.2fs' % r)
p1 = [r for r in rows if r[0].startswith('pass-1') and r[2] > 1]
print('passage 1 (sans cache) n=%d : promptTok p50=%d, prefill p50=%.2f s ; tous : evalTok p50=%d, decode p50=%.2f s, débit p50=%.1f tok/s' % (
    len(p1), st.median([r[1] for r in p1]), st.median([r[2] for r in p1]), st.median([r[3] for r in rows]),
    st.median([r[4] for r in rows]), st.median([r[3] / r[4] for r in rows])))
