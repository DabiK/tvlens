---
id: T036
titre: Add a journal port with a stderr sink and a contract test
statut: a-faire
bloque_par: T145
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le produit écrit aujourd'hui sur la sortie d'erreur sous quatre formes sans rapport entre elles, et aucune
ne porte d'identifiant commun (hôte, démarrage, session). Après ce ticket, il existe un port de journal,
une fabrique qui produit des lignes JSON d'une seule forme, un puits vers la sortie d'erreur, un puits
mémoire pour les tests, un test de contrat et une page qui dit où lire. Aucun appelant n'est encore
branché : les formes existantes restent telles quelles, parce que des tests fixent leur enveloppe.

## Sources

- Constats : GAP1-01, GAP1-10, OUBLI-57
- Livre : jalon:journal
- Code vérifié à la version `0d5a954` :
  - `core/ports.cjs` : les ports sont des `@typedef` JSDoc (`PerceptionPort` ligne 9, `ArchivePort`
    ligne 14, `SessionLibraryPort` ligne 98). Aucun port de journal.
  - `adapters/chat-trace.cjs` : `clean(value, max = 240)` ligne 2, `safeError(error, depth = 0)` ligne 13,
    écriture directe `process.stderr.write(JSON.stringify({trace:VERSION,…}))` ligne 42, exports
    `{trace,safeError,isAuthFailure,VERSION}` ligne 44.
  - `adapters/codex-session-client.cjs` : `report` ligne 53 (écriture directe ligne 55), `reported` (Set)
    ligne 46, `reportOnce` lignes 48-52 : une ligne par processus, sans heure ni identifiant.
  - `runtime/headless-runtime.cjs` : constructeur de `HeadlessRuntime`, `this.boot = randomBytes(4)…`
    ligne 250, `this.log = options.log || ((line) => console.error(line))` ligne 259.
  - `server/main.cjs` : `main()`, `console.log` lignes 36 et 41, `console.error` ligne 47.
  - `app/main.cjs` : `log: line => console.error(line)` ligne 378, `console.error(error)` ligne 549.
- Tests qui fixent l'enveloppe des formes existantes, et que ce ticket ne doit pas faire bouger :
  - `tests/chat-trace.test.cjs` : remplacement de `process.stderr.write` et `JSON.parse` de chaque
    écriture ligne 5 ; `e.stack === undefined` ligne 18.
  - `tests/codex-confinement.test.cjs:33`, `tests/architecture-f05.test.cjs:52`,
    `tests/verification.test.cjs:186` : filtres sur le préfixe « TVLens : ».
  - `tests/server-sessions.test.cjs:400` et suivants : l'option `log` comparée par `deepEqual`.
- `scripts/quality/metrics.mjs`, `ENV_READERS` ligne 15 : seuls `adapters/config.cjs`, `app/main.cjs` et
  `server/main.cjs` lisent `process.env`. Un puits qui le lirait ferait monter `process_env_hors_config`.

## Périmètre

À créer :

- `core/ports.cjs` : le `@typedef` `JournalPort`
  (`{ event(level, name, fields?, limitKey?) : void, child(fields) : JournalPort }`, niveaux `debug`,
  `info`, `warn`, `error`, `fatal`). Le port est synchrone et ne lève jamais.
- `runtime/journal.cjs` : `createJournal({ sink, now, base })`, où `base` porte `host` et `boot`. Une
  ligne est un objet `{ v: 'tvlens-journal-v1', t, level, host, boot, event, … }`. La liste blanche des
  clés est une constante nommée, exportée, à cet endroit seulement : `sessionId`, `passageId`, `jobId`,
  `sequence`, `route`, `status`, `code`, `role`, `threadId`, `turnId`, `eventTurnId`, `eventThreadId`,
  `itemId`, `tool`, `model`, `kind`, `mode`, `confined`, `verified`, `willRetry`, `questionLength`,
  `totalMs`, `ms`, `bytes`, `count`, `file`, `reasons`, `lane`, `timeout`, `origin`, `component`, `error`,
  `message`. Toute autre clé est retirée et le nombre de clés retirées est porté par la ligne. Les valeurs
  textuelles passent par `clean`, `error` par `safeError`. La borne est demandée par l'appelant : `event`
  reçoit en quatrième argument, facultatif, une clé de borne, constante écrite dans le code de l'appelant
  et jamais une donnée reçue. Sans clé, toute ligne sort. Avec une clé, la première occurrence sort ; les
  suivantes de la fenêtre (`LIMIT_WINDOW_MS`, constante nommée et exportée) sont comptées sans sortir ; la
  première occurrence après la fenêtre sort avec `repeated: n`, le nombre de lignes retenues. L'horloge
  est injectée (`now`) et la fabrique n'arme aucune minuterie : des lignes retenues ne sortent qu'avec
  l'occurrence suivante.
- Aucun `catch` ajouté en production n'est vide : chacun rend une valeur de repli ou compte la ligne
  perdue, pour que la mesure `catch_vides_prod` du cliquet ne monte pas.
- `adapters/redaction.cjs` : reçoit `clean` et `safeError`, déplacés sans changement de comportement.
  `adapters/chat-trace.cjs` les importe de là et garde ses exports actuels.
- `adapters/journal-stderr.cjs` : puits qui écrit une ligne JSON par événement sur la sortie d'erreur. Il
  reçoit en option le mode service (préfixe de priorité `<3>`, `<4>` ou `<6>` devant la ligne) ; il ne lit
  pas `process.env`. Une écriture qui échoue ne lève pas.
- `tests/helpers/journal.cjs` : puits mémoire `{ lines, sink }`.
- `tests/journal.test.cjs` : le test de contrat ci-dessous.
- `docs/diagnostic.md` : par symptôme, où lire et avec quelle commande ; la forme d'une ligne ; la règle
  de confidentialité (identifiants, tailles, durées et codes, jamais de parole, de question ni
  d'affirmation). La commande citée pour le serveur est de la forme
  `journalctl -u tvlens -o cat | jq -R 'fromjson? | select(…)'`, qui ne s'arrête pas sur une ligne non
  JSON. La page dit que les formes existantes ne passent pas encore par le port, et écrit la limite
  connue du filtre sous l'intitulé « texte libre » : `message` et `error.message` sont bornés et expurgés
  par `clean`, mais la liste blanche ne filtre que des clés ; un appelant qui journalise une réponse de
  modèle, la sortie de Codex ou le message d'un fournisseur passe un code et une taille, pas le texte.
- Un ADR dans `docs/adr/`, au premier numéro libre : le port, la forme de la ligne et sa version, la
  liste blanche commune (nommée par son emplacement, `runtime/journal.cjs`, sans être recopiée), la borne
  demandée par l'appelant et ce qu'elle retient sans minuterie, la limite du texte libre, et le fait que
  le mode service est décidé par l'hôte.

À ne pas toucher :

- Les appelants : `server/`, `app/`, `mcp/`, `runtime/headless-runtime.cjs`,
  `adapters/codex-session-client.cjs`. Aucune ligne existante ne change de forme ni de texte.
- Le comportement de `safeError` et de `clean` ; les tests de `tests/chat-trace.test.cjs`.
- `core/` hors `core/ports.cjs` ; `core/` n'importe rien du journal.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/journal.test.cjs` passe. Le fichier prouve, par `createJournal` et le puits mémoire :
   - une ligne est sérialisable en JSON sur une seule ligne et porte `v`, `t`, `level`, `host`, `boot`,
     `event` ;
   - `child({ sessionId })` ajoute ses champs à chaque ligne de l'enfant sans toucher celles du parent ;
   - une clé hors liste blanche (au moins `text`, `question`, `prompt`, `query`, `transcript`,
     `statement`, `answer`) ne sort pas, et la ligne porte le nombre de clés retirées ;
   - un secret planté dans `error.message` (un jeton de la forme que `clean` expurge déjà) sort expurgé ;
   - un puits qui lève, un champ cyclique et un champ dont la lecture lève ne font lever ni `event` ni
     `child` ;
   - avec une horloge injectée, trois occurrences sous la même clé de borne dans la fenêtre donnent une
     seule ligne ; l'horloge avancée au-delà de `LIMIT_WINDOW_MS`, l'occurrence suivante sort et porte
     `repeated: 2` ; trois occurrences du même événement sans clé de borne donnent trois lignes.
2. Le même fichier prouve que le puits de `adapters/journal-stderr.cjs`, donné un flux factice, écrit
   exactement une ligne terminée par `\n` par événement, avec le préfixe de priorité seulement en mode
   service.
3. `node --test tests/chat-trace.test.cjs` passe sans qu'une ligne de ce fichier de test ait changé.
4. `node --test tests/architecture.test.cjs` passe : `core/` n'importe rien hors de `core/`.
5. `grep -rn "process.env" runtime/journal.cjs adapters/journal-stderr.cjs adapters/redaction.cjs` ne
   rend rien.
6. `grep -n "runtime/journal.cjs" docs/adr/<nouvel ADR>` rend au moins une ligne et
   `grep -c "eventThreadId" docs/adr/<nouvel ADR>` rend 0 : l'ADR renvoie à la liste blanche sans la
   recopier. `grep -n "fromjson?" docs/diagnostic.md` et `grep -n "texte libre" docs/diagnostic.md`
   rendent chacun au moins une ligne.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/journal.test.cjs`, nouveau. Frontière : `createJournal` de `runtime/journal.cjs` avec le puits
mémoire de `tests/helpers/journal.cjs`, et le puits de `adapters/journal-stderr.cjs` devant un flux
factice passé en option. Aucune globale n'est remplacée.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si déplacer `clean` et `safeError` oblige à modifier un test existant,
ou si un appelant doit changer pour que le port existe : verdict BLOQUÉ, avec l'écart constaté.

## Journal
