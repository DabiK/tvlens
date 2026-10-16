---
id: T186
titre: Keep a failed state publication from stalling the perception lanes and the question queue
statut: termine
bloque_par: T199
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une exception d'un observateur ne bloque ni la perception ni la file des questions. Le dernier état
reste consultable, les sauvegardes et le travail suivant sont tentés, et l'échec de publication reçoit
un diagnostic distinct d'une erreur du fournisseur.

## Sources

- `docs/audit-architecture.md`, rapport B, B1 et D1 ; synthèse de l'orchestrateur, publication.
  Décision du propriétaire, le 16/10 : fiabiliser ces transitions dans la première vague.
- Code vérifié à `8340014` : `core/session.cjs:280` lève les drapeaux audio, puis publie à
  `core/session.cjs:282`, avant le `try`. Même disposition pour la vision à
  `core/session.cjs:322` et `core/session.cjs:324`. Les publications des fins de voies précèdent
  encore drainage et persistance à `core/session.cjs:305` et `core/session.cjs:373`.
- `core/session.cjs:506` appelle directement l'observateur. `runtime/session-runtime.cjs:176`
  chaîne index, manifeste et hôte. `runtime/headless-runtime.cjs:246` appelle chaque abonné sans
  isolation : le refus du premier peut empêcher les suivants de recevoir l'état.
- `core/deep-ask.cjs:73` publie avant le drainage ; `core/deep-ask.cjs:78` publie le travail actif
  avant `run`. Les publications finales à `core/deep-ask.cjs:155` et `core/deep-ask.cjs:167`
  précèdent aussi des étapes nécessaires. `runtime/conversation-runtime.cjs:59` compose ce cœur
  pour les deux hôtes ; `app/main.cjs:147` et `runtime/headless-runtime.cjs:120` sont ses observateurs.
- Tests lus : `tests/split-perception.test.cjs`, `tests/session-latency.test.cjs`,
  `tests/deep-ask-restore.test.cjs`, `tests/video-research.test.cjs`, `tests/chat-trace.test.cjs`
  et `tests/watch-session-ending.test.cjs`. Attention : `tests/session-latency.test.cjs:228`
  exige actuellement que le refus de l'observateur fasse rejeter `prune()`.
- ADR 0003 : publication avant sauvegarde ; ADR 0004 : libération après le retour effectif de
  l'agent ; ADR 0019/0020 : composition et cycle de vie du runtime.

## Périmètre

- Dans `core/session.cjs` et `core/deep-ask.cjs`, rendre les notifications incapables d'interrompre
  une transition. Couvrir toutes leurs émissions, y compris progression, annulation, fin, pause,
  reprise et publication de l'issue d'une sauvegarde ; ne pas corriger seulement les deux lignes
  avant les `try`. Les erreurs métier et de stockage conservent leur traitement propre.
- Injecter un diagnostic de publication dans ces cœurs, sans import externe ni accès à la machine.
  Le câbler dans `runtime/session-runtime.cjs`, `runtime/conversation-runtime.cjs` et les deux
  hôtes. Le diagnostic est observable hors d'une option de trace Codex ; un diagnostic qui lève
  ne relance pas l'erreur dans le métier et ne provoque pas de nouvelle émission récursive.
- Isoler les abonnés de `HeadlessRuntime.emit()` : un abonné défaillant n'empêche pas les autres
  de recevoir la publication. Garder révision et état courant consultables après le refus.
- Ajouter les scénarios dans les tests des modules et de la composition. Modifier l'attente de
  rejet de `prune()` citée ci-dessus en preuve de continuation avec diagnostic ; déclarer ce
  changement de contrat dans `ecarts.md`, sans retirer les assertions sur la rétention et l'ingestion.
- Écrire un ADR court sur la séparation entre transition, notification et diagnostic, en conservant
  les garanties des ADR 0003 et 0004. La reprise des notifications de surveillance relève de T187.
- Ne changer ni ordonnancement des voies, ni pertes, délais, reprises fournisseur, sélection des
  preuves, formats d'archive ou ordre de fermeture. Ne déplacer aucun composant du harnais.

## Critères d'acceptation

1. Par `WatchSession.ingest()` avec perception à deux voies, un observateur qui lève à chaque
   publication laisse deux passages successifs finir leurs transcriptions et descriptions, une fois
   chacune. Les drapeaux reviennent au repos et les files se vident ; les sauvegardes sont tentées.
2. Des cas ciblent séparément publication de départ audio, transcript, départ vision, progression
   et fin vision, puis un refus réel du fournisseur. L'exception d'observation n'est pas comptée
   comme erreur audio/vision et ne remplace pas la raison réelle d'un refus du fournisseur.
3. Par `DeepAsk.start()`, deux questions conduites par promesses différées finissent malgré un
   observateur qui lève sur queued, running, progression et états finaux. `done` se règle, `active`
   est libéré, la suivante démarre et les minuteries disparaissent. Annulation et plafond conservent
   leurs résultats ; un agent tardif garde ses outils jusqu'à son retour effectif, puis les rend.
4. Chaque refus de publication tenté produit un diagnostic identifiable par origine et session ou
   travail. Faire lever ce diagnostic laisse les critères 1 et 3 vrais, sans boucle de publication.
   L'état acquis reste lisible par `snapshot()` même si aucune notification n'a été livrée.
5. Deux abonnés du serveur, dont le premier lève : le second reçoit l'état et la révision avance.
   Les compositions Mac et serveur câblent le diagnostic, vérifié par injection aux coutures des
   bancs existants, sans Electron natif ni fournisseur réel.
6. Les tests cités passent en séquentiel, avec l'unique évolution d'attente de `prune()` explicitée.
   `node scripts/check.mjs` est vert à l'implémentation, sans suppression de test ni hausse du gel.

## Test d'acceptation attendu

Étendre `tests/split-perception.test.cjs` et `tests/deep-ask-restore.test.cjs` par les frontières
`ingest`, `start`, `cancel` et `snapshot`, avec observateurs défaillants, fournisseurs maîtrisés et
promesses différées. Utiliser les horloges et attentes partagées pour le plafond et les fins de
travaux. Les assertions portent sur résultats, diagnostics, files, sauvegardes et libérations ;
elles ne lisent pas le texte des fonctions. Compléter les bancs de composition pour les abonnés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les blocages sont déduits du contrôle de flux à `8340014`, sans reproduction exécutée lors du
découpage. T199 implique T178. Ce ticket n'affirme ni livraison réussie d'une notification refusée,
ni réparation d'un observateur ; il garantit la transition et le diagnostic de son échec.

## Journal

- Exploration : lecture des consignes, des deux cœurs, des compositions, des hôtes, des bancs et des
  ADR 0003/0004/0019/0020. Les notifications directes peuvent interrompre drainage et sauvegarde.
  Plan et évolution autorisée de l'attente de `prune()` consignés dans
  `.harness-state/tickets/T186/exploration.md` et `ecarts.md`. Aucun test lancé à ce stade.
- Perception : `node --test --test-name-pattern='failed publications preserve both' tests/split-perception.test.cjs`
  observé rouge sur l'assertion de continuation d'ingestion (2 échecs), puis vert (2/2).
- Questions : `node --test --test-name-pattern='failed publications preserve queued' tests/deep-ask-restore.test.cjs`
  observé rouge sur l'assertion de démarrage (2 échecs), puis vert (2/2).
- Serveur : `node --test --test-name-pattern='failed state subscriber|server composition reports' tests/host-error-handling.test.cjs`
  observé rouge sur l'isolation des abonnés et l'absence de diagnostic (3 échecs), puis vert (3/3).
- Mac : `node --test --test-name-pattern='Mac composition journals' tests/mac-ipc-contract.test.cjs`
  observé rouge sur la sauvegarde finale omise, puis vert (1/1). Le callback tente désormais
  le checkpoint après une publication refusée. Banc Node sans Electron natif.
- Couverture des transitions : `node --test --test-concurrency=1 tests/split-perception.test.cjs tests/deep-ask-restore.test.cjs tests/session-latency.test.cjs`
  vert, 55/55. Cas séparés pour départ audio, transcript, départ/progression/fin vision, refus
  fournisseur, pause/reprise et issue disque ; annulation et plafond avec retour tardif de l'agent.
- `node scripts/check.mjs --changed` vert : règles, format, lint, gel, cliquet et 77/77 tests
  dans les cinq fichiers modifiés. Journaux rouge/vert conservés dans le dossier d'état.
  ADR 0032 rédigé ; extraction de la minuterie de plafond sans changement de politique pour
  respecter la limite de longueur de `DeepAsk.run` après clarification des émissions.
- Les six fichiers cités et les deux bancs d'hôtes : commande séquentielle détaillée dans
  `commandes.md`, vert 99/99 après extraction de la minuterie.
- Premier `node scripts/check.mjs` : règles, format, lint, gel et cliquet verts ; JavaScript
  rouge, 1682/1707 (25 échecs du seul banc de latence) ; Python vert, 22 tests. Reproduction par
  `node --test tests/capture-display-latency.test.cjs` : 25 échecs sur 26, même cause déterministe,
  `require` absent de la VM chargeant `DeepAsk`. Résolution relative des imports ajoutée au script
  de mesure, sans changer scénarios ni assertions ; même commande ensuite verte, 26/26.
- Remise à zéro Mac : même commande ciblée du banc Mac, rouge observé sur l'identité de session
  absente, puis vert (1/1) après transmission de la session quittée à l'émission sans travail.
  Adaptations consignées avant modification dans `ecarts.md` ; aucun chemin protégé du harnais modifié.
- Contrôles finaux : `node scripts/check.mjs --changed` vert (77/77 tests), puis
  `node scripts/check.mjs` vert : règles, format, lint, gel, cliquet, 1707/1707 tests JavaScript
  dans 123 fichiers et 22 tests Python. Aucune suppression de test ni hausse du gel.
  Verdict `TERMINÉ` remis dans `.harness-state/tickets/T186/verdict.json` pour la relecture de la boucle.
  Aucun commit ni push.
- Reprise après `relecture-1.md` : deux mineurs acceptés, rapport, ticket/journal, écarts,
  état Git et diff relus. Correction limitée au commentaire du filtre de session et au contexte
  explicite de diagnostic de `DeepAsk.emit`. Test public prévu avant modification ; les constats
  hors périmètre restent à la boucle. Aucun nouveau contrôle exécuté à ce jalon.
- Correction du contexte de diagnostic :
  `node --test --test-name-pattern='a publication accepts diagnostic identity' tests/deep-ask-restore.test.cjs`
  rouge observé sur `jobId` perdu (1 échec). Après signature explicite `{ sessionId, jobId }`,
  conversion des huit émissions internes et défaut depuis le travail actif :
  `node --test --test-name-pattern='a publication accepts diagnostic identity|failed publications preserve queued' tests/deep-ask-restore.test.cjs`
  vert, 3/3, avec et sans défaillance du diagnostic. Le test vérifie aussi le contexte limité à la
  session, sans fabriquer de travail, et les scénarios de file vérifient le contexte actif par défaut.
- Commentaire expliquant le confinement des questions à la session chargée rétabli à côté du
  commentaire sur le `finally`, au-dessus du filtre. Vérification à la lecture ; aucun test sur
  le texte source ajouté.
- Contrôles de la correction : `node scripts/check.mjs --changed` vert (78/78 tests), puis
  `node scripts/check.mjs` vert : règles, format, lint, gel et cliquet, 1708/1708 tests JavaScript
  dans 123 fichiers et 22 tests Python. Sorties dans `correction-1-check-changed.log` et
  `correction-1-check-full.log` du dossier d'état. Les deux mineurs sont corrigés ; nouveau verdict
  `TERMINÉ` écrit pour la relecture de correction par la boucle. Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T186/relecture-2.md : 1. `runtime/session-runtime.cjs:179-183` : hors périmètre (réserve reprise de la relecture 1, code non touché par la correction)
  - **Ce qui ne va pas :** la chaîne `feedIndex → manifest.publish → onChange` n'isole pas ses étapes. Si l'index lève, le manifeste n'est pas écrit et l'hôte n'est pas notifié pour ce tour. La transition continue et un diagnostic `watch-session` est bien émis.
  - **Attendu :** une réserve à reporter. Le périmètre du ticket n'isole que `HeadlessRuntime.emit()`.
- .harness-state/tickets/T186/relecture-2.md : 2. `app/main.cjs:306-310` et `runtime/headless-runtime.cjs:257-262` : hors périmètre (réserve reprise de la relecture 1, code non touché par la correction)
  - **Ce qui ne va pas :** `recap.observe` puis `surveillance.observe` s'exécutent avant l'envoi à la fenêtre (Mac) ou avant `this.emit()` (serveur). Si l'un des deux lève, la publication d'état de l'hôte est perdue pour ce tour.
  - **Attendu :** la partie surveillance relève de T187 ; le reste est une réserve à reporter.
- .harness-state/tickets/T186/relecture-2.md : **Écart accepté, critère 6 (évolution de l'attente de `prune()` dans `tests/session-latency.test.cjs`) :** la décision de la relecture 1 tient. Le ticket autorise explicitement ce changement, et les assertions de rétention, de retrait et d'ingestion restent en place.
