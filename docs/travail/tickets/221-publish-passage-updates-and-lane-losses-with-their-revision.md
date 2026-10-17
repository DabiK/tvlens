---
id: T221
titre: Publish passage updates and lane losses with their revision
statut: a-faire
bloque_par: T206
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les versions consultables d'un passage et ses pertes de voie sont annoncées après transition.
La révision monte aussi pour disponibilité, miniature et perte terminale, avec des compteurs
inchangés et sans snapshot dans les événements.

## Sources

- Coupe de T206, relecture A, constats 8, 10 et 14 ; `docs/domaine.md`, sections 3 Mémoire et 8 ;
  ADR 0029. T206 fournit diffuseur, câblage après transition, réception et suspension ; relire
  son ADR, ses tests et les retraits T194 avant d'ajouter les faits de ce lot.
- Code vérifié à `dd5efc9` : `core/session.cjs:146` change la miniature ; `:162`, `:165`, `:175`
  et `:187` comptent les pertes de files ; `:200-230` expire et déplace en history.
  `core/session.cjs:292` compte le transcripteur qui signale son propre échec ; `:298` et `:369`
  comptent les erreurs terminales audio/vision ; `:131` compte `videoUnreadable`.
- `core/session.cjs:293` et `:354` augmentent les révisions audio/vision, mais pas les miniatures
  ou expirations. `:313-348` possède le nouvel essai unique, ses conditions et la relecture média.
- `tests/session-latency.test.cjs:54-66` attend encore qu'un échec vision ne monte pas la révision ;
  `tests/architecture-f08.test.cjs:75` attend cette même règle sur le vrai `WatchSession`.
- `tests/review-regressions.test.cjs:205` conduit `VideoTools` sur des états écrits à la main
  (`:207`, `:214`) et reste inchangé : les archives antérieures gardent des révisions égales
  pour des états différents. `core/video-tools.cjs:61` doit encore départager ces lectures.
- ADR 0002/0003/0006/0008/0023 ; suites split-perception, session-latency, architecture-f08,
  review-regressions, session-durable et watch-session-ending sous `tests/`.

## Périmètre

- Prolonger le mécanisme T206 dans `core/session.cjs`, sa composition et son test public
  `tests/session-events.test.cjs`. Publier `PassageUpdated` après transcription, observation,
  perte terminale et changement consultable de disponibilité/miniature ; `PassageLost` pour
  chaque perte de voie effectivement comptée, avec `lane` et `cause` structurées.
- Cartographier dans l'ADR chaque branche ci-dessus et son compteur, y compris expiration de
  chaque voie tant que T223 n'est pas livré, audio qui signale `failed` et erreur levée.
  `videoUnreadable` n'est pas une perte audio/vision : il donne seulement un `PassageUpdated`
  de disponibilité après la réception, jamais un `PassageLost` de voie inventé.
- Étendre la révision existante : chaque version consultable nouvelle monte, une notification
  répétée sans changement ne monte pas. La miniature tardive et l'état conservé en `history`
  portent la même version du passage. Ne pas créer de second compteur ni renommer le champ.
- Chaque événement garde le contrat léger T206 : session, passage, révision, voie/cause/intervalle
  bornés, sans observation, snapshot ou média. Livrer après état rétabli, ne pas attendre les
  abonnés. Aucun événement intermédiaire de perte pendant le nouvel essai, aucune révision
  pour son seul second appel ; succès et échec final restent distincts (ADR 0008).
- Adapter uniquement les attentes de révision de session-latency et architecture-f08 qui
  conduisent le vrai cœur ; les lister chacune dans `ecarts.md`. Le cas review-regressions
  de même révision reste intact, ainsi que les compteurs, ordres de voies et barrières disque.
- Décision de l'orchestrateur, le 17/10, par délégation du propriétaire (absent), après le blocage de la première
  tentative : trois attentes de plus changent, et seulement elles, parce qu'elles suivent le contrat de ce ticket
  (la révision monte quand la disponibilité change ou que la miniature arrive) et ont été écrites après lui :
  `tests/memory-view.test.cjs:461`, révision du passage rendu illisible `0` → `1` ; `tests/archive-compat.test.cjs:599`
  et `:618`, révision du passage neuf `moment-5` `2` → `3` pour sa miniature. Les révisions des passages historiques et
  les témoins du corpus restent identiques ; aucune autre assertion ne change.
- Compléter l'ADR de publication, sans migrer index, manifeste ou autres lecteurs. Garder
  `onChange`, formats persistés et fil ; aucun déplacement, harnais ou retrait de test.

## Critères d'acceptation

1. Avec abonnés qui lèvent, rejettent ou ne répondent jamais, audio et vision de deux passages
   terminent et sauvegardent. Chaque événement permet de lire l'état cohérent déjà acquis,
   sans construction du snapshot pour son contenu.
2. Réception, transcription et visuel gardent l'identité du passage et montent en révision pour
   leurs changements consultables. Perte terminale, expiration et miniature tardive restent
   observables, y compris après déplacement en history. Une émission sans changement ne
   crée ni version ni perte supplémentaire.
3. Surcharge audio/vision, retenue vision, expiration et erreur définitive émettent exactement
   les pertes comptées. La transcription qui signale son propre échec émet `PassageLost` audio.
   Un clip `videoUnreadable` publie sa disponibilité sans fausse perte de voie.
4. Le nouvel essai réussi n'émet pas de perte ; deux échecs donnent une seule perte terminale,
   sans troisième appel. Session fermée, restauration et refus d'admission ne produisent
   aucun faux enrichissement ou perte de passage inexistant.
5. Les attentes de révision changées sont justifiées une à une ; le test review-regressions
   à révision égale reste inchangé. Jouer en séquentiel session-events, events, les suites
   citées et les gardes, puis `node scripts/check.mjs`. Aucun cas ni plancher ne baisse.

## Test d'acceptation attendu

Étendre `tests/session-events.test.cjs` par ingestion publique du vrai cœur et sa composition.
Retenir séparément transcription, vision, miniature et disque ; observer versions, événements,
compteurs et sauvegardes à chaque frontière, sans appeler les méthodes privées des voies.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le nouveau sens de la révision est la cible acceptée, pas le contrat déjà livré à `dd5efc9`.
Les formes historiques à révisions égales restent consultables. Si T223 a déjà retiré l'élagage,
ses témoins d'archives remplacent les scénarios d'expiration active, sans réintroduire la politique.

## Journal

- 17/10, orchestrateur : la première tentative s'est bloquée sur ces trois attentes (contrôle complet 2487/2489).
  Son travail est archivé dans `.harness-state/archives/T221-bloque-1/` : `code.patch`, `fichiers/docs/adr/` (ADR 0050),
  `ticket-journal.patch` et `etat/` (preuves, `revision-expectations-proposed.patch`). Le réappliquer, le vérifier
  contre le code du moment, appliquer les trois adaptations autorisées ci-dessus, puis passer la relecture.
