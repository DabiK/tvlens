"""Écrit plan-gx10.json : la grille des campagnes de la GX10, par ordre de valeur (les résultats clés d'abord).
Usage : python3 ecrire-plan.py [racine, par défaut /srv/tvlens-gx10]

Référence : la session de 30 minutes du Mac du 18/10 (copie B, Kennedy bouclé, blocs de 8 s à 5 images, perception
gemma3:4b, questions qwen3.8:27b en contexte 16 384, embeddings qwen3-embedding:0.6b, Whisper base aux réglages par
défaut du produit). Chaque axe change un seul paramètre par rapport à cette référence, sauf la configuration « boost ».
"""
import json
import sys

R = sys.argv[1] if len(sys.argv) > 1 else "/srv/tvlens-gx10"
COPY_B, COPY_C = f"{R}/copies/gx10-copie-b", f"{R}/copies/gx10-copie-c"

# Heures des questions sur 30 minutes, celles de la référence du Mac ; une session plus courte garde les premières.
TIMES = [90, 270, 480, 690, 900, 1110, 1350, 1620]
SPEECH = ["De quoi parle-t-on en ce moment ?", "Que voit-on à l'écran en ce moment ?",
          "Combien de personnes ont parlé depuis le début, et qui sont-elles ?", "Résume les deux dernières minutes.",
          "Quel texte est écrit à l'écran en ce moment ?", "Quelle affirmation chiffrée a été faite ? Cite le moment.",
          "Qu'est-ce qui a changé à l'image dans la dernière minute ?",
          "Quel a été le moment le plus important depuis le début ? Cite-le."]
SILENT = ["Que voit-on à l'écran en ce moment ?", "Quels personnages sont apparus depuis le début ?",
          "Quel texte ou intertitre vient d'apparaître ?", "Résume ce qui s'est passé dans les deux dernières minutes.",
          "Où se déroule la scène actuelle ?", "Qu'est-ce qui a changé à l'image dans la dernière minute ?",
          "Y a-t-il eu des paroles ? Si oui, cite-les.", "Quel a été le moment le plus marquant depuis le début ? Cite-le."]
KENNEDY = ["De quoi parle l'orateur en ce moment ?", "Quelles inventions cite-t-il pour résumer l'histoire de l'humanité ?",
           "Que voit-on à l'écran derrière l'orateur ?", "Pourquoi dit-il qu'il faut aller sur la Lune ?",
           "Que vient-il de dire sur le coût du programme spatial ?", "Qui est assis derrière lui ?",
           "Résume les deux dernières minutes.", "A-t-il déjà parlé de Mars ou de Vénus ? Cite le moment."]
def ask(texts):
    return [[t, q] for t, q in zip(TIMES, texts)]

# id : (fichier, langue, type, description, parole)
V = {
    "kennedy": ("kennedy-rice-7min.mp4", "en", "discours", "Discours de Kennedy à Rice University (1962, domaine public)", True),
    "01": ("01-ayrault-discours.mp4", "fr", "discours", "Discours de Jean-Marc Ayrault (MEAE, CC BY)", True),
    "02": ("02-meae-table-ronde-ukraine.mp4", "fr", "débat", "Table ronde Ukraine/Russie (MEAE, CC BY)", True),
    "03": ("03-meae-archeologie.mp4", "fr", "reportage", "80 ans d'archéologie française à l'étranger (MEAE, CC BY)", True),
    "04": ("04-cnrs-entrainement-ia.mp4", "fr", "cours", "Comment s'entraîne une IA ? (CNRS FIDLE, CC BY)", True),
    "05": ("05-boeuf-bourguignon.mp4", "fr", "tutoriel", "Le bœuf bourguignon authentique (CC BY)", True),
    "06": ("06-age-de-pierre.mp4", "fr", "fiction", "L'âge de Pierre (BADNEWS, CC BY)", True),
    "07": ("07-parlement-europeen-discours.mp4", "en", "discours", "Discours au Parlement européen (CC BY)", True),
    "08": ("08-tears-of-steel.mov", "en", "fiction", "Tears of Steel (Blender Foundation, CC BY 3.0)", True),
    "09": ("09-artemis-lancement.mp4", "en", "direct", "Lancement d'Artemis I, 2:50:00-3:25:00 (NASA, domaine public)", True),
    "10": ("10-big-buck-bunny.mp4", "none", "animation", "Big Buck Bunny (Blender Foundation, CC BY)", False),
    "11": ("11-dvorak-marine-band.mp4", "none", "musique", "Dvořák, Carnival Overture (US Marine Band, domaine public)", False),
    "12": ("12-voyage-dans-la-lune.webm", "none", "muet", "Le Voyage dans la Lune (Méliès, 1902, domaine public)", False),
    "13": ("13-nosferatu.webm", "none", "muet", "Nosferatu (Murnau, 1922, domaine public), intertitres allemands", False),
    "14": ("14-bustinduy-discours.mp4", "es", "discours", "Discours de Pablo Bustinduy (ministère espagnol, CC BY)", True),
    "15": ("15-nasa-iss-visite.mp4", "es", "visite", "Visite de l'ISS avec Frank Rubio (NASA en Español)", True),
    "16": ("16-unican-diapositives.mp4", "es", "cours", "Le texte dans les diapositives (Universidad de Cantabria, CC BY)", True),
    "17": ("17-terrax-klimafaktoren.webm", "de", "documentaire", "Die wichtigsten Klimafaktoren (ZDF Terra X, CC BY 4.0)", True),
    "18-deu": ("18-ccc-verlorene-domains-deu.mp4", "de", "conférence", "39C3, Verlorene Domains, piste allemande (CC BY 4.0)", True),
    "18-eng": ("18-ccc-verlorene-domains-eng.mp4", "en", "conférence", "39C3, Verlorene Domains, interprétation anglaise (CC BY 4.0)", True),
    "18-fra": ("18-ccc-verlorene-domains-fra.mp4", "fr", "conférence", "39C3, Verlorene Domains, interprétation française (CC BY 4.0)", True),
    "19": ("19-chigi-conseil-ministres.mp4", "it", "conférence de presse", "Conférence de presse du Conseil des ministres (Palazzo Chigi, CC BY)", True),
    "20": ("20-draghi-scholz.mp4", "it", "déclarations", "Draghi et Scholz, italien et allemand (Palazzo Chigi, CC BY)", True),
}
videos = {vid: {"file": f"{R}/videos/{f}", "language": lang, "kind": kind, "description": d,
                "questions": ask(KENNEDY if vid == "kennedy" else SPEECH if speech else SILENT)}
          for vid, (f, lang, kind, d, speech) in V.items()}

# Préparations : 8 s à 5 images comme la référence ; G1 sur 2 minutes prises après l'ouverture, G3 sur 30 minutes.
G1_START = {"10": 60000, "12": 120000, "13": 300000}
preparations = {}
for vid in V:
    preparations[f"{vid}-g1"] = {"video": vid, "startMs": G1_START.get(vid, 60000), "durationMs": 120000, "blockMs": 8000, "frames": 5}
    preparations[f"{vid}-g3"] = {"video": vid, "startMs": 0, "durationMs": 1800000, "blockMs": 8000, "frames": 5}
preparations["kennedy-g1"]["startMs"] = 0

REF = {"vlm": {"model": "gemma3:4b", "keepAlive": "10m"},
       "questions": {"model": "qwen3.8:27b", "numCtx": 16384, "keepAlive": "10m"},
       "embeddings": {"model": "qwen3-embedding:0.6b"}}
REF_WHISPER = {"model": "base", "threads": None, "audioCtx": None}
BOOST = {"roles": {"vlm": {"model": "gemma3:12b"}, "questions": {"numCtx": 32768}},
         "whisper": {"model": "large-v3-turbo"}, "ollama": {"numParallel": 4, "maxLoadedModels": 4}}

campaigns = []
def g3(cid, prep, minutes=30, **extra):
    campaigns.append({"id": cid, "kind": "g3", "preparation": prep, "durationMin": minutes, **extra})
def boosted(**over):
    roles = {k: {**BOOST["roles"].get(k, {}), **over.get("roles", {}).get(k, {})} for k in {*BOOST["roles"], *over.get("roles", {})}}
    return {"roles": roles, "whisper": {**BOOST["whisper"], **over.get("whisper", {})}, "ollama": {**BOOST["ollama"], **over.get("ollama", {})},
            **{k: v for k, v in over.items() if k not in ("roles", "whisper", "ollama")}}

# A. Comparaison à l'identique avec le Mac : même code (copie B), puis la copie C, mêmes réglages.
g3("a1-kennedy-copie-b-reference", "kennedy-g3", code=COPY_B)
g3("a2-kennedy-copie-c-reference", "kennedy-g3")
# B. Ce que la GX10 apporte : tout ensemble d'abord (le chiffre principal), puis un axe à la fois.
g3("b1-kennedy-boost", "kennedy-g3", **boosted())
campaigns.append({"id": "c0-whisper-fr-gpu-cpu", "kind": "whisper", "preparation": "01-g1", "models": ["base", "large-v3-turbo"],
                  "threads": "4,8", "audioCtx": "0", "repeats": 2, "files": 8})
campaigns.append({"id": "c0-whisper-fr-cpu", "kind": "whisper", "preparation": "01-g1", "models": ["base", "large-v3-turbo"],
                  "threads": "4,8,16", "audioCtx": "0", "repeats": 2, "files": 8, "noGpu": True})
g3("b2-kennedy-whisper-turbo", "kennedy-g3", whisper={"model": "large-v3-turbo"})
g3("b3-kennedy-vision-12b", "kennedy-g3", roles={"vlm": {"model": "gemma3:12b"}})
g3("b4-kennedy-parallele-4", "kennedy-g3", ollama={"numParallel": 4, "maxLoadedModels": 4})
g3("b5-kennedy-surcharge-boost", "kennedy-g3", minutes=10, scenario="overload", burstAtS=300, **boosted())

# D. Perception image par image, par modèle de vision, sur les vidéos les plus visuelles (à froid au premier passage).
VISUAL = ["03", "04", "05", "08", "10", "12", "15", "16", "17"]
VLMS = ["gemma3:4b", "gemma3:12b", "gemma3:27b", "qwen2.5vl:7b", "qwen2.5vl:32b", "qwen2.5vl:72b", "mistral-small3.2:24b",
        "qwen3-vl:8b", "qwen3-vl:32b"]
for model in VLMS:
    tag = model.replace(":", "-").replace(".", "")
    for n, vid in enumerate(VISUAL):
        campaigns.append({"id": f"d-{tag}-{vid}", "kind": "g1", "preparation": f"{vid}-g1", "roles": {"vlm": {"model": model, "numCtx": 8192}},
                          "cold": n == 0})

# C. Transcription par langue et par modèle Whisper, sur GPU.
for vid in ["01", "04", "05", "07", "08", "09", "14", "15", "16", "17", "18-deu", "18-fra", "18-eng", "19", "20"]:
    campaigns.append({"id": f"c-whisper-{vid}", "kind": "whisper", "preparation": f"{vid}-g1",
                      "models": ["base", "small", "medium", "large-v3-turbo"], "threads": "8", "audioCtx": "0", "repeats": 1, "files": 8})

# E. Sessions de 30 minutes par langue et par type, en configuration boost.
g3("e1-02-debat-fr", "02-g3", **boosted())
g3("e2-18-conference-de", "18-deu-g3", **boosted())
g3("e3-18-conference-fr", "18-fra-g3", **boosted())
g3("e4-18-conference-en", "18-eng-g3", **boosted())
g3("e5-09-direct-en", "09-g3", **boosted())
g3("e6-13-muet", "13-g3", **boosted())
g3("e7-19-conference-it", "19-g3", minutes=27, **boosted())
g3("e8-20-it-de", "20-g3", minutes=27, **boosted())
g3("e9-06-fiction-fr", "06-g3", minutes=16, **boosted())

# F. Modèles de questions et rôles annexes, sur 15 minutes du débat français, en configuration boost.
g3("f1-02-questions-sans-raisonnement", "02-g3", minutes=15, **boosted(roles={"questions": {"think": "off"}}))
g3("f2-02-questions-gpt-oss-120b", "02-g3", minutes=15, **boosted(roles={"questions": {"model": "gpt-oss:120b"}}))
g3("f3-02-questions-qwen3-30b-a3b", "02-g3", minutes=15, **boosted(roles={"questions": {"model": "qwen3:30b-a3b"}}))
g3("f4-02-questions-qwen3-32b", "02-g3", minutes=15, **boosted(roles={"questions": {"model": "qwen3:32b"}}))
g3("f5-02-reexamen-qwen25vl-32b", "02-g3", minutes=15, **boosted(roles={"inspection": {"model": "qwen2.5vl:32b", "numCtx": 16384}}))
g3("f6-02-embeddings-8b", "02-g3", minutes=15, **boosted(roles={"embeddings": {"model": "qwen3-embedding:8b"}}))

plan = {
    "version": 1, "root": R, "code": COPY_C,
    "tools": {"node": "node", "ffmpeg": "/usr/bin/ffmpeg", "whisper": f"{R}/outils/whisper.cpp/build/bin/whisper-cli",
              "ollama": "ollama", "nvidiaSmi": "nvidia-smi"},
    "ollama": {"mode": "managed", "url": "http://127.0.0.1:11434", "env": {"OLLAMA_MODELS": f"{R}/modeles-ollama"}},
    "whisperModels": {m: f"{R}/poids/ggml-{m}.bin" for m in ["base", "small", "medium", "large-v3-turbo"]},
    "sampleSeconds": 5, "minFreeGb": 40,
    "videos": videos, "preparations": preparations,
    "defaults": {"roles": REF, "whisper": REF_WHISPER, "cold": True},
    "campaigns": campaigns,
}
with open("plan-gx10.json", "w") as f:
    json.dump(plan, f, ensure_ascii=False, indent=2)
kinds = {}
for c in campaigns:
    kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
print(f"{len(campaigns)} campagnes : {kinds} ; {len(videos)} vidéos ; {len(preparations)} préparations")
