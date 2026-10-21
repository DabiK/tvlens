# Audit indépendant des essais GX10 de la nuit du 20 au 21 octobre

## Question

Les chiffres, sceaux et conclusions publiés par la session de nuit (19 dossiers `2026-10-20-*` et
`2026-10-21-*`, relais du 21 octobre à 11 h 40) se retrouvent-ils dans les bruts ? Les dossiers
respectent-ils les consignes d'essai (traces, aveugle, hygiène Git) ?

## Méthode

- **Dix auditeurs indépendants** (sous-agents Claude, lecture seule sur le dépôt), un par groupe de
  dossiers plus un transversal d'hygiène. Chaque chiffre affirmé a été recalculé depuis le brut
  (`campaign.json`, `result.json`, `status.json`…), le plus souvent par un script écrit par l'auditeur
  plutôt qu'en relançant celui de l'auteur. Sceaux locaux re-hachés, tests de chaque dossier relancés
  sans écrire dans le dépôt.
- **Contre-vérification adversariale** : chaque constat moyen ou grave a été confié à un second agent
  chargé de le réfuter en retournant aux bruts. Un constat sur 49 a été réfuté. Les 79 constats
  mineurs n'ont pas été contre-vérifiés.
- **Re-hachage distant** : [`sceaux_distants.py`](sceaux_distants.py) a recalculé sur la GX10, en
  lecture seule, chacun des 30 sceaux `integrite.json` et chaque fichier qu'il liste. Le résultat est
  dans [`sceaux-distants.json`](sceaux-distants.json).
- Configuration : dépôt `main` à `0cbe363` (identique à `origin/main`), 59 agents, 58 min. Aucune
  connexion SSH depuis les agents. Le re-hachage distant a été lancé depuis la session principale.

## Résultats

**30/30 sceaux distants intacts** : aucun fichier modifié, manquant ou ajouté. 28 ont une copie
locale identique suivie par Git ; les deux autres (`validation-client`, `validation-perception` de la
nuit) n'existent que sur la GX10.

| Unité | Affirmations confirmées | Écarts | Invérifiables | Sceaux locaux | Constats moyens | Mineurs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| consolidation | 23 | 1 | 2 | 12/12 | 1 | 11 |
| fiches | 21 | 3 | 0 | 9/11 | 2 | 13 |
| pause | 21 | 2 | 2 | 7/8 | 2 | 11 |
| images | 23 | 0 | 3 | 9/10 | 1 | 13 |
| shadow | 13 | 0 | 2 | 6/7 | 0 | 8 |
| ablation-nuit | 17 | 3 | 2 | 12/12 | 1 | 8 |
| qwen-vllm | 23 | 3 | 0 | 15/16 | 0 | 15 |
| streamingvlm | 28 | 4 | 3 | 9/11 | 1 | 13 |
| reference-corpus | 26 | 1 | 5 | 12/13 | 1 | 13 |
| hygiène | 26 | 0 | 2 | 17/18 | 2 | 11 |
| **Total** | **221** | **17** | **21** | | **11** | **116** |

Aucun constat grave n'a survécu : aucun chiffre principal faux, aucun secret ni adresse privée suivi,
aucun média ni poids dans Git. Les sceaux locaux non comptés correspondent à des fichiers présents
seulement sur la GX10. Les tests des dossiers passent (5 consolidation, 6 pause, 5 images, 6 et 1
corpus, 9 et 10 StreamingVLM) ; `node scripts/check.mjs --changed` était vert lors de l'audit.

Le détail des 128 constats (emplacement, description, avis du contre-vérificateur) est dans
[`constats.json`](constats.json) ; les recalculs et tests par unité sont dans
[`verifications.json`](verifications.json).

## Constats moyens qui changent la lecture

1. **Pause vision : gain surestimé.** Le passage A1 Kennedy a démarré à froid : `qwen3.8:27b` n'était
   pas résident à la première question, alors que `coldStart=false`. La différence appariée du passage
   1 (−12,06 s, dont −18,01 s sur `kennedy-01`) inclut ce chargement. Sur Spring, apparié au passage 1,
   B n'est plus rapide que sur 3 questions sur 5 (médiane −0,97 s). Au seuil interne, A tient 7/10
   réponses sous 20 s, et non 5/10. Les incidents vision de Spring (échec de `moment-9` à chaque
   passage, blocage de ~90 s de `moment-58` en B) ne sont pas consignés.
2. **Aveugle cassable.** À température 0, les deux sorties du bras A du test d'images sont identiques
   mot pour mot sur 24/24 blocs (4/24 pour B) : le bras se lit sans ouvrir les correspondances. Les
   graines de mélange sont publiques, et trois alias de la relecture des fiches sont révélés par des
   README. Les tables de correspondance sont suivies à côté des paquets.
3. **Oracle et preuves hors Git.** `experiments/gx10/evaluation/` (fiches, questions,
   `selection.json`, preuves, grille) n'a jamais été commité : le gel de la relecture n'est pas
   rejouable depuis un clone, et huit liens sont cassés. Les attendus Kennedy v1 ont été rédigés à
   partir d'une transcription TVLens `base`.
4. **Ablation CNRS :** B2 perd aussi 3 blocs par retard et 1 par erreur, loin des questions ; le
   README réservait ces pertes à A.
5. **StreamingVLM :** mémoire et taille du cache non rapportées alors que le protocole les demandait.
   Le cache KV croît sans éviction du texte (11 869 puis 13 057 positions sur 372 s).
6. **Traces :** 110 `.log` bruts restent ignorés par Git alors que 121 autres ont été forcés. Quatre
   README sont restés à l'état « préparé » malgré des résultats publiés ailleurs : référence, corpus
   étendu, StreamingVLM et reprise Docker.

Écarts mineurs notables : « 24 blocs » Qwen pour 12 blocs × 2 passages, tous issus de CNRS. Les chiffres
Kennedy de la vision (35 appels, médiane 7,272 s) viennent d'un instantané en cours de replay ; le run
complet donne 52 appels, médiane 7,319 s et moyenne 8,101 s. L'écart Ollama/vLLM tient surtout à la
longueur des sorties : à longueur égale, il passe de 4,37 à environ 0,5 s.

## Lecture

Les mesures de la nuit sont fiables : les nombres se recalculent et les bruts sont intacts. Les
**interprétations** de la pause vision et de l'ablation sont plus fragiles que présenté (chargement à
froid, passages mélangés, pertes mal attribuées). Les essais suivants doivent échauffer chaque modèle
avant la mesure, regrouper les sorties identiques avant notation et versionner l'oracle utilisé.

## Limites et incidents

- Auditeurs et contre-vérificateurs sont des modèles. Les constats mineurs ne sont pas contre-vérifiés.
- Les fichiers présents seulement sur la GX10 n'ont été vérifiés que par le re-hachage distant.
- Le lien Tailscale est passé par le relais DERP « fra » ; une connexion SSH a expiré une fois avant
  de réussir à la seconde tentative.
- Aucune correction n'a été appliquée aux dossiers audités : les README d'origine restent inchangés.
