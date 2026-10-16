---
id: T179
titre: Move headless capture admission into one intake owner
statut: termine
bloque_par: T066, T123, T147
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un propriétaire d'ingestion possède les admissions, les préparations annulées encore en vie et les
stockages en cours du serveur. `HeadlessRuntime` délègue cette responsabilité en conservant sa façade.
Une opération reste liée à l'objet session et à la capture où elle a été acceptée ; un déplacement de
code ne permet jamais à un bloc tardif d'atterrir dans une autre vie de la session.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », ingestion headless.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code à `e92c6a6`, `runtime/headless-runtime.cjs` : ensembles et borne de préparation,
  `runtime/headless-runtime.cjs:237` ; `captureEpoch`, `runtime/headless-runtime.cjs:252` ;
  gardes `moving`/`loaded`, `runtime/headless-runtime.cjs:600` ; `admit`,
  `runtime/headless-runtime.cjs:651` ; `accept`, `runtime/headless-runtime.cjs:669` ;
  `current`/`finish`, `runtime/headless-runtime.cjs:686` ; annulation,
  `runtime/headless-runtime.cjs:702` ; attente, `runtime/headless-runtime.cjs:716` ; stockage,
  `runtime/headless-runtime.cjs:734` ; pause après saturation disque,
  `runtime/headless-runtime.cjs:754`.
- Appelants : le HTTP admet avant assemblage, `server/http.cjs:224`, prend l'opération,
  `server/http.cjs:252`, ne marque la déduplication que si elle est encore courante,
  `server/http.cjs:261`, et la rend au `finally`, `server/http.cjs:268`.
  La fin annule avant toute attente, `runtime/headless-runtime.cjs:821` ; elle attend à
  `runtime/headless-runtime.cjs:830`. L'arrêt sans session attend aussi les anciennes préparations,
  `runtime/headless-runtime.cjs:1085`. La liste considère les stockages,
  `runtime/headless-runtime.cjs:876`.
- Tests : `tests/architecture-f06.test.cjs:149`, `tests/architecture-f06.test.cjs:190`,
  `tests/architecture-f06.test.cjs:237`, `tests/architecture-f06.test.cjs:263`,
  `tests/architecture-f06.test.cjs:303`, `tests/architecture-f06.test.cjs:323`,
  `tests/architecture-f06.test.cjs:514`, `tests/server-ingest-path.test.cjs`,
  `tests/timeline-server.test.cjs` et `tests/server-sessions.test.cjs`.
- ADR 0006 (identité, annulation et borne), 0007 (protocole partagé), 0002/0003 (écritures),
  dans `docs/adr/`.

## Périmètre

- Créer `runtime/capture-intake.cjs` avec une fabrique recevant la session et l'époque courantes par
  lecture, l'état de transition, le stockage, la publication et les minuteries/borne injectées.
  Déplacer `admit`, `accept`, `current`, `finish`, `cancelPreparations`, `settleIngestions` et `ingest`,
  ainsi que les ensembles qui leur appartiennent et les erreurs propres à cette admission.
- Garder dans `HeadlessRuntime` les méthodes de délégation attendues par HTTP, sondes et tests.
  `ingest(input)` sans opération continue de fonctionner. Les lectures de `admitted` et `ingestions`
  encore faites par les bancs exposent l'état de l'unique propriétaire, sans recopier ses ensembles.
- Les changements de capture restent décidés par le cycle de vie de l'hôte ; le propriétaire lit
  cette génération, il n'en incrémente pas une seconde. La déduplication HTTP et son créneau restent
  dans le transport, éventuellement déplacé par T174.
- Ajouter `tests/capture-intake.test.cjs`, et un ADR court précisant propriétaires et coutures, en
  conservant toutes les décisions de l'ADR 0006. Adapter seulement le câblage des étapes de fermeture.
- Ne modifier ni les contrats HTTP, ni `RemoteMedia`, ni l'ordre du protocole partagé, ni les bornes,
  ni la rétention, ni les assertions des tests existants. Le découpage du cycle de vie attend T180.

## Critères d'acceptation

1. Les tests du module, par ses méthodes exportées, refusent avant préparation une session obsolète,
   une archive en lecture seule, une capture arrêtée ou saturée et une session qui part. Les codes
   et messages actuels sont conservés, notamment 503 `session-closing` pendant une transition.
2. Annuler les préparations lève chaque signal une seule fois. Une préparation qui se règle après la
   borne reste possédée et définitivement refusée jusqu'à `finish`, même si le même identifiant est
   rouvert et repris. Une fin suivante et l'arrêt sans session l'attendent de nouveau et rapportent
   le dépassement dans les mêmes termes. La minuterie de chaque attente est libérée.
3. Un stockage commencé n'est pas annulé : la fin attend son règlement, média et miniature inclus.
   Le contrôle de validité et le passage à `storing` restent synchrones, sans attente intermédiaire.
   Un échec retire le stockage de l'ensemble et propage l'erreur ; le manque d'espace conserve la
   pause de toute la session, horloge comprise, et la publication de sa raison.
4. Une opération d'une ancienne capture est refusée 409 `capture-changed` sans stockage ni marquage
   des doublons ; comparer aussi l'objet session, pas seulement son identifiant. Une déconnexion du
   client HTTP n'annule toujours pas le bloc, que son renvoi retrouve comme doublon.
5. Il ne reste qu'un propriétaire des ensembles et des opérations : `HeadlessRuntime` ne contient
   plus leurs boucles ni leurs créations. Le journal donne les fonctions déplacées, leurs propriétaires
   et `wc -l` avant/après ; aucune promesse de seuil global sous 400 lignes n'est requise.
6. Les tests cités et `tests/architecture-f07.test.cjs` passent en séquentiel sans changer leurs
   assertions, y compris les lectures de `runtime.admitted.size` après arrêt. Le diff sous `tests/`
   ne contient que le nouveau fichier. `node scripts/check.mjs` est vert à l'implémentation.

## Test d'acceptation attendu

`tests/capture-intake.test.cjs` conduit un stockage différé et une préparation sourde à l'annulation,
avec les minuteries injectées et les helpers de T055/T058. Les tests HTTP existants protègent les
réponses et le créneau, sans changer d'assertion ; aucun délai réel n'est attendu pour tester la borne
du module extrait.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T066 apporte le câblage des minuteries de checkpoint, T123 rend les transitions au domaine et attend
T150, T147 sort les calculs de vue. À `e92c6a6`, ces derniers sont encore dans l'hôte : les lignes sont
des repères de départ à relire après dépendances. Ce ticket conserve la séparation des deux axes
`ending` et `accepting`, et la borne de préparation reste un plafond d'attente, sans garantie de
nettoyage ni libération anticipée du créneau HTTP.

## Journal

### Exploration — 16 octobre 2026

- Consignes, code, appelants, tests cités et ADR 0002/0003/0006/0007/0015/0020/0021 lus.
  Détail : `.harness-state/tickets/T179/exploration.md` ; aucun écart de périmètre prévu.
- `git status --short` et `git diff` : statut du ticket préexistant, deux dossiers non suivis hors
  périmètre ; aucun code déjà modifié. Témoin de hooks présent.
- `wc -l runtime/headless-runtime.cjs server/http.cjs` : 864 et 151 lignes avant extraction.
  HTTP délègue déjà l'ingestion à `server/ingest-routes.cjs` ; déduplication et créneau y restent.

### Module — tests d'abord

- Commande de chaque cycle : `node --test tests/capture-intake.test.cjs` ; pour les rouges ciblés,
  `node --test --test-name-pattern='deaf preparations' tests/capture-intake.test.cjs`, puis les
  motifs `storage` et `disk`. Sorties conservées dans le dossier d'état, fichiers `01-*` à `07-*`.
- Rouges observés sur assertions : refus absent (session obsolète puis lecture seule), fermeture
  non refusée et opération absente, signaux non levés, anciennes captures acceptées, stockage annulé
  et non suivi, pause disque non publiée. Verts successifs : 1, 2, 4, 6, 8, 10 puis 13 tests.
- Les préparations sourdes traversent plusieurs bornes pilotées par `manualClock`, un nouvel objet
  du même identifiant et l'absence de session ; elles restent possédées et annulées une seule fois.
  Chaque minuterie est libérée. Stockages média et miniature sont conduits par promesses différées.

### Câblage et acceptation

- Rouge de façade : `node --test --test-name-pattern='headless closing' tests/capture-intake.test.cjs`
  constate que l'hôte n'arme pas la minuterie injectée (0 au lieu de 1). Après délégation :
  `node --test tests/capture-intake.test.cjs`, 15/15 verts (`08-wiring-*.log`).
- Une vérification de compatibilité sur l'option nulle a révélé le repli perdu pendant l'extraction :
  `node --test --test-name-pattern='default preparation' tests/capture-intake.test.cjs` rouge,
  puis repli `??` conservé et suite 15/15 verte (`09-default-*.log`).
- Propriétaire avant : `HeadlessRuntime` pour `admit`, `accept`, `current`, `finish`,
  `cancelPreparations`, `settleIngestions`, `ingest`, `admitted`, `ingestions` et la borne.
  Propriétaire après : `createCaptureIntake` dans `runtime/capture-intake.cjs` pour ces éléments.
  L'hôte garde les sept délégations, les getters des deux mêmes ensembles, les époques et le protocole.
- `wc -l runtime/headless-runtime.cjs runtime/capture-intake.cjs` : hôte 864 → 774 lignes physiques ;
  nouveau module 147 lignes. Pas de promesse de seuil global.
- `node scripts/check.mjs --changed` : premier passage rouge sur le constructeur à 87 lignes utiles ;
  câblage isolé dans `createHeadlessIntake`, second passage vert, 15/15 tests (`check-changed*.log`).
  Aucun gel ajouté ou augmenté ; les suppressions existantes restent utiles.
- `node --test --test-concurrency=1 tests/capture-intake.test.cjs tests/architecture-f06.test.cjs tests/architecture-f07.test.cjs tests/server-ingest-path.test.cjs tests/timeline-server.test.cjs tests/server-sessions.test.cjs`
  : 80/80 verts, aucun ignoré (`acceptance.log`).
- `git diff --name-only -- tests` : vide ; `git ls-files --others --exclude-standard tests` :
  seul `tests/capture-intake.test.cjs`. ADR 0023 ajouté, transport et contrats inchangés.

### Contrôle final et remise à la boucle

- `node scripts/check.mjs` : vert, code de sortie 0. Règles, format, lint, gel et cliquet verts ;
  113 fichiers JavaScript, 1 415 tests réussis, aucun échec ; Python : 33 tests exécutés,
  résultat OK avec un test ignoré. Sortie : `.harness-state/tickets/T179/check-full.log`.
- `git diff --check` : code de sortie 0. Aucun test existant modifié, aucun harnais modifié,
  aucun commit ni push. Les dossiers non suivis présents au départ restent hors périmètre.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T179/verdict.json` ; relecture et intégration
  laissées à la boucle. Aucun critère restant ni écart à trancher.

### Reprise après interruption — 16 octobre 2026

- `echec-1.txt` rapporte une interruption du service Codex (503), sans constat de relecture.
  Le verdict annoncé ci-dessus est absent au démarrage de cette reprise ; code, tests, ADR,
  traces et journal sont présents. Témoin de hooks présent pour la nouvelle session.
- Consignes, journal, écarts, diff, propriétaire d'ingestion, façade, fermeture, transport et
  15 nouveaux tests relus. Aucun correctif supplémentaire identifié ; contrôle final à rejouer
  avant d'écrire le verdict. Exploration complétée dans le dossier d'état.
- `node scripts/check.mjs --changed` : vert, code de sortie 0, 15/15 tests ; sortie dans
  `.harness-state/tickets/T179/reprise-check-changed.log`.
- `node scripts/check.mjs` : vert, code de sortie 0 ; règles, format, lint, gel et cliquet verts,
  113 fichiers JavaScript, 1 415 tests réussis, aucun échec ; Python : 33 tests exécutés,
  résultat OK avec un test ignoré. Sortie : `.harness-state/tickets/T179/reprise-check-full.log`.
- `git diff --check` : code de sortie 0. `git diff --name-only -- tests` : vide ;
  `git ls-files --others --exclude-standard tests` : seul `tests/capture-intake.test.cjs`.
  Aucun code changé pendant cette reprise, aucun harnais modifié, aucun commit ni push.
- Verdict `TERMINÉ` réécrit dans `.harness-state/tickets/T179/verdict.json` après le contrôle complet.
  Relecture et intégration laissées à la boucle ; aucune réserve nouvelle.

### Correction de la première relecture — 16 octobre 2026

- Rapport `relecture-1.md`, ticket et journal, écarts, état Git et diff relus. Les deux constats
  mineurs sont confirmés : commentaires explicatifs manquants et deux instructions sur une ligne
  dans le nettoyage du stockage différé. Aucun constat contesté ; exploration et écarts complétés.
- Avant correction : `node --test tests/capture-intake.test.cjs`, code de sortie 0, 15/15 verts
  (`correction-1-before.log`). Ces corrections de lisibilité ne changent aucun comportement ;
  aucun rouge comportemental revendiqué, aucun test du texte source ajouté.
- Constat 1 corrigé : explications locales rétablies sur le refus avant préparation, la possession
  jusqu'au retour du transport, l'attente des stockages avant la borne, le maintien du créneau,
  l'opération facultative, la priorité de la vie d'origine et la pause disque de la session courante.
- Constat 2 corrigé : `media.resolve()` et `thumbnail.resolve()` occupent chacun leur ligne dans
  le `t.after`. Aucune assertion ni instruction exécutable changée.
- `node scripts/check.mjs --changed` : vert, code de sortie 0, 15/15 tests après correction
  (`correction-1-check-changed.log`). `git diff --check` : code de sortie 0.
- `wc -l runtime/headless-runtime.cjs runtime/capture-intake.cjs` : 774 et 159 lignes physiques ;
  les douze lignes supplémentaires du module sont les commentaires rétablis.
- `git diff --name-only -- tests` : vide ; `git ls-files --others --exclude-standard tests` :
  seul `tests/capture-intake.test.cjs`. Contrôle complet lancé en séquentiel.
- `node scripts/check.mjs` : vert, code de sortie 0 ; règles, format, lint, gel et cliquet verts,
  113 fichiers JavaScript, 1 415 tests réussis, aucun échec ; Python : 33 tests exécutés,
  résultat OK avec un test ignoré (`correction-1-check-full.log`).
- `git diff --check` après correction : code de sortie 0. Les deux constats sont corrigés,
  sans réserve ; verdict `TERMINÉ` écrit après le contrôle complet. Aucun commit ni push.
  La boucle garde la responsabilité de la relecture de correction et de l'intégration.

### Réserves à la clôture

- .harness-state/tickets/T179/relecture-2.md : **Écart accepté, repères de lignes historiques** : le transport vit bien dans `server/ingest-routes.cjs` depuis T174. Ce n'est pas un écart à un critère.
- .harness-state/tickets/T179/relecture-2.md : **Écart accepté, options `setPreparationTimer` / `clearPreparationTimer`** : c'est le câblage des minuteries injectées que demande le périmètre. Il garde le contrat de l'ADR 0015, où `setTimer`/`clearTimer` restent réservés au checkpoint.

  La section « Première relecture » de `ecarts.md` ne conteste rien et ne déclare aucun nouvel écart. Il n'y avait donc aucune contestation à trancher.
