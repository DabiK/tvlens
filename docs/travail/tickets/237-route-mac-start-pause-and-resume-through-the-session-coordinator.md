---
id: T237
titre: Route Mac start pause and resume through the session coordinator
statut: a-faire
bloque_par: T236
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le Mac démarre, met en pause et reprend une session par le coordinateur partagé. Les gestes,
réponses IPC, titres et refus existants restent définis ; une seule chaîne sérialise les transitions.

## Sources

- Cible : `docs/domaine.md`, sections 3 Bibliothèque, 6, 9 et 10 ; ADR 0029/0030.
  T236 livre le coordinateur issu du serveur et ses capacités ; T234 fixe le contrat de fin.
- Code vérifié à `1d8aa48` : `app/main.cjs:107` possède la chaîne `transition` ; `:314` adopte
  le runtime et les métadonnées. `:403` démarre ou reprend la session en pause, `:449` met en
  pause et `:487` reprend explicitement l'archive. Ces transitions vivent encore dans l'hôte.
- `app/main.cjs:418` compose la session, `:421` prépare son titre et `:423` modifie le manifeste
  demandé ; `:424` prépare le résumé, `:429` préchauffe les agents. Ce ne sont pas des faits d'archive confirmée.
- `runtime/headless-session-lifecycle.cjs:53` sérialise, `:75` adopte, `:88` démarre,
  `:119` pause et `:238` reprend. Le serveur accepte un start répété pendant capture (`:110`),
  alors que le Mac le refuse (`app/main.cjs:404`) : déclarer cette différence de commande.
- `runtime/session-lifecycle.cjs:162` arrête l'horloge puis l'admission ; `:169` vérifie le
  disque avant la reprise. Le cycle de ressources reste dans ce module (ADR 0020).
- Tests lus : `tests/mac-ipc-contract.test.cjs:410`, `:735` et `:1322`,
  `tests/headless-session-lifecycle.test.cjs:225` et `tests/session-lifecycle.test.cjs:208`.
  Le vrai preload appelle ces canaux à `app/preload.cjs:40`, `:63` et `:65`.

## Périmètre

- Modifier `app/main.cjs`, qui compose `runtime/library/session-coordinator.cjs` (livré par T236)
  et déclare les capacités et étapes du Mac (`docs/domaine.md:281`) ; ne modifier le coordinateur
  que si son raccord l'exige. Adapter leurs tests et le banc IPC. Réutiliser les ports livrés, sans
  fabriquer une seconde variante du coordinateur. Aucun import Electron dans runtime.
- Base attendue après T227 : `ViewingMemory` derrière son entrée publique, projections communes,
  abonnements du résumé et de la surveillance, politique vision applicative, rétention durable.
  Ne réintroduire ni `watch.snapshot()` comme notification, ni `setQuestionPending`, ni balayage glissant.
- Faire déléguer `watch:start`, `watch:stop` et `sessions:resume` au coordinateur. Les vérifications
  et effets de transition sont exécutés par lui à travers les capacités déclarées : autorisation
  de capture Mac, garde disque, composition, titre via la fiche T235, résumé, préchauffage et publication.
  L'hôte conserve validation de provenance IPC et adaptation des réponses historiques.
- La pause conserve la session chargée et laisse finir les analyses et questions déjà lancées.
  La reprise conserve identité, horloge acquise et numérotation ; seule la reprise explicite
  quitte la lecture seule. Le coordinateur utilise les commandes du cycle de ressources ADR 0020.
- Employer sa chaîne unique aussi pour les chemins Mac restant à migrer. Une couture transitoire
  de lecture/adoption peut les raccorder jusqu'à T238/T239 ; la nommer au journal et prévoir son
  retrait dans T239. Aucun second propriétaire modifiable de session ni double verrou imbriqué.
- Déclarer les étapes Mac sans anticiper la migration de leur fin : T238 prend l'ouverture,
  T239 la fermeture, la suppression et le départ de l'application. Le résumé ne reçoit aucun
  nouvel abonnement de sauvegarde obligatoire. Élaguer les suppressions ESLint devenues inutiles.

## Critères d'acceptation

1. Par le vrai preload sous Electron simulé, start rend les mêmes `id`, `elapsedMs`, `segmentMs` ;
   le titre contient toujours la source choisie et la date. Une deuxième session ne remplace pas
   une capture active ; start sur archive est refusé avec le texte Mac existant.
2. Pause ferme l'admission et fige l'horloge sans décharger la session. Une analyse et une question
   retenues avant pause peuvent terminer ; la reprise poursuit cette session sans réutiliser de passage.
3. Un disque bloqué refuse création et reprise avant adoption ou modification d'horloge/lecture seule.
   Une reprise réussie d'archive préchauffe les deux agents comme auparavant ; l'ouverture seule ne le fait pas.
4. Un start retenu puis refusé est suivi d'une pause et d'une autre transition sans blocage de chaîne.
   Deux commandes concurrentes observent les états dans l'ordre d'exécution, sans double composition.
5. Les scénarios serveur et le contrat T234 restent verts. À ce stade, la fin Mac garde les étapes
   encore à migrer et leurs garanties caractérisées ; la preuve de la fin Mac entièrement portée
   par le coordinateur appartient à T239, pas à une assertion anticipée dans ce ticket.
6. À l'implémentation, jouer en séquentiel `tests/headless-session-lifecycle.test.cjs` (ou le fichier du coordinateur
nommé au journal de T236), mac-ipc-contract,
   session-lifecycle, `tests/server-warm-up.test.cjs` et `tests/mac-ipc-contract.test.cjs:1322` et le contrat T234, puis `node scripts/check.mjs`.
   Aucun test, format, canal ni plancher n'est retiré ou affaibli.

7. `tests/mac-ipc-contract.test.cjs` enveloppe la fabrique du coordinateur comme ses fabriques
   actuelles (`:226-235`) et observe que `watch:start`, `watch:stop` et `sessions:resume` passent
   par ses commandes et sa chaîne ; ce test échoue sur la base d'avant ce ticket.

## Test d'acceptation attendu

Étendre `tests/mac-ipc-contract.test.cjs` par start → ingestion → pause → start, puis par une
reprise explicite d'archive. Retenir disque, analyse et question séparément ; observer états,
fichiers et appels de préchauffage. `tests/headless-session-lifecycle.test.cjs` (ou le fichier du coordinateur nommé
au journal de T236) vérifient la chaîne avec promesses
maîtrisées. Une comparaison de fragments de `main.cjs` ne prouve pas la délégation.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères décrivent la base vérifiée, avant la phase 1 et T236. T227 est le dernier successeur
de phase 1 dans l'hôte Mac et sa composition, déjà transitif par T235/T236 ; relire ces livraisons avant implémentation.
Les noms exacts de capacités suivent sa livraison. Ce lot applique l'ADR 0030 sans nouvelle décision d'architecture.
T234 lit le résultat de T250 et nomme les écarts de fin Mac ; ce lot conserve cette caractérisation.

## Journal
