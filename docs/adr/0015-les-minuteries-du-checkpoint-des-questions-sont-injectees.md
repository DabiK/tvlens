# 0015 — Les deux hôtes injectent les minuteries du checkpoint partagé des questions

- Date : 2026-10-15
- Ticket : `docs/travail/tickets/066-drive-the-question-checkpoint-of-the-server-host-with-an.md`
- Statut : acceptée

## Contexte

`runtime/question-checkpoint.cjs` porte déjà la cadence de sauvegarde des questions des deux hôtes.
Ses minuteries globales conduisaient deux tests de `tests/server-sessions.test.cjs` à remplacer
`setTimeout` pour tout le processus, y compris le vrai HTTP et `fetch`. Le couplage est établi par
lecture ; sa responsabilité dans les activités HTTP tardives n'a pas été reproduite.
Les contrats de publication et de durabilité de l'ADR 0003 et l'ordre de fin de l'ADR 0007 restent requis.

## Décision

`createQuestionCheckpoint` reçoit `setTimer(fn, ms)` et `clearTimer(handle)`. `checkpoint`, `flush`
et `forget` utilisent exclusivement ces dépendances. Sans injection, les délégations appellent
`setTimeout` et `clearTimeout` au moment de leur utilisation : aucune fonction globale n'est capturée
au chargement du module. Le délai reste de 1000 ms par défaut.

`HeadlessRuntime` transmet ses seules options `setTimer` et `clearTimer` au checkpoint. Ces options
ne pilotent aucune autre minuterie de l'hôte. Le Mac construit le même module avec deux délégations
explicites aux minuteries de son hôte ; le banc IPC peut toujours remplacer celles-ci après l'import.
La sauvegarde Mac n'est donc plus une copie de la cadence à extraire, contrairement à la description
historique de l'ADR 0003.

Un test qui ouvre un socket ne simule jamais globalement les minuteries du processus : les
minuteries applicatives qu'il veut piloter sont injectées. Les tests HTTP de cadence emploient
`manualClock`, avancé relativement ; transport et délais des questions continuent de tourner avec
leurs minuteries propres. Les tests isolés du module peuvent encore simuler les globales pour prouver
les valeurs par défaut.

Une borne d'attente de test sert à faire échouer une attente sans signal ; son expiration ne prouve
pas la fin du travail. Cela se distingue d'une borne dont l'expiration est précisément le résultat
voulu, par exemple le refus d'une préparation qui ne libère pas ses ressources dans `preparationWaitMs` :
le test vérifie alors ce refus, au lieu d'utiliser un temps écoulé comme preuve de stabilisation.

## Alternatives écartées

- Garder la simulation globale en HTTP : elle pilote aussi les minuteries du transport et des questions.
- Capturer les fonctions globales au chargement : cela empêcherait les bancs existants de les remplacer
  ensuite pour vérifier les valeurs par défaut.
- Injecter toutes les minuteries des hôtes : cela élargirait le contrat au-delà du checkpoint et
  changerait les domaines de temps que les tests de cadence doivent contrôler.

## Conséquences

Le test contrôle un unique timer pour plusieurs brouillons, puis le dernier état à l'échéance.
`flush` et `forget` annulent ce timer ; une avance après fermeture ne réécrit aucun fichier de session.
La publication de chaque progression, les sauvegardes immédiates et l'appartenance de l'état à son
store restent les mêmes, ainsi que le filtre Mac, la porte `asking` et l'ordre de fin.

Restent hors de cette injection : les minuteries de `core/deep-ask.cjs` et de `core/living-recap.cjs`,
les deux `setInterval` du runtime serveur, la borne de `settleIngestions`, les minuteries Mac de
résumé vivant, surveillance, balayage et stockage, ainsi que celles des fournisseurs et du transport.
Ce changement ne promet pas de résoudre tout échec HTTP intermittent.

## Protégée par

- `tests/question-checkpoint.test.cjs` : timer injecté unique, 999 ms puis 1 ms, dernier état,
  annulations par `flush` et `forget`, aucune écriture tardive ; défauts et store vérifiés séparément.
- `tests/server-sessions.test.cjs` : assertions de cadence HTTP conservées, sonde bornée à huit
  écritures, fermeture du runtime avec un brouillon en attente et arbre de session inchangé après avance.
- `tests/architecture-f07.test.cjs`, sélection `server host (HTTP)` : fermeture avec les valeurs par défaut.
- `tests/mac-ipc-contract.test.cjs` : cadence Mac et durabilité du brouillon lors de la fin de session.
- `node scripts/check.mjs` : contrôles et suite séquentielle du projet.
