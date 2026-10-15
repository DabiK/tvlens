---
id: T180
titre: Move headless session transitions into one coordinator
statut: a-faire
bloque_par: T179
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le démarrage, la pause, l'ouverture, la reprise, la fin, la suppression et l'arrêt du runtime headless
passent par un coordinateur de cycle de vie. Il possède la sérialisation et les faits de transition ;
l'hôte compose, publie ses vues et délègue. Le protocole de fin partagé avec le Mac reste l'unique
propriétaire du sort d'une session et des erreurs de ses étapes.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », transitions headless.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code à `e92c6a6`, avant T147/T179 : état initial, `runtime/headless-runtime.cjs:252` ;
  sérialisation `exclusive`, `runtime/headless-runtime.cjs:348` ; description et options de session,
  `runtime/headless-runtime.cjs:566` ; adoption synchrone, `runtime/headless-runtime.cjs:589` ;
  `moving`, `runtime/headless-runtime.cjs:600` ; `start`, `runtime/headless-runtime.cjs:608` ;
  `pause`, `runtime/headless-runtime.cjs:642` ; `leave`, `runtime/headless-runtime.cjs:805` ;
  `release`/`end`, `runtime/headless-runtime.cjs:854` ; existence et état de capture,
  `runtime/headless-runtime.cjs:870` ; `open`, `runtime/headless-runtime.cjs:941` ; `resume`,
  `runtime/headless-runtime.cjs:976` ; `remove`, `runtime/headless-runtime.cjs:1007` ; `close`,
  `runtime/headless-runtime.cjs:1075`.
- Dépendants : méthodes des routes dans `server/http.cjs:183` ; `server/main.cjs:43` ferme d'abord
  le serveur puis le runtime ; callbacks de conversation, `runtime/headless-runtime.cjs:284`,
  et d'admission, `runtime/headless-runtime.cjs:669`, lisent les transitions.
- Tests protecteurs : `tests/server-sessions.test.cjs:120`, `tests/server-sessions.test.cjs:227`,
  `tests/server-sessions.test.cjs:398`, `tests/server-sessions.test.cjs:435`,
  `tests/server-sessions.test.cjs:592`, `tests/server-warm-up.test.cjs:68`,
  `tests/architecture-f06.test.cjs`, `tests/architecture-f07.test.cjs`.
  La garde finale de `tests/architecture-f07.test.cjs:578` impose encore les appels textuels à
  `closeSession` et `settleQuestions` dans les deux anciens fichiers hôtes.
- ADR 0002, 0003, 0006 et 0007 dans `docs/adr/` ; ce dernier interdit de confondre une fin ayant
  collecté des erreurs avec une session que son hôte a effectivement pu lâcher.

## Périmètre

- Créer `runtime/headless-session-lifecycle.cjs`, fabrique injectée avec bibliothèque, construction
  et ouverture des sessions, conversation, surveillance, checkpoint, propriétaire d'ingestion de
  T179, préchauffage, garde disque, publication et journal.
- Déplacer les transitions listées, la chaîne exclusive, les promesses coalescées de fin/arrêt et
  les faits `fresh`, `ending`, `releasing`, `closing`, `lastEnd`, `captureEpoch`. Chaque fait garde
  une seule écriture propriétaire ; l'hôte et l'ingestion le lisent par délégation.
- Garder une seule référence faisant autorité pour la session chargée. Son adoption remplace
  synchroniquement les questions et la session, oublie le checkpoint antérieur, renouvelle la
  capture et publie comme aujourd'hui. Les vues de l'hôte reçoivent cette référence et l'état publié,
  sans maintenir une seconde copie modifiable de la session.
- `HeadlessRuntime` conserve ses méthodes et lectures de compatibilité : HTTP, tests et sondes
  appellent toujours la même façade, notamment `exclusive`, `moving`, `session` et `captureEpoch`.
  Les listes de sessions, les calculs de vue, les timers de maintenance de l'hôte et les commandes
  de questions/surveillance restent hors du coordinateur, avec leurs délégations nécessaires.
- Ajouter `tests/headless-session-lifecycle.test.cjs`. Déplacer la cible headless de la garde finale
  de `tests/architecture-f07.test.cjs` vers le module propriétaire ; garder le contrôle du Mac,
  l'unicité du protocole et toutes les assertions comportementales existantes.
- Écrire un ADR court sur les propriétaires et le transfert synchrone. Ne pas recopier
  `closeSession`, réordonner ses étapes, modifier les règles d'archive, ou introduire une phase
  exclusive à la place des axes actuels. Ne pas modifier le Mac, le transport ou les formats.

## Critères d'acceptation

1. Les tests du coordinateur prouvent que les transitions sont sérialisées même après le rejet
   d'une précédente ; deux `end` partagent la même fin et deux `close` la même fermeture. Une fin
   demandée rend immédiatement `moving()` vrai avant son tour, et l'admission refuse sans préparer.
2. Démarrer renouvelle la numérotation même si la même session capturait déjà ; l'ouverture reste
   en lecture seule, sans préchauffage ni écriture. Une archive illisible ne remplace pas la session
   chargée. La reprise explicite retrouve la même session, renouvelle sa capture et préchauffe comme
   avant. L'adoption ne publie jamais des questions de l'ancienne session avec la nouvelle.
3. La fin appelle le protocole partagé dans l'ordre serveur : annulation des préparations avant
   attente, pause sauf suppression, stockages/préparations, questions et checkpoint, surveillance,
   chat, puis archivage ou scellement/effacement par le protocole. Une erreur reste sous son nom
   d'étape, dans `lastEnd` et au journal ; un archivage refusé ne devient pas un succès confirmé.
4. Les cas « session vide créée ici », archive ouverte vide, suppression pendant capture,
   suppression non chargée et arrêt sans session gardent leurs réponses et leur sort actuels.
   Si l'annulation des questions empêche l'adoption de `null`, ne pas forcer la libération : la fin
   est refusée et rien n'est effacé sous la session encore tenue. Un nouvel essai peut aboutir.
5. Une préparation tardive de T179 reste possédée et attendue aux mêmes points ; l'arrêt tente la
   fermeture de la surveillance même après une erreur et conserve son résultat. Aucun retour tardif
   ne réadopte une session partie. Les tests du module utilisent des doublures différées et ne
   dorment pas pour observer les courses.
6. La garde finale contrôle le coordinateur headless et l'hôte Mac contre le même protocole ; elle
   échoue si le coordinateur réintroduit son propre protocole ou format de journal. Toutes les
   assertions comportementales des suites HTTP et des deux hôtes restent inchangées et passent en
   séquentiel. Le diff sous `tests/` ne contient que le nouveau fichier et ce changement de cible.
7. Le journal inventorie les faits de transition et leur unique propriétaire, et donne `wc -l`
   avant/après de l'hôte. `node scripts/check.mjs` est vert à l'implémentation, sans modification du
   harnais ou du plancher.

## Test d'acceptation attendu

`tests/headless-session-lifecycle.test.cjs` appelle la fabrique avec un vrai protocole partagé et des
ressources différées enregistrant ordre, adoptions et publications. Les suites `server-sessions`,
`server-warm-up`, `architecture-f06` et les scénarios de `architecture-f07` prouvent l'intégration
par HTTP et la préservation du Mac ; seule la cible de sa garde statique change.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T179 implique T123 et donc T150, ainsi que T066 et T147. Au lancement, relire les responsabilités
après ces déplacements. T172/T173 concernent les ressources d'un runtime de session et ne sont pas
des prérequis techniques : le coordinateur utilise sa façade publique. Le niveau sensible vient du
déplacement du cycle de vie et de ses transferts de possession, pas d'une nouvelle règle métier.

## Journal
