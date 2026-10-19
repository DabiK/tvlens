# 0056 — La boucle relève son processus après intégration de ses modules

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/229-restart-the-loop-after-integrating-its-own-code.md`
- Statut : acceptée

## Contexte

Les imports de la boucle restaient en mémoire après un commit modifiant ses modules. Le ticket
suivant utilisait alors les anciennes règles. Les lecteurs identifient un lancement par l'instant
du verrou numérique et lisent ses événements cumulés ; le PID peut changer sans changer ce lancement.

## Décision

`run.mjs` valide le démarrage et confie l'exécution à `restart.mjs`. Ce superviseur conserve la
commande initiale, son environnement et ses descripteurs de sortie. Un seul enfant admis traite
les tickets. Les options effectives, les exclusions initiales et les compteurs de tickets traités
et intégrés passent sur son canal IPC direct. Chaque enfant refait les validations de démarrage,
y compris la propreté des fichiers suivis ; aucun fichier de relève n'accorde une admission.

Après commit et push réussi ou désactivé, la rétrospective puis l'harmonisation due finissent dans
l'enfant qui a intégré. Une comparaison Git entre les commits, sans détection des renommages,
repère les ajouts, modifications et suppressions de `.mjs` ou `.cjs` sous `scripts/loop/` et
`scripts/quality/`. Les autres chemins, dont `baseline.json`, ne déclenchent aucune relève.
S'il reste un ticket dans le budget, l'enfant rend le verrou au superviseur puis sort ; le
superviseur attend sa sortie, recharge aussi son propre propriétaire et crée un enfant neuf.

Le verrou passe atomiquement au superviseur puis au successeur, sans disparition intermédiaire.
Son instant initial est conservé : les lecteurs existants gardent le même lancement, le budget
initial et les événements précédents. L'ancien propriétaire ne retire que son propre verrou.
Les arguments restent des tableaux, les sorties sont héritées et aucun journal n'est tronqué.
Un échec de relève est journalisé et arrête la commande ; aucun import périmé ne reprend la file.

## Alternatives écartées

- Invalider seulement un import : les dépendances transitives resteraient en cache.
- Lancer un successeur puis quitter la commande initiale : son statut et sa durée ne couvriraient
  plus l'ensemble des tickets demandés.
- Retirer le verrou avant de démarrer l'enfant : une seconde commande pourrait entrer dans la file.

## Conséquences

`--ticket` ne vaut que pour le premier choix global ; `--max` et `--tune-every` gardent leurs
compteurs à travers les relèves. Le superviseur reste vivant pendant toute la commande, mais
n'exécute ni ticket, ni contrôle, ni intégration. Un lancement détaché par l'appelant conserve
son autonomie ; aucune interface de détachement n'est ajoutée.

Une boucle déjà en mémoire avant ce correctif ne sait pas se relever : sa première intégration
nécessite encore un redémarrage par l'orchestrateur.

L'[ADR 0060](0060-la-boucle-reprend-sur-claude-apres-quota-sur-demande.md) étend cette relève au travail
interrompu par quota, uniquement sur demande explicite et après validation d'un état consommable une fois.

## Protégée par

`tests/ticket-loop.test.cjs` remplace des modules dans des dépôts jetables et observe leur
comportement, les PID, le verrou, les options, les commits et les événements. Une relève retenue
par signaux vérifie l'exclusion, le lancement lu par les vues, les sorties redirigées et la fin
des processus. Les refus de qualité, de relecture, de commit, de push et de démarrage empêchent
le ticket suivant. Les suites des lecteurs et `quality-check` complètent le contrôle complet.
