# Bilan technique — pause de la vision pendant les questions

Le 21 octobre 2026, huit replays complets Kennedy puis Spring ont suivi l'ordre A/B/B/A sur GX10. A laisse partir les nouveaux appels visuels pendant les questions ; B les suspend. Tous les passages ont utilisé les mêmes cinq questions par vidéo, Whisper `base`, le même média et les mêmes poids. Le superviseur a terminé à 09:18:16 UTC, puis le [vérificateur](verifier_fermeture.py) a confirmé huit passages, la libération des verrous et le sceau SHA-256 `ad4f47c4fe1d8475958dfbd53c1d0f155f71a6a00455389ff7ee713bc2ba68c1`. Les [rapports bruts rapatriés](rapatriements/confirmation-pause-20261021T081500Z/results/) concordent avec ce sceau. Aucune relance ni inférence concurrente n'a eu lieu.

| Vidéo | Passage | HTTP p50 / p95 | Sous 15 / 20 s | Acquises ; `insufficient` | Couverture vision | Publications ; pertes par cause |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Kennedy | A1 | 23,26 / 26,16 s | 0/5 ; 2/5 | 5/5 ; 0 | 98,10 % | 52 ; backlog 1 |
| Kennedy | B1 | 11,20 / 15,13 s | 4/5 ; 5/5 | 5/5 ; 0 | 98,10 % | 52 ; backlog 1 |
| Kennedy | B2 | 11,23 / 15,32 s | 4/5 ; 5/5 | 5/5 ; 0 | 98,10 % | 52 ; backlog 1 |
| Kennedy | A2 | 15,38 / 20,26 s | 1/5 ; 3/5 | 5/5 ; 0 | 98,10 % | 52 ; backlog 1 |
| Spring | A1 | 12,17 / 13,67 s | 5/5 ; 5/5 | 5/5 ; 2 | 91,38 % | 53 ; backlog 4, erreur 1 |
| Spring | B1 | 11,19 / 17,25 s | 4/5 ; 5/5 | 5/5 ; 2 | 82,76 % | 48 ; backlog 8, erreur 2 |
| Spring | B2 | 8,19 / 13,34 s | 5/5 ; 5/5 | 5/5 ; 2 | 89,66 % | 52 ; backlog 4, erreur 2 |
| Spring | A2 | 13,03 / 17,33 s | 4/5 ; 5/5 | 5/5 ; 2 | 91,38 % | 53 ; backlog 4, erreur 1 |

Sur Kennedy, B est plus rapide sur les deux comparaisons appariées : différence médiane par question B−A de −12,06 s puis −7,06 s. Les 20 réponses sont acquises, la couverture et les pertes sont identiques entre bras. Les deux passages B donnent 10/10 réponses sous 20 s, contre 5/10 pour A. L'état chaud/froid affecte aussi A (23,26 puis 15,38 s de médiane) ; ce plan ne prouve pas que tout l'écart vient de la pause.

Sur Spring, B passe de 11,19 à 8,19 s entre ses deux passages, contre 12,17 puis 13,03 s pour A. Les quatre passages rendent chacun cinq réponses, dont `spring-04` et `spring-06` sont `insufficient` à chaque fois. L'amélioration de médiane de B coexiste avec une **couverture visuelle inférieure** (82,76 et 89,66 % contre 91,38 % pour A) et davantage de pertes. La médiane de l'âge du dernier passage analysé au début des questions est d'environ 12 s en A contre 16 s en B sur Spring ; elle n'est pas systématiquement plus mauvaise sur Kennedy. B ne peut donc pas être retenu comme amélioration factuelle générale à ce stade.

Les [40 délais individuels et 20 différences appariées](../2026-10-21-consolidation-gx10/bilan.json) restent disponibles par question. Le p95 de cinq observations par passage est fragile. Le délai est HTTP complet, observé par sondage ; aucun premier token n'a été mesuré. `acquired` indique la réception d'une réponse, et `insufficient` son type, pas sa justesse. Il faut relire à l'aveugle les réponses et les preuves temporelles, en priorité `kennedy-06`, `spring-04` et `spring-06`, avant une décision sur le ratio pertinence/vitesse. Les fiches restent `readyForScoring=false`.

La télémétrie complète de 23,1 Mo est sauvegardée hors Git sous `/Users/Dabi/Documents/TVLens-GX10/essais/confirmation-pause-20261021T081500Z/telemetry.jsonl`, au SHA-256 `0d89908337e6a959c05a4532460e13c8d9b6645fbcd4902525aa7c140b9b747a`, identique au sceau distant. Les médias, poids et copies d'entrées restent sur GX10 ; aucun de ces gros fichiers n'est ajouté à Git.
