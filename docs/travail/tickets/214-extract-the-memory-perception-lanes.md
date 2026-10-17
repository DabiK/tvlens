---
id: T214
titre: Extract the memory perception lanes and their generic vision hold policy
statut: termine
bloque_par: T221, T207
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les files audio et vision ont un propriétaire dans `core/memory/lanes.cjs`. Leur ordre, leurs
bornes, leurs pertes et leur unique nouvel essai restent observables par l'ingestion de session.
La retenue vision devient une politique générique, indépendante des questions.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire), 6 à 9 et 11 ; ADR 0029/0030.
  Garanties obligatoires : ADR 0002/0003 (durabilité et publication), 0006/0023 (ingestion possédée),
  0004 (outils encore retenus) et 0008 (un seul nouvel essai vision).
- Code vérifié à `dd5efc9` : `core/session.cjs:159` borne l'audio encore transcrivable à `maxPending`
  et la file de références à trois fois cette borne ; `core/session.cjs:171` distingue retenue et
  encombrement ; `core/session.cjs:179` conserve l'ordre du transfert vers la vision.
- `core/session.cjs:271` possède l'audio ; `core/session.cjs:305` publie les paroles et démarre la
  vision avant le drainage des passages suivants. `core/session.cjs:313` décide du nouvel essai ;
  `core/session.cjs:345` relit le média puis revérifie les conditions avant le second appel.
- `core/session.cjs:79` mesure la retenue ; `core/session.cjs:320` ne la compte que lorsqu'elle
  est seule à retenir la voie. `core/session.cjs:380` annule les appels à la fermeture.
- Appelants : `runtime/session-runtime.cjs`, `runtime/session-lifecycle.cjs`,
  `runtime/session-closing.cjs`, `app/main.cjs`, `runtime/headless-runtime.cjs` et simulateurs.
  Tests lus : split-perception, session-latency, architecture-f08, watch-session-ending et
  session-lifecycle sous `tests/`, suffixe `.test.cjs`.
- État attendu : T194 a retiré voie série, ancien `ask` et déclaration d'images masquées après
  T193 ; T190 a donné à la session `setQuestionPending`. T186/T206/T221 isolent les publications
  après état rétabli. T205 fournit points d'entrée et exceptions. Relire ces livraisons avant
  extraction ; ne pas transporter les chemins historiques supprimés par T194.

## Périmètre

- Créer `core/memory/lanes.cjs` et son exposition strictement nécessaire dans
  `core/memory/index.cjs`. Le propriétaire des voies tient leurs files de références, les appels
  en cours, le drainage, le transfert, la retenue et la décision de nouvel essai. La racine reste
  propriétaire des passages, de leur identité et de leurs transitions publiées/persistées.
  Injecter les ports et les lectures nécessaires, sans objet hôte ni accès global à la machine.
- Extraire seulement les deux voies actives : `shed`, `skipVision`, `toVision`, drainage audio et
  vision et leurs aides. Ne pas déplacer rétention, restauration, calcul de couverture ou cycle
  de vie ; ils ont leurs tickets. Ne pas recopier les règles dans les callbacks de la façade.
- Remplacer la cause technique de retenue par une commande générique, par exemple retenir/libérer
  la vision. La façade `setQuestionPending` de T190 traduit encore activité et `visionDuringAsk`
  dans la racine, puis délègue aux voies sans redonner les files aux hôtes. T227 sortira cette
  traduction de la racine ; ce lot ne la déplace pas déjà dans le runtime.
  Le nouveau module ne nomme ni question, ni `DeepAsk`, ni surveillance.
- Garder les noms historiques `asking`, `visionSkippedAsking`, `visionBlockedMs` et la valeur de
  cause `asking` aux frontières publiées/persistées. Leur traduction ne doit pas recréer une règle
  de question dans les voies. Le retrait de la façade de vocabulaire appartient à T227.
- Compléter la ligne de sous-zone `core/memory/**` et l'entrée publique créées par T207, avec
  les consommateurs exacts nécessaires selon T205. Les éventuelles arêtes vers les helpers encore
  plats sont des exceptions nommées, avec fichier, arête et raison ; aucune permission générale
  vers les autres contextes. Le nouveau module n'utilise aucun accès global au temps ; le stock de T202 ne change pas.
- Le propriétaire des voies expose le retrait d'un passage des deux files, avec la fin de
  retenue. L'élagage l'appelle tant que la rétention existe, et ne touche plus aux files
  (`core/session.cjs:202-213`, `:208`). `close()` (`:382`) et les comptes publiés (`:493`) passent
  aussi par ce propriétaire. `tests/session-latency.test.cjs:176` et `:335` restent verts.
- La politique générique couvre aussi `closeIntake()` (`core/session.cjs:91`) et le verrou de
  fermeture serveur (`runtime/headless-runtime.cjs:126`, conservé par T190) ; `asking` publié,
  la cause `asking` (`core/session.cjs:172`) et le refus du second essai (`:314`) restent identiques
  pendant une fermeture. La racine garde sa façade de question jusqu'à T227.
- Le code déplacé est corrigé de ses infractions avant d'arriver dans le nouveau fichier.
  Élaguer `eslint-suppressions.json` sans déplacer ni augmenter son stock. Ajouter un ADR court
  sur la propriété des voies et la traduction de politique, en citant les ADR conservés.

## Critères d'acceptation

1. Par l'ingestion publique, audio et vision avancent indépendamment, avec au plus un appel par
   voie. Les références en attente sont bornées ; chaque saut est compté et conserve les paroles
   déjà disponibles. Le passage transcrit garde sa place devant ceux dont l'audio a été écarté.
2. Un passage sans paroles ne chasse pas un passage parlé d'une file vision pleine. Les pertes
   dues à une voie occupée restent des pertes d'encombrement, même pendant une retenue demandée.
3. Retenir la vision laisse l'audio avancer ; libérer la retenue termine exactement sa mesure et
   reprend la même instance, comme T190. Une politique autorisant la vision pendant l'activité
   des questions conserve le comportement actuel. Aucun hôte n'affecte les files ou drapeaux.
4. L'ADR 0008 reste prouvé par sa suite : seulement le code passager autorisé, au plus deux appels,
   média relu et conditions revérifiées, aucun état perdu entre les deux, compteurs distincts et
   aucune reprise automatique d'un passage restauré. Une file arrivée entre-temps interdit l'essai.
5. Début de fin, fermeture et écriture média retenue gardent leurs garanties : les stockages déjà
   commencés atterrissent, aucune nouvelle analyse ne part, une réponse tardive n'enrichit ni ne
   publie après fermeture. Sauvegarde et drainage ne dépendent pas du succès d'un abonné.
6. La garde refuse un accès externe direct à `lanes.cjs` et un import de domaine étranger ; les
   arêtes de transition sont nommées et vérifiées. Le nouveau fichier n'a aucune suppression ESLint.
7. À l'implémentation, jouer les suites citées, capture-intake et les contrats T206/T221/T207 affectés
   en séquentiel, puis `node scripts/check.mjs`. Aucun cas ni assertion métier n'est retiré.

## Test d'acceptation attendu

Les tests `tests/split-perception.test.cjs`, `tests/session-latency.test.cjs` et
`tests/architecture-f08.test.cjs` continuent de passer par `ingest` et les commandes publiques,
avec promesses différées par voie et horloge injectée. Remplacer leurs lectures de files privées
par les comptes/états publiés équivalents sans perdre la preuve des bornes. Un test direct de
`lanes` complète seulement les transitions que l'ingestion ne permet pas d'isoler.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les lignes décrivent l'avant-T194. Les noms exacts des aides restantes et des interfaces T206/T221 seront
relevés au démarrage. Si un helper encore plat doit être lu temporairement, l'exception de garde
doit nommer cette arête et sa fin ; elle ne justifie aucun import de Questions dans la Mémoire.

## Journal

- Exploration : skill ticket-codex, standards, contrat de test et code des deux voies relus ;
  état initial et plan consignés dans `.harness-state/tickets/T214/exploration.md` et `ecarts.md`.
  Les fichiers non suivis préexistants restent intacts. Aucun écart aux critères prévu.

- Extraction, rouge puis vert :
  `node --test --test-name-pattern='memory perception lanes' tests/architecture.test.cjs` :
  1/1 rouge sur l'absence de propriétaire Mémoire, puis 1/1 vert (`lanes-red.log`, `lanes-green.log`).
  `PerceptionLanes` possède les références, appels, annulation, transfert, retenue et nouvel essai.
  La façade traduit la politique à un seul endroit, et `held` aux frontières historiques.
  Élagage, fermeture, snapshot et consultation délèguent aux comptes/retraits du propriétaire.
- `node --test --test-concurrency=1 tests/split-perception.test.cjs tests/session-latency.test.cjs tests/architecture-f08.test.cjs tests/watch-session-ending.test.cjs tests/session.test.cjs` :
  première extraction à 77/78 (`ingestion-green.log`) : une attente asynchrone supplémentaire
  retardait la libération vision et faisait perdre une référence sans paroles. Attente retirée ;
  78/78 verts (`ingestion-corrected-green.log`), sans changer l'assertion d'ordre.
- Critère de fin :
  `node --test --test-name-pattern='ending during the .* media read' tests/watch-session-ending.test.cjs` :
  2/2 rouges sur un départ fournisseur après début de fin, puis 2/2 verts après revérification
  au retour de lecture (`ending-read-red.log`, `ending-read-green.log`).
  La matrice de relecture avant nouvel essai couvre aussi `closeIntake` suivi d'une fin de question tardive.
- Contrats, en séquentiel :
  `node --test --test-concurrency=1 tests/session-events.test.cjs tests/events.test.cjs tests/memory-view.test.cjs tests/capture-intake.test.cjs tests/session-lifecycle.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/server-state-views.test.cjs tests/state-view-contract.test.cjs` :
  593/593 verts (`contracts-green.log`). Le dernier chemin était absent et ignoré par Node ;
  les preuves de vues sont `server-state-views` et la suite `state-views` ci-dessous.
- `node --test --test-concurrency=1 tests/memory-lanes.test.cjs tests/split-perception.test.cjs tests/session-latency.test.cjs tests/architecture-f08.test.cjs tests/watch-session-ending.test.cjs tests/session.test.cjs tests/state-views.test.cjs` :
  87/87 verts (`perception-final-green.log`). Le test direct caractérise uniquement le retrait
  explicite des références et la fin exacte de sa mesure, sans accès aux files.
- `node_modules/.bin/eslint --prune-suppressions core/session.cjs` : code 0 ;
  complexités gelées de 6 à 4, aucune suppression ajoutée. Le contrôle ciblé ESLint est vert
  (`lint-green.log`) après découpage synchrone de l'éligibilité au drainage vision.
- `node scripts/check.mjs --changed` : vert, 92/92 tests sur 7 fichiers ; règles, format, lint,
  gel et cliquet verts (`check-changed.log`). ADR 0051 et présentation d'architecture ajoutés.

- Contrôle complet final : `node scripts/check.mjs` : **vert**, 2 532/2 532 tests JS
  sur 141 fichiers et 47/47 tests Python ; règles, format, lint, gel et cliquet verts
  (`.harness-state/tickets/T214/check-full.log`). Aucun cas ni assertion métier retiré,
  aucun accès global au temps ajouté ; stock de complexités de la session diminué de deux.
  Le protocole de relecture et l'intégration restent à la boucle ; aucun commit ni push effectué.
- Après la dernière mise en forme : `node scripts/check.mjs --changed` : **vert**, 92/92 tests ;
  `git diff --check` : code 0. Verdict `TERMINÉ` enregistré dans
  `.harness-state/tickets/T214/verdict.json`, sans réserve propre à l'implémentation.

- Reprise après `relecture-1.md` : rapport, journal, écarts, `git status` et `git diff` relus.
  Les deux constats mineurs sont acceptés : protéger les noms composés dans la garde,
  puis déplier les deux `try/catch` sans modifier le flot de nouvel essai.
  Plan consigné dans `.harness-state/tickets/T214/correction-1-exploration.md` ; aucun nouvel écart.
- Constat 1 corrigé, tests d'abord :
  `node --test --test-name-pattern='memory lane vocabulary guard' tests/architecture-guard.test.cjs` :
  9/9 rouges, dont sept acceptations erronées de noms composés et deux diagnostics sans chemin ;
  puis 9/9 verts après recherche par sous-chaîne et ajout du chemin au diagnostic
  (`correction-1-vocabulary-red.log`, `correction-1-vocabulary-green.log`).
  Chaque fixture refuse le nom composé et accepte ensuite une politique générique.
- Constat 2 corrigé : les deux `try/catch` sont répartis sur plusieurs lignes, sans ajout d'attente.
  Avant modification, `node --test --test-name-pattern='media that cannot be read again|what allows the second call' tests/architecture-f08.test.cjs` :
  2/2 verts (`correction-1-reread-before.log`). Après mise en forme,
  `node --test --test-concurrency=1 tests/architecture-f08.test.cjs tests/memory-lanes.test.cjs tests/architecture.test.cjs` :
  35/35 verts (`correction-1-lanes-green.log`) ; cause initiale et conditions de relecture conservées.
- `node scripts/check.mjs --changed` après correction : **vert**, 596/596 tests JS sur
  8 fichiers ; règles, format, lint, gel et cliquet verts (`correction-1-check-changed.log`).
  `git diff --check` : code 0. Aucun test ni assertion retiré ; aucune contestation de relecture.
- Contrôle complet après correction : `node scripts/check.mjs` : **vert**, 2 541/2 541 tests JS
  sur 141 fichiers, 47/47 tests Python ; règles, format, lint, gel et cliquet verts
  (`correction-1-check-full.log`). Les deux constats mineurs sont corrigés, sans changement
  de comportement des voies. Verdict `TERMINÉ` renouvelé ; relecture et intégration à la boucle.
  Aucun commit ni push effectué.

### Réserves à la clôture

- .harness-state/tickets/T214/relecture-2.md : `adapters/codex-perception.cjs:25` et `core/memory/lanes.cjs:5` (hors périmètre)

  Le code `'TVLENS_VISION_TRANSIENT'` est toujours défini à deux endroits. Ce doublon existait déjà avant ce ticket, et le retirer demande de modifier l'adaptateur. Je le garde comme réserve, inchangée par rapport à la relecture 1.
- .harness-state/tickets/T214/relecture-2.md : **Écart accepté, critère 5.** Je maintiens la décision de la relecture 1. Le propriétaire vérifie à nouveau le début de fin au retour de la lecture média, avant le premier appel fournisseur. Cela réalise la garantie « aucune nouvelle analyse ne part ». La preuve est rouge puis verte (`ending-read-red.log`, `ending-read-green.log`), et l'ADR 0051 le documente. La correction ne touche pas ce chemin.
