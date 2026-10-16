---
id: T192
titre: Read one consistent session when the server lists sessions during a switch
statut: a-faire
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
