---
id: T178
titre: Report a deterministic capture-to-display latency
statut: a-faire
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
