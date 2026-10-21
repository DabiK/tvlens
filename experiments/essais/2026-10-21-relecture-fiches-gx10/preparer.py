#!/usr/bin/env python3
"""Freeze the provisional oracle and prepare blinded baseline answers."""

from __future__ import annotations

import hashlib
import json
import random
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
EVALUATION = ROOT / "experiments/gx10/evaluation"
REFERENCE = ROOT / "experiments/essais/2026-10-20-reference-gx10/preuves/rapatriement-20261020"
EXTENDED = ROOT / "experiments/essais/2026-10-21-corpus-etendu-gx10/rapatriements/reprise-corpus-20261020T224923Z/results"
WHISPER = ("base", "small", "large-v3-turbo")
MEDIA_SHA256 = {
    "cnrs-apprentissage": ("04-cnrs-entrainement-ia.mp4", "99f25322dd4268556589e1c454c460020da8971d4b163d0ec840c3cc7a0b0d4b"),
    "boeuf-bourguignon": ("05-boeuf-bourguignon.mp4", "ec9d70f64ea55dc13a6e5c162a22ce88a383b65d97c442326e6a5045d7c478fd"),
    "kennedy": ("kennedy-rice-7min.mp4", "f542af18fda70d00bef6d4c167a9af4aa239a7a064fd306c6f1aa45035b2c611"),
    "tears-of-steel": ("08-tears-of-steel.mov", "efa9062d9cdb7a338e40ad530dfdf234806743f29ae6a1a136b97ece4e588e8f"),
    "artemis": ("09-artemis-lancement.mp4", "6ac25c124375fdac03a2a3e2bd599ea3516a75e9fd03bb193de18d6575297710"),
    "spring": ("spring.mp4", "c2c678f2a70338c060b33608bc34d0a1050cd284e249814b3dac0d85eaaa443a"),
}
PRIORITY = {
    "cuisine-07": "Trois sorties insufficient : écouter et voir 09:00–10:56 ; vérifier ordre et disponibilité dans le contexte.",
    "tears-07": "Vérifier alignement du SRT officiel : 90 % à 08:24, terminé à 08:58, question à 09:12.",
    "artemis-07": "Vérifier la pose à 34:56 et la coupure attendue après le préfixe ; l'ASR à 03:24:40 annonce encore 30 s avant MECO.",
    "spring-06": "Trois sorties insufficient : revoir preuve visuelle ancienne et disponibilité dans les images échantillonnées.",
    "kennedy-06": "Small insufficient : écouter 04:00–04:32, contrôler l'alignement de l'intervalle indiqué.",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def dump(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    selection_path = EVALUATION / "selection.json"
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    if selection.get("readyForScoring") is not False or len(selection["videos"]) != 6:
        raise ValueError("La sélection provisoire attendue a changé")

    snapshots = OUT / "snapshots"
    manifest = {"version": 1, "readyForScoring": False, "selectionSha256": sha256(selection_path), "videos": []}
    questions_by_video = {}
    for video in selection["videos"]:
        fiche_src = EVALUATION / video["fiche"]
        questions_src = EVALUATION / video["questions"]
        fiche_dst = snapshots / video["fiche"]
        questions_dst = snapshots / video["questions"]
        fiche_dst.parent.mkdir(parents=True, exist_ok=True)
        questions_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fiche_src, fiche_dst)
        shutil.copyfile(questions_src, questions_dst)
        questions = json.loads(questions_src.read_text(encoding="utf-8"))["questions"]
        if len(questions) != 5 or len({q["id"] for q in questions}) != 5:
            raise ValueError(f"Questions inattendues : {questions_src}")
        slug = questions_src.stem
        media_name, media_sha = MEDIA_SHA256[slug]
        questions_by_video[slug] = questions
        manifest["videos"].append({
            "video": slug,
            "mediaOnGx10": f"/srv/tvlens-gx10/videos/{media_name}",
            "mediaSha256": media_sha,
            "fiche": relative(fiche_src),
            "ficheSha256": sha256(fiche_src),
            "ficheSnapshotSha256": sha256(fiche_dst),
            "questions": relative(questions_src),
            "questionsSha256": sha256(questions_src),
            "questionsSnapshotSha256": sha256(questions_dst),
            "status": "draft_requires_media_review",
            "priorityIds": [q["id"] for q in questions if q["id"] in PRIORITY],
        })

    rng = random.Random("tvlens-gx10-2026-10-21-provisional-review-v1")
    packet = []
    key = []
    for slug, questions in questions_by_video.items():
        for expected in questions:
            group = []
            for whisper in WHISPER:
                if slug in ("cnrs-apprentissage", "kennedy", "spring"):
                    source = REFERENCE / f"{whisper}-{slug}" / "run/campaign.json"
                else:
                    source = EXTENDED / f"run-{whisper}-{slug}" / "campaign.json"
                campaign = json.loads(source.read_text(encoding="utf-8"))
                matches = [q for q in campaign["questions"] if q["id"] == expected["id"]]
                if len(matches) != 1 or matches[0]["question"] != expected["question"] or matches[0]["atMs"] != expected["atMs"]:
                    raise ValueError(f"Question non appariée : {expected['id']} dans {source}")
                q = matches[0]
                group.append((whisper, source, q))
            rng.shuffle(group)
            for index, (whisper, source, q) in enumerate(group, 1):
                alias = f"{expected['id']}-R{index}"
                result = q.get("result") or {}
                packet.append({
                    "alias": alias,
                    "video": slug,
                    "questionId": expected["id"],
                    "atMs": expected["atMs"],
                    "question": expected["question"],
                    "acquired": q.get("acquired") is True,
                    "kind": result.get("kind"),
                    "answer": result.get("answer"),
                    "citations": result.get("citations", []),
                    "score0to3": None,
                    "invention": None,
                    "temporalEvidenceCorrect": None,
                    "justification": None,
                })
                key.append({
                    "alias": alias,
                    "whisper": whisper,
                    "source": relative(source),
                    "sourceSha256": sha256(source),
                    "latencyHttpMs": (q.get("latency") or {}).get("submissionToHttpResponseMs"),
                    "status": q.get("status"),
                })

    if len(packet) != 90 or len({row["alias"] for row in packet}) != 90:
        raise ValueError("Le paquet doit contenir 90 réponses uniques")
    dump(OUT / "manifest.json", manifest)
    (OUT / "annotation-aveugle.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in packet), encoding="utf-8"
    )
    dump(OUT / "correspondance-apres-notation.json", key)
    dump(OUT / "priorites.json", [{"questionId": qid, "controle": reason} for qid, reason in PRIORITY.items()])


if __name__ == "__main__":
    main()
