"""Prépare un corpus de rejeu (manifeste version 1) depuis une capture conservée du Mac, sans la modifier.

Les JSON média sont copiés octet pour octet ; le transcript vient de observation.transcript de l'archive, avec une
disponibilité inconnue au départ de la vision ; le contexte reste inconnu ; lightweight vient des métriques sauvegardées.
Usage : python3 preparer-corpus.py <dossier de session> <dossier du corpus> [nombre de passages]
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

session_dir, corpus = Path(sys.argv[1]), Path(sys.argv[2])
count = int(sys.argv[3]) if len(sys.argv) > 3 else 4
session = json.loads((session_dir / "session.json").read_text())
ready = [p for p in session["segments"] if p.get("status") == "ready"][:count]
(corpus / "media").mkdir(parents=True, exist_ok=False)
cases = []
for p in ready:
    source = session_dir / "media" / f"{p['id']}.json"
    target = corpus / "media" / source.name
    shutil.copyfile(source, target)
    media = json.loads(target.read_text())
    saved = (p.get("metrics") or {}).get("lightweight")
    cases.append({
        "id": f"{session['id'][:8]}-{p['id']}",
        "startMs": media["startMs"], "endMs": media["endMs"],
        "media": {"path": f"media/{source.name}", "sha256": hashlib.sha256(target.read_bytes()).hexdigest()},
        "provenance": {"kind": "tvlens-capture", "sessionId": session["id"], "passageId": p["id"]},
        "transcript": {
            "text": (p.get("observation") or {}).get("transcript") or "",
            "availability": "unknown",
            "limits": "Texte final de l'archive : sa disponibilité au départ de la vision n'est pas conservée.",
            "provenance": {"kind": "archive-observation",
                           "reference": f"session.json de {session['id']}, {p['id']}, observation.transcript"},
        },
        "context": {"value": None, "limits": "Contexte de départ non conservé ; aucun recalcul depuis l'archive."},
        "lightweight": ({"value": saved, "source": "saved-metrics"} if isinstance(saved, bool)
                        else {"value": False, "source": "explicit-default"}),
    })
(corpus / "manifest.json").write_text(json.dumps({"version": 1, "cases": cases}, ensure_ascii=False, indent=2))
print(f"{len(cases)} cas, manifeste {corpus / 'manifest.json'}")
