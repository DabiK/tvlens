# Fiche — Un seul cycle de vie pour les deux hôtes

Fiche de travail du lot, hors dépôt (aucun ticket ne la cite). Lot L11, vague 2. Constats : CORE-01, CORE-02,
CORE-04, CORE-19, ADP-06, ADP-07, ADP-09, OUBLI-03, OUBLI-07, OUBLI-10. Code lu à la version `0d5a954`.
Les lignes citées sont celles de cette version ; elles bougeront au jalon de format : chaque ticket cite
d'abord le nom (fonction, méthode, test), puis la ligne. Les fichiers de test nommés d'après un chantier
(`architecture-f05` à `architecture-f10`) peuvent avoir été renommés en vague 1 : un test se retrouve par
son titre.

## Le problème, en une phrase

Le cycle de vie d'une session (démarrage, reprise, questions, ingestion, fin) est écrit deux fois : dans
`app/main.cjs` (hôte Mac, une fermeture `app.whenReady().then(async () => {…})` de la ligne 46 à 547) et
dans `runtime/headless-runtime.cjs` (classe `HeadlessRuntime`, lignes 236 à 1143). La fin de session est
déjà mutualisée par `runtime/session-closing.cjs` (ADR 0007). Le reste ne l'est pas : un correctif de
cycle de vie se fait deux fois, et les copies dérivent.

## Forme cible

Le modèle est `runtime/session-closing.cjs` : **des fonctions partagées, paramétrées par l'hôte**, pas un
hôte unique. Chaque module porte un seul comportement mutualisé. Il ne lit ni disque, ni horloge
murale, ni transport, ni `process`, et ne charge aucun module. Il agit seulement par ce que l'hôte lui
remet : un store, une session, un agent, une surveillance. L'ADR 0007, point 8, garde à chaque hôte
l'ordre de ses étapes, sa règle « session vide » et ses gardes. La forme cible les laisse donc dans
l'hôte.

| Module (à créer) | Responsabilité | Consommateurs | Ce qui reste dans chaque hôte |
|---|---|---|---|
| `runtime/question-checkpoint.cjs` | Cadence de sauvegarde des questions : tout de suite si la forme des jobs change ou si aucun job n'est actif, sinon au plus une fois par seconde, le dernier état compris. Écrit dans le store pour lequel l'état a été publié. | `app/main.cjs`, `HeadlessRuntime` | Le Mac filtre les jobs de la session chargée avant d'appeler. |
| `runtime/session-warm-up.cjs` | Préchauffage de l'agent de chat et de l'agent d'observation au démarrage et à la reprise. | les deux hôtes | Quand l'appeler : jamais pour une archive ouverte en lecture seule. |
| `runtime/active-instruction.cjs` | La consigne de la surveillance active sur la session chargée, ou rien ; ne lève jamais. | les deux hôtes | L'identifiant de la session chargée. |
| `runtime/asking-gate.cjs` | Pose `watch.asking`, émet, relance l'analyse en attente quand la dernière question s'achève. | les deux hôtes, `scripts/simulate-stream.cjs`, la fixture de `tests/question-ceiling.test.cjs` | Le calcul de « occupé » : filtre par session côté Mac ; `this.closing` côté serveur. |
| `runtime/serialized.cjs` | Une file qui exécute les transitions l'une après l'autre ; un échec ne bloque pas la suivante. | les deux hôtes | La méthode `exclusive(work)` du serveur reste (appelée par `tests/architecture-f06.test.cjs`). |
| `runtime/segment-intake.cjs` | La queue commune de l'ingestion : `validateSegment`, `watch.ingest`, pause sur `STORAGE_FULL` et publication de l'état disque. | les deux hôtes | La possession des blocs (`accept`, `current`, `finish`, `settleIngestions`, ADR 0006) et le refus pendant une fin : serveur seulement. |
| `runtime/session-rows.cjs` | Ligne « en cours » de la liste des sessions, description de la session courante, libellé de rétention. | les deux hôtes | Le titre de la ligne, `createdAt`, la pagination du serveur (voir E7). |

Sens des dépendances : `app/main.cjs` et `runtime/headless-runtime.cjs` → ces modules → `core/` seulement
quand c'est nécessaire (par exemple `validateSegment`). Aucun de ces modules ne charge un adaptateur ni
Electron. Les tests de couches restent dans `tests/architecture.test.cjs` (arbitrage A3).

Justification de la forme par duplication (arbitrage A8) : un module par comportement mutualisé, comme
`session-closing.cjs`. Une classe « hôte de session » commune (remédiation d'ADP-07) aurait déplacé
l'ordre des étapes et les gardes, que l'ADR 0007 garde par hôte. Et architecture-f07 exige que chaque hôte
contienne lui-même `closeSession({` et `settleQuestions(`.

Ce qui n'est pas unifié, parce que c'est voulu et commenté :

- La condition de balayage. Le serveur ne publie rien pour une session durable au repos, pour que les
  polls reçoivent 304 (`HeadlessRuntime` constructeur, minuterie de balayage, lignes 326-332 ; fixé par
  `tests/server-state-views.test.cjs`). Le Mac pousse son horloge pendant la capture (`sweep`, lignes
  308-311).
- Le filtre des jobs par session côté Mac (`onChange` de la conversation, lignes 167 et 171) et la garde
  `this.closing` du serveur (`onChange`, ligne 295).
- Le refus d'un bloc pendant une fin, au serveur seulement (`ingest`, ligne 778, par `moving()`). L'ADR 0007
  en fait un écart hors sujet (Conséquences).
- L'ordre des étapes de fin, la règle « session vide », le comportement sans session chargée (ADR 0007,
  point 8).

## Séquence étendre / migrer / contracter

Chaque étape laisse les deux hôtes verts. Une extraction se fait en trois temps dans le même ticket quand
elle est petite. Étendre : créer le module et son test unitaire. Migrer : brancher les deux hôtes.
Contracter : supprimer les copies et les commentaires « same as the other host ».

### E1 — Caractériser ce que les extractions vont déplacer (tickets T116 et T117)

Aucun test ne fixe aujourd'hui, côté Mac, la porte `asking` ni la relance de l'analyse après une
réponse. Aucun ne fixe non plus le préchauffage ou la consigne active. Côté serveur, aucun test ne fixe
le préchauffage. Ces tests s'écrivent avant toute extraction et passent sur le code actuel.

### E2 — Cadence de sauvegarde des questions (ticket T118)

Première extraction. C'est la duplication que l'ADR 0003 nomme dans ses limites. Elle est déjà protégée
des deux côtés, par un test de cadence par hôte et par les scénarios d'architecture-f07. Elle ne dépend
donc pas d'E1.

### E3 — Préchauffage et consigne active (ticket T119)

Deux fonctions de quelques lignes. Protégées par E1.

### E4 — Porte `asking`

- Contenu : `markAsking(watch, busy, drain)` pose le drapeau, émet, et appelle `drain` au microtask
  quand `busy` redevient faux. Le calcul de `busy` reste dans chaque hôte. `drain` est fourni par l'hôte :
  le Mac lit sa variable `watch` au moment du microtask (`watch?.drain()`), le serveur draine la session
  capturée. Ce n'est pas la même chose, et la fonction ne doit pas trancher.
- Consommateurs : les deux hôtes, `scripts/simulate-stream.cjs` (`onChange`, ligne 312), la fixture de
  `tests/question-ceiling.test.cjs` (ligne 41, commentée « Same glue as both hosts »).
- Déclencheur de découpage : T116 intégré (porte Mac caractérisée) et T118 intégré (le même `onChange`
  est touché). Le ticket ajoute aussi un test serveur : `asking` reste vrai pendant `close()` quand la
  dernière question s'achève. La garde `this.closing` n'est fixée par aucun test aujourd'hui.

### E5 — Transitions sérialisées

- Contenu : `serialized()` remplace `exclusive` de `app/main.cjs` (lignes 91-92) et le corps de
  `HeadlessRuntime.exclusive` (lignes 353-357). La méthode du serveur reste, elle délègue.
- Déclencheur : après E4 (même zone de l'hôte Mac). Effort S.

### E6 — Queue commune de l'ingestion

- Contenu : `validateSegment`, `watch.ingest`, pause sur `STORAGE_FULL` quand la session est celle chargée,
  publication de l'état disque (Mac `watch:ingest`, lignes 413-424 ; serveur `ingest`, lignes 778-809).
- Déclencheur : décision D1 du propriétaire (le Mac doit-il refuser un bloc pendant une fin ?). Sans
  décision, l'extraction garde l'écart tel quel. Si le propriétaire veut le refus, c'est un ticket de
  comportement à part, avec son ADR, avant l'extraction.
- Tests qui protègent : `tests/mac-ipc-contract.test.cjs`, test « host settings come from the environment;
  a full disk stops capture… » (ligne 451) ; `tests/server-sessions.test.cjs` (disque plein, 507, ligne 290) ;
  `tests/architecture-f06.test.cjs`.

### E7 — Lignes de session, description, libellé de rétention (OUBLI-07)

- Contenu : la ligne « en cours » (Mac `sessionRows`, lignes 314-325 ; serveur `sessions()`, lignes 925-976),
  `described` (serveur, lignes 607-617) et `current` (Mac, ligne 323). Le libellé rolling / until-deleted est
  dérivé à quatre endroits (`core/session.cjs:480`, serveur 612-613, Mac 255 et 323).
- Écarts constatés à arbitrer par un test, pas par l'extraction : titre « Session en cours » et
  `createdAt: null` côté serveur, `createdAt: startedAt` côté Mac ; pagination (`slice(0, 50)`, `total`) au
  serveur seulement.
- Déclencheur : un test qui compare la ligne « en cours » des deux hôtes, champ par champ, sur le même
  scénario (dans `tests/architecture-f07.test.cjs`, qui a déjà un adaptateur par hôte). Sans lui, pas de
  ticket.

### E8 — Garde disque par défaut construite une fois (OUBLI-07)

- Contenu : `HeadlessRuntime` constructeur (lignes 272-277) et `createSessionRuntime` (lignes 100-105)
  construisent la même garde. Une seule fabrique, dans `runtime/`.
- Déclencheur : libre après le jalon de format. Tests : `tests/disk-guard.test.cjs`,
  `tests/mac-ipc-contract.test.cjs` ligne 451.

### E9 — Réglages d'hôte et binaire Codex (ADP-09, OUBLI-03)

- Contenu : une lecture des réglages commune aux deux hôtes (Mac lignes 58-71, serveur `settings(env)`
  lignes 9-21) et une résolution du binaire Codex commune (`findCodex` du Mac, lignes 553-557, contre
  `executable('codex', …)` du serveur, ligne 39).
- Déclencheur : décisions D2, D3 et D4. Les messages « Réglage X invalide » restent mot pour mot (A5, A6).
  `confinementMode` et `itemGuard` restent nommés par le client seul (`tests/codex-confinement.test.cjs`,
  ligne 472), sauf décision D5 avec ADR.

### E10 — Doublures de test hors de la composition de production (CORE-04, part d'ADP-06)

- Contenu : les doublures de `app/main.cjs` (agent vidéo smoke, lignes 130-138 ; vérificateur `'FAIL_TEST'`,
  227-235 ; résumé, 296-301) et celles de `runtime/session-runtime.cjs` (161-258) deviennent des
  adaptateurs simulés.
- Déclencheur : lot L05 intégré (`tests/helpers/mac-host.cjs` refuse une substitution perdue) et décision
  D6 (simulateur à deux voies : il change la forme des passages dans les 16 fichiers en `smoke: true`).
  Le paramètre unique `providers` doit reprendre les usages d'`overrides` (six fichiers de tests,
  `scripts/replay-reinspection.cjs:150`).

### E11 — Découpage de `HeadlessRuntime` (CORE-02)

- Premier temps, indépendant d'E2 à E6 : sortir les vues pures (lignes 85-234 : `lightPassage`,
  `lightJob`, `captureGapsOf`, `surveillanceHistory`, `surveillanceDetail`) dans un module de vues.
- Second temps, après E4 à E6 : une `phase` explicite. Elle remplace seulement `closing` et `releasing` ;
  `ending` (ligne 905) et `closed` (ligne 1116) restent des promesses mémorisées par `||=`.
- À garder : `leave()` dans ce fichier (test de texte d'architecture-f07, lignes 578-591) ; `runtime.session`
  et `runtime.captureEpoch` lus par `server/http.cjs` ; les quelque 170 accès des tests à `.session`,
  `.deep`, `.surveillance`, `.lastEnd`, `.admitted`.
- Déclencheur : le premier temps peut être découpé dès le jalon de format ; le second une fois E6 intégré.

### E12 — Découpage d'`app/main.cjs` (ADP-06)

- Déclencheur : lot L05 intégré et E2 à E6 intégrés. Le découpage rend fausses les substitutions du banc,
  qui dépendent du fichier appelant (`tests/mac-ipc-contract.test.cjs`, ligne 173 ; `architecture-f05`,
  ligne 660 ; `architecture-f07`, ligne 257). Il casse aussi les assertions sur le texte de `main.cjs`
  (`mac-ipc-contract`, test « every bridge call has its handler… », lignes 86-108). Ces assertions se
  réécrivent en assertions de comportement, sans en perdre une : à vérifier ligne à ligne.
- Les consignes métier en français (lignes 489-494) ne changent pas de rédaction (A6).

### E13 — Minuteries injectées (OUBLI-10)

- Contenu : les `setInterval` du constructeur de `HeadlessRuntime` (lignes 326 et 334). Le délai de
  sauvegarde des questions devient un paramètre dès E2.
- Déclencheur : après le premier temps d'E11.

### E14 — Réglage de langue (CORE-19)

- Contenu : la langue mutée dans `options.config` (`setTranscriptionLanguage`, lignes 342-351), le défaut
  affiché « fr » contre le défaut utilisé « auto » (`session-runtime.cjs`, ligne 145), le chemin du modèle
  Whisper (lignes 150-159), `this.deep.now` écrit après la construction (ligne 309), `...this.options`
  passé en vrac (`sessionOptions`, lignes 618-626).
- Risque : figer la langue à la création de la session. La lecture paresseuse est voulue (un changement
  s'applique sans recréer la session) ; `tests/transcription-language.test.cjs` le détecte.
- Déclencheur : après E11. Impact nul en production aujourd'hui (correction du relecteur).

## Invariants à préserver

1. Questions : une question qui apparaît, part ou change de statut est sauvegardée tout de suite, états
   finaux compris. Entre deux, le brouillon d'une réponse en cours est publié à chaque mouvement et
   sauvegardé au plus une fois par seconde, le dernier état compris quand la réponse s'arrête.
2. Une sauvegarde en retard va dans le store de la session pour laquelle l'état a été publié. Elle ne
   va jamais dans la session chargée depuis, ni dans une session scellée. Après la libération
   (`letGo`, `adopt`), rien n'attend plus.
3. Un refus d'écriture n'est pas perdu : le store le garde pour la barrière de fin de session.
4. Mac : seuls les jobs de la session chargée comptent pour `asking` et vont dans son dossier. Serveur :
   `asking` reste vrai pendant `close()`.
5. La surveillance ne lève jamais `asking` (`tests/server-surveillance.test.cjs`, lignes 73-94).
6. Le préchauffage a lieu au démarrage et à la reprise, jamais à l'ouverture d'une archive en lecture
   seule. Son échec ne fait échouer ni l'un ni l'autre.
7. La consigne n'atteint un tour de chat que si la surveillance est active sur la session chargée. Sa
   lecture ne lève jamais.
8. Les écarts voulus de la section « Forme cible » restent.
9. Chaque hôte contient lui-même `closeSession({` et `settleQuestions(`. `session-closing.cjs` ne charge
   rien et ne pose aucune minuterie (`tests/architecture-f07.test.cjs`, lignes 578-591).
10. Aucun code d'erreur renommé (A5). Le contrat `/v1` ne reçoit que des ajouts (A7).

## Tests qui protègent, et ceux qui manquent

| Étape | Protégée par (à `0d5a954`) | Manque |
|---|---|---|
| E2 | `server-sessions` « the draft of an answer is published each time it moves and saved at most once a second… » (688) ; `mac-ipc-contract` « on the Mac host the draft of an answer reaches the window… » (758) et « a question is at rest on disk… » (798) ; scénarios d'`architecture-f07` (lecture de `runtime.unsaved` et `runtime.checkpointTimer`, ligne 187) | Un test unitaire du module, écrit par T118 |
| E3 | `chat-instruction` (serveur) | Préchauffage des deux hôtes ; consigne côté Mac (T116, T117) |
| E4 | `remote-server` (70-81), `server-surveillance` (73-94) | Porte Mac (T116) ; garde `this.closing` (à écrire dans le ticket d'E4) ; filtre par session du Mac (voir « Non vérifié ») |
| E5 | `architecture-f06` (appel de `runtime.exclusive`, ligne 348), scénarios Mac | — |
| E6 | `mac-ipc-contract` (451), `server-sessions` (290), `architecture-f06` | — |
| E7 | `server-state-views`, `mac-ipc-contract` (227) | Comparaison des lignes « en cours » des deux hôtes |
| E9 | `server-sessions` (619), `mac-ipc-contract` (451), `codex-confinement` (472), `portable-config` | Ordre de recherche du binaire Codex côté Mac |
| E10 | les 16 fichiers en `smoke: true`, `session-optimization` | Smoke Electron hors `npm test` |
| E11 | `server-*`, `timeline-server`, `remote-server`, `architecture-f07` (578) | — |
| E12 | `mac-ipc-contract`, `mac-ui`, `architecture-f05`, `architecture-f07` | Banc qui refuse une substitution perdue (lot L05) |

## Risques

- **Unifier une différence voulue.** Le risque principal du lot : la condition de balayage, le filtre de
  session, `this.closing` ou le refus des blocs pendant une fin. Chaque module laisse ce calcul à l'hôte.
  Les tests ci-dessus le détectent.
- **Le microtask de la porte `asking`.** Le Mac draine la session chargée au moment du microtask, le
  serveur celle capturée. Passer l'une pour l'autre change ce qui est drainé juste après une fin.
- **Minuteries simulées.** Les tests de cadence avancent `t.mock.timers`. Le module de sauvegarde doit
  appeler `setTimeout` et `clearTimeout` au moment de l'appel, sans les capturer au chargement : sinon,
  la simulation ne s'applique plus et les tests attendent une vraie seconde.
- **Catch vides déplacés.** Le cliquet juge un fichier nouveau contre rien : un `catch {}` déplacé tel quel
  compte comme ajouté. Les `.catch(() => {})` ne sont pas comptés, mais gardent leur commentaire.
- **Le banc Mac.** Les substitutions ne s'appliquent que si le `require` vient d'`app/main.cjs`. Un module
  qui charge `DiskGuard` ou `codex-confinement` à la place de l'hôte ferait lire le vrai disque sans
  erreur, jusqu'au lot L05.
- **Mémoire de la machine.** Les tests d'hôte lancent l'hôte Mac complet. Tests en séquentiel, un fichier
  à la fois pendant la mise au point.

## Décisions qui reviennent au propriétaire

- D1. Le Mac doit-il refuser un bloc pendant une fin, comme le serveur ? Aujourd'hui non (ADR 0007,
  Conséquences). Bloque E6 dans sa forme finale.
- D2. Valider les réglages d'hôte avec zod (ADR et décision exigés par A4), ou à la main, en gardant les
  messages actuels.
- D3. `TVLENS_MEDIA_RETENTION_MS=Infinity` : accepté par le Mac, refusé par le serveur. Quelle règle commune ?
- D4. Binaire Codex : quel ordre de recherche, et le Mac doit-il honorer `TVLENS_CODEX_BINARY` ?
- D5. Injecter `confinementMode` et `itemGuard` par la composition revient sur un choix documenté
  (`codex-session-client.cjs`, lignes 101-102). Recommandation : ne pas le faire. Sinon, un ADR d'abord.
- D6. Un simulateur à deux voies (audio et vision) en `smoke` change la forme et le nombre des
  publications dans 16 fichiers de tests. Le veut-on, ou garde-t-on le drain hérité pour le smoke ?
- D7. Un ADR qui enregistre la forme cible (fonctions partagées paramétrées par l'hôte, différences
  voulues listées), avant E11 et E12. L'ADR 0007 n'a écarté la mutualisation de l'ouverture, de la reprise
  et des questions que pour une raison de périmètre (« Alternatives écartées », dernière ligne).
