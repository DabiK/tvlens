---
id: T179
titre: Move headless capture admission into one intake owner
statut: a-faire
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
