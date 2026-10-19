---
id: T225
titre: Stop building the full snapshot to notify
statut: termine
bloque_par: T224, T208, T292
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: critique
---

## Ce que le ticket livre

La racine Mémoire notifie des faits ou invalidations bornés et ne construit plus son snapshot
complet pour prévenir les lecteurs. Les deux hôtes utilisent la projection applicative déjà livrée,
et `session.json` reste écrit uniquement par le convertisseur avec ses barrières explicites.

## Sources

- Troisième lot de T219, relecture B, constat 5 ; `docs/domaine.md`, sections 6, 8 et 9 ;
  ADR 0029/0030. T224 implique la migration serveur T219 et tous les lecteurs T209 à T213 ;
  T208 sépare archive et état publié. Relire leurs contrats, invalidations et tests avant contraction.
- Code vérifié à `dd5efc9` : `core/session.cjs:506` construit le snapshot dans `emit()`,
  `:513` le sauvegarde et `:520` publie l'issue de sauvegarde ;
  `runtime/session-runtime.cjs:176-180` chaîne encore index, manifeste et hôte.
- `adapters/local-store.cjs:157-169` coalesce par document, `:202` porte la barrière ;
  `runtime/session-lifecycle.cjs:118` confirme avant le manifeste final. Aucun abonné ne remplace cela.
- `runtime/headless-runtime.cjs:241-246` construit par auditeur seulement quand il en existe ;
  seul `scripts/replay-lg-stream.cjs:121` s'abonne hors tests. La mesure 0/1/3 est un banc de
  contrat de coût, pas un gain produit établi. ADR 0025 conserve les garanties Mac.
- Tests : session-durable, session-lifecycle, server-state-views, server-sessions,
  mac-ipc-contract, state-delivery et architecture-f04/f08/f10 sous `tests/`, suffixe `.test.cjs`.
  ADR 0002/0003/0004/0006/0008/0023 restent obligatoires.

## Périmètre

- Retirer le callback complet de `WatchSession.emit()` et son chaînage hérité dans le runtime
  partagé seulement après inventaire des consommateurs. Garder la consultation explicite
  compatible encore nécessaire, sans construction complète par notification ou par abonné.
- Compléter la matrice des invalidations T219 : progression, départ/fin de voie, pertes,
  disponibilité, retenue, admission suspendue, pause/reprise, lecture seule, erreurs de traitement
  et sauvegarde ; les hôtes ajoutent questions, quotas, index, stockage et chargement.
  Une notification non liée à un passage reste une invalidation bornée, documentée dans l'ADR.
- Relever aussi cycle de vie, moments gardés, protocoles média, recherche Mac et simulateurs hors
  sept familles. Donner la projection applicative aux demandeurs d'état publié, sans redonner
  un snapshot complet à chaque abonné ni élargir MemoryView à d'autres contextes.
- Garder au plus une projection complète partagée par livraison, les lectures bornées des
  abonnés spécialisés et les occasions de cadence manifeste sans passage nouveau. Aucun rejeu,
  nouvelle file historique ou minuterie du domaine. Détacher au remplacement de session.
- Vérifier `session.json` uniquement par T208, jamais par la projection publiée. Les sauvegardes,
  leur ordre, `saveError`, la coalescence, la barrière et le scellement restent des appels
  obligatoires explicites ; aucun abonné isolé n'en devient l'unique responsable.
- Adapter seulement racine, runtime partagé, lectures restantes et tests affectés. Ne pas
  refondre les cycles de vie ou déplacer la racine. Compléter l'ADR T219, maintenir les zones
  T205 et élaguer les suppressions ESLint devenues inutiles sans déplacer de dette.

## Critères d'acceptation

1. Les sept lecteurs et les deux hôtes fonctionnent sans callback snapshot complet. Aucune
   notification du domaine ni abonné spécialisé ne construit une vue complète pour son usage propre.
2. Une matrice conduite par promesses couvre progression et départ/fin des voies, pause/reprise,
   retenue, stockage plein, échec puis retour de sauvegarde, archive ouverte et remplacement.
   Le dernier état est visible même sans nouveau texte de passage publié.
3. Dans le même scénario avant/après contraction, compter constructions de snapshots complets,
   MemoryView complètes/bornées et projections pour 0, 1 puis 3 abonnés. Ajouter un abonné n'ajoute
   pas de construction complète ; trois changements rapprochés gardent le dernier état. Consigner
   les comptes sans annoncer de gain de latence/mémoire ni les assimiler à des auditeurs produit.
4. Un premier abonné et son diagnostic défaillent : les autres reçoivent l'état, les voies continuent
   et les sauvegardes obligatoires sont tentées. Le dernier `session.json` écrit par T208 contient
   les faits acquis, y compris le bloc qui atterrit pendant fermeture.
5. Derrière un disque retenu, une écriture et au plus un dernier état attendent par document.
   Refuser l'état final ou la barrière empêche `archived:true` ; réessayer confirme cette vie,
   sans double fermeture de ressources ni résurrection d'un dossier scellé.
6. Les corps figés T213, le contrat T038, ETags/304 et ADR 0025 gardent leurs preuves. Jouer les
   suites citées, memory-projection, wire-contract et contrats d'événements/vue/archive affectés
   en séquentiel, puis `node scripts/check.mjs`. Aucun test ou plancher n'est retiré.

## Test d'acceptation attendu

`tests/memory-projection.test.cjs` compose vraie mémoire, abonnés comptés et disque maîtrisé.
Les suites session-lifecycle/session-durable retiennent puis refusent état final/barrière,
y compris quand l'abonné et son diagnostic échouent. Les bancs des deux hôtes vérifient la
livraison réelle ; le comptage passe par une couture injectée, sans comparaison du source.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T208 doit déjà avoir séparé écrivain et projection. S'il manque ce contrat, signaler le manque
avant de contracter : ne pas réimplémenter la persistance dans ce lot critique. Ajouter une
invalidation manquante n'autorise pas à confier la sauvegarde au diffuseur.

## Journal
- 19/10, orchestrateur : attend aussi T292, pour que les échecs du contrôle complet restent lisibles.
- 19/10, Codex : exploration enregistrée dans `.harness-state/tickets/T225/exploration.md` ; T208 confirmé, inventaire des sept familles et lecteurs restants effectué. `git status --short`, `git diff`, lecture du ticket, des standards, du code et des ADR : callback complet encore présent, projection déjà partagée par les deux hôtes. Aucun écart de périmètre prévu.
- 19/10, Codex : `node --test --test-name-pattern='three memory invalidations' tests/memory-projection.test.cjs` rouge observé puis vert : pour 0/1/3 auditeurs, trois changements donnent 3→0 snapshots, 3→3 vues complètes et 3→3 projections. Journaux `cost-red.log` et `cost-green.log` dans le dossier d'état ; aucune mesure de latence ou de mémoire.
- 19/10, Codex : partage des consultations différées et migration des lecteurs restants. `node --test --test-name-pattern='deferred surveillance reuses' tests/memory-projection.test.cjs` rouge puis vert ; `node --test --test-name-pattern='search reads the application' tests/moment-actions.test.cjs` rouge sur une construction héritée, puis suite verte après migration. Les lectures explicites et la sauvegarde par T208 restent distinctes.
- 19/10, Codex : `node --test tests/memory-projection.test.cjs` : 7 tests verts, dont matrice conduite par promesses avec abonné et diagnostic défaillants. `node --test --test-name-pattern='failed observers cannot confirm' tests/session-durable.test.cjs` : 2 tests verts, état final/barrière refusés, atterrissage pendant fermeture, nouvel essai et scellement. Premier lancement interrompu : la doublure n'exposait pas close et son nettoyage attendait une porte ; doublure et ordre de libération corrigés avant le passage observé.
- 19/10, Codex : premier `node scripts/check.mjs --changed` : 344 tests verts, lint et format verts, contrôle rouge pour une ligne longue ajoutée dans disk-guard ; ligne découpée. ADR 0054 complété et ADR 0061 ajouté.
- 19/10, Codex : les suites de contrats citées dans `.harness-state/tickets/T225/preuves.md`, lancées avec `node --test --test-concurrency=1`, donnent 544 tests verts. `node --test --test-name-pattern='headless adoption detaches' tests/memory-projection.test.cjs` expose ensuite une ancienne vie encore abonnée lors du remplacement par le même identifiant ; abonnement déplacé à l'adoption, puis 72 tests verts dans `adoption-green.log`. Nouveau `node scripts/check.mjs --changed` : 348 tests verts, toutes les étapes réussies ; `git diff --check` : sortie 0.
- 19/10, Codex : premier `node scripts/check.mjs` complet rouge : 2957 tests JS verts, 23 rouges, 54 tests Python verts, autres contrôles verts (`check-full-first.log`). Le banc de latence attendait encore le callback supprimé et le test de diagnostic serveur son ancien code. `node --test --test-concurrency=1 tests/capture-display-latency.test.cjs tests/host-error-handling.test.cjs` : rouge reproduit et test de non-construction ajouté, puis 33 verts après raccordement du banc à la projection et adaptation du diagnostic. `node scripts/check.mjs --changed --no-tests` : règles, format, lint, gel et cliquet verts ; tests explicitement non lancés par cette commande.
- 19/10, Codex : second `node scripts/check.mjs` complet vert, sortie 0 : 2981 tests JS dans 153 fichiers, 54 tests Python, règles par fichier, format, lint, gel et cliquet réussis (`check-full.log`). Verdict TERMINÉ déposé dans `.harness-state/tickets/T225/verdict.json`, prêt pour la relecture de la boucle ; aucun commit ni push.
- 19/10, Codex : reprise après `relecture-1.md` ; rapport, ticket, journal, écarts, `git status --short` et `git diff` relus. Les cinq constats sont acceptés. Exploration et stratégie de correction consignées dans `.harness-state/tickets/T225/correction-1.md` ; aucun écart supplémentaire.
- 19/10, Codex : `node --test --test-name-pattern='Mac state IPC ignores' tests/mac-ipc-contract.test.cjs` rouge sur l'état injecté par le renderer, puis vert après isolation du gestionnaire IPC. Le test Mac de bascule envoie maintenant `MemoryInvalidated` et éprouve aussi le callback retenu ; les mutations temporaires retirant `switching` ou l'identité échouent sur leurs assertions, puis les deux tests Mac passent avec les gardes restaurées. Commandes et sorties `correction-*.log` dans le dossier d'état.
- 19/10, Codex : appels serveur adaptés à la vraie vie de session et à son état publié ; assertions d'invalidation sorties des abonnés. Une forme invalide auparavant absorbée provoque désormais un échec de test. `node --test --test-concurrency=1 tests/session-events.test.cjs tests/server-state-views.test.cjs tests/server-sessions.test.cjs` : 66 tests verts. La mutation retirant l'identité serveur échoue sur la révision.
- 19/10, Codex : `node --test tests/memory-projection.test.cjs` : 9 tests verts, dont archive réelle restaurée, adoption et reprise sans passage nouveau, avec sauvegarde retenue par promesse. Les mutations faisant émettre la restauration, supprimant l'invalidation de reprise ou le détachement sont rouges sur leurs assertions ; les sources ont été restaurées après chaque sonde. Aucun constat de la relecture n'est contesté.
- 19/10, Codex : `node scripts/check.mjs --changed` après correction : vert, sortie 0, 412 tests JS dans 23 fichiers, règles, format, lint, gel et cliquet réussis (`correction-check-changed.log`). `git diff --check` : sortie 0.
- 19/10, Codex : `node scripts/check.mjs` complet après correction : vert, sortie 0, 2983 tests JS dans 153 fichiers, 54 tests Python et toutes les étapes qualité réussies (`correction-check-full.log`). Les cinq constats de la relecture 1 sont corrigés, sans contestation ni réserve restante ; nouveau verdict TERMINÉ déposé pour relecture par la boucle. Aucun commit ni push.
