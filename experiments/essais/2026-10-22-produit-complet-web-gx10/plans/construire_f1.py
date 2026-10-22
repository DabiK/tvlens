"""Build the F1 plan: J6's configuration (N2, the product's memory journal, no journal rewrite) on the trial branch that
merges the journal and the web retrieval, with the 42 oracle v4 W/M/O questions added to the 60 oracle v3 ones. A W/M/O question shares its pose with a v3 question and is asked right
after it: the product queues it, and its latency is read without the queue wait (metrics.waitMs).

Usage: python3 -I construire_f1.py --j2-plan plan.json --wmo questions-wmo-scenario.json --sha SHA --runner-sha256 HEX
       --local-web '{"backend": "searxng", ...}' --out plan-f1.json
"""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--j2-plan", required=True)
    parser.add_argument("--wmo", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--runner-sha256", required=True)
    parser.add_argument("--local-web", required=True)
    parser.add_argument("--experiment", default="f1-gps-sans-resume-web-searxng-102q")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    plan = json.loads(Path(args.j2_plan).read_text())
    wmo = json.loads(Path(args.wmo).read_text())
    local_web = json.loads(args.local_web)
    plan["experiment"] = args.experiment
    plan["codeShas"] = [args.sha]
    plan["runnerSha256"] = args.runner_sha256
    plan["hypothesis"] = (
        "Produit complet sur la branche d'essai essai/f1-journal-web (jamais main) : J6 (N2 + journal mémoire du produit) avec "
        "la récupération web locale (T308–T311%s), SearXNG sur la GX10, déclencheur %s, sur les 102 questions (60 oracle v3 + "
        "42 W/M/O). La référence sans recherche est connue : le mode local refuse le web (H1-A), et J6 donne les 60 v3 sans "
        "web. Critères fixés avant le départ : W/M pertinentes ≥ 12/30 avec source validée ; inventions W/M ≤ 8/60 rapportées "
        "à 30 (H1-B) ; v3 : pertinentes ≥ J6 − 3 et récupérations déclenchées à tort ≤ 5/60 ; délai médian W/M ≤ 15 s hors "
        "file d'attente." % (", T314" if local_web.get("trigger") == "model" else "", local_web.get("trigger", "auto")))
    (arm_name, arm), = plan["arms"].items()
    arm = json.loads(json.dumps(arm))
    arm["scenario"]["config"]["localWeb"] = local_web
    plan["arms"] = {"GPSR102W": arm}
    plan["order"] = [[video, "GPSR102W"] for video, _ in plan["order"]]
    for video, entry in plan["videos"].items():
        added = wmo[video]
        entry["questions"] = sorted(entry["questions"] + added, key=lambda q: (q["atMs"], q["id"] in {a["id"] for a in added}))
    plan["budgetSeconds"] = max(plan.get("budgetSeconds", 0), 10800)
    plan["knownConcurrentLoad"] = "Aucune autre charge GPU. Réseau : SearXNG local et pages ouvertes en ligne."
    Path(args.out).write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    print(args.out, {v: len(e["questions"]) for v, e in plan["videos"].items()})


if __name__ == "__main__":
    main()
