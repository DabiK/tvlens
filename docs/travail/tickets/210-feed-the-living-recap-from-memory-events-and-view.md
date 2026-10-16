---
id: T210
titre: Feed the living recap from memory events and its consultation view
statut: a-faire
bloque_par: T221, T207
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le résumé vivant suit les passages et la vue de consultation de la Mémoire. Il conserve ses originaux,
ses limites et sa règle de capacité sans recevoir le snapshot complet de `WatchSession`.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire), 6, 8 et 9 ; ADR 0029 et 0030.
  Application de la phase 1 du plan structurel du 16/10. L'ADR 0009 reste le contrat de capacité.
- Code vérifié à `dd5efc9` : `core/living-recap.cjs:47` reçoit `{id, history, segments}` ;
  `core/living-recap.cjs:54` ne retient que les passages `ready` avec un texte exploitable.
  `core/living-recap.cjs:56` distingue une correction de source d'un changement de relecture.
- `core/living-recap.cjs:59` calcule aussi les limites sur les passages en attente, partiels et perdus ;
  `core/living-recap.cjs:67` compte les interruptions supérieures à 250 ms. Une notification limitée
  aux seuls passages prêts ne suffirait donc pas.
- `core/living-recap.cjs:24` restaure silencieusement les sources et les chapitres ;
  `core/living-recap.cjs:99` bloque une entrée déjà refusée, avec la révision relevée au départ à
  `core/living-recap.cjs:100`. La disponibilité seule ne doit pas réarmer cette tentative.
- Appelant produit établi : `app/main.cjs:201`, `app/main.cjs:300` et `app/main.cjs:462` ;
  composition partagée à `runtime/session-runtime.cjs:176`.
  Tests lus : `tests/living-recap.test.cjs` et `tests/architecture-f09.test.cjs`.
- État attendu : T206/T221 publient les changements de passage sans remplacer `onChange` ; T207 publie
  `MemoryView`. T194, transitif, retire la voie série et conserve les archives historiques.
  Ces interfaces n'existent pas à la version vérifiée : relire leurs modules et contrats livrés.

## Périmètre

- Modifier l'entrée de `LivingRecap.observe` et le branchement du Mac. Placer toute nouvelle
  coordination dans `runtime/memory/`, avec lectures et abonnement injectés ; ne pas importer
  `WatchSession` depuis le résumé. Si cette sous-zone est créée, déclarer sa zone et ses permissions
  dans `tests/architecture.test.cjs` selon T205, transitif par T206.
- Alimenter le résumé par `PassageUpdated` et la vue courante ; couvrir aussi réception et pertes
  nécessaires à ses limites. Un callback synchrone ne lance ni synthèse ni sauvegarde attendue.
  Les changements rapprochés peuvent être regroupés, en gardant le dernier état par passage.
- Initialiser depuis la vue courante au branchement et après restauration : les événements ne sont
  pas rejoués. Actualiser silencieusement la disponibilité après `restore`, sans réécrire l'archive,
  sans synthèse et sans publier un état intermédiaire qui viderait les chapitres.
- Garder l'ordonnancement de `tick`, le délai de 25 s par défaut et son réglage smoke existant,
  l'annulation pour priorité à la question,
  la provenance et la validation des chapitres. Les limites participent toujours à la révision
  d'entrée ; une disponibilité changée seule actualise le replay mais pas cette révision.
- Retirer l'ancien appel `recap.observe(snapshot)` des publications de session. Détacher l'abonnement
  au remplacement ou à la fermeture. Détacher l'abonnement avant le `recap.reset()` de l'étape
  « résumé vivant » (`app/main.cjs:359`) et ignorer tout événement reçu pendant `closing`/`switching`
  (`app/main.cjs:300`). Un événement d'une autre session est ignoré : il ne remet plus le résumé
  à zéro comme à `core/living-recap.cjs:49`.
  Ne pas ajouter le résumé vivant au serveur ou à la TV dans ce ticket.
- Jusqu'à T195, `tests/mac-ipc-contract.test.cjs:87-128` lit encore le texte du câblage Mac.
  Ne pas réécrire ces motifs pour suivre le nouveau câblage ; si l'un casse, s'arrêter.
- Les fichiers restent à leur adresse actuelle s'ils sont gelés. Élaguer toute suppression ESLint
  devenue inutile ; aucun nouveau fichier ne reçoit d'infraction. Aucun format persisté ne change.

## Critères d'acceptation

1. Une session réelle à deux voies, avec vision retenue par une promesse, ne fournit pas sa seule
   transcription partielle à la synthèse. Après le visuel, le même passage prêt devient une source
   unique. Répéter la notification de la même révision ne duplique ni source ni travail.
2. Une correction de texte ou de bornes remet la source en attente ; un changement de disponibilité
   conserve son texte et ne réarme pas une entrée refusée pour capacité. Les cas de l'ADR 0009
   gardent leur résultat, dont une correction arrivée pendant une tentative refusée.
3. Réception, attente vision, perte et interruption de capture actualisent les mêmes limites que
   précédemment, y compris sans nouveau passage `ready`. Une notification étrangère est ignorée.
4. Une archive avec résumé est restaurée sans événement historique : sources, chapitres, provenance
   et disponibilité sont corrects dès sa consultation, sans fournisseur, écriture ni émission de
   restauration. Seule une reprise explicite autorise les synthèses suivantes.
5. Une analyse qui se termine pendant l'étape « capture » d'une fin n'appelle pas `saveRecap`,
   et `living-recap.json` garde ses chapitres (`app/main.cjs:206-207`, `:367`). Après débranchement, un événement de l'ancienne session ne change rien. Un abonné défaillant
   conserve les garanties de T186/T206 et ne bloque ni les voies ni une sauvegarde obligatoire.
6. Le branchement n'appelle plus `WatchSession.snapshot()` pour nourrir le résumé. À l'implémentation,
   lancer en séquentiel living-recap, architecture-f09, les tests du branchement et les bancs Mac
   affectés, puis `node scripts/check.mjs`. Aucun test ni plancher n'est supprimé ou affaibli.

## Test d'acceptation attendu

Étendre `tests/living-recap.test.cjs` et ajouter un test de la coordination dans
`tests/living-recap-runtime.test.cjs` si elle est extraite. Utiliser les vrais contrats T206/T221/T207,
une perception et une synthèse maîtrisées, et les horloges partagées. Les preuves passent par
l'ingestion, les événements, la vue et les entrées reçues par la synthèse, sans lire le source.
Conserver `tests/architecture-f09.test.cjs` comme preuve de l'ADR 0009.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le nombre et le nom des accès de T207 seront ceux du contrat livré, pas une API inventée ici.
Hypothèse technique à vérifier : les notifications T206/T221 couvrent toutes les modifications des
limites. Si l'une manque, documenter la transition et compléter son événement borné, sans retour
au snapshot ni synthèse sur une seule transcription. Aucun gain de coût n'est annoncé au découpage.

## Journal
