# J2 et J3 — le journal mémoire dans le flux réel, sur 60 questions

## Question

Sur 30 questions, le journal mémoire ne se distinguait pas du bruit (N3, N5) : seules 6 questions dépendaient de la
mémoire. Hors ligne, le journal complet gagnait 4 réponses sur 60 et divisait presque par deux les inventions (G5). Sur
les 60 questions de l'oracle v3, dont 27 dépendent de la mémoire, le journal améliore-t-il les réponses dans le flux réel ?

## Configuration

- **J2** : N2 (questions `gemma4:26b-a4b`, pause vision, Whisper `small`, vision `gemma3:4b` sans `topicSummary`), sur les
  60 questions, sans journal.
- **J3** : J2 avec le journal mémoire complet injecté par le proxy (`--rewrite questions=journal`, le bras B de G5).
- `labo.py` remplace les questions de chaque vidéo par les 10 de l'oracle v3, sans toucher aux préparations.
- 22 octobre. J2 a d'abord été bloqué à 10:50 UTC par le garde-fou GPU, parce que le modèle de G5 se déchargeait encore ;
  il a été relancé de 10:51 à 12:21 UTC. J3 a tourné de 12:21 à 13:52 UTC. Sceaux complets, aucun fichier divergent.
  Plans et lanceurs : [`plans/`](plans/) ; bruts compressés : [`bruts/`](bruts/).
- Notation à l'aveugle des 120 réponses dans un même paquet, contre l'oracle v3 (120 textes distincts, 3 arbitrages) :
  [`notation/`](notation/).
- Âge des faits selon la fenêtre réelle du contexte [P − 56 s, P − 8 s) : 19 questions entièrement anciennes, 8 mixtes,
  33 récentes.

## Résultats

| | Pertinentes /60 | Inventions | Abst. injustifiées | Note moyenne | Délai médian | Sous 15 s | Blocs perdus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| J2 : sans journal | 28 | 16 | 19 | 1,48 | 5,0 s | 60/60 | 0 |
| **J3 : journal complet** | **38** | **9** | 14 | **1,91** | 6,3 s | **60/60** | 7 (CNRS seulement) |

| Pertinentes | J2 | J3 |
| --- | ---: | ---: |
| Entièrement anciennes (/19) | 0 | **6** |
| Mixtes (/8) | 3 | **7** |
| Récentes (/33) | 25 | 25 |
| 30 premières questions | 21 | 24 |
| 30 nouvelles questions | 7 | 14 |

- J3 gagne 15 questions et en perd 5, toutes récentes (test des signes : p ≈ 0,04 bilatéral).
- Gagnées : 6 anciennes, 4 mixtes, 5 récentes. Perdues : `artemis-07`, `cuisine-06`, `cuisine-n2`, `kennedy-n5`,
  `spring-01`.
- Critères fixés avant la notation (revue de Codex Astra) : gain d'au moins 5/60 (**+10**) ; inventions non accrues
  (**16 → 9**) ; perte d'au plus 1 sur les récentes (**25 → 25**, solde nul). Les trois sont remplis.

## Lecture

- Le journal mémoire est le premier gain de pertinence net dans le flux réel : **+10 réponses sur 60 et 7 inventions de
  moins**, pour 1,3 s de plus par question, toutes les réponses restant sous 15 s.
- Sans journal, aucune question entièrement ancienne n'obtient de bonne réponse (0/19), et le modèle s'abstient à tort ou
  invente. Avec le journal, il en réussit 6 sur 19 : la mémoire reste le point faible. Le journal est plafonné à
  10 000 caractères et aminci au milieu sur les longues vidéos, ce qui peut écarter le fait demandé.
- Diagnostic des 13 échecs sur les questions entièrement anciennes (analyse hors GPU suggérée par la revue de Codex
  Astra, corrigée par la session d'intégration du journal) : dans les 13 cas, les blocs qui portent le fait sont dans le
  journal ; aucun n'a été perdu ni retiré par le plafond.
  - 7 échecs sont des réponses du modèle rejetées par la validation des citations de TVLens : le modèle avait répondu en
    citant seulement des passages du journal (`artemis-n1`, `artemis-n2`, `artemis-n4`, `cnrs-n2`, `cnrs-n3`, `kennedy-n1`,
    `tears-n5`). Ces passages, injectés par le proxy, ne figurent pas dans les preuves de mémoire de DeepAsk, et la
    réponse devient « Je n'ai pas pu relier cette réponse aux passages consultés ». Il y a 8 rejets en tout dans J3, avec
    `artemis-07`, une question récente.
  - 4 échecs sont de vraies abstentions, sur des faits visuels ou écrits à l'écran (`spring-n2`, `spring-n3`, `spring-n4`,
    `cuisine-n3`), que le journal ne décrit qu'à chaque changement de sujet.
  - 2 sont des inventions (`kennedy-n3` reprend la coquille de transcription « William Brown »).
  J3 sous-estime donc l'apport du journal : intégré au produit, avec des entrées citables (ticket T313), ces 8 réponses
  pourraient passer la validation.
- Les 30 premières questions confirment la tendance (24 contre 21), mais l'écart y reste du même ordre que les bascules
  entre passages : il fallait les 60 questions pour conclure.
- Nouvelle meilleure configuration mesurée : **N2 + journal mémoire (J3)**. Pour le produit, il faudra aussi sortir
  `topicSummary` du chemin critique (J4) et intégrer le journal dans TVLens : aujourd'hui il est injecté par le proxy.

## Limites et incidents

- Un passage par configuration ; un test des signes à p ≈ 0,04 ne remplace pas une répétition.
- Oracle et juges sont des modèles. Un audit par Codex Astra, d'une autre famille de modèles, donne 90 % d'accord sur le
  statut ([revues](../2026-10-21-variantes-gx10/revues/README.md)).
- Incident de départ de J2 : garde-fou GPU déclenché par le déchargement du modèle de G5 ; les lanceurs suivants attendent
  désormais un GPU libre.
- Les campagnes et les journaux du proxy sont compressés avec `gzip -n` ; leurs empreintes renvoient aux fichiers non
  compressés sur la GX10.
