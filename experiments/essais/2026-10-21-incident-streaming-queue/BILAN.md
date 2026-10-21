# Bilan StreamingVLM sur GX10 — 21 octobre 2026

## Résultat

Le modèle StreamingVLM et son runtime dédié ont exécuté quatre pilotes sur la vidéo Spring. Tous les
processus ont fini avec le code 0, les nombres de segments attendus ont été produits et le nettoyage
des conteneurs appartenant à ce run est confirmé. La campagne établit une compatibilité pratique de
ce modèle et de ce runtime sur le GX10. Elle ne démontre ni une amélioration de TVLens, ni une qualité
de réponse supérieure : `readyForScoring=false` et aucune réponse n'a encore été jugée contre la vidéo.

| Pilote | Segments de 1 s | Temps mural interne | Temps du stage Docker | Vitesse média / mur |
| --- | ---: | ---: | ---: | ---: |
| Cache, 16 s | 16 | 111,96 s | 114,08 s | 0,143× |
| Cache, 72 s | 72 | 196,12 s | 199,20 s | 0,367× |
| Cache, 372 s | 372 | 603,94 s | 607,16 s | 0,616× |
| Recalcul, mêmes 16 s | 16 | 160,90 s | 163,18 s | 0,099× |

Sur le même préfixe de 16 secondes, le cache réduit le temps mural interne d'environ **30,4 %**
face au recalcul ; les sorties textuelles sont identiques après retrait des lignes de chronométrage.
Le pilote de 372 secondes traite cependant 372 secondes de média en environ 604 secondes : il reste
**sous le temps réel** dans cette configuration. La hausse du débit entre 16 et 372 secondes est
largement liée à l'amortissement du chargement initial ; elle n'établit pas un débit soutenu supérieur
à 1×.

## Où part le temps

Les mesures par segment additionnent `CHECK`, `VIDEO`, `INPUT`, `GEN`, `PKV` et `POST`. La médiane
de cette somme vaut 0,697 s sur 16 segments avec cache, 0,804 s sur 72, 1,140 s sur 372 et
3,710 s en recalcul. La génération `GEN` en représente l'essentiel : médianes respectives de
0,605 s, 0,673 s, 1,015 s et 3,686 s. Le p95 de la somme atteint respectivement 2,534 s,
3,179 s, 2,844 s et 6,404 s. La maintenance du cache `PKV` devient visible dans les passages
longs, avec une médiane d'environ 0,089 s sur 72 et 0,098 s sur 372 segments.

La somme des temps instrumentés par segment est de 18,40 s, 102,55 s, 508,55 s et 65,86 s.
Il reste environ 93 à 95 secondes entre cette somme et le temps mural de chaque pilote. Le
chronomètre mural démarre avant l'import du module et inclut donc initialisation, chargement et
autres coûts non ventilés. Les temps par segment ne sont **pas** une latence de bout en bout.

## Erreurs, abstentions et annotation

Les quatre pilotes finaux ont un statut `finished`, `exitCode=0` et aucun champ d'erreur. Les
incidents préparatoires BuildKit, dépendance `past` et masquage de `queue` sont conservés dans leurs
dossiers respectifs ; aucun de leurs résultats n'est mélangé avec ces mesures finales. Les quatre
fichiers VTT contiennent exactement 16, 72, 372 et 16 entrées, sans entrée vide. Le marqueur
`...` seul apparaît respectivement 12, 44, 157 et 12 fois : il indique qu'aucun nouveau texte
n'a été émis sur le segment, **pas** une abstention explicite à une question. Aucune formule
d'abstention explicite n'a été relevée dans ces sorties.

Les textes VTT des passages 16 s, 72 s et 372 s sont à relire contre Spring avant tout jugement de
pertinence ; le passage 16 s avec recalcul vérifie surtout l'effet du cache. Aucune réponse de
question-réponse TVLens n'a été produite dans cette sonde. Le statut d'évaluation reste
`readyForScoring=false`.

## Portée et prochaines mesures

Le protocole utilise le checkpoint StreamingVLM/Qwen2.5-VL, son runtime propre, une vidéo locale,
des segments de 1 s et une fenêtre visuelle de 16 s dans un conteneur hors ligne. Il ne mesure pas
la capture TV, le transport, l'audio, la session ou la chaîne complète de replay de TVLens. La
comparaison cache contre recalcul sur les mêmes 16 premières secondes est interne à ce protocole ;
elle ne s'applique pas directement aux sondes Ollama/vLLM ni au replay TVLens.

Pour évaluer le ratio pertinence/vitesse visé, il faut relire les sorties contre des événements
horodatés de Spring, compter les éléments utiles et les erreurs, puis comparer à une base sur les
mêmes fenêtres. Avant une intégration, mesurer aussi le délai au premier résultat et le débit sur
la chaîne TVLens complète, avec ses coûts de capture, audio et transport.

Le dernier stage a commencé avant la limite de phase courte de 05:07:16 UTC et s'est fermé à
05:07:43 UTC, 27 secondes après cette limite ; aucun nouveau pilote n'a démarré après elle. Le
plafond total original était 07:07:16 UTC. Le manifeste distant couvre 78 fichiers, tous vérifiés
par SHA-256 ; la [copie locale](rapatriements/reprise-streaming-queue-20261021T044930Z/RAPATRIEMENT.md)
conserve 73 fichiers du manifeste vérifiés, sans poids ni vidéo.
