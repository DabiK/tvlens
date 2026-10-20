# Essai du 18/10/2026 — recette réelle sur la TV et le VPS (projection de la Mémoire)

Recette de T233 : point de contrôle avant de retirer l'ancien chemin de publication de la Mémoire. Deux sessions
réelles, sur la vraie TV, le vrai VPS et les vrais fournisseurs ; parcours conduits par le propriétaire, journaux et
états relevés par l'orchestrateur. Une exécution de chaque parcours : aucune statistique.

## Question

La projection de la Mémoire servie par le serveur depuis T219 tient-elle en réel, de la capture TV à la réouverture
d'une archive : passages, sujets, question citée, surveillance, fin de session ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | tag `recette-t233` (`e2696c2`), release figée `recette-t233-20261018-e2696c2` sur le VPS ; page et compagnon TV déployés depuis ce tag |
| TV | LG 75QNED87T, webOS, application YouTube, capture par le contrôleur de la TV |
| Serveur | VPS Linux, 2 vCPU partagés, Whisper sur CPU (`ggml-base`), vision et questions par Codex (`gpt-6-luna`) |
| Session 1 | `5c07dc06`, parcours nominal, environ 5 min 30 de capture, une question |
| Session 2 | `78b2173e`, environ 5 min, surveillance « Vérifie les chiffres annoncés. », fin puis réouverture |
| Données brutes | `resultats-vps.json` (exportées en lecture seule du VPS, adresses masquées) |

## Résultats

| Mesure | Session 1 | Session 2 |
| --- | --- | --- |
| Passages prêts | 35 / 35 | 32 / 33 à l'archivage |
| Trous audio ou image, erreurs | 0 | 0 |
| Retard d'analyse à l'arrêt | 0 | — |
| Sujets regroupés | 9 | 1 |
| Question | « De quoi ça parle », 11 s, 5 citations | — |
| Surveillance | — | 1 carte sourcée (3 sources dont l'INA, 6 recherches web), 1 affirmation indéterminée |
| Fin et réouverture | — | archivée, rouverte en lecture seule depuis « Sessions » |

Latences de la session 1 (moyenne, maximum) : transcription 7,3 s (18,1 s) pour des blocs de 8 s ; attente audio
2,9 s (11,2 s) ; vision 4,1 s (6,4 s) ; passage prêt 16,1 s (26,1 s) après la fin de son bloc.

## Lecture

- **La projection tient en réel.** Aucun passage perdu, aucune erreur, le cycle complet fonctionne sur la TV.
- **La citation existe côté serveur** ; la TV l'affiche en lignes horaires, sans lien, faute de pointeur.
- **La surveillance distingue ce qui est sourcé de ce qui ne l'est pas**, plutôt que de trancher sans preuve.
- **Whisper sur le CPU partagé du VPS est à la limite du temps réel** : 7,3 s pour 8 s d'audio, contre 5,2 s le 13/10.
  C'est la seule marge fragile du chemin, et un argument pour une transcription sur GPU (GX10).

## Limites et incidents

- Une exécution par parcours, contenus choisis par le propriétaire, aucune annotation.
- Une détection de la surveillance a dépassé son délai ; le passage a été relu automatiquement.
- **Écarts relevés, antérieurs au code testé :** panneau refusé sur une vidéo YouTube à bandes noires (1668×1080),
  sans message (corrigé par T268) ; titre de session à l'heure UTC du VPS, corrigé le jour même par le fuseau
  `Europe/Paris` dans l'unité systemd ; la TV exécutait un `panel.py` antérieur au dépôt.
