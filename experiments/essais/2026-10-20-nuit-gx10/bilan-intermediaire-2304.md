# Bilan intermédiaire — 20 octobre 2026, 23:04 Paris

Source : `preuves/reference-intermediaire-210407.json`, capture distante à 21:04 UTC.
Six campagnes complètes, trente questions acquises ; large-v3-turbo en cours et exclu.
Le lanceur nocturne attend la fin des neuf campagnes. Aucune mesure vLLM à ce stade.

| Vidéo | Médiane HTTP Whisper base | Médiane HTTP Whisper small | Abstentions base / small |
| --- | ---: | ---: | ---: |
| CNRS | 23,356 s | 22,197 s | 0/5 / 0/5 |
| Kennedy | 16,206 s | 15,097 s | 0/5 / 1/5 |
| Spring | 15,049 s | 12,219 s | 3/5 / 1/5 |

Temps mesuré : `questions[].latency.submissionToHttpResponseMs`, observation HTTP échantillonnée,
avec toutes les cinq questions par campagne, y compris les abstentions. Médianes internes correspondantes :
CNRS 22,821 / 21,741 s ; Kennedy 15,366 / 14,711 s ; Spring 14,172 / 11,751 s.
Une seule campagne par combinaison, dans l'ordre base puis small : les différences ne prouvent pas
un effet causal de Whisper, ni un gain reproductible à qualité égale.

L'audio couvre 100 % de chaque vidéo. Couverture vision base/small : CNRS 91,8/99,1 %,
Kennedy 88,6/98,1 %, Spring 91,4/98,3 %. Les pertes visuelles diminuent dans ces campagnes.
Les appels vision prennent environ 6,4 à 7,5 s en médiane ; les appels ASR environ 1,3 à 2,2 s.
Cela justifie les ablations vision préparées, sans isoler encore une cause aux gains.

Observations qualitatives, sans notation contre les vidéos :

- Kennedy-01 : base écrit « demi-année » en l'associant à « half a century » ; small écrit « demi-siècle ».
  L'incohérence de traduction du premier résultat est visible directement dans la réponse.
- Spring-06 : les deux variantes s'abstiennent sur la comparaison du paysage avec le début.
  Small indique ne disposer que des passages 320–368 s. Les métriques ne montrent aucun outil de réinspection.
  La récupération du contexte ancien est donc un axe concret à examiner.
- Kennedy-06 avec small : refus car la réponse proposée n'a pas passé la validation des preuves.
  Cette abstention garde un délai interne de 17,704 s ; l'absence de result.elapsedMs ne signifie pas
  que la mesure est absente de metrics.endToEndMs.

Les types observation/insufficient ne sont pas des notes de pertinence. Les citations et réponses
restent à confronter aux vidéos et références validées. `readyForScoring` reste false.
