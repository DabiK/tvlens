---
id: T192
titre: Read one consistent session when the server lists sessions during a switch
statut: termine
bloque_par: T199
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une liste de sessions demandée pendant un changement ne mélange plus l'identité de A et les chiffres
de B. La lecture capture les faits de la session chargée avant sa première attente et restitue cet
instantané cohérent, y compris pour les chiffres de session de `/v1/storage`.

## Sources

- `docs/audit-architecture.md`, rapport B, B3 et D3 ; synthèse, lecture serveur restant à traiter.
  Décision du propriétaire, le 16/10 : corriger cette lecture sans fusionner les hôtes.
- Code vérifié à `8340014` : `runtime/headless-runtime.cjs:465` capture l'objet chargé et son id,
  puis attend `library.list` à la ligne 467. Après l'attente, `runtime/headless-runtime.cjs:475`
  lit le `this.sessionState` courant, tandis que horloge et stockage sont encore ceux de `loaded`
  aux lignes 479 et 484. Le mélange est possible si l'adoption a remplacé A par B entre-temps.
- `runtime/headless-session-lifecycle.cjs:74` adopte questions, référence de session et instantané
  dans le même tour ; `runtime/headless-runtime.cjs:71` remplace alors `sessionState`. L'adoption
  est cohérente, c'est la lecture à travers l'attente qui ne l'est pas.
- `runtime/headless-runtime.cjs:508` décrit encore l'ancien `loaded`, puis attend `library.usage`
  à la ligne 513. `runtime/headless-runtime.cjs:517` attend `sessions()` avant de relire le stockage
  de la session courante : `/v1/storage` peut ainsi ajouter les chiffres d'une autre session.
- Appelants HTTP : `server/session-routes.cjs:37` pour la liste et `server/session-routes.cjs:38`
  pour le stockage. `adapters/session-library.cjs:117` liste les archives et
  `adapters/session-library.cjs:152` calcule leur volume et l'état disque.
- Tests : `tests/server-sessions.test.cjs:122` pour les chiffres vivants de la liste,
  `tests/server-state-views.test.cjs`, `tests/headless-session-lifecycle.test.cjs` et
  `tests/server-routes.test.cjs`. ADR 0003, 0023 et 0024 : états, ingestion et transfert synchrone.

## Périmètre

- Modifier `runtime/headless-runtime.cjs` et, si utile, ajouter une projection pure dans `runtime/`.
  Avant le premier await, capturer ensemble identité, état publié correspondant, titre, horloge,
  rétention, readOnly, accepting, capturing et chiffres de stockage. Copier les faits nécessaires ;
  conserver seulement une référence à l'objet mutable de A ne suffit pas.
- Après chaque attente de bibliothèque, construire current et la ligne vivante avec cette même
  lecture. Ne jamais injecter un état dont l'id diffère de l'identité capturée. La réponse peut
  décrire A même si B a été adoptée depuis : elle décrit la session à l'entrée de la requête.
- Réutiliser cette lecture pour `storageUsage()` ; ne pas relire `this.session.storage()` après
  avoir attendu une liste construite pour une autre session. Le volume global reste celui de la
  liste retournée ; l'espace libre est la mesure fournie par la bibliothèque, pas un fait de session.
- Ajouter les courses contrôlées aux tests serveur. Écrire un ADR court fixant le contrat de lecture
  à l'entrée, sans boucle de nouvelle tentative ni attente de fin de transition.
- Préserver le format JSON, l'ordre et la limite de 50 lignes, le total et les règles de bibliothèque.
  Aucune modification du Mac, du protocole d'adoption, des archives ou de l'admission des captures.
  T191 mutualise les projections : réutiliser sa forme si elle est déjà livrée, sans la dupliquer.

## Critères d'acceptation

1. Retenir `library.list` après l'entrée de la requête sur A, adopter B avec des chiffres distincts,
   puis libérer la liste. current, titre, flags, rétention, temps, passages, médias et octets de la
   ligne courante appartiennent à A. Aucune valeur de B n'est ajoutée à la ligne de A.
2. Même scénario en fermant A sans remplacement, puis en ouvrant une archive B readOnly. La lecture
   ne lève pas, ne fabrique pas de ligne avec une identité null et ne réinterprète pas l'archive.
   Une requête commencée sans session reste sans current même si une session arrive pendant l'attente.
3. Changer les flags ou les métriques de A pendant l'attente, sans changer son id, ne déchire pas
   l'instantané : les faits de current et de sa ligne restent ceux capturés à l'entrée.
4. Retenir séparément `library.usage`, adopter B pendant cette attente, puis lire `/v1/storage` :
   le champ session porte encore les chiffres de A capturés avec la liste. Le volume global est
   calculé sur les lignes de cette réponse, avant leur éventuelle limitation d'affichage.
5. Les mêmes scénarios passent par le vrai `RemoteServer`, routes `/v1/sessions` et `/v1/storage`,
   avec bibliothèque différée et faux fournisseurs. Ils n'attendent ni délai réel ni course favorable.
6. Les suites `server-sessions`, `server-state-views`, `headless-session-lifecycle` et `server-routes`
   de `tests/` passent avec `node --test --test-concurrency=1`, puis `node scripts/check.mjs` est
   vert à l'implémentation. Aucune assertion existante ni compteur du cliquet n'est affaibli.

## Test d'acceptation attendu

Dans `tests/server-sessions.test.cjs`, exposer un signal « liste entrée », puis une promesse de
libération de `library.list`. Faire une vraie transition A → B pendant ce blocage et vérifier la
réponse HTTP avec des valeurs volontairement distinctes. Un second blocage de `library.usage`
prouve le même contrat pour le stockage. L'état initial, le changement et la libération sont
ordonnés par signaux ; aucune comparaison du texte source ni sommeil ne prouve la course.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T199 implique T178. Le rapport B, D3 autorise un instantané cohérent ou une reprise bornée ; ce ticket
retient l'instantané à l'entrée, choix technique qui évite une boucle sous changements répétés.
La course est établie par lecture, sans reproduction exécutée au découpage. Le `TypeError` Mac
infirmé par la synthèse n'est pas utilisé comme preuve.

## Journal

- 16/10/2026 — Exploration : course confirmée à la lecture de `sessions()` et
  `storageUsage()` ; adoption synchrone conservée et projection partagée de T191 réutilisée.
  Périmètre et preuves consignés dans `.harness-state/tickets/T192/exploration.md` ; aucun écart prévu.
- 16/10/2026 — Rouge observé :
  `node --test --test-concurrency=1 --test-name-pattern='HTTP session listing keeps the entry session facts' tests/server-sessions.test.cjs`
  échoue sur l'assertion : la ligne de A porte les deux passages de B et les flags de A après fermeture.
  Après capture synchrone des faits utiles, même commande : 1 test vert.
  Sorties : `list-replacement-red.log` et `list-replacement-green.log` dans le dossier d'état.
- 16/10/2026 — Rouge observé :
  `node --test --test-concurrency=1 --test-name-pattern='HTTP storage keeps the entry session volume' tests/server-sessions.test.cjs`
  échoue sur l'assertion : `session` porte 1562 octets de B au lieu des 776 octets capturés pour A.
  Après réutilisation de la lecture d'entrée dans `storageUsage()`,
  `node --test --test-concurrency=1 --test-name-pattern='HTTP storage keeps the entry session volume|HTTP session listing keeps the entry session facts' tests/server-sessions.test.cjs`
  donne 2 tests verts. Sorties : `storage-usage-red.log` et `storage-usage-green.log`.
- 16/10/2026 — Compléments de couverture par HTTP réel :
  `node --test --test-concurrency=1 --test-name-pattern='HTTP (session listing|storage keeps|/v1/)' tests/server-sessions.test.cjs`
  donne 12 tests verts, sans sommeil pour ordonner les courses (`http-races-complete.log`).
  `node scripts/check.mjs --changed` : vert à la première étape, 27 tests, 0 échec
  (`check-changed-first.log`). ADR 0037 ajouté ; aucun changement du protocole d'adoption.
- 16/10/2026 — Validation finale :
  `node --test --test-concurrency=1 tests/server-sessions.test.cjs tests/server-state-views.test.cjs tests/headless-session-lifecycle.test.cjs tests/server-routes.test.cjs`
  donne 64 tests verts, 0 échec (`required-suites.log`).
  `node scripts/check.mjs --changed` : vert, 29 tests, 0 échec (`check-changed-final.log`).
  `node scripts/check.mjs` : vert, 1924 tests JS dans 126 fichiers et 22 tests Python ;
  règles, format, lint, gel et cliquet verts (`check-full.log`). Aucune assertion existante affaiblie,
  aucun compteur ni gel modifié. Verdict `TERMINÉ` remis à la boucle pour relecture ; aucun commit ni push.
- 16/10/2026 — Reprise après `relecture-1.md` : constat mineur de lisibilité confirmé dans
  `holdLibrary`, sans changement de comportement demandé. Avant correction,
  `node --test --test-concurrency=1 --test-name-pattern='HTTP (session listing|storage keeps|/v1/)' tests/server-sessions.test.cjs`
  donne 12 tests verts (`correction-1-before.log`). Pas de nouveau test de texte source ;
  méthode de vérification de cette correction de forme consignée dans `ecarts.md`.
- 16/10/2026 — Correction du constat mineur : corps `releaseHeld` sur plusieurs lignes,
  une instruction par ligne, ordre et assertions conservés. `node scripts/check.mjs --changed` :
  vert, 29 tests JS, 0 échec (`correction-1-check-changed.log`).
  `node scripts/check.mjs` : vert, 1924 tests JS dans 126 fichiers et 22 tests Python ;
  règles, format, lint, gel et cliquet verts (`correction-1-check-full.log`).
  Nouveau verdict `TERMINÉ` remis à la boucle pour relecture ; aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T192/relecture-2.md : 1. `adapters/session-library.cjs:39`, avec `runtime/headless-runtime.cjs:489` (hors périmètre, réserve reprise du rapport précédent)

  - **Ce qui se passe :**
    - la bibliothèque est lue après l'attente, avec l'identifiant capturé à l'entrée ;
    - `describe()` classe donc `interrupted` une session B adoptée pendant l'attente dont le manifeste dit `live` ;
    - je l'ai confirmé en relisant `describe()`, ligne 39 : `id === current ? 'live' : 'interrupted'`.
  - **Pourquoi ce n'est pas à corriger ici :**
    - le comportement existait avant ce ticket ;
    - il suit le contrat retenu (la réponse décrit la session présente à l'entrée) ;
    - le changer toucherait aux règles de bibliothèque, que le ticket demande de préserver ;
    - la correction n'a pas touché ce code.
  - **Ce qui est attendu :** le noter dans les réserves. Il faut soit le documenter explicitement dans l'ADR 0037, soit ouvrir un ticket de suite si l'interface TV ne doit pas afficher une session vivante comme interrompue.
- .harness-state/tickets/T192/relecture-2.md : **Écart accepté, méthode de vérification de la correction** (`ecarts.md`, « Reprise après la première relecture ») : il n'y a pas de nouveau test rouge pour une correction de forme. C'est justifié : la correction ne change aucun comportement, et un test sur le texte source irait contre les standards. Les preuves rouge puis vert de l'implémentation restent dans le dossier d'état. Cet écart ne remplace aucun critère d'acceptation.
