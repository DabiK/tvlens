"""Prépare deux corpus d'images dérivés ; aucun modèle, réseau ou processus externe."""
import copy
import hashlib
import json
from pathlib import Path
import sys


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def write_json(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    with path.open("xb") as stream:
        stream.write(raw)
    return digest(raw)


def prepare(source, output):
    original = json.loads(source.read_text())
    if output.exists():
        raise ValueError("Le dossier de sortie doit être neuf.")
    loaded = []
    for case in original["cases"]:
        relative = Path(case["media"]["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Chemin média non relatif.")
        raw = (source.parent / relative).read_bytes()
        if digest(raw) != case["media"]["sha256"]:
            raise ValueError("Empreinte média différente.")
        media = json.loads(raw)
        if len(media["frames"]) != 5:
            raise ValueError("Cinq images source sont nécessaires.")
        loaded.append(media)
    output.mkdir()
    (output / "media").mkdir()
    for name, indices in [("five-images", [0, 1, 2, 3, 4]), ("three-images", [0, 2, 4])]:
        manifest = copy.deepcopy(original)
        manifest["derivation"] = {
            "sourceManifestSha256": digest(source.read_bytes()),
            "selectedFrameIndices": indices,
            "method": "Sélection de pixels existants, sans réencodage ni inférence.",
        }
        for index, (case, media) in enumerate(zip(manifest["cases"], loaded)):
            derived = copy.deepcopy(media)
            derived["frames"] = [media["frames"][position] for position in indices]
            relative = Path("media") / f"{name}-{index:03d}.json"
            case["media"] = {"path": str(relative), "sha256": write_json(output / relative, derived)}
            case["lightweight"] = {"value": False, "source": "explicit-default"}
        write_json(output / f"perception-{name}.json", manifest)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage : prepare-visual-ablation.py manifeste-source.json dossier-neuf")
    prepare(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
