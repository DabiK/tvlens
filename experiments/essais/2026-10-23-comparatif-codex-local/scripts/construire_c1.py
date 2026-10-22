"""C1: export, for the 102 questions, the exact question request the local model received, to ask Codex the same thing.
Oracle v3 questions come from J6 (memory journal of the product, the best local configuration); the 42 W/M/O questions
from J2 at the same pose with the question replaced, as in H1, H2 and H4.
Usage: python3 -I construire_c1.py --j6 <J6 results> --j2 <J2 results> --questions questions-wmo.json
       --oracle-v3 oracle-v3.json --out c1-requetes.json
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rejouer_h2 as h2  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    for name in ("--j6", "--j2", "--questions", "--oracle-v3", "--out"):
        parser.add_argument(name, required=True)
    args = parser.parse_args()
    v3 = json.loads(Path(args.oracle_v3).read_text())
    out = []
    for key, run in h2.h1.VIDEOS.items():
        rows = [json.loads(line) for line in (Path(args.j6) / "proxy" / ("%s-GPSR60P-1.jsonl" % run)).read_text().splitlines()]
        calls = [r for r in rows if r["role"] == "questions" and r["path"] == "/api/chat" and r["status"] == 200]
        for q in v3[key]["questions"]:
            marker = 'DEMANDE (du spectateur) : "%s"' % q["askedQuestion"]
            call = next(r for r in calls if marker in r["request"]["messages"][0]["content"])
            out.append({"id": q["questionId"], "category": "v3", "video": key, "question": q["askedQuestion"],
                        "source": "J6", "request": call["request"]})
    for case in h2.build(argparse.Namespace(j2=args.j2, questions=args.questions, oracle_v3=args.oracle_v3)):
        if case["category"] != "v3":
            out.append({"id": case["id"], "category": case["category"], "video": case["video"], "question": case["question"],
                        "source": "J2", "request": case["base"]})
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False))
    print(len(out), "requêtes")


if __name__ == "__main__":
    main()
