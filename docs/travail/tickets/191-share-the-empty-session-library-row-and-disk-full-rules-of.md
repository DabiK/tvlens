---
id: T191
titre: Share the empty-session, library-row and disk-full rules of both hosts, and spare a resumed archive on the Mac
statut: termine
bloque_par: T190
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les deux hôtes appliquent une seule définition de session vide, de ligne de bibliothèque et de
réaction au disque plein à l'ingestion. Sur Mac, une archive reprise sans passage ni question est
conservée à sa fermeture, comme sur le serveur.

## Sources

- `docs/audit-architecture.md`, synthèse, règle de session vide confirmée ; rapport A, B1.
  Décision du propriétaire, le 16/10 : trois règles pures partagées dans `runtime/`, sans coordinateur
  commun aux hôtes ; retenir pour la session vide la règle serveur avec `fresh`.
- Code vérifié à `8340014` : `app/main.cjs:305` adopte `{ runtime, title, startedAt }`, sans origine
  fresh ; `app/main.cjs:354` peut déclarer vide toute session non readOnly sans passage ni job.
  `app/main.cjs:479` reprend une archive, qui perd alors readOnly sans acquérir de protection d'origine.
- Le serveur initialise `fresh` à false (`runtime/headless-session-lifecycle.cjs:40`), le remet
  à false à l'adoption (`runtime/headless-session-lifecycle.cjs:80`) et ne le lève qu'à la création
  (`runtime/headless-session-lifecycle.cjs:98`). Sa règle vide, à
  `runtime/headless-session-lifecycle.cjs:141`, vérifie aussi questions historiques et passages.
- Lignes de bibliothèque : `app/session-rows.cjs:1` et `runtime/headless-runtime.cjs:464` calculent
  chacun la ligne vivante. `app/main.cjs:321` transmet le `loaded` courant après l'attente ;
  `tests/session-rows.test.cjs:64` couvre son absence. Le `TypeError` Mac du rapport A est infirmé
  et ne constitue pas un défaut à corriger ici.
- Disque plein : `app/main.cjs:428` et `runtime/capture-intake.cjs:117` comparent le code et
  l'identité de session, mettent en pause puis publient. `core/session.cjs:126` a déjà arrêté
  l'admission lors du refus d'écriture ; la pause d'hôte arrête aussi l'horloge.
- Tests : `tests/session-rows.test.cjs`, `tests/mac-ipc-contract.test.cjs:461`,
  `tests/server-sessions.test.cjs:292`, `tests/capture-intake.test.cjs`,
  `tests/headless-session-lifecycle.test.cjs` et `tests/disk-guard.test.cjs`.
- ADR 0002/0003 (confirmation), 0007 (ordres distincts), 0020/0023/0024 (propriétaires actuels).

## Périmètre

- Créer dans `runtime/` une fonction pure pour chacune des trois règles et les faire appeler par
  les deux hôtes. Les entrées sont des faits explicites ; aucune fonction pure ne lit le disque,
  ne consulte un singleton d'hôte et ne déclenche pause ou publication.
- La session vide exige : créée dans cette vie de l'hôte (`fresh`), aucun job de question, aucune
  question historique de WatchSession, aucun passage. Ajouter à l'objet Mac chargé le fait d'origine
  nécessaire, vrai seulement à la création ; ouvrir puis reprendre une archive ne le lève jamais.
- La projection commune des lignes prend liste, instantané et métadonnées explicites. Conserver
  les titres, dates, host, rétention, indicateurs current/readOnly/capturing et chiffres médias.
  Les différences de présentation et la limite serveur de 50 lignes restent à la frontière d'hôte.
  `app/session-rows.cjs` peut garder une façade de compatibilité, sans seconde règle.
  Si T192 est déjà livré, conserver sa lecture à l'entrée de `HeadlessRuntime.sessions()` et
  `storageUsage()` ; ses tests de courses restent verts après la mutualisation.
- La règle disque plein décide si le code de stockage et l'identité courante exigent une pause.
  Chaque hôte conserve ses effets : pause de la session d'origine encore chargée, horloge comprise,
  publication de stockage et propagation du refus initial même si la pause échoue.
- Ajouter les cas communs et les régressions aux bancs Mac/serveur ; écrire un ADR court sur les
  trois règles partagées. Garder les propriétaires et ordres de l'ADR 0007.
- Ne toucher ni protocole de fermeture, ni rétention, ni effacement explicite, ni seuils disque,
  ni formats des archives. La cohérence des lectures serveur pendant un await est traitée par T192.

## Critères d'acceptation

1. Une archive valide sans passage ni question est ouverte, reprise, mise en pause puis fermée
   sur chaque hôte. Son dossier et ses fichiers d'archive restent présents et elle reste listée.
   Tester séparément la fermeture sans reprise, toujours sans écriture dans l'archive lue seule.
2. Une session fraîche sans passage ni question est encore effacée par la fin ordinaire ; une
   session avec passage, job ou question historique est conservée. Les tests de la fonction pure
   couvrent ces quatre faits indépendamment et distinguent archive reprise et session fraîche.
3. La même fixture produit les mêmes chiffres et indicateurs communs de ligne sur les deux hôtes :
   sans manifeste, avec manifeste ancien, archive en lecture seule, aucun chargé, passage expiré
   et stockage connu ou absent. Les entrées ne sont pas mutées ; titres/dates propres sont préservés.
4. Au disque plein à l'ingestion, les deux hôtes conservent les anciens médias, refusent le bloc,
   arrêtent capture et horloge, publient la raison et restent ouverts aux questions. Aucun effacement
   automatique ni redémarrage sans geste explicite ; la reprise reste soumise à la garde disque.
5. Le refus tardif d'une ingestion de A ne met pas B en pause. Un refus autre que stockage plein
   n'entraîne aucune pause. Si la pause échoue, le refus initial du bloc reste celui rendu au client.
6. Une recherche et la relecture des appelants établissent une implémentation de chaque règle,
   appelée par les deux hôtes. Les différences d'ordre de fin, transport et présentation demeurent
   explicites ; aucune nouvelle composition commune de cycle de vie n'est créée.
7. Les tests cités et ceux des fonctions partagées passent en séquentiel ; si T192 est livré,
   ses scénarios de lecture cohérente restent verts. Ensuite, `node scripts/check.mjs`
   est vert à l'implémentation, sans suppression de test ni modification du harnais ou du plancher.

## Test d'acceptation attendu

Ajouter dans `tests/mac-ipc-contract.test.cjs` et `tests/server-sessions.test.cjs` le parcours
archive vide → ouverture → reprise → pause → fermeture, par le preload réel et les routes HTTP.
Une fixture d'archive explicite évite de confondre ce cas avec une session fraîche normalement
effacée. Vérifier le dossier, ses fichiers et la liste après la fin. Les fonctions pures reçoivent
ensuite un corpus commun ; les tests d'ingestion conduisent refus et changement de session par
promesses différées, sans panne disque réelle ni fournisseur payant.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T190 stabilise la propriété du drapeau de question et implique T199 puis T178. Le risque d'effacement
Mac est déduit de la perte de readOnly après reprise et de l'absence de fresh ; aucun effacement
n'a été provoqué au découpage. Le ticket corrige cette divergence précise, sans rouvrir la réserve
infirmée sur un déréférencement de `sessionRows`.

## Journal

- Exploration : règles et appelants relus ; T190 livré, T192 encore à faire. Trois fonctions pures
  prévues, sans coordinateur commun ni changement des ordres de fermeture. Détails et écarts dans
  `.harness-state/tickets/T191/` ; aucun écart prévu.
- Rouge observé : `node --test --test-concurrency=1 --test-name-pattern='an empty Mac archive'
  tests/mac-ipc-contract.test.cjs` : 1 vert, 1 rouge sur la présence du dossier après reprise.
  Même parcours serveur : 2/2 verts avant extraction. Sorties `empty-mac-red.log` et `empty-server-before.log`.
- Correction et règle de vacuité : corpus des 16 combinaisons et quatre parcours IPC/HTTP,
  commande avec le filtre `an empty (Mac|server) archive|only a fresh session` : 5/5 verts (`empty-green.log`).
- Projection : corpus commun caractérisé avant extraction, `node --test --test-concurrency=1
  tests/session-rows.test.cjs` : 5/5 verts (`rows-characterization.log`), puis 5/5 après extraction.
  Premier essai du corpus refusé pour une fixture incomplète (`watch.readOnly` absent), corrigée sans changer les assertions.
- Disque plein : caractérisations Mac `--test-name-pattern='Mac ingestion keeps'` : 2/2 verts ;
  `tests/capture-intake.test.cjs` : 15/15 verts avant extraction. Après extraction, fonctions pures,
  projection et ingestion : `node --test --test-concurrency=1 tests/empty-session.test.cjs
  tests/session-rows.test.cjs tests/capture-storage.test.cjs tests/capture-intake.test.cjs` : 22/22 verts.
  Le contrôle rapide a demandé de découper deux fonctions trop complexes ; corrections sans gel supplémentaire.
- Bancs ciblés : `node --test --test-concurrency=1 tests/mac-ipc-contract.test.cjs
  tests/server-sessions.test.cjs tests/headless-session-lifecycle.test.cjs tests/disk-guard.test.cjs` :
  63/63 verts (`hosts-green.log`). Complément Mac, filtre `a Mac disk refusal|host settings come` :
  2/2 verts (`disk-mac-replacement.log`), refus de A encore en pause pendant le chargement de B,
  et question acceptée pendant le blocage disque.
- Inventaire et relecture des appelants : une définition par règle dans `runtime/`, deux hôtes
  consommateurs ; façade Mac sans seconde projection. ADR 0036 ajouté ; ordres de fin conservés.
- `node scripts/check.mjs --changed` : vert, 51/51 tests des fichiers alors modifiés (`check-changed.log`).
  `node scripts/check.mjs` : vert, 126 fichiers JS, 1912/1912 tests JS et 22 tests Python (`check-full.log`).
  Aucun test supprimé, aucun changement de harnais, de plancher ou de gel du lint.
- Contrôle final des fichiers modifiés : `node scripts/check.mjs --changed` : vert, 52/52 tests
  (`check-changed-final.log`). `git diff --check` : vert. Verdict `TERMINÉ` écrit dans le dossier d'état ;
  aucun commit ni push, relecture et intégration laissées à la boucle.
