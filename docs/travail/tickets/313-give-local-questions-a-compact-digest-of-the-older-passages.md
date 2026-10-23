---
id: T313
titre: Give local questions a compact digest of the older passages before the recent ones
statut: termine
bloque_par:
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une question de chat posée à la voie locale (Ollama) reçoit, avant ses six passages récents, un journal compact des
passages plus anciens de la session : la transcription de chaque passage, et une ligne « Image : » quand le sujet
change. Ces entrées sont citables. Aujourd'hui, seul le proxy de mesure des essais GX10 injecte ce journal ; la voie
locale du produit ne voit que les six derniers passages et s'abstient ou invente sur les faits plus anciens.

## Sources

- Mesure qui justifie l'intégration, `experiments/essais/2026-10-22-flux-60-questions-gx10/README.md` (J2 contre J3, 60
  questions dans le flux réel, code `2035a2f`, ancêtre de `097807b` sans écart dans `core/`, `adapters/`, `runtime/`,
  `server/`) : 38 réponses pertinentes contre 28, 9 inventions contre 16, faits entièrement anciens 6/19 contre 0/19,
  questions récentes inchangées (25/33), délai médian 6,3 s contre 5,0 s.
- Prototype de référence : `with_journal` dans `experiments/essais/2026-10-21-flux-journal-deux-phases-gx10/ollama_proxy-e7.py`
  (`:48-77`) et `block_journal` / `thin` dans `experiments/essais/2026-10-22-journal-hors-ligne-gx10/scripts/construire_g5.py`
  (`:50-66`, bras B de G5).
- Exploration du 22/10 à `097807b` (orchestrateur hors boucle), code concerné :
  - `core/video-tools.cjs:174-195` : `context({intent})` ; fenêtre `limit = intent==='recap'?120:6` (`:177`, littéral) ;
    `passages: this.remember(usable.slice(-limit),'context')` et `omittedCount: max(0, usable.length-limit)` (`:191`) ;
    `usable` = passages du préfixe figé qui ont une observation utilisable (`hasUsableObservation`).
  - `core/video-tools.cjs:37-46` : `toolPassage` ; un passage outil porte `observation` (`transcript`, `visual`,
    `topic`, …), `available`, `hasImages: false` pour un passage son seul, `mediaReason`.
  - `core/video-tools.cjs:11-15` : `mediaEvidenceFields` ; `:120-137` : `record` (audit des lectures, plafonné à 400
    entrées, publié par `freshness()` en `journalEntries` / `journalDropped`) et `remember` (preuves `memoryEvidence`).
  - `core/deep-ask.cjs:239-255` : validation des citations en chat contre `transcriptEvidence`, `memoryEvidence`,
    `observations` et `priorEvidence` (preuves des questions terminées, `endMs <= anchorMs`), par id et intervalle
    (±1 ms). Sans citation valide, la réponse devient « Je n’ai pas pu relier cette réponse aux passages consultés. ».
    `memoryEvidence` ne sert qu'à cette validation.
  - `runtime/conversation-runtime.cjs:63` : `const backend = config.questionsBackend ?? 'codex'` ; `:65-88` : `makeTools`
    construit `new VideoTools({...})` pour les deux hôtes (`app/main.cjs:157`, `runtime/headless-runtime.cjs:128`).
  - `adapters/codex-session-agent.cjs:93-100` : Codex garde un fil et reçoit les passages nouveaux ou modifiés ; la voie
    locale reconstruit chaque question sans fil (ADR 0057). Le journal ne vise donc que la voie locale.
  - `adapters/companion-prompt.cjs:153-170` (`buildLocalPrompt`) met `context` tel quel dans le bloc de données non
    fiables : aucune modification de l'agent ni du prompt n'est nécessaire.
- Écarts relevés entre le prototype et le produit, tranchés ici par l'orchestrateur :
  1. Dans J3, les entrées injectées par le proxy n'étaient pas citables (absentes de `memoryEvidence`) ; 8 des 9 réponses
     remplacées par la phrase de validation sont des réponses J3. Le produit les rend citables : une citation doit tomber
     dans un passage réellement consulté (`docs/domaine.md:114-115`), et ces passages le sont.
  2. Le proxy ne reprenait que les blocs passés par la vision ; le produit reprend tous les passages utilisables plus
     anciens que la fenêtre (paroles seules comprises), ce qui garde `omittedCount` cohérent.
  3. Le proxy calculait l'id `moment-(startMs//8000+1)` et mettait `available: true` en dur ; le produit garde l'id et la
     disponibilité réels du passage.
  4. Le proxy réécrivait toute question ; le produit limite le journal au chat sans intention (`recap` a sa fenêtre de
     120 et sa consigne d'intervalle, `explain-moment` ses propres règles).
- ADR à respecter : 0004 (preuves rendues au retour de l'agent, aucune minuterie), 0029 et 0044 (un module plat
  `core/*.cjs` peut importer `core/shared/**`), 0046 et 0061 (le journal se construit sur le préfixe figé de la
  consultation, sans nouvelle lecture), 0053 (aucun changement de `passageText` ni de `continuesTopic`), 0055 (aucune
  expiration, d'où le plafond), 0057 (limites dans `VideoTools`, citations dans DeepAsk, rien dans l'agent), 0062 (son
  seul : aucune ligne « Image »).

## Périmètre

- À modifier :
  - Nouveau module pur `core/older-passage-digest.cjs` (nom indicatif, sans le mot « journal », déjà pris par l'audit
    des lectures de `VideoTools`). Entrée : les passages outil utilisables plus anciens que la fenêtre récente, dans
    l'ordre chronologique. Sortie : les entrées compactes, dans le même ordre :
    - `{ id, startMs, endMs, text, precision: 'compact-journal', available }` avec l'id et `available` réels du passage,
      plus `hasImages: false` et `mediaReason` comme `mediaEvidenceFields` pour un passage son seul ou illisible ;
    - `text` = `observation.transcript` sans blancs de bord, ou « (pas de parole transcrite) » s'il est vide ;
    - suivi de `"\nImage : "` et des 300 premiers caractères de `observation.visual` si ce visuel n'est pas vide et que
      l'entrée est l'une des deux premières de la liste avant amincissement, ou que son `observation.topic` diffère de
      celui du passage précédent (le sujet précédent avance à chaque passage, avec ou sans visuel) ;
    - plafond : tant que la somme des longueurs de `text` dépasse 10 000 caractères et qu'il reste plus de 3 entrées,
      retirer l'entrée d'indice `2 + floor((n - 3) / 2)` (les deux premières et la dernière restent) ;
    - constantes nommées une seule fois : plafond 10 000, visuel 300, deux premières entrées avec image, libellé de
      parole absente, préfixe « Image : », valeur de `precision`.
  - `core/video-tools.cjs` : une option du constructeur, absente par défaut (nom indicatif `olderPassageDigest: true`).
    Avec l'option et une question sans intention, `context()` place les entrées compactes avant les passages récents,
    sur la même liste `usable` et dans le même appel que ceux-ci, et réduit `omittedCount` du nombre d'entrées placées
    (au moins 0). Les entrées placées deviennent des preuves de `memoryEvidence` (id et intervalle suffisent à DeepAsk),
    sans passer par l'audit des lectures (`record`) et sans remplacer une preuve déjà présente pour le même passage ;
    une lecture complète ultérieure du même passage par un outil la remplace comme aujourd'hui. Sans l'option, ou avec
    une intention, `context()` est inchangé. La fenêtre récente de 6 et celle du récapitulatif (120) deviennent des
    constantes nommées sans changer de valeur. `context()` reste sous la complexité gelée : la logique va hors d'elle.
  - `runtime/conversation-runtime.cjs` : `makeTools` passe l'option seulement quand `backend === 'local'`. Aucun réglage
    nouveau : la voie locale reçoit toujours le journal, Codex jamais.
  - Tests (voir plus bas), un ADR court `docs/adr/0072-…` (d'abord numérotée 0064) (0063 est réservé par T309 sur la branche
    `feat/recherche-web-locale`) et son lien dans la section « Décisions » de `docs/architecture.md`
    (`tests/documentation-index.test.cjs` l'exige).
- À ne pas toucher :
  - `adapters/ollama/question-agent.cjs`, `adapters/companion-prompt.cjs`, `adapters/ollama/question-response.cjs` :
    une autre branche (`feat/recherche-web-locale`, T308 à T312) les modifie en ce moment ;
  - `tests/ollama-question-agent.test.cjs` : n'y ajouter un test qu'en fin de fichier si un test traversant le vrai agent
    local est indispensable ; ne rien y modifier ;
  - `core/deep-ask.cjs` (ses règles de preuves restent les mêmes), `core/shared/passage-text.cjs`, la perception, la
    mémoire, le backend Codex, `adapters/config.cjs` et `scripts/local-stream-input.cjs` (aucun réglage nouveau) ;
  - `experiments/` : la note pour couper la réécriture du proxy est l'affaire de l'orchestrateur, hors boucle.

## Critères d'acceptation

1. Le module pur, testé dans `tests/older-passage-digest.test.cjs` (nom à suivre si le module est nommé autrement) :
   transcription rognée ou libellé de parole absente ; ligne « Image » sur les deux premières entrées et à chaque
   changement de sujet, tronquée à 300 caractères ; aucune ligne « Image » sans visuel, en particulier pour un passage
   son seul, qui garde `hasImages: false` et `mediaReason: 'images-absent'` ; id et `available` réels ; ordre
   chronologique ; amincissement au milieu sous 10 000 caractères qui garde les deux premières et la dernière entrée,
   jamais en dessous de 3 entrées.
2. `VideoTools` avec l'option, par `context()` : avec 10 passages utilisables, 4 entrées `compact-journal` puis les 6
   récentes dans l'ordre chronologique, et `omittedCount` à 0 ; avec un journal aminci, `omittedCount` égale le nombre de
   passages retirés ; avec `intent: 'recap'` ou `intent: 'explain-moment'`, le contexte est identique à celui obtenu sans
   l'option. Les tests existants qui construisent `VideoTools` sans l'option restent verts sans modification.
3. Citabilité, par la composition et DeepAsk (voie locale) : une réponse qui cite un passage du journal garde sa
   citation (`job.validation.acceptedCitations`), une citation d'un passage retiré par l'amincissement est refusée,
   et l'audit des lectures (`freshness().journalEntries`) ne compte pas les entrées du journal.
4. Composition, dans `tests/conversation-runtime.test.cjs` (agents injectés qui capturent `input.context`) : avec
   `questionsBackend: 'local'`, le contexte d'une question de chat sans intention porte les entrées compactes avant les
   récentes ; avec la configuration Codex et la même mémoire, le contexte est inchangé (aucune entrée `compact-journal`).
5. L'ADR `docs/adr/0072-…` (d'abord numérotée 0064) dit la décision, les quatre écarts tranchés avec le prototype et les alternatives écartées
   (proxy, journal construit dans l'agent ou le prompt local, journal dans DeepAsk, interrupteur de configuration) ; il
   est lié depuis `docs/architecture.md`.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/conversation-runtime.test.cjs` : une session de dix passages utilisables, une question de chat ancrée après le
dixième, composée avec `questionsBackend: 'local'` et un agent local injecté qui capture `input.context` et répond en
citant le premier passage. Le contexte capturé commence par quatre entrées `precision: 'compact-journal'` (ids réels des
passages 1 à 4), suivies des six passages récents, avec `omittedCount: 0` ; la réponse garde sa citation. La même
question avec la configuration Codex ne contient aucune entrée `compact-journal` et garde `omittedCount: 4`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Choix retenus par l'orchestrateur le 22/10, à rappeler dans l'ADR : journal citable ; passages à paroles seules inclus ;
chat sans intention seulement ; voie locale seulement, sans interrupteur (un A/B se fait entre deux commits) ; valeur
`precision: 'compact-journal'` gardée telle que le modèle l'a vue pendant la mesure. L'effet de la citabilité n'a pas été
mesuré : un essai dans le flux réel sur la GX10, sans réécriture du proxy, suivra l'intégration hors boucle.

## Journal

Rempli pendant le traitement : un jalon par étape, avec la commande lancée et son résultat réel.
Rien au-dessus de cette ligne ne se modifie pendant le traitement.

- 22/10, orchestrateur, cadrage : première tentative, aucun jalon antérieur ; `docs/standards.md` lu.
- 22/10, exploration (`explorateur`, rapport dans `.harness-state/tickets/T313/exploration.md`) : aucune contradiction
  de périmètre ; lignes citées exactes (sauf `mediaEvidenceFields` en `:12-15`). `context()` est à une complexité de 14
  sur 15, non gelée : la fenêtre sort dans une méthode. `mediaEvidenceFields` est privée à `video-tools` : elle part dans
  `core/shared/media-evidence.cjs` (écart déclaré dans `ecarts.md`). Une preuve sans `revision` ni `consultedAt` est
  remplacée par toute lecture ultérieure, ce que veut le ticket. Le test local doit fournir `localQuestions` car
  `createQuestionAgent` valide la config même avec un agent injecté. Ne rien écrire d'autre que l'unique `Date.now`
  dans `video-tools` (garde temps textuelle).
- 22/10, implémentation (`implementeur`) : `core/older-passage-digest.cjs`, `core/shared/media-evidence.cjs`,
  `core/video-tools.cjs` (constantes de fenêtre, `contextWindow`, `rememberDigest`, option `olderPassageDigest`),
  `runtime/conversation-runtime.cjs` (option si `backend === 'local'`), tests dans `tests/older-passage-digest.test.cjs`
  et `tests/conversation-runtime.test.cjs`. Rouge vu à chaque incrément (mutations temporaires pour DeepAsk) ;
  `node scripts/check.mjs` rapporté vert par l'implémenteur (3050 tests JS, 71 Python).
- 22/10, ADR : `docs/adr/0064-les-questions-locales-recoivent-un-condense-citable-des-passages-anciens.md`, lié depuis
  `docs/architecture.md` ; `node --test tests/documentation-index.test.cjs` vert.
- 22/10, relecture 1 (`relecture-1.md`) : à corriger, 0 bloquant, 3 mineurs. Écarts `media-evidence.cjs` et sujet
  normalisé acceptés. Corrections : cas `recap` rendu discriminant (130 passages, rouge vu sur une garde mutée) ;
  visuel repris brut comme dans le ticket et le prototype (rouge vu) ; causalité retirée de l'ADR.
  `node scripts/check.mjs --changed` : vert (26 tests).
- 22/10, relecture 2 (correction, `relecture-2.md`) : accepté, 0 bloquant, 0 mineur, 0 hors périmètre, 0 non corrigé.
- 22/10, contrôle : `node scripts/check.mjs` sur l'état relu : vert, 3050 tests JS sur 155 fichiers, 71 tests Python ;
  cliquet `cas_de_test_produit` 1633 → 1655.

### Réserves à la clôture

- Écart accepté, critère 1 : mediaEvidenceFields déplacée à l'identique dans core/shared/media-evidence.cjs (fichier hors liste du périmètre), pour éviter une dépendance circulaire et une duplication.
- Écart accepté, critère 1 : le sujet absent est comparé comme un sujet vide (topic ?? ''), comme le prototype qui lisait get('topic', '').
- Non vérifié : aucun essai réel avec le vrai agent Ollama ni sur la GX10 ; l'effet de la citabilité et le poids du condensé (environ 2 500 à 3 000 jetons au plafond) face à numCtx restent à mesurer hors boucle, proxy sans réécriture.
- Question pour le propriétaire : un visuel fait uniquement de blancs reçoit une ligne « Image » vide, comme dans le prototype et le texte du ticket ; à rogner si l'essai réel le montre gênant.

### Intégration sur main

- 23/10, intégration sur main (session expériences, décision de Dabi) : cherry-pick des deux commits de
  `feat/journal-memoire-local` sur `origin/main` (recherche web T308–T318 comprise), dans le worktree `../tvlens-t318`,
  branche `feat/journal-et-echeance`. L'ADR 0064 devient 0072 : main a pris 0065 à 0071. Conflits résolus :
  `docs/architecture.md` (lien d'ADR), `scripts/quality/baseline.json` (plancher de main gardé, 1759) et l'index des
  tickets. `node --test` sur le condensé, la composition, l'agent local, DeepAsk et les rejeux : 196 tests verts ;
  `node scripts/check.mjs` complet sur l'état intégré (journal + recherche web + échéance web portée à 30 s) : vert, 3 274
  tests JS, 71 tests Python.
