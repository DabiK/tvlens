---
id: T178
titre: Report a deterministic capture-to-display latency
statut: termine
bloque_par: T058, T066, T168, T171, T183
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un scénario hors ligne conduit une capture simulée, les deux voies de perception, une question et
la remise de leurs états aux vraies vues Mac/TV. Il rend sur stdout un tableau français ou un JSON
versionné, reproductible, séparant attente, traitement, publication, réception client et application
par la vue. Cette référence précède toute optimisation ; elle mesure un ordonnancement simulé et
la remise au DOM, sans annoncer un débit fournisseur ou l’apparition physique des pixels.
Elle ne sert pas de référence aux déplacements headless T179/T180 : le scénario ne traverse pas
`HeadlessRuntime` et, dans la chaîne retenue, attend la décision de retrait ambient.

## Sources

- `docs/audit-points-chauds.md`, section C « Latence ».
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6` :
  - horloge et découpe Mac, `app/recording.js:17` et `app/recording.js:29` ; remise du bloc,
    `app/recording.js:70` ; capture TV monotone et file d'envoi, `tv/capture.py:145` et
    `tv/capture.py:167`. Le scénario ne lance pas ce programme Python ni une capture réelle ;
  - admission avant assemblage, `server/http.cjs:224` et `server/http.cjs:252` ; mesure
    `assembleMs`, `adapters/remote-media.cjs:119` ; `WatchSession` date `receivedMs` pendant
    l'ingestion, `core/session.cjs:87` et `core/session.cjs:101`, **après l'assemblage HTTP** ;
  - publication des paroles, `core/session.cjs:282` ; file/début/publication vision,
    `core/session.cjs:172`, `core/session.cjs:312`, `core/session.cjs:341` ;
  - acceptation/ancrage de question, `core/deep-ask.cjs:62` ; démarrage et contexte,
    `core/deep-ask.cjs:95` ; validation du résultat avant fin, `core/deep-ask.cjs:128` ;
    mesures de question, `core/deep-ask.cjs:149` ;
  - huit mesures par passage, `core/latency-trace.cjs:4`, agrégat des 40 derniers,
    `core/latency-trace.cjs:12`, exposé par `core/session.cjs:487` ;
  - regroupement du rendu Mac par frame/timer de secours 100 ms, `app/renderer.js:40` ; réception
    de session, `app/renderer.js:201` ; cartes, `app/renderer.js:278` ; réception des questions,
    `app/renderer.js:317`. Les lectures murales de `app/renderer.js:274` et
    `app/renderer.js:324` doivent être maîtrisées dans le scénario ;
  - extrapolation serveur par delta monotone TV, `tv/app/companion.js:842` ; compteur de rendus,
    `tv/app/companion.js:1047` ; réception et rendu, `tv/app/companion.js:1106` ; 304 sans nouvelle
    réception de cartes, `tv/app/companion.js:1153`. Un compteur n'est pas un horodatage d'application.
- Tests et bancs existants : `tests/session-latency.test.cjs`, `tests/latency.test.cjs`,
  `tests/server-ingest-path.test.cjs:36`, `tests/server-state-views.test.cjs`,
  `tests/tv-panel.test.cjs`, `tests/helpers/tv-page.cjs`, `tests/mac-ui.test.cjs`.
  `scripts/bench-backend.cjs` mesure un temps machine réel : il ne constitue pas ce scénario.
- Interfaces promises : contrôleur de capture de T167/T168, horloge commune de T058,
  minuteries de checkpoint de T066, contrôleur de polling et vue de T170/T171, couture Mac T183.
  ADR 0003 (publication avant disque) et 0011 (scripts classiques TV), dans `docs/adr/`.

## Périmètre

- Créer `scripts/measure-latency.cjs`, avec un scénario réutilisable et un schéma de trace versionné
  dans des modules voisins hors `scripts/quality/` et `scripts/loop/`. L'import n'exécute rien ;
  une fonction exportée construit le scénario pour les tests. Documenter la commande et la lecture
  du tableau/JSON dans `docs/travail/README.md`.
- Réutiliser `tests/helpers/clock.cjs` livré par T058 : `manualClock({ turns })`, son `io`
  (`now`, `setTimer`, `clearTimer`), `advance(ms)` et `armed`. Utiliser des fournisseurs différés
  à deux voies et un agent de réponse simulé, un store contrôlé et les vrais `WatchSession`,
  `DeepAsk` et outils nécessaires. Les faux smoke de T146 conservent leur comportement ; ne pas
  leur inventer ici un nouveau mode à deux voies dans la composition produit.
- Conduire le vrai contrôleur de capture Mac avec ses dépendances navigateur/recorder simulées et
  un bridge en mémoire. Alimenter le vrai polling et la vraie vue TV extraits par T170/T171 avec
  les états publiés, les réponses réseau différées et le banc/DOM réutilisable livré par T185.
  Le chemin de remise doit réellement relier ces composants ; pas de tableau composé seulement
  en additionnant des délais déclarés dans la fixture.
- Réutiliser `app/ui/state-delivery.mjs` livré et branché par T183, avec ses dépendances injectées,
  ses observations de réception/application et son chemin de vraies cartes. Observer la fin du dessin
  DOM avec le même banc Mac ; aucune extraction ni recâblage supplémentaire du renderer ici.
  Conserver le regroupement par frame et le secours à 100 ms déjà testés par T183.
- La trace corrèle identifiant de scénario, session, passage, question et révision/émission locale.
  Elle distingue fermeture du passage, admission de transport simulée, début/fin de préparation,
  ingestion par le cœur, files/traitements audio et vision, publications, acceptation/démarrage de
  question, premier texte utile et fin validée, réception client et application DOM Mac/TV.
  Une question peut consulter plusieurs passages : enregistrer les liens effectivement utilisés,
  sans inventer une relation unique passage-question.
- Les observations de réception et d'application sont des callbacks optionnels injectés ou des
  effets enregistrés par le banc ; aucune nouvelle surface HTTP, IPC ou disque n'est requise.
  Conserver les horodatages et métriques déjà exposés par le produit.
- Ajouter `tests/capture-display-latency.test.cjs` ; réutiliser les helpers DOM de T185 et T183
  ainsi que `tests/state-delivery.test.cjs`, livré par T183, sans reconstruire la couture.
  Écrire un ADR court sur les domaines d’horloge, la corrélation
  et la limite du terme « application par la vue ».
- Ne changer ni durée de capture, ni files/priorités, délais de modèle, polling, rétention ou règles
  de contexte. Aucun réseau externe, binaire média, Electron, TV, fournisseur ou sommeil réel ; pas
  d'installation, modification du contrôle unique ou seuil de performance.

## Critères d'acceptation

1. `node scripts/measure-latency.cjs` produit le tableau français ; l'option `--json` produit un seul
   document JSON avec version de schéma, unités, origines d'horloge et identifiants stables. Trois
   cas bornés sont présents : mémoire prête, audio/vision retardés et question en attente derrière
   une autre. Tous traversent la chaîne jusqu'aux cartes Mac et TV.
2. Deux constructions/exécutions fraîches sur le même code donnent les mêmes valeurs et le même
   JSON, sans UUID aléatoire, chemin temporaire, horloge réelle ou durée machine dans les mesures.
   Les dates ou étapes non observées restent `null`, jamais un zéro ou un événement inventé.
3. Une augmentation contrôlée d'un délai audio, vision, réponse ou livraison modifie les intervalles
   causalement concernés et leurs cumuls, en laissant les autres identiques. Le test compare les
   effets attendus, pas seulement la sortie du formateur. L'attente de file de la seconde question
   reste séparée de son traitement et de sa durée depuis acceptation.
4. Premier texte utile et réponse finale validée sont deux étapes distinctes. Publication serveur,
   réception client et retour du dessin DOM sont séparés ; un premier callback de progression sans
   texte n'est pas présenté comme une réponse utile. La trace conserve la disponibilité figée de la
   question et ne suppose pas qu'elle attend toute la perception précédente.
5. Les domaines passage/session, mural serveur et monotone client sont nommés. Aucune soustraction
   entre domaines n'est faite sans correspondance établie par le scénario. La TV continue d'extrapoler
   `serverNowMs` par un delta monotone ; un décalage simulé de son horloge murale ne modifie pas les
   durées. `receivedMs` n'est jamais étiqueté réception HTTP brute.
6. Un 304 ne produit aucun nouveau corps appliqué ni rendu de carte. Les états Mac arrivant dans une
   même frame sont regroupés ; le secours 100 ms ne produit pas de deuxième dessin. Les preuves
   observent texte/nœuds des cartes et callbacks de rendu des modules réels, sans charger tout
   Electron ni fabriquer un faux rendu à partir du texte source.
7. Chaque cas libère contrôleur de capture, polling, vues, session et questions, même après un refus.
   `armed` revient à 0 et les doublures de frame ne détiennent aucun callback actif ; aucun état
   tardif n'est appliqué après libération. La mesure ne repose pas sur les intervalles non contrôlés
   de la page complète ou du constructeur headless.
8. La documentation annonce les limites : valeurs synthétiques d'ordonnancement et de remise aux
   vues, sans mesure du réseau réel, de Codex/Whisper, de la dictée LG ou des pixels physiques.
   Elle indique que le scénario ne traverse pas `HeadlessRuntime`, attend la décision ambient par
   T171→T170→T169→T182 et ne sert pas de référence aux déplacements T179 et T180.
   Les tests existants de latence, de vues et de capture restent protégés ; les nouveaux tests et
   les suites concernées passent en séquentiel, puis `node scripts/check.mjs` est vert à l'implémentation.

## Test d'acceptation attendu

`tests/capture-display-latency.test.cjs` appelle le scénario exporté, conduit l'horloge et les
promesses différées, observe les cartes réelles et compare trace/JSON attendus. Un cas fait varier
un délai et un autre fournit un 304. Le test de couture `tests/state-delivery.test.cjs` de T183
reste une preuve réutilisée et exécutée, sans extraction supplémentaire dans ce ticket. La commande CLI n'est qu'une présentation de
ce scénario, sans accès à des identifiants ou à un fournisseur réel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T168 implique T167/T021/T150 ; T171 implique T170/T169/T182 et T058 ; T066 fournit les minuteries
du checkpoint et T183 la couture Mac déjà testée. Ces interfaces n’existent pas encore à `e92c6a6` :
relire leurs versions livrées, sans refaire leurs extractions. La chaîne ambient attend sa décision
propriétaire ; un refus applique l’hypothèse nommée de T169 et impose de recadrer le banc partagé.
T179 et T180 gardent leurs dépendances propres : cette mesure, qui ne traverse pas `HeadlessRuntime`,
ne leur fournit pas de référence avant déplacement. T058/T066 n’injectent pas toutes les horloges :
le banc compose seulement les composants nécessaires avec leurs dépendances maîtrisées.
Les chiffres réels de capture à affichage restent inconnus ; ce ticket n'en déduit aucune cible métier.

## Journal

- Exploration : coutures livrées relues, décision ambient ADR 0017 disponible ; scénario composé
  hors HeadlessRuntime. Horloges DeepAsk maîtrisées dans une VM sans modification du produit.
  État initial et choix consignés dans `.harness-state/tickets/T178/exploration.md` et `ecarts.md`.

- Contrat rouge observé : `node --test tests/capture-display-latency.test.cjs`, assertion de
  version (`undefined !== 1`), puis vert après composition réelle capture/cœur/vues.
  Sorties : `red-contract.log`, `green-contract.log` dans le dossier d'état.
- Causalité et caractérisations : délais audio, vision, réponse, livraison ; file de deux questions,
  disponibilité figée, consultations multiples, callbacks vides, cartes réelles, 304, regroupement
  et secours Mac, horloge murale TV décalée, refus média/réponse et libération.
  Rouge puis vert observés séparément pour les colonnes du tableau, le texte absent (`null`) et
  l'observation de l'entrée en file audio : `red-table.log`, `red-missing-text.log`,
  `red-queue-observation.log` et leurs sorties vertes. Dernière suite ciblée : 12 tests, 12 réussis.
- `node scripts/check.mjs --changed` : vert (à l'étape des 11 premiers tests).
  `node --test --test-concurrency=1 tests/capture-display-latency.test.cjs tests/state-delivery.test.cjs tests/session-latency.test.cjs tests/latency.test.cjs tests/capture-controller.test.cjs tests/recording.test.cjs tests/server-ingest-path.test.cjs tests/server-state-views.test.cjs tests/tv-chat-model.test.cjs tests/tv-poll-controller.test.cjs tests/tv-chat-view.test.cjs tests/tv-panel.test.cjs tests/mac-ui.test.cjs` :
  208 tests réussis, aucun échec ; `related-tests.log`. Suites exécutées en séquentiel.
- `node scripts/measure-latency.cjs` : tableaux français observés ; deux commandes fraîches
  `node scripts/measure-latency.cjs --json` puis
  `cmp .harness-state/tickets/T178/report-one.json .harness-state/tickets/T178/report-two.json` :
  sortie 0, documents identiques octet pour octet. Aucun débit réel ni pixel mesuré.
  Node avertit sur stderr du type implicite des modules `.js` Mac existants ; stdout reste un seul JSON.
- Documentation de commande/lecture et ADR 0028 ajoutés. `node scripts/check.mjs` complet lancé ;
  son résultat sera consigné après observation.
- Contrôle final observé : `node scripts/check.mjs` vert ; règles, format, lint, gel et cliquet
  verts ; 120 fichiers JS en séquentiel, 1 521 tests réussis et aucun échec ; 22 tests Python
  réussis. Sortie complète : `.harness-state/tickets/T178/check-full.log`.
- `node scripts/check.mjs --changed` final : vert, 12 nouveaux tests réussis ;
  `check-changed-final.log`. `git diff --check` et `cmp` des deux JSON : sorties 0.
  Verdict TERMINÉ écrit pour remise à la boucle ; aucun commit ni push, aucun fichier préexistant
  de `design/continuous-context/` ou `experiments/` modifié.

### Reprise après relecture 1

- Rapport `relecture-1.md`, ticket/journal, écarts, état/diff et témoin hooks relus.
  Constats 1 à 8 acceptés ; aucun écart ni contestation. Le constat 9 devient une réserve hors
  périmètre : extraction future de la porte `asking` dupliquée entre hôtes, dans un ticket dédié.
- Constat 1 : mutation temporaire retirant `c.poll.stop()` exécutée avant correction :
  `node --test tests/capture-display-latency.test.cjs`, sortie 0, 12 tests réussis malgré la mutation
  (`mutation-stop-before.log`). Défaut confirmé. Sonde corrigée : corps publié enregistré et
  non vide dans le cas nominal, compte des événements tardifs, lecture des timers après la sonde
  et avant le nettoyage de sécurité. Nouveau test rouge puis vert (`correction-cleanup-*.log`).
  Même mutation après correction : sortie 1, carte appliquée après libération, 2 événements tardifs
  et 1 minuterie réarmée (`mutation-stop-after.log`, puis `mutation-stop-final.log`). Mutation retirée.
- Constat 2 : test renforcé rouge puis vert (`correction-final-cards-*.log`) : chaque question de
  chaque cas possède sa vraie carte avec « Réponse simulée validée. » sur Mac et TV, et une
  estampille d'application finie. Textes du DOM conservés par identifiant de question.
- Constat 3 : nouveau test rouge `80 !== 87`, puis vert (`correction-measured-duration-*.log`) :
  une attente injectée dépasse le délai déclaré ; audio/vision mesurent l'horloge autour de l'attente.
- Constat 4 : transitions `asking` publiées avant le deep correspondant, puis reprise de vision en
  microtâche uniquement à la libération, comme les hôtes. Tests rouge puis vert
  (`correction-asking-*.log`). Mutation remplaçant la microtâche par une reprise synchrone :
  `node --test --test-name-pattern='vision held' tests/capture-display-latency.test.cjs`, sortie 1
  sur l'ordre des publications observées (`mutation-asking-microtask.log`), mutation retirée.
- Constat 5 : nouvelle découpe à 700/1400 ms, test rouge puis vert
  (`correction-correlation-*.log`). Rapprochement du transport et de la préparation par la fermeture
  observée `closedAtMs`/`endMs`, sans deviner l'identifiant attribué par le cœur.
- Constats 6 et 7 : schéma d'horloge par chemin de champ ; bornes/disponibilité dans le domaine
  session, traitement de question mural serveur, estampilles client `clientReceivedMs` et
  `clientAppliedMs`. Tests rouge puis vert (`correction-clock-schema-*.log`,
  `correction-client-names-*.log`). Documentation et ADR 0028 mis à jour.
- Constat 8 : délai du premier texte configurable, test rouge `40 !== 70`, puis vert
  (`correction-constants-*.log`). Délais/bornes/marge et constantes de conduite centralisés dans
  `scripts/latency-fixture.cjs` ; tests utilisant les paramètres/exportations et les origines de l'environnement.
- `node scripts/check.mjs --changed` : vert, 20 tests réussis (`correction-check-changed.log`).
  Deux commandes `node scripts/measure-latency.cjs --json` fraîches puis `cmp` des fichiers
  `correction-report-one.json` et `correction-report-two.json` : sortie 0, identiques octet pour octet.
  Suites concernées puis contrôle complet relancés en séquentiel ; résultat à consigner après observation.
- Validation finale de la correction : suites concernées en séquentiel, 217 tests réussis,
  aucun échec (`correction-related-tests.log`). `node scripts/check.mjs` : vert ; règles, format,
  lint, gel et cliquet verts ; 1 529 tests JS sur 120 fichiers et 22 tests Python réussis
  (`correction-check-full.log`). `git diff --check` : sortie 0.
- Nouveau verdict TERMINÉ remis à la boucle ; constats 1 à 8 corrigés. Réserve hors périmètre 9
  conservée dans `reste`, sans modification des hôtes. Aucun commit ni push ; fichiers préexistants
  étrangers au ticket préservés.

### Reprise après relecture 2

- Rapport `relecture-2.md`, ticket/journal, écarts, arbre et nouveau témoin hooks relus.
  Constats 1 (bloquant) et 2 (mineur) acceptés sans contestation. Réserves 3 (écart de livraison
  implicite dans le test) et 4 (porte `asking` dupliquée) conservées hors périmètre.
- Libération sans `run()` : assertion `doesNotReject` rouge sur la lecture de `c.latest.session`,
  puis verte avec un bilan nul et libération idempotente (`revision-empty-release-*.log`).
  La sonde ne retient/résout un corps tardif que si une publication existe.
- Échec avant ingestion : test rouge sur `armed: 1`, puis vert (`revision-early-failure-*.log`).
  Les livraisons Mac programmées sont annulées par la vue. L'ajout de l'état initial a révélé une
  réponse TV encore en vol (`revision-initial-state-progress.log`) ; son attente est désormais
  annulée par le banc TV. Le cœur ferme avant l'attente du contrôleur de capture, les attentes
  simulées des fournisseurs/du bridge sont annulées, et le nettoyage de sécurité est en `finally`.
- Premier polling : nouveau test rouge sur le faux événement `transport.refused`
  (`revision-initial-state-red.log`), puis vert dans les trois cas nominaux. Le conducteur
  publie un vrai instantané de session avant de démarrer le polling ; chaque première requête
  se rattache à cette publication.
- Erreurs : un refus simulé de transport porte le code stable `SIMULATED_TRANSPORT_REFUSAL`.
  Toute autre exception du client ou de ses callbacks est conservée puis propagée au conducteur
  avec sa cause originale, sans faux refus. Test du conducteur rouge sur « Missing expected
  rejection », puis vert (`revision-conductor-error-*.log`). La fabrique de vues injectée éprouve
  les exceptions de réception aux premier, deuxième et troisième corps, avec nettoyage nul.
  Le cas de refus explicitement simulé est aussi couvert.
- Mutations exécutées puis retirées : masquer les exceptions imprévues en refus de transport
  fait échouer les assertions (`revision-mutation-misclassified-error.log`, sortie 1) ; omettre
  `c.poll.stop()` reste détecté (`revision-mutation-stop.log`, sortie 1).
- `node scripts/check.mjs --changed` : vert, 26 tests réussis (`revision-check-changed.log`).
  Deux exécutions fraîches `node scripts/measure-latency.cjs --json`, puis `cmp` des fichiers
  `revision-report-one.json` et `revision-report-two.json` : sortie 0, identiques octet pour octet.
  Documentation et ADR mis à jour ; suites concernées puis contrôle complet lancés en séquentiel.
- Validation finale : 223 tests concernés réussis en séquentiel (`revision-related-tests.log`).
  `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet verts ; 1 535 tests JS
  sur 120 fichiers et 22 tests Python réussis (`revision-check-full.log`). `git diff --check` : sortie 0.
- Nouveau verdict TERMINÉ remis à la boucle. Les deux constats à corriger sont couverts ;
  réserves 3 et 4 conservées dans `reste`. Aucun commit ni push, aucun fichier produit ou du
  harnais modifié, fichiers préexistants étrangers au ticket préservés.

### Réserves à la clôture

- Réserve hors périmètre, relecture 2 constat 3 : le test de livraison utilise 65 et un écart 50, dépendant implicitement du défaut 15 ; à exprimer ultérieurement avec DEFAULT_DELAYS.deliveryMs et addedDeliveryMs.
- Réserve hors périmètre, relecture 2 constat 4 : extraire dans runtime/ la règle asking commune à app/main.cjs et runtime/headless-runtime.cjs, également reproduite par le banc, dans un ticket dédié. Les hôtes restent inchangés.
- .harness-state/tickets/T178/relecture-3.md : `tests/capture-display-latency.test.cjs:104-122` — hors périmètre (réserve maintenue)
  - **Problème.** `deliveryMs: 65` et l'écart attendu `50` reposent toujours, sans le dire, sur `DEFAULT_DELAYS.deliveryMs = 15`. La correction n'a pas touché ce code.
  - **Attendu :** écrire `DEFAULT_DELAYS.deliveryMs + addedDeliveryMs`, comme dans le test de réponse.
- .harness-state/tickets/T178/relecture-3.md : `app/main.cjs:147-154` et `runtime/headless-runtime.cjs:120-131` — hors périmètre (réserve maintenue)
  - **Problème.** La règle « question occupée → `asking` » existe en deux exemplaires dans les hôtes, et en troisième dans le banc (`scripts/latency-model.cjs:93-103`).
  - **Attendu :** l'extraire dans `runtime/` par un ticket dédié.
