---
id: T165
titre: Remove the closed-panel ambient page, its build and its dedicated tools
statut: a-faire
bloque_par: T163
adr: oui
installe: non
harnais: oui
supprime_tests: oui
niveau: standard
---

## Ce que le ticket livre

Après décision écrite du propriétaire, la page d'alertes panneau fermé, son paquet et ses outils
d'essai dédiés disparaissent du dépôt. Les cartes et l'activité du panneau ouvert restent disponibles.
T166 retire ensuite superviseur/relais/routes, T181 le gate de capture et T182 les intégrations
de page et documents ; ce premier ticket ne supprime pas encore toute la chaîne ambient.

## Sources

- `docs/audit-points-chauds.md`, section D « Coupes », ambient panneau fermé.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, fichiers dédiés et tests lus en entier :
  - `tv/app/ambient.html:10` charge `surveillance-overlay.js` puis `ambient.js` ;
    `tv/app/ambient.js:99` peint après accord du contrôleur, et `tv/app/ambient.js:164`
    rapporte les touches puis ferme la page ;
  - `tv/app/ambient.css:1` ne sert qu'à cette page ; `tv/app/appinfo.ambient.json:2` lui donne
    l'identifiant `org.tvlens.ambient`, distinct de `tv/app/appinfo.json:2` pour le panneau ;
  - `scripts/package-tv-ambient.mjs:19` distingue les identifiants production/sonde et
    `scripts/package-tv-ambient.mjs:241` définit l'assemblage des paquets ;
    `scripts/package-tv-ambient.mjs:288` appelle l'empaqueteur générique LG, qui n'est pas à supprimer ;
  - `scripts/smoke-tv-ambient.mjs:15` importe ce packager ;
    `scripts/simulate-tv-ambient.mjs:1` simule le superviseur et
    `scripts/probe-tv-ambient-capture.mjs:1` reçoit les captures de sonde ;
  - `tests/tv-ambient-params.test.cjs:7` importe le parseur et
    `tests/tv-ambient-params.test.cjs:95` le packager : six cas exclusivement dédiés à ambient ;
  - `tests/tv-app-compat.test.cjs:50` attend `ambient.js` parmi les scripts, et deux cas dédiés
    commencent à `tests/tv-app-compat.test.cjs:77` et `tests/tv-app-compat.test.cjs:102` ;
  - `tv/app/surveillance-overlay.js:172` définit la file du panneau ouvert,
    `tv/app/surveillance-overlay.js:351` son parseur de paramètres ambient et
    `tv/app/surveillance-overlay.js:435` le rendu partagé ; ce fichier n'est pas dédié ;
  - `tests/tv-overlay-queue.test.cjs:1` protège les cartes, activités et file du panneau ouvert ;
    `scripts/smoke-tv-overlay.mjs:1` est lui aussi partagé, distinct du smoke à supprimer.
- Contrôle statique au même commit, sans exécution des tests : le comptage de
  `scripts/quality/metrics.mjs:74` donne 966 cas JavaScript déclarés ;
  `scripts/quality/baseline.json:8` fixe leur minimum à 966. La marge évoquée par l'audit ancien
  n'existe donc plus à cette version. Le retrait prévu enlève huit cas JavaScript dédiés.
- L'ADR 0011 décrit encore la page ambient comme second consommateur du rendu. Il reste une pièce
  historique ; un nouvel ADR consigne le retrait, sans réécrire cette décision passée.

## Périmètre

- Supprimer exactement ces huit fichiers de produit et d'outils :
  - `tv/app/ambient.html`, `tv/app/ambient.js`, `tv/app/ambient.css`, `tv/app/appinfo.ambient.json` ;
  - `scripts/package-tv-ambient.mjs`, `scripts/smoke-tv-ambient.mjs`,
    `scripts/simulate-tv-ambient.mjs`, `scripts/probe-tv-ambient-capture.mjs`.
- `supprime_tests: oui`, sous réserve de la décision ci-dessous : supprimer le fichier
  `tests/tv-ambient-params.test.cjs` et les deux cas exclusivement ambient de `tv-app-compat`.
  Retirer `ambient.js` de sa liste attendue et les imports devenus inutiles, tout en gardant les
  gardes générales de scripts classiques, d'API, de CSS et de HTML, avec leurs assertions.
- Conserver `surveillance-overlay.js`, son parseur et ses exports jusqu'au nettoyage des intégrations
  dans T182. Conserver `appinfo.json`, `index.html`, `icon.png`, les vues du panneau, les fixtures de
  file partagées et `tests/tv-overlay-queue.test.cjs`.
- Conserver `tv/ambient.py`, ses tests Python, contrôleur, capture, relais et coordination native :
  T166 et T181 les possèdent dans cet ordre. Conserver aussi `prototypes/lg-sidebar/package.py`
  et les autres prototypes LG.
- Ajouter un ADR au premier numéro libre qui nomme la capacité retirée, les huit fichiers et les
  tests retirés et le commit permettant de les retrouver. Cet ADR couvre **tout le retrait** et ses
  quatre étapes : page/outils (T165), superviseur/relais/routes et coordination native (T166), gate
  de capture et primitives résiduelles (T181), intégrations de page/documents (T182). Il décrit les
  cartes ouvertes conservées et le retrait différé de `/v1/surveillance/overlay` et de sa projection,
  sans supposer l’absence d’autres consommateurs. T166, T181 et T182 ont `adr: non` et le citent.
  Mettre à jour `docs/lg-ambient.md` pour annoncer le retrait de la page et des outils, sans transformer
  les anciennes validations non exécutées en résultats matériels.
- Après la décision du propriétaire, le plancher `cas_de_test` de `scripts/quality/baseline.json` baisse du nombre exact de cas `test(` supprimés, compté au début et à la fin de la session. C'est la seule modification du harnais permise : `harnais: oui` ne sert qu'à elle, et aucune autre mesure du cliquet ne change. Aucun cas de remplissage n'est ajouté. Les documents historiques, tickets et ADR existants ne
  font pas partie d'un critère d'absence. Aucune installation, désinstallation ou opération TV/VPS.

## Critères d'acceptation

1. Les huit fichiers dédiés sont absents. `git diff --name-status` sur le périmètre du ticket montre
   leurs suppressions et celle du test dédié ; aucun fichier partagé de panneau ou d'empaqueteur
   générique n'est supprimé. Aucun fichier n'est déplacé dans un dossier d'archives de remplacement.
2. Une recherche `rg -n` des quatre noms de scripts et des chemins de page supprimés dans le code
   produit, les scripts et les tests restants ne trouve aucun import, lecture ou lancement cassé.
   Chaque occurrence résiduelle éventuelle est classée au journal : le backend natif encore présent
   jusqu’aux étapes T166/T181 et les nouvelles mentions de retrait ne sont pas des fichiers à supprimer ici.
3. `tests/tv-app-compat.test.cjs` continue de vérifier tous les scripts, styles et pages restants.
   `tests/tv-overlay-queue.test.cjs`, les modèles du panneau et les tests de navigation passent sans
   réduction de leurs assertions sur le panneau ouvert. Les tests Python du superviseur et de la
   capture encore présents passent en séquentiel, sans appeler les outils supprimés.
4. Avant suppression, le journal inventorie les huit cas retirés et ce qu'ils vérifient. Il mesure
   le comptage M et le plancher P au début de la session. À la fin, le comptage vaut M − n et le plancher
   P − n, n étant le nombre de cas supprimés ; `git diff -- scripts/quality/baseline.json` ne montre que la
   ligne `cas_de_test`. Aucun test de remplissage n'est ajouté.
   La commande suivante et sa sortie sont consignées au journal ; elle ne liste que
   `scripts/quality/baseline.json` :
   ```sh
   git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
   ```
5. Le nouvel ADR et la page `docs/lg-ambient.md` distinguent page/outils retirés, intégrations encore
   présentes à chaque étape et cartes du panneau ouvert conservées. L’ADR décrit les quatre étapes
   ci-dessus et le maintien provisoire de l’API overlay serveur. Ils ne décrivent aucun déploiement effectué.
6. Les suites concernées sont exécutées en séquentiel, puis `node scripts/check.mjs` est vert.
   Les scripts de smoke ou de sonde ne sont pas lancés pour prouver leur suppression.

## Test d'acceptation attendu

Frontière : l'arborescence réelle pour les suppressions et les imports résiduels ;
`tests/tv-app-compat.test.cjs`, `tests/tv-overlay-queue.test.cjs`, `tests/tv-panel.test.cjs`
et `tests/tv-remote-navigation.test.cjs` pour le panneau conservé. Les suites Python de T166 sont
encore présentes et doivent charger le backend sans les outils supprimés. Les assertions qui restent
sur le panneau ouvert ne sont pas affaiblies au motif qu'ambient disparaît.

## Hypothèses bloquantes

Décision attendue du propriétaire : Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert ? Et, pour que la suppression puisse passer le cliquet, autoriser l'abaissement du plancher `cas_de_test` du nombre exact de cas supprimés ?

Ce ticket propose le premier temps de cette suppression, avec le retrait des huit cas JavaScript
dédiés cité plus haut ; `supprime_tests: oui` ne s'applique qu'après la décision inscrite au début de
cette section. T166, T181 puis T182 portent les trois étapes suivantes. Un accord écrit seulement ailleurs ne lève pas l'attente.

Fait mécanique : la boucle resserre le plancher à chaque intégration (`scripts/loop/run.mjs:407`). Au début de toute session, le comptage égale donc le plancher, et retirer un cas fait toujours passer le cliquet au rouge sans abaissement autorisé. L'état d'une TV installée n'est
pas établi et ne fait pas partie de cette suppression dans le dépôt.

## Journal
