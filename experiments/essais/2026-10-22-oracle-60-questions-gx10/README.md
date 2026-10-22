# Oracle v3 — 60 questions au lieu de 30

## Question

Rejouer GPS à l'identique fait basculer 8 questions sur 30 ([nuit du 22 octobre](../2026-10-22-variantes-nuit-gx10/)).
Avec 30 questions, un écart de quelques réponses est du même ordre que ces bascules et ne suffit pas à conclure. Peut-on doubler le jeu d'évaluation
automatiquement, avec le même soin que l'oracle v2, et en visant la mémoire, qui est la faiblesse principale ?

## Configuration

- Mêmes matériaux et même règle de disponibilité que l'oracle v2
  ([méthode](../2026-10-21-oracle-notation-recherche-gx10/)) : transcriptions `large-v3-turbo`, images toutes les 2 s,
  blocs de 8 s.
- Sous-agents Claude (Opus 5.5), trois paires de vidéos (Kennedy + Artemis, Spring + Tears, CNRS + Bœuf) :
  1. un rédacteur par paire écrit 5 questions par vidéo avec leur entrée d'oracle ;
  2. un vérificateur indépendant par paire reprend chaque question sur les médias et rend un verdict (acceptée,
     corrigée ou rejetée).

  Aucun agent ne voit une réponse de TVLens.
- Règles imposées :
  - questions en français, pour ne plus plafonner à 2/3 une réponse française à une question en anglais ;
  - pose multiple de 8 s, à 24 s au moins de toute autre pose ;
  - faits requis disponibles à la pose ;
  - au moins 3 questions sur 5 à fait **ancien**, c'est-à-dire hors des 6 derniers blocs clos (48 s) selon la règle
    donnée aux agents.
- Consignes exactes : [`consignes-agents.js.txt`](consignes-agents.js.txt) (trace, pas du code à exécuter). Sorties
  brutes : [`redaction-et-verification.json`](redaction-et-verification.json). 22 octobre, 08:02–08:40 UTC.

## Résultats

| | Nombre |
| --- | ---: |
| Questions rédigées | 30 (5 par vidéo) |
| Acceptées telles quelles | 15 |
| Corrigées par le vérificateur | 15 |
| Rejetées | 0 |
| Entièrement anciennes / en partie / récentes (fenêtre réelle) | 19 / 2 / 9 |

Les corrections portent sur des horodatages, une formulation ambiguë (`cnrs-n3`) ou une grille trop large. Pour
`artemis-n3`, la transcription Whisper hallucine dans la zone et le vérificateur a recoupé avec une autre transcription.

Un contrôle par script confirme pour les 30 questions : pose multiple de 8, écart d'au moins 24 s, faits requis
disponibles (A) et antérieurs à la pose, âge déclaré égal à l'âge calculé.

Fichiers :
- [`oracle-v3.json`](oracle-v3.json) : oracle v2 et les 30 nouvelles entrées (`v1Status: "new"`), 10 questions par
  vidéo.
- [`questions-60-scenario.json`](questions-60-scenario.json) : les 60 questions au format des scénarios de rejeu
  (`id`, `atMs`, `question`). Les 30 anciennes sont identiques, texte et instant, à celles des scénarios déjà joués.
- [`nouvelles-questions.json`](nouvelles-questions.json) et [`verdicts.json`](verdicts.json).

## Lecture

Le jeu passe à 60 questions. 19 des nouvelles dépendent entièrement de faits sortis du contexte récent et 2 en partie ;
parmi les 30 premières, aucune n'en dépend entièrement et 6 en partie. Au total, 27 questions sur 60 testent la mémoire.
Les essais suivants pourront être notés sur
60 questions, et les anciens restent comparables sur le sous-ensemble des 30 premières.

## Limites et incidents

- Âge des faits. La règle donnée aux agents (bloc hors des 6 derniers blocs clos) décale la fenêtre d'un bloc. Les
  requêtes réelles de N2 montrent qu'à une pose P, multiple de 8 s, les 6 passages reçus couvrent [P − 56 s, P − 8 s) :
  le bloc qui se ferme à la pose n'est pas encore traité. Recalculé avec cette fenêtre, l'âge change pour 3 questions
  (`cnrs-n1` et `cuisine-n4` en partie anciennes, `cnrs-n5` récente). Les agents en déclaraient 22 anciennes sur 30
  (une première version de ce dossier disait 23 : erreur de comptage relevée par Codex Astra). Le champ `factAge`
  d'`oracle-v3.json` suit la fenêtre réelle, et
  `factAgeDeclared` garde la valeur d'origine.
- Les questions et l'oracle sont écrits par des modèles, sans relecture humaine. Le vérificateur est indépendant
  du rédacteur, mais c'est le même modèle.
- Ajouter 5 questions par vidéo change la charge du flux : la vision est mise en pause pendant chaque question. Un essai
  à 60 questions se compare à un autre essai à 60 questions.
