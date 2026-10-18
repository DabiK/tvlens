---
id: T221
titre: Publish passage updates and lane losses with their revision
statut: termine
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

- Reprise Codex : règles, skill, ticket, journal et tentative archivée examinés ; témoin de hooks présent.
  Exploration et liste détaillée des sept attentes autorisées dans `.harness-state/tickets/T221/`.
  La décision du 17/10 lève le blocage précédent. Réapplication prévue tests d’abord, preuves rejouées,
  sans reprendre l’ancien statut bloqué ni déclarer disponibles ses sorties de commande absentes.
- Réapplication du test public archivé avant production : `node --test tests/session-events.test.cjs` :
  **10/27 verts, 17 échecs sur assertion** (`session-events-red.log`). Après reprise du code et de l’ADR :
  même commande **27/27 verts** (`session-events-green.log`). Réceptions, états cohérents, pertes comptées,
  second essai, miniature en history, fournisseurs tardifs et disque retenu sont couverts.
- Attentes autorisées :
  `node --test --test-concurrency=1 --test-name-pattern='timeline stamps|revision counts|a description that fails twice|the pruned archive opens without writes|composition binds read capabilities' tests/session-latency.test.cjs tests/architecture-f08.test.cjs tests/archive-compat.test.cjs tests/memory-view.test.cjs` :
  **5/5 rouges sur assertion**, puis **5/5 verts** après les seules adaptations prévues
  (`revision-expectations-red.log`, `revision-expectations-green.log`). Les deux attentes du nouveau
  moment-5 sont vérifiées, reprise et réouverture comprises ; les témoins et passages historiques restent intacts.
- Acceptation : `node --test --test-concurrency=1 tests/session-events.test.cjs tests/events.test.cjs tests/split-perception.test.cjs tests/session-latency.test.cjs tests/architecture-f08.test.cjs tests/review-regressions.test.cjs tests/session-durable.test.cjs tests/watch-session-ending.test.cjs tests/archive-compat.test.cjs tests/memory-view.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/documentation-index.test.cjs` :
  **705/705 verts**, séquentiels (`acceptance.log`).
- `node scripts/check.mjs --changed` : **vert**, règles/format/lint/gel/cliquet et **111/111 tests JS**
  (`check-changed.log`). Mesure produit : **1317**, plancher inchangé **1307**.
  `git diff --check` et vérification d’absence de changements des témoins, de review-regressions,
  du harnais et des suppressions ESLint : **codes 0**. ADR 0050 repris et documentation courante complétée.
  Contrôle complet lancé ; son résultat reste à observer.
- Contrôle complet final : `node scripts/check.mjs` : **vert**, règles/format/lint/gel/cliquet,
  **2489/2489 tests JavaScript** dans 138 fichiers et **47 tests Python réussis** (`check-full.log`).
  Aucun contrôle non lancé. Les trois adaptations autorisées lèvent les deux échecs de la tentative archivée.
- Vérification de périmètre (`final-scope.log`) : code de production identique au patch archivé ;
  les seules trois attentes supplémentaires correspondent exactement au patch proposé. Témoin à révisions
  égales de review-regressions, corpus d’archives, harnais, plancher et suppressions ESLint inchangés.
  `git diff --check` : **code 0**. Verdict **TERMINÉ** écrit dans
  `.harness-state/tickets/T221/verdict.json`, sans réserve propre. Aucun commit ni push ; relecture laissée à la boucle.
- Reprise après relecture 1 : rapport, ticket/journal, écarts, témoin de hooks, état Git et diff relus.
  Les trois mineurs sont acceptés. Corrections prévues dans `ecarts.md` avant modification : frontière
  d’expiration avant suppression, faits extraits pour rétablir la lisibilité, restauration des voies
  interrompues et refus disque sur clip sans image. Aucun relecteur lancé, aucun commit ni push.
- Relecture 1, constat 2 :
  `node --test --test-name-pattern='transcription finishing during media removal' tests/session-events.test.cjs` :
  **1 rouge sur assertion** (révision obtenue 1 au lieu de 2), puis **1/1 vert**
  (`correction-1-expiry-red.log`, `correction-1-expiry-green.log`). Le balayage publie ses faits
  avant d’attendre `media.remove` ; la transcription et son relais vision expiré acquièrent la version 2.
- Relecture 1, constat 1 : `capturedModalities` et les quatre lectures sont rétablis ; instructions
  nouvelles audio/vision et écriture miniature séparées. `core/passage-events.cjs` possède les faits,
  leurs constructeurs développés, leur regroupement et leur remise protégée. Aucun module de voie
  ou de persistance déplacé. La garde rapide intermédiaire avait observé **402 lignes utiles**,
  rouge sur `max-lines` avant extraction ; aucun tassement supplémentaire ni gel ajouté.
  `node --test tests/session-events.test.cjs` : **28/28 verts** après extraction (`correction-1-events-green.log`).
  `node_modules/.bin/eslint core/session.cjs core/passage-events.cjs tests/session-events.test.cjs` :
  **code 0** (`correction-1-lint.log`).
- Relecture 1, constat 3 :
  `node --test --test-name-pattern='restoration of|storage refusal of an unreadable' tests/session-events.test.cjs` :
  **4/4 verts**, caractérisations du comportement déjà livré (`correction-1-restoration-green.log`).
  Les compteurs historiques augmentent pour chaque voie interrompue ; révision conservée et silence
  après restauration, émission, pause et reprise. Refus disque sur clip vide : seule suspension,
  aucun passage, compteur unreadable ou perte de voie. ADR 0050 précisé sur ces garanties et sur
  la frontière synchrone d’expiration.
- `node scripts/check.mjs --changed` après les trois corrections : **vert**, règles/format/lint/gel/cliquet
  et **115/115 tests JavaScript** (`correction-1-check-changed.log`). Compteur textuel produit **1319**,
  plancher inchangé **1307**. Le cas de suppression retenue vérifie aussi l’absence d’émission `onChange`
  supplémentaire. Acceptation séquentielle et contrôle complet à observer avant le nouveau verdict.
- Acceptation après correction :
  `node --test --test-concurrency=1 tests/session-events.test.cjs tests/events.test.cjs tests/split-perception.test.cjs tests/session-latency.test.cjs tests/architecture-f08.test.cjs tests/review-regressions.test.cjs tests/session-durable.test.cjs tests/watch-session-ending.test.cjs tests/archive-compat.test.cjs tests/memory-view.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs tests/documentation-index.test.cjs` :
  **709/709 verts**, séquentiels (`correction-1-acceptance.log`). Le contrôle complet est lancé dans
  la même séquence ; aucun résultat n’est anticipé.
- Contrôle complet après correction : `node scripts/check.mjs` : **vert**, règles/format/lint/gel/cliquet,
  **2493/2493 tests JavaScript** dans 138 fichiers et **47 tests Python réussis**
  (`correction-1-check-full.log`). Aucun contrôle non lancé.
- Vérifications finales : `git diff --check` et `git diff --exit-code` sur review-regressions, les témoins,
  le harnais, le plancher, les suppressions ESLint et le port hors périmètre : **codes 0**
  (`correction-1-scope.log`). Les trois adaptations supplémentaires de révision restent exactement
  celles autorisées. Trois mineurs corrigés, aucune contestation ; nouveau verdict **TERMINÉ** dans
  `.harness-state/tickets/T221/verdict.json`, sans réserve propre. Aucun commit ni push ; prochaine
  relecture laissée à la boucle. Le constat hors périmètre reste transmis par son rapport.

### Réserves à la clôture

- .harness-state/tickets/T221/relecture-2.md : 1. `core/ports.cjs:79` — hors périmètre (repris de la relecture 1)
  - **Le problème.** Le commentaire du port dit toujours « Every published change of an observation increments the passage revision ». Il est incomplet : la révision monte aussi pour une perte terminale, un changement de disponibilité et une miniature.
  - **Pourquoi hors périmètre.** Le ticket ne couvre pas ce fichier, et `correction-1-scope.log` montre qu'il n'a pas été modifié.
  - **Suite.** Je le garde pour qu'il reste dans les réserves.
