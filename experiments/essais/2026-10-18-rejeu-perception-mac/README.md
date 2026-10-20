# Essai du 18/10/2026 — rejeu d'une vraie capture par la perception de production

Contrôle réel T272, après T257. Quatre passages, une campagne par backend, sans annotation humaine : premier usage
réel du runner de rejeu qui servira à G1 et G2 sur le GX10.

## Question

Le runner de T257 valide-t-il un corpus préparé depuis une vraie capture, rejoue-t-il ses passages par la perception
de production en local et avec la référence Codex, et refuse-t-il une entrée altérée avant tout appel ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `b9f5d56` (T257), `scripts/replay-local-perception.cjs` |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, boucle arrêtée |
| Corpus | 4 premiers passages prêts de la session `ec55a89c` du 17/10 (2 s, puis 3 × 8 s), préparés par `preparer-corpus.py` : JSON média copiés octet pour octet avec leur SHA-256, transcript de l'archive marqué `availability: unknown`, contexte inconnu, `lightweight` des métriques sauvegardées ; `manifeste.json` |
| Local | `--backend local`, Ollama 0.33.2, `gemma3:4b`, fenêtre 8 192, `keep_alive` 2 min |
| Référence | `--backend codex`, `gpt-6-luna`, un nouvel agent par cas |
| Données brutes | `campagne-validation.json`, `campagne-locale.json`, `campagne-codex.json`, `campagne-media-altere.json` |

Les médias (2,7 Mo d'images de la capture) ne sont pas recopiés ici : leurs empreintes figurent dans le manifeste.

## Résultats

| Campagne | Issue | Durée par cas | Remarque |
| --- | --- | --- | --- |
| Validation | 4 / 4 `validated`, code 0 | — | aucun agent construit |
| Local `gemma3:4b` | 4 / 4 `succeeded`, complète | 6,8 / 5,9 / 5,1 / 5,3 s | chargement 1,8 s au premier cas, puis 3 à 4 ms |
| Référence Codex | 4 / 4 `succeeded`, complète | 4,2 / 4,7 / 4,1 / 5,8 s | `coldStart` vrai à chaque cas (un fil neuf par cas) |
| Média altéré (un octet ajouté) | `TVLENS_REPLAY_HASH_MISMATCH`, incomplète, code 1 | — | aucun appel à Ollama |

Chaque cas réussi conserve le prompt exact, son empreinte et les images effectivement envoyées (indice, instant,
empreinte). La référence porte `backend: codex` et `reference: codex`.

Exemple, passage 2 : Codex écrit que « le présentateur évoque un sondage publié lundi dernier par Toluna et Harris
Interactive pour M6 et RTL » ; le 4B écrit qu'« un homme est en direct sur YouTube » et lit le titre de la vidéo.

## Lecture

- **Le runner est prêt pour G1 et G2** : traçabilité complète (code, entrées, images envoyées), refus avant appel,
  référence Codex séparée de la mesure locale.
- **Le 4B suit le rythme** : environ 5 à 7 s par passage de 8 s.
- **L'écart de fond se confirme** sur un second protocole : Codex rend la parole, le 4B l'image. G2 devra le noter.

## Limites et incidents

- Quatre passages, aucune annotation : `g2Eligible: false`, aucune notation.
- Transcript et contexte de départ non conservés par l'archive : déclarés inconnus, jamais reconstitués.
