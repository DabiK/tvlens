---
id: T180
titre: Move headless session transitions into one coordinator
statut: termine
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

- Exploration : hôte à 774 lignes (`wc -l runtime/headless-runtime.cjs`). Le coordinateur possédera
  `session`, `transition`, `fresh`, `ending`, `releasing`, `closing`, `closed`, `lastEnd` et `captureEpoch` ;
  l'hôte les lira par délégation. L'ingestion garde ses ensembles et le protocole partagé garde le sort,
  les erreurs et le journal de fin. Aucun écart prévu ; détails dans le dossier d'état T180.

- Cycles ciblés : `node --test tests/headless-session-lifecycle.test.cjs` : assertions rouges observées
  sur la fabrique puis les frontières de démarrage, fin, ouverture et suppression/arrêt ; verts observés
  après chaque extraction. Journaux `01` à `13` dans le dossier d'état. La suite finale couvre 14 cas,
  avec vrai protocole partagé, vraie ingestion, ressources différées et minuteries manuelles.
- Intégration : premier `node scripts/check.mjs --changed` rouge : constructeur au-delà de 80 lignes
  et sonde d'annulation contournée. Composition extraite dans une fonction dédiée ; l'ingestion est
  injectée par les délégations de compatibilité. `node --test --test-name-pattern='closing steps of a session' tests/architecture-f07.test.cjs` : rouge observé puis 2/2 verts sur les hôtes Mac et serveur.
- `node scripts/check.mjs --changed` : vert, 40/40 tests JS. Le diff des tests existants ne change
  que les deux références à la cible headless de la garde finale ; aucune assertion comportementale modifiée.
- Propriétaires finaux : `runtime/headless-session-lifecycle.cjs` écrit seul `session`, `transition`,
  `fresh`, `ending`, `releasing`, `closing`, `closed`, `lastEnd` et `captureEpoch`. L'hôte ne conserve
  qu'un instantané publié et lit les faits par getters. L'ingestion possède `admitted` et `ingestions` ;
  `session-closing.cjs` possède le sort, les erreurs nommées et le journal de fin. ADR 0024 ajouté.
- `wc -l runtime/headless-runtime.cjs runtime/headless-session-lifecycle.cjs` : hôte 774 → 576 lignes
  physiques ; coordinateur 293 lignes. `git diff --check` : vert. Aucun écart de périmètre.
- Premier contrôle complet `node scripts/check.mjs` : vert, 114 fichiers JS, 1429/1429 tests JS ;
  Python : 33 tests, OK avec un ignoré (`18-check-full.log`).
- Nettoyage final : formatage des deux nouveaux fichiers, explications locales sur l'adoption et
  l'époque, et preuve supplémentaire qu'une pause attend un démarrage refusé puis que la file reprend.
  `node scripts/check.mjs --changed` : vert, 41/41 tests (`19-check-changed-final.log`).
  `wc -l` final : hôte 576 lignes, coordinateur 325 lignes après formatage ; l'hôte était à 774.
- Contrôle final `node scripts/check.mjs` : vert, code 0, règles, format, lint, gel et cliquet verts ;
  114 fichiers JS, 1430/1430 tests JS ; Python : 33 tests, OK avec un ignoré (`20-check-full-final.log`).
- Trois mutations temporaires détectées : chaîne qui ne reprend plus après rejet, référence remplacée
  avant restauration des questions, journal de fin recopié dans le coordinateur. Sources restaurées.
  `git diff --check` : vert. Verdict `TERMINÉ` écrit dans le dossier d'état ; aucun commit ni push.

- Reprise après `relecture-1.md` : constat mineur accepté. Les six justifications de `exclusive`,
  `leave`, `located`, `open`, `remove` et `close` seront rétablies dans le coordinateur, en commentaires
  uniquement. Le constat hors périmètre sur la garde de l'ancien hôte sera conservé dans `reste`.
  Aucun test textuel de commentaires ni rouge comportemental artificiel ; banc existant lancé avant correction.
- Avant correction : `node --test tests/headless-session-lifecycle.test.cjs` : vert, 15/15 tests,
  code 0 (`correction-1-before.log`). Aucun rouge comportemental revendiqué pour ces commentaires.
- Constat mineur 1 corrigé : six commentaires rétablis au-dessus des méthodes du coordinateur,
  avec les justifications de sérialisation, ordre serveur, confirmation, lecture seule et scellement.
  Comparaison avant/après hors lignes de commentaires : instructions strictement identiques.
  `node scripts/check.mjs --changed` : vert, code 0, 41/41 tests (`correction-1-check-changed.log`).
  `wc -l` : hôte inchangé à 576 lignes, coordinateur 340 lignes avec les explications rétablies.
- `node scripts/check.mjs` après correction : vert, code 0 ; règles, format, lint, gel et cliquet verts ;
  114 fichiers JS, 1430/1430 tests JS ; Python : 33 tests, OK avec un ignoré
  (`correction-1-check-full.log`). `git diff --check` : vert. Nouveau verdict `TERMINÉ`, avec le
  constat 2 hors périmètre dans `reste` ; aucun commit ni push.

### Réserves à la clôture

- Constat 2 de relecture-1, hors périmètre : la garde finale de tests/architecture-f07.test.cjs ne scanne plus runtime/headless-runtime.cjs contre une réintroduction du journal de fin ou du protocole. À traiter dans un futur ticket ; le critère 6 actuel limite le diff des tests au changement de cible. La correction laisse cette garde inchangée.
- .harness-state/tickets/T180/relecture-2.md : `tests/architecture-f07.test.cjs:580-589` (hors périmètre) — reste en réserve

  Il n'y a pas de changement, et c'est normal : ce constat n'était pas à corriger dans le ticket. La garde finale ne surveille plus `runtime/headless-runtime.cjs`. Si quelqu'un réintroduisait dans l'hôte la phrase du journal de fin ou un `closeSession`, aucun test ne le signalerait.

  **Ce qui est attendu.** Un ticket futur ajoute l'hôte à la liste des fichiers où cette phrase est interdite. Le critère 6 limite le diff sous `tests/` au seul changement de cible, d'où le classement hors périmètre.
