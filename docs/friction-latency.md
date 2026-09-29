# Visionnage sans interruption

## Parcours

Choisir la fenêtre puis **Regarder avec TVLens** lance ensemble capture et analyse,
et ouvre automatiquement le mode flottant. La dernière source est proposée
uniquement si son identifiant et son nom existent toujours. Reprendre vérifie
à nouveau la disponibilité ; une source disparue demande une nouvelle sélection.

La barre flottante expose **Pause/Reprendre**, **Explique**, **Garder**, le chat
et le retour au mode complet. **Explique** (également Cmd/Ctrl+Maj+E si le
raccourci global est libre) retient l'instant avant toute attente. Le panneau
propose Résumer, Expliquer ou une question libre. Les images et l'audio du passage
scellé sont bornés à l'instant demandé. Réexaminer conserve ces mêmes bornes.

**J'ai décroché** synthétise depuis le dernier repère, initialement le début de
la session. **Je reprends ici** pose un repère explicite. Un rattrapage réussi
avance le repère uniquement sur les passages couverts par les citations ; les
passages encore sans analyse ne sont pas silencieusement sautés. Une nouvelle
session remet les repères à zéro.

## Latence et limites

Le premier segment est livré après 2 secondes au maximum de durée configurée
(1,8 s dans le test synthétique), puis la cadence normale de 8 secondes reprend.
Les actions ciblées scellent le segment en cours sans attendre cette cadence.
La rotation normale continue à enregistrer pendant la vidange audio. Un
checkpoint peut créer un petit trou avant la reprise ; les interruptions de
capture supérieures à 250 ms sont signalées dans la couverture des réponses.

Les questions de résumé et les actions ciblées montrent immédiatement jusqu'à
3 résumés automatiques déjà disponibles, avec leurs passages. Cela constitue
un aperçu sourcé et explicitement provisoire, pas une réponse finale du modèle.
Le modèle reçoit la mémoire avant de décider si un réexamen visuel est utile.
Le contexte de rattrapage inclut jusqu'à 120 passages et indique les omissions et lacunes.

Chaque réponse mesure attente en file, préparation du contexte, première
information utile, durée totale et appels d'outils. Le détail Temps de réponse
rend visibles les mesures principales. La première information peut être un
résumé existant ; elle ne mesure pas uniquement la génération du modèle.

## Validation

`npm test` couvre notamment concurrence timer/checkpoint/pause, bornage des
images et audio, repères, couverture et conservation des bornes au réexamen.
`npm run test:electron` vérifie démarrage unique, reprise, capture pendant le
chat, actions ciblées, vignettes, navigation et dimensions du mode flottant.

Le rapport `latency-local.json` provient d'une capture synthétique et d'un agent
simulé avec une attente de 2,5 secondes. Il mesure l'intégration locale et ne
constitue pas une mesure du fournisseur réel ni de la capture native macOS.

Le [panneau Jusqu’ici](living-recap.md) fournit en parallèle une synthèse globale
actualisée automatiquement, distincte de l’action ponctuelle « J’ai décroché ».
