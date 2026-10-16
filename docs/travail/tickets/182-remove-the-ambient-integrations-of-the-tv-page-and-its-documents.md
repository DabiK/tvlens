---
id: T182
titre: Remove the ambient integrations of the TV page and its documents
statut: termine
bloque_par: T181, T185
adr: non
installe: non
harnais: oui
supprime_tests: oui
niveau: standard
---

## Ce que le ticket livre

Après décision écrite du propriétaire, la page TV et ses documents actifs ne présentent plus le
chemin ambient retiré. Surveillance, activité, cartes sourcées et réglages locaux du panneau ouvert
restent utilisables. Le banc de page appairée livré par T185 prouve ce chemin.

## Sources

- `docs/audit-points-chauds.md`, section D « Coupes », ambient, et section B, banc TV non appairé.
  Décision de l'orchestrateur, le 15/10 : achever ici page/documents ; T185 livre le banc appairé commun.
- Repères vérifiés à `e92c6a6`, avant T165, T166 et T181 :
  - `tv/app/companion.js:700` prépare les appels locaux ambient ; `:762` commence le callback
    de carte montrée ; `:773` injecte ambient dans la vue et `:794` synchronise les réglages ;
  - `tv/app/surveillance-view.js:426` décrit l’état fermé, `:819` organise sa relecture et
    `:879` couple l’action serveur à l’action native ; `tv/app/index.html:73` affiche le statut ;
  - `tv/app/surveillance-overlay.js:351` parse les paramètres de la page retirée, mais `:172`
    définit la file ouverte et `:435` le rendu partagé : ne pas supprimer ce module ;
  - `tv/app/sessions-view.js:337` présente les compteurs du gate retiré par T181 ;
    `tests/tv-panel.test.cjs:414` est le cas dédié à l’état fermé, et `:517` commence les
    assertions de capture mixtes : seuls les fragments de gate disparaissent ;
  - `tests/tv-panel.test.cjs:214` teste un 404 générique de transport sur `/ambient` : ce cas
    ne requiert pas cette route et reste ; `tests/tv-overlay-queue.test.cjs:1` protège les cartes ;
  - `scripts/smoke-tv-overlay.mjs:90` simule le contrôleur local tout en protégeant le panneau ;
    `tests/server-surveillance.test.cjs:175` protège `/v1/surveillance/overlay` et ses ETags ;
  - les documents actifs sont `docs/lg-ambient.md:16`, `docs/architecture.md:106`,
    `docs/interface.md`, `docs/server-installation.md` et `README.md` : y relever les instructions
    ambient restantes au lancement, sans réécrire les validations datées.
- L’ADR de retrait créé par T165 couvre cette étape et le retrait différé de l’API overlay serveur.
  Citer son numéro livré ; `adr: non`, aucune obligation d’ajouter ou compléter un ADR ici.
- T185 livre `tests/helpers/tv-page.cjs` et `tests/tv-paired-page.test.cjs` : relire leurs interfaces
  livrées et réutiliser le document, les événements, le réseau et les minuteries injectables.

## Périmètre

- Retirer du companion et des vues appels `/ambient`, déclarations `seen` au contrôleur, lecture
  d’état fermé, synchronisation de réglages et textes/éléments dédiés. Garder les compteurs locaux
  de cartes vues, activité, démarrage/arrêt serveur, `alerts` et `displayMs` du panneau ouvert.
- Retirer `parseAmbientParams` et ses exports de `surveillance-overlay.js`, en conservant modèles,
  file et rendus partagés. Retirer les présentations des compteurs de gate dans `sessions-view.js`.
- `supprime_tests: oui`, après décision : supprimer le seul cas JavaScript d’état fermé
  (`tests/tv-panel.test.cjs:414`) et les assertions exclusivement gate des cas mixtes. Conserver
  leurs autres assertions : transport, capture, stockage, sessions, cartes et surveillance.
  Les suppressions ambient déjà effectuées par T165/T166/T181 ne sont pas recomptées ici.
- Compléter `tests/tv-paired-page.test.cjs` en réutilisant le banc livré par T185, sans le construire
  ni enrichir son DOM ici. Ajouter le scénario de surveillance du panneau ouvert et ses assertions
  d'absence d'appels `/ambient`, en conservant les cas appairés et non appairés déjà livrés.
- Adapter seulement les mocks ambient des smokes partagés, en conservant les scénarios du panneau.
  Mettre à jour `docs/lg-ambient.md`, `docs/architecture.md`, `docs/interface.md`,
  `docs/server-installation.md` et `README.md` : capacité retirée, lien vers l’ADR T165 et cartes
  ouvertes conservées. Préserver les faits datés sur installations/validations, sans annoncer de déploiement.
- Après décision, abaisser la seule ligne `cas_de_test` de `scripts/quality/baseline.json` du
  nombre exact n de cas JavaScript supprimés ici. `harnais: oui` est limité à cette ligne ; aucune
  autre mesure ne change. Le nombre a de nouveaux cas de ce ticket est relevé séparément : ce sont des preuves
  comportementales, sans remplissage. Il ne réduit pas la baisse autorisée de n.
- Conserver `/v1/surveillance/overlay`, sa projection runtime, ses champs et ses ETags. Son retrait
  est différé selon l’ADR T165. Ne pas modifier les politiques de capture ou les autres vues ;
  aucun accès TV/VPS, fournisseur, installation ou modification des documents historiques.

## Critères d'acceptation

1. `rg -n '/ambient|parseAmbientParams|describeAmbient|surv-ambient|gateStale|framesCropped|framesWithheld' tv/app`
   ne trouve plus d’intégration active du chemin fermé. Les mentions éventuelles de retrait sont
   classées au journal ; aucun import ni lecture d’un élément retiré ne reste cassé.
2. La page appairée ouvre la surveillance, la démarre/l’arrête sur le serveur et affiche une carte
   sourcée dans le panneau ouvert, sans appel local `/ambient`. Activité, alertes et durée locales
   restent utilisables ; les tests observent nœuds et appels des vrais scripts, sans lecture de leur texte.
3. Le scénario du critère 2 utilise `tests/helpers/tv-page.cjs` livré par T185 et ses points
   d'injection existants. Les cas appairés et de navigation non appairée gardent leurs assertions ;
   `git diff --exit-code -- tests/helpers/tv-page.cjs` rend 0, sortie consignée au journal.
4. Les suites de file, modèles, sessions, navigation et serveur gardent leurs assertions sur les
   capacités conservées. Le 404 générique de transport et les ETags overlay serveur restent vérifiés.
5. Au début M = P, sans marge présumée : le journal relève M, P, les n cas supprimés et les a cas
   comportementaux ajoutés. À la fin M − n + a est **supérieur ou égal** à P − n ; le plancher
   baisse exactement de n, même si les nouveaux cas compensent le retrait. Le diff de baseline ne
   montre que `cas_de_test`. Aucun cas n’est ajouté pour remplir le compteur.
   La commande suivante et sa sortie sont consignées au journal ; elle ne liste que
   `scripts/quality/baseline.json` :
   ```sh
   git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
   ```
6. Les documents actifs annoncent le retrait et ses étapes en renvoyant à l’ADR T165. Une recherche
   `rg -n` de leurs anciennes commandes/chemins retirés ne rend que les faits datés ou mentions
   explicites de retrait, classés au journal ; tickets, rapports et anciens ADR restent historiques.
7. Les tests JavaScript concernés et les suites Python de capture/contrôle et mapper/panneau sont
   exécutés en séquentiel, ces derniers explicitement ; puis `node scripts/check.mjs` est vert.
   Aucun smoke natif, navigateur, packaging ou service réel n’est requis pour cette preuve.

## Test d'acceptation attendu

`tests/tv-paired-page.test.cjs`, frontière : scripts chargés depuis la vraie page dans le banc
`tests/helpers/tv-page.cjs` livré par T185, avec document réutilisable, réseau et temps contrôlés.
Le scénario ajouté ici vérifie surveillance, carte et réglages sans ambient.

## Hypothèses bloquantes

Décision du propriétaire, le 15/10 (« Oui », en réponse à la question posée) : oui. Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert, et autoriser l'abaissement du plancher `cas_de_test` du nombre exact de cas supprimés.

La décision doit figurer dans cette section, même si les trois premières étapes ont été tranchées.
La boucle resserre le plancher à chaque intégration (`scripts/loop/run.mjs:407`) ; les cas appairés
ne créent aucune marge au début du ticket. T185 fournit le banc appairé. T169 attend cette étape ;
son hypothèse nommée prévoit le recadrage de dépendance si le propriétaire refuse le retrait.
La simulation de page n’établit ni l’état installé ni le rendu physique sur le moteur de la TV.

## Journal

- Cadrage : skills `ticket-codex` et `tests`, règles, ADR 0017/0011 et intégrations relus.
  Témoin de hooks présent. Exploration et écarts consignés dans `.harness-state/tickets/T182/`.
  `git status --short` : ticket déjà modifié (en-cours), `design/continuous-context/` et `experiments/`
  non suivis ; travail initial conservé. `git diff` : seul le statut du ticket différait de HEAD.
- Mesure initiale : `node scripts/quality/ratchet.mjs` → `cas_de_test: 1270` ; baseline `P = 1270`.
  Donc `M = P`, sans marge. Retrait autorisé `n = 1` : cas `ambient display, read on the local
  controller, is told in plain words` de `tests/tv-panel.test.cjs`. Ajout prévu `a = 1` : parcours
  de surveillance appairée sans ambient, sans modification du helper T185.

- Rouge observé : `node --test --test-name-pattern='the open panel controls' tests/tv-paired-page.test.cjs`
  → 1 échec sur l’assertion d’absence : `GET http://controller.test/ambient` à l’ouverture de la vue.
  Sortie complète : `red-paired.log` dans le dossier d’état.
- Vert observé après retrait : même commande → 1 cas réussi, 0 échec (`green-paired.log`).
  Le scénario exerce démarrage/arrêt serveur authentifiés, carte sourcée, activité, durée locale effective,
  alertes, stockage local, compteur de carte vue et cinq secondes de minuterie sans `/ambient`.
  Les anciens cas appairés restent présents ; le helper et la navigation non appairée restent inchangés.
- Implémentation : retrait des appels, modèle fermé, relecture, réglages synchronisés, parseur et compteurs gate.
  L’avis de géométrie du panneau ouvert reste sous `surv-overlay` (HTML, CSS, vue et smoke cohérents).
  Un seul cas supprimé (`n = 1`), un seul cas comportemental ajouté (`a = 1`). Le 404 générique reste,
  avec `/unknown` à la place de `/ambient` ; les assertions mixtes hors gate sont conservées.
- `node scripts/check.mjs --changed` → rouge : règles, format, gel, cliquet et 26 tests verts ;
  lint refuse des suppressions devenues inutiles. Selon `docs/standards.md`,
  `node_modules/.bin/eslint --prune-suppressions tv/app/companion.js tv/app/sessions-view.js tv/app/surveillance-overlay.js tv/app/surveillance-view.js`
  → code 0. Diff de `eslint-suppressions.json` : complexité overlay 5→4 et vue 9→8,
  suppression `max-lines` overlay retirée ; aucune hausse ni nouveau gel (`prune-lint.log`).
- `node --test --test-concurrency=1 tests/tv-paired-page.test.cjs tests/tv-panel.test.cjs tests/tv-overlay-queue.test.cjs tests/tv-remote-navigation.test.cjs tests/tv-app-compat.test.cjs tests/tv-text.test.cjs tests/chat-error-ui.test.cjs tests/server-surveillance.test.cjs tests/server-sessions.test.cjs`
  → 103 tests réussis, 0 échec (`node-targeted.log`). File, modèles, sessions, navigation non appairée,
  compatibilité et contrats serveur/ETags conservés. `node --check scripts/smoke-tv-overlay.mjs` → code 0.

- Suites Python exécutées l’une après l’autre (`python-targeted.log`), toutes code 0 :
  `python3 -m unittest tests/test_tv_capture.py` → 9 tests OK ;
  `python3 -m unittest tests/test_tv_control.py` → 13 tests OK ;
  `python3 prototypes/lg-remote/test_mapper.py` → 3 tests OK ;
  `python3 prototypes/lg-remote/test_panel.py` → 14 tests OK.
  Cette dernière émet un `ResourceWarning` de fichier `panel.lock` non fermé à la ligne 164 du test,
  sans échec ; code Python inchangé, constat hors périmètre.
- `node scripts/check.mjs --changed` après élagage → vert : règles, format, lint, gel, cliquet,
  26 tests JS réussis, 0 échec (`check-changed-final.log`).
- `rg -n '/ambient|parseAmbientParams|describeAmbient|surv-ambient|gateStale|framesCropped|framesWithheld' tv/app`
  → code 1, aucune ligne. Aucune mention active ni mention de retrait à classer dans `tv/app`.
- `git diff --exit-code -- tests/helpers/tv-page.cjs` → code 0, aucune sortie.
- `git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop`
  → code 0, sortie unique : ` M scripts/quality/baseline.json`.
  `git diff -- scripts/quality/baseline.json` ne montre que `cas_de_test: 1270 → 1269`.
- Mesure finale : `node scripts/quality/ratchet.mjs` → `cas_de_test: 1270`.
  `M − n + a = 1270 − 1 + 1 = 1270 ≥ P − n = 1269`. Baisse exacte de 1,
  sans compensation du retrait par le nouveau cas ; les autres lignes du plancher restent identiques.
- Documents actifs actualisés : retrait achevé, étapes et ADR 0017 cités, cartes ouvertes et API overlay
  serveur conservées. Le corps historique du 13 octobre dans `docs/lg-ambient.md` reste inchangé.
  Recherche exécutée (`acceptance-evidence.log`) :
  `rg -n 'tv/ambient.py|/ambient|parseAmbientParams|TVLENS_AMBIENT|ambient-settings|package-tv-ambient|smoke-tv-ambient|simulate-tv-ambient|probe-tv-ambient|ambient\.json|focus:"relay"' docs/lg-ambient.md docs/architecture.md docs/interface.md docs/server-installation.md README.md`
  → code 0 ; classification : `docs/architecture.md:120` dit explicitement l’absence d’appel ;
  `docs/lg-ambient.md:10–12,21,23,28` décrivent le retrait. Toutes ses autres occurrences (51–288)
  appartiennent à « Historique au 13 octobre 2026 », protocole abandonné inclus.
  Aucune ancienne commande active dans README, interface ou installation serveur.
  Les faits datés d’installation/validation sont conservés, aucun déploiement annoncé.
- Smoke partagé : mock ambient supprimé (404), attentes de déclarations/état retiré remplacées par
  absence d’appels ; scénarios de cartes, panneau, historique, sessions et serveur conservés.
  Smoke navigateur, natif, Electron, packaging, TV/VPS et fournisseurs réels non exécutés,
  non requis pour cette preuve. Le contrôle complet est en cours.

- Contrôle final : `node scripts/check.mjs` → code 0, **vert** (`check-full.log`) : règles,
  format, lint, gel et cliquet verts ; 116 fichiers JavaScript, **1 459 tests réussis, 0 échec** ;
  découverte Python : **22 tests OK**. Les quatre suites Python exigées ont aussi été exécutées
  explicitement en séquentiel, comme détaillé plus haut (39 tests OK au total).
- Vérifications de clôture : `git diff --check` → code 0 ;
  `git diff --unified=0 -- tests/tv-panel.test.cjs tests/tv-paired-page.test.cjs | rg '^[+-]test\('`
  → uniquement le nouveau parcours ouvert ajouté et le cas d’état fermé supprimé.
  `git diff --exit-code -- runtime server tests/helpers/tv-page.cjs tests/tv-remote-navigation.test.cjs`
  → code 0, aucune sortie ; même résultat pour capture/contrôleur/transport et `prototypes/lg-remote`.
  Comparaison exacte de l’historique `docs/lg-ambient.md` après son titre daté avec HEAD : identique.
  Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T182/verdict.json`. Aucun commit ni push.

- Reprise après `relecture-1.md` : rapport, ticket/journal, écarts, `git status --short` et
  `git diff` relus ; exploration de correction consignée. Trois mineurs confirmés, aucun écart
  prévu ni contestation ; constats 4 à 7 conservés hors périmètre. Ajout prévu d'un second cas
  comportemental (`a = 2`) : callback public d'une carte affichée, comptage unique après interruption
  et réinitialisation à la session suivante, sans argument de session devenu inutile.
- Rouge de correction observé :
  `node --test --test-name-pattern='an open overlay reports' tests/tv-paired-page.test.cjs`
  → 1 échec sur `the callback receives only the drawn card`, à cause de l'argument session
  surnuméraire (`correction-red-callback.log`).
  `node_modules/.bin/eslint --no-config-lookup --suppressions-location .harness-state/tickets/T182/empty-suppressions.json --rule 'no-nested-ternary:error' tv/app/surveillance-view.js`
  → code 1, dix ternaires imbriqués, dont la ligne 745 visée (`correction-red-ternary.log`) ;
  le fichier de suppressions temporaire contient `{}`, aucune configuration du dépôt n'est modifiée.
- Correction 1 : table renommée `countedSequences`, commentaire/JSDoc centrés sur le compteur local,
  callback limité à la carte. Le nouveau cas passe avec le callback public, le retrait/réaffichage
  après interruption et la réinitialisation du comptage à la session suivante : même commande →
  1 test réussi, 0 échec (`correction-green-callback.log`).
- Correction 2 : avis du panneau ouvert choisi par `if`/`else if`.
  Le contrôle rapide du hook a signalé la suppression devenue inutile ;
  `node_modules/.bin/eslint --prune-suppressions tv/app/surveillance-view.js` → code 0,
  gel `no-nested-ternary` 10→9, aucune hausse (`correction-prune-lint.log`).
- Correction 3 : commentaire du mock dans `scripts/smoke-tv-end-to-end.mjs` actualisé : les routes
  retirées répondent 404, le panneau ne les appelle plus. Comportement inchangé ;
  `node --check scripts/smoke-tv-end-to-end.mjs` → code 0, smoke navigateur non exécuté.
- `node scripts/check.mjs --changed` → vert, 27 tests réussis, 0 échec
  (`correction-check-changed.log`).
  `node --test --test-concurrency=1 tests/tv-paired-page.test.cjs tests/tv-panel.test.cjs tests/tv-overlay-queue.test.cjs tests/tv-remote-navigation.test.cjs tests/tv-app-compat.test.cjs tests/tv-text.test.cjs tests/chat-error-ui.test.cjs tests/server-surveillance.test.cjs tests/server-sessions.test.cjs`
  → 104 tests réussis, 0 échec (`correction-node-targeted.log`).
- Suites Python rejouées explicitement en séquentiel (`correction-python-targeted.log`) :
  `python3 -m unittest tests/test_tv_capture.py` → 9 tests OK ;
  `python3 -m unittest tests/test_tv_control.py` → 13 tests OK ;
  `python3 prototypes/lg-remote/test_mapper.py` → 3 tests OK ;
  `python3 prototypes/lg-remote/test_panel.py` → 14 tests OK. Tous les codes sont 0 ;
  le `ResourceWarning` déjà consigné sur `panel.lock` est encore présent, sans échec.
- Preuves de conservation (`correction-acceptance-evidence.log`) :
  `git diff --check` → code 0 ;
  `git diff --exit-code -- tests/helpers/tv-page.cjs tests/tv-remote-navigation.test.cjs runtime server tests/server-surveillance.test.cjs tv/capture.py tv/control.py tv/transport.py prototypes/lg-remote`
  → code 0, aucune sortie. Comparaison avec `git show HEAD:tests/tv-paired-page.test.cjs` :
  tous les cas appairés livrés à HEAD sont conservés comme préfixe exact du fichier courant.
  Les recherches des intégrations retirées dans `tv/app` et de `declared`/`onShown(card, …)`
  dans la vue rendent code 1, aucune occurrence.
- Mesure après correction : `node scripts/quality/ratchet.mjs` → `cas_de_test: 1271`.
  `M = P = 1270`, `n = 1`, `a = 2` ; `M − n + a = 1271 ≥ P − n = 1269`.
  `correction-test-diff.log` ne montre que les deux cas comportementaux ajoutés et le seul retrait
  autorisé. La baseline conserve exactement sa baisse de 1 sur `cas_de_test`.
  `git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop`
  → sortie unique ` M scripts/quality/baseline.json`.
- Réserves de relecture conservées pour un cadrage ultérieur : `OverlayQueue.seen` (constat 4),
  index `docs/README.md` (5), commentaires runtime/serveur sur l'ancien consommateur de l'API overlay (6),
  mock et filtre `/ambient` du cas appairé antérieur (7). Aucun de ces fichiers ou comportements
  n'est modifié pour cette correction. Smokes navigateur/natifs et matériel non exécutés, non requis.
- Contrôle complet après correction : `node scripts/check.mjs` → code 0, **vert**
  (`correction-check-full.log`) : règles, format, lint, gel et cliquet verts ; 116 fichiers JS,
  **1 460 tests réussis, 0 échec** ; découverte Python : **22 tests OK**.
  `git diff --check` final → code 0. Les trois mineurs de la relecture 1 sont corrigés ;
  nouveau verdict `TERMINÉ` écrit dans le dossier d'état, avec réserves 4 à 7 et vérifications
  non requises non exécutées. Aucun commit, push, enregistrement d'état relu ni relecteur lancé.

### Réserves à la clôture

- Constat 4 hors périmètre : OverlayQueue.prototype.seen et sa documentation résiduelle restent avec la file, ses fixtures et ses tests ; reprise au cadrage différé du retrait de l'API overlay.
- Constat 5 hors périmètre : description ancienne de lg-ambient.md dans docs/README.md ; reprise dans un ticket documentaire.
- Constat 6 hors périmètre : commentaires de runtime/headless-runtime.cjs, runtime/state-views.cjs et tests/server-surveillance.test.cjs citant l'ancien consommateur ambient ; reprise avec le retrait différé de l'API overlay.
- Constat 7 hors périmètre : mock /ambient et filtre du premier cas appairé antérieur conservés ; le scénario ajouté couvre l'absence d'appels, les assertions des cas livrés restent inchangées.
- Smokes navigateur/natifs, Electron, packaging et vérification physique TV/VPS non exécutés, non requis par le ticket. Aucune preuve de déploiement ou de rendu matériel.
- ResourceWarning préexistant dans prototypes/lg-remote/test_panel.py:164 sur panel.lock non fermé, observé sans échec ; code Python inchangé.
- .harness-state/tickets/T182/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 4 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
