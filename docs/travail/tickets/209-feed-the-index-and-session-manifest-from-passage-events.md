---
id: T209
titre: Feed the index and session manifest from passage events
statut: a-faire
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
