# Réanalyse appariée des ablations GX10

Analyse hors GPU des campagnes nocturnes déjà scellées. Le script [analyser.py](analyser.py) lit les
quatre `campaign.json` de chaque ablation et produit [resultats.json](resultats.json), avec chemin
et SHA-256 de chaque source. Il refuse des cas/questions manquants ou des identifiants, textes et
temps non appariés. Aucune sortie n'est utilisée comme vérité terrain ; `readyForScoring=false`.

## Cinq contre trois images, CNRS

A envoie cinq images par bloc, B les images 0, 2 et 4 ; douze blocs identiques, ordre A/B/B/A.

| Passage | Médiane délai complet par appel | p95 | Médiane préremplissage | Médiane génération |
| --- | ---: | ---: | ---: | ---: |
| A1, cinq images | 6,784 s | 7,503 s | 2,900 s | 3,725 s |
| B1, trois images | 5,344 s | 6,032 s | 1,801 s | 3,401 s |
| B2, trois images | 3,648 s | 4,232 s | 0,085 s | 3,435 s |
| A2, cinq images | 3,761 s | 4,668 s | 0,086 s | 3,488 s |

Sur les douze blocs appariés, B est plus rapide dans 11/12 au premier passage (différence médiane
`B−A = −1,592 s`) et 11/12 au second (`−0,211 s`). Le préremplissage chute à environ 0,085 s
pour **les deux bras** au second passage, ce qui rend l'effet d'échauffement/cache dominant.
On ne peut donc pas attribuer un gain de 1,6 s uniquement au nombre d'images ni déclarer une
configuration gagnante sans notation des faits/OCR/actions présents dans les observations.

## Vision pendant les questions, CNRS

A laisse partir les appels visuels pendant les questions ; B suspend ces nouveaux départs. Les
quatre replays A/B/B/A ont chacun acquis les cinq mêmes questions.

| Passage | Médiane HTTP | p95 HTTP | Sous 15 s | Sous 20 s | Publications vision | Couverture vision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | 20,967 s | 22,244 s | 0/5 | 2/5 | 104 | 94,55 % |
| B1 | 12,060 s | 15,440 s | 3/5 | 5/5 | 109 | 99,09 % |
| B2 | 13,526 s | 14,386 s | 5/5 | 5/5 | 105 | 95,45 % |
| A2 | 21,500 s | 23,698 s | 0/5 | 2/5 | 104 | 94,55 % |

B est plus rapide pour **10/10 comparaisons appariées** entre premier et second passage ; les
différences médianes par question sont `−6,901 s` et `−7,008 s`. Sur ces exécutions, le gain
ne s'accompagne pas d'une baisse globale de couverture visuelle : B perd une publication puis cinq,
contre six dans chacun des deux A. Les pertes ne sont toutefois pas de même nature : B marque une
publication sautée pendant la question à chaque passage, A en perd cinq par backlog et une par
erreur. Les observations et leur pertinence restent à relire.

L'âge du dernier passage **analysé** au début de la question, calculé comme
`anchorMs − analyzedThroughMs`, a une médiane voisine de 16,0 s dans les quatre passages. Son
p95 va de 16,0 s en A1 à environ 22,4 s dans les trois autres. L'âge médian apparié ne montre
donc pas d'effondrement systématique en B, mais les cinq questions par passage rendent ce p95
fragile ; il faut examiner les cas individuels et le rappel d'événements anciens. Le rapport donne
aussi `lagAtStartMs` séparément, sans le confondre avec l'âge du dernier passage analysé.

## Portée et prochaine mesure

Le calcul inclut les temps HTTP complets, pas le premier token. Les résumés donnent publications,
couverture et pertes, mais pas pour chaque appel l'intervalle média source associé à son heure de
publication : la proportion exacte de blocs **livrés avant l'arrivée du bloc suivant** ne se déduit
pas sans ambiguïté de ces seuls fichiers. Le nouvel essai doit tracer ce lien explicitement.

La suspension de vision est le meilleur candidat technique à confirmer sur Kennedy et Spring,
avec réponse, preuves et fraîcheur annotées. La réduction à trois images mérite une confirmation
séparée, idéalement avec démarrages froids/chauds équilibrés et des blocs contrôlés en anglais et
sans dialogue. Aucune de ces mesures ne vaut classement de pertinence avant validation des fiches.
