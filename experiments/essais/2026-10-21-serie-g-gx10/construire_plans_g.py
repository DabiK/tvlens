"""Build the preregistered G1 (format/tools), G3 (MTP) and G4 (vision output) replay plans from the closed E1.

Cases come from the research synthesis of 21 October (section 1.3); the oracle is only used there to pick cases and
nothing from it enters a request. G4 takes eight perception bodies per video at evenly spaced positions after the
first two (whose cumulative summary is still empty).
"""
import argparse
import json
from pathlib import Path

VIDEOS = ["kennedy", "spring", "cnrs-apprentissage", "boeuf-bourguignon", "tears-of-steel", "artemis"]
OLD_EVIDENCE = ["spring-06", "cuisine-02", "cuisine-05", "cuisine-07", "cnrs-04", "cnrs-06"]
NOW = ["kennedy-01", "spring-02", "tears-03", "kennedy-08"]
MTP_CASES = ["kennedy-01", "kennedy-03", "kennedy-05", "kennedy-06", "kennedy-08", "cnrs-01", "cnrs-02", "cnrs-04",
             "cnrs-05", "cnrs-06", "spring-01", "spring-02", "spring-03", "spring-04", "spring-06"]
TOPIC_RULE = ["Le champ distinct topicSummary", "recopié dans summary, visual ou transcript."]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--e1", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    e1, out = Path(args.e1), Path(args.out)
    common = {"journals": [str(e1 / "proxy" / (v + "-A-1.jsonl")) for v in VIDEOS],
              "scenarios": [str(e1 / "inputs" / v / "scenario.json") for v in VIDEOS]}
    g1 = {"experiment": "g1-format-outils", **common, "capSeconds": 1200,
          "cases": [{"kind": "question", "id": q} for q in OLD_EVIDENCE + NOW],
          "arms": [{"label": "A"}, {"label": "B", "dropKeys": ["format"]}, {"label": "C", "dropKeys": ["tools"]}],
          "order": ["A", "B", "C", "C", "B", "A"]}
    g3 = {"experiment": "g3-mtp", **common, "capSeconds": 1800,
          "cases": [{"kind": "question", "id": q} for q in MTP_CASES],
          "arms": [{"label": "P"}, {"label": "P0", "options": {"draft_num_predict": 0}}],
          "order": ["P", "P0", "P0", "P"]}
    bodies = []
    for video in VIDEOS:
        files = sorted((e1 / "proxy" / (video + "-A-1-bodies")).glob("vlm-*.json.gz"))[2:]
        for k in range(8):
            body = files[min(len(files) - 1, round((k + 0.5) * len(files) / 8))]
            bodies.append({"kind": "body", "id": "%s/%s" % (video, body.name), "body": str(body)})
    g4 = {"experiment": "g4-sortie-vision", "capSeconds": 2400, "cases": bodies,
          "arms": [{"label": "R"}, {"label": "V2", "schemaDrop": ["topicSummary"], "promptCut": [TOPIC_RULE]},
                   {"label": "V3", "schemaMaxLength": {"topicSummary": 300}}],
          "order": ["R", "V2", "V3", "V3", "V2", "R"]}
    for name, plan in (("plan-g1.json", g1), ("plan-g3.json", g3), ("plan-g4.json", g4)):
        (out / name).write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    print("G1", len(g1["cases"]), "cas ; G3", len(g3["cases"]), "cas ; G4", len(g4["cases"]), "blocs")


if __name__ == "__main__":
    main()
