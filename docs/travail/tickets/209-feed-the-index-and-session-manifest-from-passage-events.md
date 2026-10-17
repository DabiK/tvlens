---
id: T209
titre: Feed the index and session manifest from passage events
statut: termine
bloque_par: T221, T207
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

L'index et le manifeste réagissent aux événements de passage et lisent `MemoryView`, chacun avec
ses règles d'éligibilité. Ils quittent leur dépendance au contenu du snapshot publié sans changer
les résultats de recherche, la cadence du manifeste ou la confirmation d'archive.

## Sources

- `docs/domaine.md`, sections 3 Mémoire et 8 ; ADR 0029/0030. T206/T221 livrent événements et révisions ;
  T207 livre la vue et la matrice des lecteurs, après les chemins retirés par T194.
  Relire leurs API réelles, diagnostics et entrée publique avant de migrer les deux abonnés.
- Code vérifié à `dd5efc9` : `runtime/session-runtime.cjs:177` appelle feedIndex puis
  manifest.publish sur chaque `onChange`, avant l'hôte. `runtime/session-providers.cjs:201` ne
  retient que les 48 derniers segments et les observations utilisables (`:30`, `:205`).
  `core/passage-text.cjs:20` accepte notamment une voie utilisable dans un passage partiel.
- `core/moment-index.cjs:114` observe sans attente ; `:122` sérialise l'admission ; `:167`
  coalesce par identifiant/texte ; `:284` écarte les réponses devenues obsolètes ; `:397` ferme.
  `tests/session-providers.test.cjs:280` protège le filtrage de la queue de 48 passages ;
  `tests/moment-index.test.cjs:99` et `:113` protègent partial → ready, avant et pendant l'embedding.
- `runtime/session-manifest.cjs:27` calcule totaux, premier sujet, rétention et octets ; `:77`
  évalue une cadence monotone de 30 s lors d'une publication, sans timer autonome.
  `core/session.cjs:232` émet même après un balayage sans changement de passage ;
  `app/main.cjs:312` conduit ces balayages pendant capture. Ne suivre que PassageUpdated
  supprimerait des occasions actuelles d'écriture, notamment avant la fin d'une analyse lente.
- `runtime/session-lifecycle.cjs:162` et `:169` enregistrent explicitement pause et reprise ;
  `:118` attend la barrière avant manifeste final. Ces étapes ne sont pas des réactions facultatives.
  `runtime/session-lifecycle.cjs:3` restaure silencieusement ;
  `tests/session-durable.test.cjs:127` prouve l'absence d'indexation en lecture seule.
- Tests lus : session-providers, moment-index, session-manifest, session-lifecycle, session-durable,
  review-regressions et server-state-views. ADR 0002/0003/0019/0020 : cadence, octets, libération,
  barrière et fait de fin confirmé de cette vie ; ADR 0006/0008/0023 restent couverts par les voies.

## Périmètre

- Modifier `runtime/session-runtime.cjs`, `runtime/session-providers.cjs`,
  `runtime/session-manifest.cjs` et les appels nécessaires de `runtime/session-lifecycle.cjs`.
  Ajouter `tests/session-event-consumers.test.cjs` et adapter les tests de ces modules.
  L'index de domaine garde son ordonnancement et ses limites ; aucun fournisseur réel requis.
- Abonner l'alimentation de l'index à PassageUpdated, lire la version courante dans MemoryView,
  vérifier session/révision et observation utilisable. Conserver le réglage backgroundIndex,
  l'absence d'index sans embeddings et le périmètre des 48 derniers passages encore dans segments.
  Une révision différente mais un texte identique ne doit pas créer un nouvel embedding.
- Initialiser les curseurs depuis la vue courante après composition/restauration, sans rejouer
  les anciens événements. Une archive en lecture seule ne soumet aucun embedding ; à la reprise,
  l'initialisation de l'abonné retrouve le périmètre courant sans rattrapage global de history.
  Une mise à jour visuelle d'un passage déjà transcrit reste admissible et remplace le texte ancien.
- Le manifeste marque ses données à relire sur PassageReceived et PassageUpdated, avec les faits
  courants de disponibilité/révision. Garder son premier enregistrement dès le premier passage,
  sa cadence monotone et ses totaux, même sans observation utilisable. Il n'attend pas ready.
- Garder l'occasion de cadence offerte aujourd'hui par les publications de balayage : le callback
  hérité peut signaler une échéance sans transmettre son snapshot au manifeste. Lire la vue seulement
  lorsque nécessaire à l'écriture, sans nouveau timer dans le cœur. Les événements ne remplacent
  pas les appels explicites de pause, reprise ou manifeste final ; ces appels lisent aussi la vue.
  Ce maintien des déclencheurs est nécessaire pour respecter le comportement observable du plan.
- Les octets du store et des miniatures, les dates et captures restent apportés par la composition.
  La restauration initialise la lecture sans réécrire le manifeste, même s'il est ancien ou live.
  Un refus courant garde sa cadence ; un refus final reste transmis par archive(), après barrière.
- Conserver un seul abonnement par consommateur/session, désabonné au déchargement/fermeture.
  Rejet d'un abonné diagnostiqué selon T206, pas d'attente qui retient la perception. Aucun événement
  ancien ne nourrit la session suivante ; aucune sauvegarde essentielle ne dépend du succès d'abonné.
- Ne migrer ni résumé vivant, ni surveillance, ni questions, ni frise/vues TV ; ne supprimer ni
  `onChange`, ni snapshot, ni le format disque actuel. T225 contractera la notification complète.
  Toute nouvelle sous-zone éventuelle reçoit sa ligne et ses permissions T205 ; aucun déplacement
  n'est nécessaire à ce lot. Les fichiers extraits éventuels arrivent sans infraction gelée.

## Critères d'acceptation

1. Par le runtime public avec fournisseurs différés, la transcription partielle puis le visuel
   alimentent l'index par leurs versions utiles. Une réponse d'embedding ancienne ne remplace
   pas le nouveau texte ; une répétition de révision, ou disponibilité seule à texte égal, ne
   provoque pas de nouvel appel fournisseur. Le test ne remplace pas MomentIndex par son imitation.
2. Avec plus de 48 passages, le périmètre et le filtre historiques restent ceux de `runtime/session-providers.cjs:201-208` ; aucun
   history ou passage hors queue n'est ajouté par rattrapage. backgroundIndex:false et absence
   d'embeddings restent sans travail de fond. Les recherches gardent leur propre ancrage figé.
3. Une restauration initialise les abonnés sans écriture, analyse ou embedding, puis une reprise
   explicite permet les passages éligibles et les nouvelles versions. Fermer et changer de session
   empêche tout événement tardif de nourrir l'index ou le manifeste de la suivante.
4. Avec première analyse retenue, le premier passage écrit son manifeste ; les publications aux
   échéances suivantes conservent la cadence de 30 s, sans dépendre de l'heure civile ni d'un visuel
   terminé. Miniature tardive, passage expiré déplacé en history et sujet enrichi gardent leurs totaux.
   Les mêmes scénarios conduits avant/après produisent les mêmes faits et demandes de manifeste.
5. Pause/reprise, lecture seule, refus courant/final, barrière, scellement et nouvelle vie d'une
   archive conservent les assertions des suites manifest/lifecycle/durable. Le manifeste final
   reste une obligation appelée explicitement, même si tous les abonnés facultatifs ont échoué.
6. Dans un même scénario déterministe, compter par espion, avant et après, les appels à
   `WatchSession.snapshot()` et les constructions de `MemoryView`, complètes ou bornées, avec le
   même nombre d'auditeurs d'hôte. Après le ticket, l'index fait au plus une lecture bornée par
   `PassageUpdated` (le passage nommé), et le manifeste ne lit la vue qu'au moment d'écrire. Aucun
   des deux ne construit une vue complète par événement. Consigner le scénario et les comptes,
   sans les présenter comme une mesure de latence.
7. À l'implémentation, exécuter en séquentiel session-event-consumers, session-providers, moment-index,
   session-manifest, session-lifecycle, session-durable et server-state-views, puis
   `node scripts/check.mjs`. Aucun test, compteur de pertes ou plancher n'est supprimé.

## Test d'acceptation attendu

`tests/session-event-consumers.test.cjs` compose le vrai runtime, son vrai index et son manifeste,
avec embeddings, temps et écritures retenus par le banc. Il prouve les éligibilités distinctes,
l'initialisation silencieuse, la cadence sans nouveau passage prêt et le coût de construction des
snapshots. Les tests existants de manifeste et de cycle de vie restent les preuves de durabilité.

## Hypothèses bloquantes

Aucune décision n'est attendue.

L'initialisation sur vue courante ne signifie pas indexer une archive rouverte : le contrat actuel
l'interdit en lecture seule. Le plan mentionne seulement PassageUpdated ; réception et occasions de
cadence doivent être conservées pour éviter un changement produit. Les totaux ne doivent pas être
déduits des seuls événements reçus, qui ne forment pas un historique. Le coût des snapshots et des vues sera
mesuré à l'implémentation ; aucun chiffre de performance n'est établi lors de ce découpage.

## Journal

- Exploration : API des événements et de MemoryView vérifiées ; initialisation après restauration,
  queue de 48 avant filtrage, cadence sur balayage et manifeste final explicite conservés.
  État initial et choix consignés dans `.harness-state/tickets/T209/exploration.md` ; aucun écart prévu.

- Tests d'abord : `node --test tests/session-event-consumers.test.cjs` a reproduit le couplage
  au snapshot (premier manifeste absent : 0 au lieu de 1), puis est passé après migration.
  Le cas d'archive uniquement en history a ensuite échoué sur la cadence (1 au lieu de 2),
  puis est passé après initialisation par l'horloge de la lecture bornée vide.
- Migration : index abonné aux versions de passage, curseurs bornés et reprise explicite sur la
  queue courante ; manifeste abonné à réception/mise à jour, lecture complète seulement pour écrire,
  occasion de cadence sans contenu de snapshot, désabonnements à la fermeture et fin explicite conservée.
- Sonde déterministe, un auditeur d'hôte : premier passage, audio/vision retenus, balayages à
  29 999, 30 000 et 60 000 ms. Avant : 14 snapshots, 0 vue complète, 0 lecture bornée ; après :
  14 snapshots, 3 vues complètes pour 3 demandes de manifeste, 2 lectures du seul passage pour
  2 PassageUpdated, 2 lectures d'initialisation bornées (queue de 48 et horloge sans passage).
  Dans les deux cas : 10 notifications d'hôte et 3 demandes de manifeste. Ce sont des comptes
  de constructions, pas une mesure de latence ; la notification complète héritée reste présente.
- Comparaison des manifestes : le scénario « manifest totals » exécuté aussi sur les quatre modules
  de HEAD copiés dans un répertoire temporaire produit les mêmes quatre demandes et faits : reprise,
  passage expiré déplacé en history, sujet enrichi et miniature tardive (+17 octets).
  Journaux `manifest-facts-before.log` et `manifest-facts.log` dans le dossier d'état.
- Adaptation de session-durable : l'ancienne assertion attendant le renvoi de 48 passages a échoué
  (1 observé). Elle vérifie désormais le seul passage nommé, son appartenance à la queue de 48 et
  l'absence de renvoi lors des émissions répétées ; toutes les assertions de durabilité sont conservées.

- Vérifications intermédiaires : `node scripts/check.mjs --changed` vert (74 tests), puis les
  sept commandes `node --test tests/<suite>.test.cjs` exécutées séparément et en séquentiel :
  session-event-consumers 10/10, session-providers 18/18, moment-index 41/41,
  session-manifest 7/7, session-lifecycle 15/15, session-durable 24/24,
  server-state-views 6/6. Sorties conservées dans `suite-*.log`.
- Protection supplémentaire de la reprise : nouveau rouge observé sur `assert.doesNotReject`
  lorsqu'`observe` refuse l'initialisation ; réaction isolée et diagnostiquée avant l'enregistrement
  explicite. `node --test tests/session-event-consumers.test.cjs` : 11/11 verts ensuite.

- Contrôle complet : `node scripts/check.mjs` vert, règles/format/lint/gel/cliquet verts,
  2 504 tests JavaScript dans 139 fichiers et 47 tests Python réussis (`check-full.log`).
- Nettoyage du banc après ce contrôle : libération des miniatures retenues avant fermeture même
  en cas d'assertion en échec, et attente du signal d'entrée visuelle après reprise, sans nombre
  de tours implicite. `node scripts/check.mjs --changed` vert : 75/75 tests (`check-changed-final.log`).
  Aucun changement de production après le contrôle complet. `git diff --check` vert.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T209/verdict.json` ; relecture et intégration
  laissées à la boucle. Aucun commit ni push.

- Reprise après relecture 1 : trois constats acceptés. Vérification du générateur manuel dans
  un dossier temporaire neuf, puis preuves discriminantes des gardes de lecture seule, de queue
  et d'origine historique. Aucune contestation ni modification des corpus figés.

- Constat bloquant corrigé, tests d'abord :
  `python3 .harness-state/tickets/T209/probe-pruned-generator.py` exécute
  `node scripts/fixtures/write-pruned-archive.cjs <dossier-temporaire-neuf>` et vérifie la sortie.
  Rouge avant adaptation : code 0 mais un seul passage et aucun manifeste ; vert après branchement
  des événements, des lectures et de la nouvelle signature : code 0, moment-1 à moment-4,
  manifeste final `archived` et 4 passages (`correction-generator-{red,green}.log`).
- Première preuve mineure renforcée : espion sur `MomentIndex.prototype.observe` installé avant
  la composition ; 60 s d'horloge virtuelle en lecture seule, aucun appel, embedding ou travail
  en attente ; reprise explicite ensuite éligible.
- Seconde preuve mineure ajoutée : miniature du premier passage retenue jusqu'à l'admission de
  48 passages plus récents, puis mise à jour réellement publiée sans renvoi à observe. Autre cas :
  passage conservé devenu historique par prune(), puis faits de réception/mise à jour retardés
  refusés selon l'origine consultée, malgré leur texte utilisable.
- Preuves de discrimination : `python3 .harness-state/tickets/T209/probe-index-guards.py` retire
  chacune des trois gardes, indépendamment et uniquement dans une copie temporaire. Chacun des
  trois tests sélectionnés échoue sur son assertion (codes 1, `ERR_ASSERTION`), sans changer le
  code de production de l'arbre. Sorties `correction-guard-{read-only,tail,history}-red.log`.
  Avec les gardes intactes, `node --test tests/session-event-consumers.test.cjs` : 13/13 verts.
- `node scripts/check.mjs --changed` : vert, 77/77 tests ; règles, format, lint, gel et cliquet verts
  (`correction-check-changed.log`). Aucun compteur ni test supprimé, corpus figés conservés.

- Vérification de correction en séquentiel : `node --test tests/<suite>.test.cjs` pour
  session-event-consumers 13/13, session-providers 18/18, moment-index 41/41,
  session-manifest 7/7, session-lifecycle 15/15, session-durable 24/24,
  server-state-views 6/6, puis archive-compat 27/27. Total : 151 tests ciblés verts,
  sorties `correction-suite-*.log` ; compatibilité et intégrité des corpus conservées.
- Contrôle complet après toutes les corrections : `node scripts/check.mjs`, code 0 et vert :
  2 506 tests JavaScript dans 139 fichiers, 47 tests Python, règles/format/lint/gel/cliquet verts
  (`correction-check-full.log`). `git diff --check` réussi.
- Nouveau verdict `TERMINÉ` : les trois constats de relecture sont corrigés, aucune réserve propre.
  Relecture de correction et intégration laissées à la boucle ; aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T209/relecture-2.md : **Écart accepté, adaptation de `scripts/fixtures/write-pruned-archive.cjs`.** Ce n'est pas un élargissement de périmètre : c'est l'appelant que le changement d'API casserait, et la relecture 1 en demandait la correction. Ce script n'appartient pas au harnais protégé (`scripts/quality/`, `scripts/loop/`, `scripts/check.mjs`), et les corpus figés restent intacts.
