"""Scénario G3 de la recette T280 : discours de Kennedy (7 min) converti par T262, bouclé et déclaré, trente minutes,
tous les rôles en local sur le Mac. Écrit `scenario.json` à côté de la préparation.
Usage : python3 ecrire-scenario.py <dossier de préparation>
"""
import hashlib
import json
import sys
from pathlib import Path

prepared = Path(sys.argv[1])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
index = json.loads((prepared / "blocks.json").read_text())
blocks = index["blocks"]
durations = [b["endMs"] - b["startMs"] for b in blocks]
PLANNED = 30 * 60 * 1000

clips, at, i = [], 0, 0
while at < PLANNED:
    block = i % len(blocks)
    if at + durations[block] > PLANNED:
        break
    clips.append({"id": f"clip-{i}", "block": block, "occurrence": i // len(blocks), "atMs": at, "language": "en"})
    at += durations[block]
    i += 1

QUESTIONS = [
    (90, "De quoi parle l'orateur en ce moment ?"),
    (270, "Quelles inventions cite-t-il pour résumer l'histoire de l'humanité ?"),
    (480, "Que voit-on à l'écran derrière l'orateur ?"),
    (690, "Pourquoi dit-il qu'il faut aller sur la Lune ?"),
    (900, "Que vient-il de dire sur le coût du programme spatial ?"),
    (1110, "Qui est assis derrière lui ?"),
    (1350, "Résume les deux dernières minutes."),
    (1620, "A-t-il déjà parlé de Mars ou de Vénus ? Cite le moment."),
]
scenario = {
    "version": 1, "kind": "nominal", "loop": True,
    "index": {"path": "blocks.json", "sha256": sha(prepared / "blocks.json")},
    "provenance": {"kind": "converted-video",
                   "reference": ("Discours de Kennedy à Rice University (1962, domaine public), extrait de 7 minutes de "
                                 "media/samples/kennedy-rice-7min.mp4 converti par T262, bouclé et déclaré : environ sept "
                                 "minutes de contenu inédit pour trente minutes de calendrier ; capture LG non mesurée."),
                   "preparation": {"path": "preparation.json", "sha256": sha(prepared / "preparation.json")}},
    "plannedDurationMs": PLANNED, "finalWaitMs": 360000, "closeWaitMs": 30000,
    "config": {"perceptionBackend": "local", "questionsBackend": "local", "embeddingsBackend": "local",
               "inspectionBackend": "local",
               "localVlm": {"url": "http://127.0.0.1:11434", "model": "gemma3:4b"},
               "localQuestions": {"url": "http://127.0.0.1:11434", "model": "qwen3.8:27b", "numCtx": 16384},
               "localEmbeddings": {"url": "http://127.0.0.1:11434", "model": "qwen3-embedding:0.6b"},
               "visionDuringAsk": True, "backgroundIndex": True},
    "selectedModels": {"observationModel": "gpt-6-luna", "inspectionModel": "gpt-6-luna", "codexModel": "gpt-6"},
    "clips": clips,
    "questions": [{"id": f"question-{n}", "atMs": s * 1000, "question": q} for n, (s, q) in enumerate(QUESTIONS)],
}
(prepared / "scenario.json").write_text(json.dumps(scenario, ensure_ascii=False, indent=2))
print(f"{len(blocks)} blocs sources, {len(clips)} clips, {at / 60000:.1f} min planifiées, {len(QUESTIONS)} questions")
