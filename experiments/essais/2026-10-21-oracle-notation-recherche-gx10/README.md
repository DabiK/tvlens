# Oracle v2, notation initiale et recherche — méthode commune des essais du 21 octobre

## Question

Comment juger la pertinence des réponses sans relecture humaine (demande du propriétaire), et quelles pistes tester
en priorité ? Ce dossier rassemble ce qui sert à tous les essais : l'oracle, la notation des 150 réponses déjà
produites, la recherche bibliographique et la méthode (consignes des agents, outils).

## Configuration

- Sous-agents Claude (Opus 5.5), au plus quatre à la fois sur le Mac, orchestrés par des workflows. Leurs consignes
  exactes sont dans [`methode/consignes-agents/`](methode/consignes-agents/), en `.js.txt` : ce sont des traces, pas du
  code à exécuter.
- Matériaux : transcriptions `large-v3-turbo` et images toutes les 2 s
  ([oracle-medias](../2026-10-21-oracle-medias-gx10/)), SRT officiel de Tears, fiches v1 gelées
  ([relecture des fiches](../2026-10-21-relecture-fiches-gx10/)).
- Programme préenregistré : [`methode/PROGRAMME.md`](methode/PROGRAMME.md) ; contexte donné aux agents de recherche :
  [`methode/contexte-recherche.md`](methode/contexte-recherche.md) ; outils d'analyse : [`methode/outils/`](methode/outils/).

## Oracle v2

Pour chaque vidéo, deux relecteurs indépendants établissent depuis les médias seulement, sans jamais voir de réponse de
modèle :
- les faits requis et optionnels, avec leur preuve horodatée ;
- leur disponibilité à la pose, compte tenu des blocs de 8 s ;
- les inventions à sanctionner et la politique d'abstention ;
- une grille de 0 à 3.

Un arbitre réconcilie les deux relectures. Résultat : [`oracle/oracle-v2.json`](oracle/oracle-v2.json) ; les 18
relectures et arbitrages sont dans [`oracle/relectures-et-arbitrages.json`](oracle/relectures-et-arbitrages.json).
Face aux attendus v1 : 21 confirmés, 8 corrigés, 1 mal posé (`spring-04` à l'instant de la pose).

## Notation

Les réponses sont regroupées par question, mélangées et anonymisées, sans configuration ni délai. Les textes identiques
sont fusionnés pour ne pas trahir un bras. Deux juges indépendants notent chaque réponse : 0–3, invention, abstention
justifiée ou non. Un troisième juge tranche les écarts de 2 points ou les désaccords sur l'invention. La
correspondance n'est ouverte qu'après la notation. « Pertinente » : note ≥ 2 sans invention.

Notation des 150 réponses antérieures (référence, corpus étendu, pause, nuit) : [`notation-v0/`](notation-v0/), table
par vidéo et configuration dans [`notation-v0/frontiere.md`](notation-v0/frontiere.md). Les notations suivantes sont
rangées avec leur essai.

## Recherche

Trois revues indépendantes, sous les consignes du rôle researcher (`.codex/agents/researcher.toml`) et l'outil MCP
arXiv : latence des questions, coût de la perception, mémoire et transcription. Une synthèse en programme d'essais et
en propositions d'architecture : [`recherche/SYNTHESE.md`](recherche/SYNTHESE.md) (texte rendu) et
`SYNTHESE-fichier-agent.md` (fichier écrit en cours de route, légèrement différent). Revues, mesures dérivées et scripts
dans [`recherche/`](recherche/).

## Lecture

L'oracle et les juges permettent de classer les variantes entre elles avec une même règle. Ils ne remplacent pas une
vérité humaine.

## Limites et incidents

- Oracle et juges sont des modèles, sans relecture humaine. Les juges s'accordent presque toujours (138 notes
  identiques sur 138 en notation v0), ce qui montre leur cohérence, pas leur justesse.
- La grille plafonne à 2/3 une réponse en français à une question en anglais, alors que TVLens répond en français par
  conception. L'effet est le même pour toutes les configurations.
- Une première notation d'E4 a été lancée avec une liste de vidéos fixée en dur, puis arrêtée avant tout résultat et
  relancée correctement.
