"""Break down question and perception latency of the instrumented reference replay (E1) from its proxy journals.

Usage: python3 -I analyser_e1.py <E1 results dir> <output json>
Questions: HTTP delay, model load, prefill, decode and tokens per second, tool calls, citations proposed by the model
versus answers kept by TVLens. Perception: calls, provider time, share over 8 s, output tokens, share of the
cumulative topicSummary in the generated characters, published losses.
"""
import json
import statistics
import sys
from pathlib import Path

VIDEOS = ["kennedy", "spring", "cnrs-apprentissage", "boeuf-bourguignon", "tears-of-steel", "artemis"]
BLOCK_S = 8


def seconds(counters, key):
    return (counters.get(key) or 0) / 1e9


def questions(campaign, rows):
    calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat"]
    out = []
    for question, call in zip(campaign["questions"], calls):
        c = call["counters"]
        model = json.loads(call["response"]["message"]["content"])
        result = question.get("result") or {}
        out.append({"id": question["id"], "httpS": question["latency"]["submissionToHttpResponseMs"] / 1000,
                    "loadS": seconds(c, "load_duration"), "prefillS": seconds(c, "prompt_eval_duration"),
                    "promptTokens": c["prompt_eval_count"], "decodeS": seconds(c, "eval_duration"), "outputTokens": c["eval_count"],
                    "tokensPerS": c["eval_count"] / max(seconds(c, "eval_duration"), 1e-9),
                    "toolCalls": len((call["response"].get("message") or {}).get("tool_calls") or []),
                    "modelKind": model.get("kind"), "modelCitations": len(model.get("citations") or []),
                    "finalKind": result.get("kind"),
                    "rejectedByValidation": any("validation des preuves" in l for l in result.get("limits") or [])})
    return out


def perception(campaign, rows):
    calls = [r for r in rows if r["role"] == "vlm" and r["path"] == "/api/chat" and r["status"] == 200]
    totals = [seconds(r["counters"], "total_duration") for r in calls]
    topic_chars = all_chars = 0
    for r in calls:
        try:
            output = json.loads(r["response"]["message"]["content"])
        except (ValueError, KeyError, TypeError):
            continue
        all_chars += sum(len(str(v)) for v in output.values())
        topic_chars += len(str(output.get("topicSummary", "")))
    losses = (campaign.get("summary") or {}).get("losses", {}).get("vision", {})
    return {"calls": len(calls), "totalMedianS": statistics.median(totals), "totalMaxS": max(totals),
            "over8s": sum(1 for t in totals if t > BLOCK_S), "outputTokensMedian": statistics.median(r["counters"]["eval_count"] for r in calls),
            "prefillMedianS": statistics.median(seconds(r["counters"], "prompt_eval_duration") for r in calls),
            "decodeMedianS": statistics.median(seconds(r["counters"], "eval_duration") for r in calls),
            "topicSummaryShare": topic_chars / max(all_chars, 1), "lostBlocks": losses.get("count"),
            "lostByCause": losses.get("byCause")}


def main():
    root, target = Path(sys.argv[1]), Path(sys.argv[2])
    report = {}
    for video in VIDEOS:
        campaign = json.loads((root / (video + "-A-1") / "run" / "campaign.json").read_text())
        rows = [json.loads(line) for line in (root / "proxy" / (video + "-A-1.jsonl")).read_text().splitlines()]
        report[video] = {"questions": questions(campaign, rows), "perception": perception(campaign, rows)}
    target.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for video, part in report.items():
        q, p = part["questions"], part["perception"]
        print("%-20s HTTP méd %.1f s | décodage méd %.1f s à %.0f jet/s | préremplissage méd %.1f s | rejets validation %d/5"
              " | outils %d | vision méd %.1f s, %d/%d > 8 s, topicSummary %.0f %% | blocs perdus %s" % (
                  video, statistics.median(x["httpS"] for x in q), statistics.median(x["decodeS"] for x in q),
                  statistics.median(x["tokensPerS"] for x in q), statistics.median(x["prefillS"] for x in q),
                  sum(x["rejectedByValidation"] for x in q), sum(x["toolCalls"] for x in q), p["totalMedianS"], p["over8s"],
                  p["calls"], 100 * p["topicSummaryShare"], p["lostBlocks"]))


if __name__ == "__main__":
    main()
