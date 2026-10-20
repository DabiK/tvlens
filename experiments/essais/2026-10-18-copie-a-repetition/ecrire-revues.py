"""Écrit les revues (format T258, version 1) des rejeux 4B et Codex de la répétition T274.

Revue de l'orchestrateur (Claude), lue sur les sorties et les images envoyées : elle exerce la chaîne, elle ne vaut pas
une revue humaine G2. Usage : python3 ecrire-revues.py <dossier t274>
"""
import hashlib
import json
import sys
from pathlib import Path

T = Path(sys.argv[1])
manifest_sha = hashlib.sha256((T / "kennedy-b/manifest.json").read_bytes()).hexdigest()
annotations_sha = hashlib.sha256((T / "annotations.json").read_bytes()).hexdigest()
REVIEWER = "orchestrateur Claude, répétition T274 du 18/10, pas une revue humaine G2"


def dim(value, reason):
    return {"value": value, "reason": reason}


SPEECH = dim("na", "Aucune parole transmise : le rejeu d'une vidéo convertie envoie un transcript vide.")
ORDER = dim("na", "Bloc d'une seule scène continue, sans événements successifs à ordonner.")
REFS = dim("na", "Le rejeu de routine ne produit pas de référence explicite ; aucune n'est attendue.")
CAUSAL = dim("valid", "Aucun contenu postérieur au bloc ; contexte vide déclaré.")


def line(case_id, accuracy, invention, description, provenance, reason, abstention="none"):
    return {"id": case_id, "status": "reviewed", "reason": reason, "citations": [], "dimensions": {
        "accuracy": accuracy, "invention": invention, "order": ORDER,
        "imageEvidence": dim("sufficient", "Cinq images nettes du pupitre, du sceau, du drapeau et de la foule."),
        "speechEvidence": SPEECH, "description": description,
        "abstention": dim(abstention, "La réponse décrit la scène sans s'abstenir, ce que les images permettent."),
        "references": REFS, "causality": CAUSAL, "provenance": provenance}}


NAME = "nomme Kennedy sans preuve dans les images (le sceau prouve la fonction, pas l'identité), incertitude « Aucune »"
reviews = {
    "gemma3_4b": [
        line("video-0", dim("partial", "Pupitre, foule et drapeaux justes ; le sceau est décrit comme « l'insigne de l'Élysée »."),
             dim("present", "Insigne de l'Élysée inventé ; " + NAME + "."),
             dim("misdescribed", "Le sceau lisible « President of the United States » devient un insigne français."),
             dim("valid", "Seules les images sont décrites."), "Scène juste, sceau mal identifié, identité affirmée."),
        line("video-1", dim("partial", "Pupitre et stade justes ; il ne tient pas le drapeau et le sceau n'est pas un badge."),
             dim("present", "Drapeau tenu, badge porté et banderoles de la foule inventés ; " + NAME + "."),
             dim("misdescribed", "Le sceau du pupitre devient un badge sur sa veste."),
             dim("valid", "Seules les images sont décrites."), "Trois détails inventés sur une scène juste."),
        line("video-2", dim("partial", "Foule et drapeau justes ; il ne tient pas le drapeau, le sceau est devant lui."),
             dim("present", "Drapeau tenu inventé ; " + NAME + "."),
             dim("misdescribed", "Le sceau, sur le pupitre au premier plan, est placé en arrière-plan."),
             dim("valid", "Seules les images sont décrites."), "Geste inventé et sceau mal placé."),
        line("video-3", dim("partial", "Pupitre, sceau, drapeau et foule justes ; le regard baissé vers les notes manque."),
             dim("present", NAME[0].upper() + NAME[1:] + "."),
             dim("faithful", "Les éléments décrits sont présents dans les images."),
             dim("valid", "Seules les images sont décrites."), "Juste, mais identité affirmée et geste attendu absent."),
    ],
    "codex": [
        line("video-0", dim("correct", "Orateur au pupitre, sceau présidentiel, drapeau à gauche, foule et personnalités."),
             dim("absent", "Aucune identité affirmée : l'incertitude dit qu'elle n'est pas établie."),
             dim("faithful", "Description conforme aux images envoyées."),
             dim("valid", "L'absence de paroles est déclarée ; rien n'est attribué au son."), "Conforme à l'attendu."),
        line("video-1", dim("correct", "Pupitre présidentiel, stade, drapeau et foule."),
             dim("absent", "Identité non affirmée ; rien d'ajouté."), dim("faithful", "Conforme aux images."),
             dim("valid", "Absence de paroles déclarée."), "Conforme ; le regard tourné n'est pas relevé."),
        line("video-2", dim("correct", "Drapeau déployé derrière l'orateur, foule ; détail vérifiable de l'homme au tissu blanc."),
             dim("absent", "Le tissu blanc est visible à droite des images ; aucune identité affirmée."),
             dim("faithful", "Conforme aux images."), dim("valid", "Absence de paroles déclarée."),
             "Conforme, avec un détail juste en plus."),
        line("video-3", dim("correct", "Il baisse la tête puis se redresse : le geste attendu vers les notes est relevé."),
             dim("absent", "Aucune identité ni action ajoutée."), dim("faithful", "Conforme aux images."),
             dim("valid", "Absence de paroles déclarée."), "Conforme à l'attendu, geste compris."),
    ],
}
for name, cases in reviews.items():
    report = T / f"rejeu-{name}/campaign.json"
    run = json.loads(report.read_text())
    review = {"version": 1, "manifestSha256": manifest_sha, "annotationsSha256": annotations_sha,
              "reportSha256": hashlib.sha256(report.read_bytes()).hexdigest(), "runId": run["runId"],
              "reviewer": REVIEWER, "cases": cases}
    (T / f"revue-{name}.json").write_text(json.dumps(review, ensure_ascii=False, indent=2))
    print("revue écrite :", name, run["runId"])
