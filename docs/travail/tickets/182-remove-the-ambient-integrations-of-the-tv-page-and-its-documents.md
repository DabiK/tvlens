---
id: T182
titre: Remove the ambient integrations of the TV page and its documents
statut: a-faire
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

Décision attendue du propriétaire : Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert ? Et, pour que la suppression puisse passer le cliquet, autoriser l'abaissement du plancher `cas_de_test` du nombre exact de cas supprimés ?

La décision doit figurer dans cette section, même si les trois premières étapes ont été tranchées.
La boucle resserre le plancher à chaque intégration (`scripts/loop/run.mjs:407`) ; les cas appairés
ne créent aucune marge au début du ticket. T185 fournit le banc appairé. T169 attend cette étape ;
son hypothèse nommée prévoit le recadrage de dépendance si le propriétaire refuse le retrait.
La simulation de page n’établit ni l’état installé ni le rendu physique sur le moteur de la TV.

## Journal
