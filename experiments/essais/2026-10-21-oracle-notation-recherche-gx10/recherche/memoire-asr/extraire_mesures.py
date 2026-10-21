"""Extract, read-only, the measurements behind the memory/ASR proposals from archived GX10 runs (no inference).

Usage: python3 -I extraire_mesures.py /Users/Dabi/Documents/ISN/tvlens > mesures.json
Every figure printed here is computed from files already repatriated in the repository; nothing is estimated.
"""
import collections
import glob
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(sys.argv[1])
ESSAIS = ROOT / "experiments/essais"
REF = ESSAIS / "2026-10-20-reference-gx10/preuves/rapatriement-20261020"
EXT = ESSAIS / "2026-10-21-corpus-etendu-gx10/rapatriements/reprise-corpus-20261020T224923Z/results"
PROBE = ESSAIS / "2026-10-20-nuit-gx10/rapatriements/nuit-20261020T210107Z/results/answers-ollama"


def q(values, p):
    values = sorted(values)
    k = (len(values) - 1) * p
    i = int(k)
    j = min(i + 1, len(values) - 1)
    return round(values[i] + (values[j] - values[i]) * (k - i), 1)


def rel(path):
    return str(Path(path).relative_to(ROOT))


out = {"source": "archives GX10 rapatriées, lecture seule", "toolUse": {}, "freshness": {}, "whisper": {},
       "springNonSpeech": {}, "prefixTranscript": {}, "questionProbe": {}, "failedQuestions": []}

# 1. Tool calls and evidence lag over every archived question with metrics.
tools, lags, kinds, files = collections.Counter(), [], collections.Counter(), []
for f in glob.glob(str(ESSAIS / "**/campaign.json"), recursive=True):
    if "fixture" in f or "validation" in f:
        continue
    try:
        d = json.loads(Path(f).read_text())
    except (OSError, ValueError):
        continue
    used = False
    for item in d.get("questions") or []:
        m = item.get("metrics") or {}
        if not m:
            continue
        used = True
        tools[len(m.get("tools", []))] += 1
        kinds[(item.get("result") or {}).get("kind")] += 1
        lag = (m.get("evidence") or {}).get("lagAtStartMs")
        if lag is not None:
            lags.append(lag / 1000)
    if used:
        files.append(rel(f))
out["toolUse"] = {"questions": sum(tools.values()), "toolCallsPerQuestion": dict(tools), "kinds": dict(kinds),
                  "campaigns": sorted(files)}
out["freshness"] = {"lagAtStartS_median": statistics.median(lags),
                    "lagAtStartS_buckets": dict(collections.Counter(int(x // 8) * 8 for x in lags))}

# 2. Whisper per-block time split (reference batch, one run per model and video).
for f in sorted(glob.glob(str(REF / "*/run/campaign.json"))):
    d = json.loads(Path(f).read_text())
    ev = [e for e in d["roles"]["transcription"]["evidence"] if e.get("scope") != "transcriber"]
    m = [e["metrics"]["whisper"] for e in ev if (e.get("metrics") or {}).get("whisper")]
    el = [x["elapsedMs"] for x in m]
    out["whisper"][Path(f).parts[-3]] = {
        "blocks": len(m), "elapsedMs_p50": q(el, .5), "elapsedMs_p90": q(el, .9), "elapsedMs_max": round(max(el), 1),
        "whisperTotalMs_p50": q([x.get("totalMs", 0) for x in m], .5),
        "loadMs_p50": q([x.get("loadMs", 0) for x in m], .5),
        "encodeMs_p50": q([x.get("encodeMs", 0) for x in m], .5),
        "decodeMs_p50": q([x.get("decodeMs", 0) + x.get("batchdMs", 0) for x in m], .5),
        "outsideWhisperMs_p50": q([x["elapsedMs"] - x.get("totalMs", 0) for x in m], .5),
        "temperatureFallbacks": sum(x.get("logprobFallbacks", 0) + x.get("entropyFallbacks", 0) for x in m),
        "source": rel(f)}


def transcripts(d):
    seen = {}
    for r in d["journal"]["revisions"]:
        p = r["passage"]
        o = p.get("observation") or {}
        seen[p["id"]] = (p["startMs"], o.get("transcript") or "", (o.get("summary") or "") + (o.get("visual") or ""))
    return sorted(seen.values())


# 3. Speech-like text on the dialogue-free Spring (language auto).
for f in sorted(glob.glob(str(REF / "*-spring/run/campaign.json"))):
    rows = transcripts(json.loads(Path(f).read_text()))
    speech = []
    for start, text, _ in rows:
        stripped = re.sub(r"\([^)]*\)|\[[^\]]*\]|\*[^*]*\*|¶", "", text).strip()
        if len(re.findall(r"[A-Za-zÀ-ÿА-Яа-я']+", stripped)) >= 2:
            speech.append({"startS": start // 1000, "text": stripped[:80]})
    out["springNonSpeech"][Path(f).parts[-3]] = {"passages": len(rows), "speechLike": len(speech),
                                                  "examples": speech[:8], "source": rel(f)}

# 4. Size of the full prefix transcript versus vision text at the last question (base runs).
for f in sorted(glob.glob(str(REF / "base-*/run/campaign.json")) + glob.glob(str(EXT / "run-base-*/campaign.json"))):
    d = json.loads(Path(f).read_text())
    last = max(item.get("atMs") or 0 for item in d["questions"])
    rows = [r for r in transcripts(d) if r[0] < last]
    tc, vc = sum(len(r[1]) for r in rows), sum(len(r[2]) for r in rows)
    out["prefixTranscript"][rel(f)] = {"lastQuestionS": last // 1000, "blocks": len(rows), "transcriptChars": tc,
                                       "transcriptTokensApprox_chars_div_4": tc // 4, "visionTextChars": vc}

# 5. Question model alone (night probe, no tools, no concurrent load).
rows = []
for f in sorted(PROBE.glob("*/result.json")):
    d = json.loads(f.read_text())
    t = d.get("ollamaTimings") or {}
    rows.append({"case": f.parent.name, "promptTokens": t.get("prompt_eval_count"),
                 "prefillS": round(t.get("prompt_eval_duration", 0) / 1e9, 2), "evalTokens": t.get("eval_count"),
                 "decodeS": round(t.get("eval_duration", 0) / 1e9, 2), "clientS": round(d.get("clientTotalMs", 0) / 1000, 2)})
out["questionProbe"] = {"rows": rows, "source": rel(PROBE)}

# 6. The three failures named in the brief, as answered in the archived runs.
for f in sorted(glob.glob(str(EXT / "run-*-boeuf-bourguignon/campaign.json")) + glob.glob(str(REF / "*-spring/run/campaign.json"))
                + glob.glob(str(REF / "*-kennedy/run/campaign.json"))):
    d = json.loads(Path(f).read_text())
    for item in d["questions"]:
        if item.get("id") in ("cuisine-07", "spring-06", "kennedy-06"):
            m = item.get("metrics") or {}
            r = item.get("result") or {}
            out["failedQuestions"].append({"run": rel(f), "id": item["id"], "e2eMs": m.get("endToEndMs"),
                                           "tools": len(m.get("tools", [])),
                                           "contextThroughMs": (m.get("evidence") or {}).get("contextThroughMs"),
                                           "kind": r.get("kind"), "answer": (r.get("answer") or "")[:240]})

json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
print()
