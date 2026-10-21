# Incident d’identité Qwen : préfixe du SHA-256

## Diagnostic vérifié

À **00:04:55 UTC le 21 octobre 2026**, la file Qwen s’est arrêtée avec
`RuntimeError: OLLAMA_DIGEST_MISMATCH` après un téléchargement Ollama terminé avec le code 0.
Le problème est une comparaison de représentations : les **64 chiffres hexadécimaux sont identiques**,
mais le protocole préfixe l’empreinte par `sha256:` et l’API `/api/tags` ne le fait pas.

| Provenance | Valeur |
| --- | --- |
| Protocole gelé | `sha256:1d2c81ea69a06341d1aaa9e4fbd655402681057c291754008f44fa6e74acc298` |
| API après acquisition | `1d2c81ea69a06341d1aaa9e4fbd655402681057c291754008f44fa6e74acc298` |
| Modèle nommé | `qwen3-vl:4b-instruct-bf16` |
| Taille annoncée par l’API | 8 891 230 128 octets |
| Métadonnée de précision | `F16` |

La comparaison fautive est dans `queue.py`, lignes 266–275 du paquet gelé. Le téléchargement n’est
pas en cause selon les traces : le modèle était absent avant, le pull est sorti avec 0 après
428,301 s et l’empreinte après correspond. Aucun appel d’inférence Ollama de cette file n’a suivi.
Il ne s’agit donc pas d’un échec de compatibilité du modèle ; cette compatibilité reste **non testée**.

La mention BF16 du protocole initial n’est pas établie pour les tenseurs réellement servis par Ollama :
le tag contient `bf16`, mais l’API annonce `quantization_level=F16`. Conserver ce tag et ce digest permet
de garder le modèle choisi ; cela ne démontre pas une parité de précision avec vLLM en bfloat16.
La comparaison éventuelle devra expliciter cette limite.

## Conséquences et preuve

- Qwen vLLM : pré-vol de 1 cas puis 24 cas complets, tous déclarés `returned`, étapes sorties avec 0.
- Conteneur vLLM arrêté avant le téléchargement Ollama, à 23:57:46 UTC.
- Qwen Ollama : aucune inférence commencée ; seule l’acquisition est terminée.
- StreamingVLM : `blocked` pour `PREDECESSOR_FAILED`, sans étape de travail commencée.
- Le corpus étendu est indépendant de cette correction ; il conserve la priorité et ses processus
  ne doivent être ni interrompus ni concurrencés.

Racines originales, laissées intactes :

```text
/home/nvidia/tvlens-setup/reprise-qwen-20261020T224923Z/results
/home/nvidia/tvlens-setup/reprise-streaming-20261020T224923Z/results
```

La [capture JSON](preuves/capture.json) conserve les fichiers diagnostiques bruts et le résultat du
contrôle de **144 fichiers scellés Qwen et 3 fichiers scellés Streaming**, tous conformes. Les requêtes
contenant les images ne sont pas rapatriées ; leurs empreintes ont été contrôlées sur le GX10. Aucun
poids, média ou secret n’est inclus. Le [script de capture](capture.py) lit exclusivement ces dossiers
clos par SSH, avec `ControlMaster=no` et `ControlPath=none` ; il ne lit pas l’API et ne lance aucune charge.
Le [garde de reprise validé sur les originaux](preuves/validation-original.json) a aussi confirmé les
25 réponses et leurs SHA-256 en lecture seule sur le GX10, sans déployer ni lancer la reprise.

| Fichier | SHA-256 |
| --- | --- |
| Capture locale | `9f2e185454c83b42981847dbd6d8f98e17def96a16c962a49af1c35267a02746` |
| Sceau Qwen | `17660b79ce96c940ca1c5412ceb2fdcd23851824a3566d07871f8df12b63b026` |
| Statut Qwen | `fb63b5f075aa3fa0212416e250439905fbed2d209a0926021ee45ff74250ce28` |
| Tags Ollama après pull | `b40a2792fdb48a34e26a11399df502136a56cd532d8b406491c07055b3d82032` |
| Sceau Streaming | `1525213d99f3eb2e28d172ad3d3e7a80e2deb30254a82a1921020856719edeaa` |

## Correction bornée proposée

Le [suffixe préparé](../2026-10-21-reprise-bras-qwen/README.md) conserve les originaux et les réponses
vLLM, compare strictement les SHA-256 après retrait du seul préfixe optionnel `sha256:`, puis exécute
uniquement le bras Ollama manquant si le corpus est clos et si au moins une heure reste avant
05:00 UTC. Aucun téléchargement Qwen n’est autorisé par ce suffixe. Un modèle absent, une autre
empreinte ou une erreur de pré-vol provoque un arrêt sans nouvelle tentative.

Le garde d’origine Streaming exige `finished` pour Qwen : il **n’autorise pas** le simple contournement
du Qwen `blocked`. La préparation introduit donc un amendement explicite de dépendance, dans un nouveau
lanceur : Qwen d’origine au seul défaut de préfixe prouvé, suffixe terminé ou non exécuté faute de
créneau, corpus terminal scellé, conteneurs possédés arrêtés, absence de replay, trois verrous et
GPU/Ollama inactifs. Le modèle, les entrées et les paramètres Streaming restent ceux du paquet gelé,
avec échéance 12:00 UTC et budget propre de 3,5 h inchangés.

La solution minimale alternative consiste à conserver les deux bras manquants et à exploiter le
vLLM déjà obtenu. Aucun des deux choix n’autorise à transformer un statut original en succès.
Le diagnostic n'a lancé aucun téléchargement ni inférence. Le [suffixe](../2026-10-21-reprise-bras-qwen/README.md)
a ensuite été déployé à 00:25 UTC dans deux sessions en attente, sans charge GPU ; ses résultats restent
à observer.
