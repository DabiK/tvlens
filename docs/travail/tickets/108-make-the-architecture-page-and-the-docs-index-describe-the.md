---
id: T108
titre: Make the architecture page and the docs index describe the current code
statut: a-faire
bloque_par: T107
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`CLAUDE.md` envoie chaque session lire `docs/architecture.md`. Or la page s'ouvre sur une affirmation
fausse (« ni commitée ni déployée ») et ignore la composition `runtime/session-closing.cjs`. Elle décrit
aussi la file de perception de façon imprécise et ne renvoie à aucune des dix décisions de `docs/adr/`.
L'index `docs/README.md` affirme « Rien n'est déployé ». Il range quatre rapports datés avec la référence,
et sept documents n'y figurent pas. Après ce ticket, ces deux pages disent l'état du code sans nom de
branche, sans état de déploiement et sans décompte de tests. L'architecture renvoie à chaque ADR, et
l'index cite chaque document de premier niveau. Deux phrases fausses ou périmées sont aussi corrigées
dans `docs/installation.md` et `README.md`. Un test garde l'index et les renvois.

## Sources

- Constats : DOC-02, DOC-03, DOC-07
- Code et documents, à la version `0d5a954` :
  - `docs/architecture.md`, paragraphe d'introduction (ligne 3) : il cite quatre des cinq fichiers de
    `runtime/` et omet `runtime/session-closing.cjs` (commande : `ls runtime`). Ce fichier est appelé par `app/main.cjs` (`require`
    ligne 4) et par `runtime/headless-runtime.cjs` (ligne 18). Son en-tête (lignes 1-7) dit son rôle :
    la fin d'une session chargée, la même sur les deux hôtes.
  - `docs/architecture.md`, bandeau « État du 13 octobre 2026 » (ligne 5) : il cite la branche
    `codex/tvlens-night-features`, « ni commitée ni déployée ». Le code est committé.
    `docs/night-features-delivery.md`, section 13 (ligne 966), relate une installation sur le VPS et la
    TV le 13 octobre.
  - `docs/architecture.md`, section « De la capture à la réponse », étape 3 (ligne 26) : « deux files
    FIFO bornées (un travail actif et deux en attente chacune) ». Dans `core/session.cjs`, le
    constructeur de `WatchSession` (ligne 47) pose `maxPending = 2`. En perception séparée, `shed()`
    (lignes 147-155) saute la transcription des passages en attente au-delà de `maxPending`, puis abandonne
    le plus ancien passage entier tant que la file dépasse `maxPending * 3` (ligne 151), soit six passages
    en attente. `runtime/session-runtime.cjs` (ligne 383) construit `WatchSession` sans `maxPending` : la
    valeur par défaut s'applique.
  - `docs/architecture.md` : aucune occurrence de « adr », « session-closing », « scell », « révoqu »,
    « redemand ». Commande : `grep -ciE "adr|session-closing|scell|révoqu|redemand" docs/architecture.md`
    renvoie 0.
  - `docs/README.md`, section « Comprendre, développer, vérifier », ligne 25 : la ligne du livrable de la
    nuit finit par « Rien n'est déployé ». Les lignes 24 à 28 du tableau rangent avec la référence quatre
    rapports datés : `night-features-delivery.md`, `backend-latency-optimization.md`,
    `reinspection-transcript-reuse.md` et `publication-audit.md`.
  - Documents de `docs/` de premier niveau absents de `docs/README.md` : `active-goal.md`,
    `chat-overlay-validation.md`, `lg-companion-design.md`, `lg-pre-root-safety.md`,
    `reexamen-contract-original.md`, `research-dgx-spark-qwen38-2026-10-12.md` et `standards.md`.
    `docs/adr/`, `docs/diagrams/README.md` et `docs/architecture-improvements/index.md` n'y figurent pas
    non plus. Commande :
    `for f in $(git ls-files 'docs/*.md' | grep -v '/.*/'); do b=${f#docs/}; grep -q "]($b)" docs/README.md || echo $b; done`.
  - `docs/validation.md` s'ouvre sur « État actuel — 4 octobre 2026 ». `docs/refactor-runtime.md`, rangé
    sous « Rôles des agents », est titré « 30 septembre 2026 ».
  - `docs/installation.md`, paragraphe qui suit le bloc de code du test réel (lignes 210-212) : il affirme
    que `scripts/probe-video-chat-live.mjs` « appelle encore l'ancien pont Auto ». Le script appelle
    `window.tvlens.startSurveillance` (ligne 28).
  - `README.md`, section « Ce qui est prouvé, ce qui reste à mesurer », première puce (ligne 169) :
    « 287 tests Node et 6 tests Python… avant ses changements ». C'est un décompte daté.

## Périmètre

- À modifier :
  - `docs/architecture.md` :
    - l'introduction cite les cinq fichiers de `runtime/`, `session-closing.cjs` compris, chacun avec son
      rôle en une demi-phrase ;
    - le bandeau de la ligne 5 est retiré. Un lien vers ce qui est prouvé peut rester, sans date, sans
      branche et sans état de déploiement ;
    - l'étape 3 décrit la voie comme le fait `shed()` : deux en attente, et jusqu'à six passages en
      perception séparée, le plus ancien abandonné au-delà ;
    - une section « Décisions » est ajoutée, regroupée par thème : cycle de vie d'une session (0002, 0003,
      0005, 0006, 0007), perception (0008), résumé (0009), relecture (0010), recherche et questions (0001,
      0004). Une phrase par ADR reprend sa décision, avec un lien vers le fichier. Aucune règle nouvelle.
  - `docs/README.md` :
    - « Rien n'est déployé » est retiré ;
    - une section « Rapports datés » reçoit les quatre rapports cités, chacun avec sa date ;
    - une section « Règles et décisions » renvoie à `standards.md` et au dossier `adr/` ;
    - les sept documents absents sont indexés dans la section qui convient, d'après leur premier titre ;
      `diagrams/README.md` et `architecture-improvements/index.md` vont sous « Recherche et historique » ;
    - la colonne « Contenu » de `validation.md` et de `refactor-runtime.md` donne leur date.
  - `docs/installation.md`, lignes 210-212 : la moitié fausse de la phrase est corrigée. Le script lance
    la surveillance par `startSurveillance`. Ce qui n'est pas vérifiable (« n'a pas été rejoué ») est
    laissé tel quel.
  - `README.md`, ligne 169 : le décompte daté est remplacé par la commande qui produit le décompte actuel,
    `node scripts/check.mjs`. Le renvoi au livrable de la nuit reste. La ligne 170 et le bandeau de la
    ligne 89 ne sont pas touchés : l'état de déploiement attend une décision du propriétaire (T140).
  - À créer : `tests/documentation-index.test.cjs`. Il exige que :
    - chaque fichier `.md` de premier niveau de `docs/` (hors `README.md`) et chaque
      `docs/archive/*/README.md` soient liés depuis `docs/README.md` ;
    - chaque `docs/adr/NNNN-*.md` (hors `0000-gabarit.md`) soit lié depuis `docs/architecture.md` ;
    - `docs/architecture.md`, `docs/README.md` et `CONTRIBUTING.md` ne contiennent ni décompte de tests
      (`/\b\d+ tests?\b/`), ni nom de branche entre accents graves après le mot « branche ».

    L'univers des fichiers est celui de `tests/documentation-links.test.cjs`. Un ticket `adr: oui` de la
    boucle ajoutera un ADR. Le message d'échec doit donc dire quoi faire : « ajouter une phrase et un lien
    dans la section Décisions de docs/architecture.md ».
- À ne pas toucher : le code de production, les ADR, `CLAUDE.md`, `docs/standards.md`. Aucun document
  n'est déplacé ni renommé dans ce ticket.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/documentation-index.test.cjs` échoue sur la version `0d5a954` des documents, en
   nommant les sept documents non indexés et les dix ADR non liés. Il passe après les modifications.
   Les deux sorties sont dans le journal.
2. `grep -nE "codex/tvlens-night-features|ni commitée|Rien n.est déployé" docs/architecture.md docs/README.md`
   ne renvoie rien.
3. `grep -c "session-closing.cjs" docs/architecture.md` vaut au moins 1, et
   `grep -nE "jusqu.à six|six passages" docs/architecture.md` renvoie une ligne.
4. `grep -n "ancien pont Auto" docs/installation.md` ne renvoie rien, et
   `grep -n "startSurveillance" docs/installation.md` renvoie une ligne.
5. `grep -nE "287 tests|6 tests Python" README.md` ne renvoie rien.
6. `node --test tests/documentation-links.test.cjs` passe.
7. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

`tests/documentation-index.test.cjs`, par la frontière des fichiers publiés. Il lit les documents et la
liste des fichiers Git, sans réseau.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le ticket retire des pages de référence l'état de déploiement sans en
affirmer un autre. Les phrases de `README.md` et de `SECURITY.md` qui le portent restent à T140.

## Journal
