---
id: T311
titre: Configure local web retrieval and let replays declare and report it
statut: a-faire
bloque_par: T309, T310
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La récupération web des questions locales s'active par configuration, désactivée par défaut : corpus figé pour les essais
reproductibles, SearXNG pour le flux réel. Les deux hôtes la composent au même endroit. Un rejeu en flux réel peut la
déclarer dans son scénario et relève, par question, ce qui a été récupéré et validé, sans texte de page.

## Sources

- Décision du propriétaire, le 22/10 : récupération web pour la voie locale, désactivée par défaut ; corpus figé pour
  les essais hors ligne, SearXNG sur la GX10 (`127.0.0.1:8888`) pour le flux réel (essai F1 de la session expériences).
- T308 (`FrozenCorpusRetrieval`, format `corpus.json`), T309 (options `retrieval` et `webTrigger` de
  `OllamaQuestionAgent`, champ `retrieval` du résultat, ADR 0063), T310 (`SearxngRetrieval`).
- Code à `c9f3cc2` (relire après T309 et T310) :
  - `adapters/config.cjs` : `SWITCHES` (`:59-64`), lecture de l'environnement et du fichier importé (`:33`, `:41`),
    `switches()` (`:72-93`), `localQuestionsConfig` (`:99-104`). Ajouter un champ toujours présent casse les
    `deepEqual` de `tests/portable-config.test.cjs:274-285` : la clé n'apparaît que si elle est réglée (précédent de
    `think`) ;
  - `runtime/conversation-runtime.cjs` : `createQuestionAgent` (`:27-35`, validation avant constructeur puis
    `new LocalAgent(config.localQuestions)` en `:32`), `questionAgentOrigin` (`:37-41`) ;
  - rejeux : `scripts/local-stream-input.cjs` (`CONFIG_KEYS` `:12-13`, `validateConfig` `:22-41`, secrets interdits
    `:38`), `scripts/local-stream-host.cjs:17-20` (fusion de la configuration importée et du scénario),
    `scripts/local-stream-report.cjs:31-43` (`rolesOf`), `:56-63` (`finalizeRoles`) ;
  - le résultat publié d'une question garde ses champs (`runtime/state-views.cjs:67-93`, `lightJob`) ; le bilan
    `validation` n'est que dans l'état complet ;
  - réglages documentés : `.env.example`, `docs/gx10-experiment.md`.

## Périmètre

- Réglages (environnement ou fichier importé, persistés comme les autres commutateurs) :
  - `TVLENS_LOCAL_WEB_BACKEND` : `corpus` ou `searxng` ; absent ou vide, aucune récupération ;
  - `TVLENS_LOCAL_WEB_CORPUS` : dossier du corpus (backend `corpus`) ;
  - `TVLENS_LOCAL_WEB_URL` : adresse http(s) de SearXNG, sans identifiants (backend `searxng`) ;
  - `TVLENS_LOCAL_WEB_TRIGGER` : `auto` (par défaut, règle `callsForWeb`) ou `always`.
  `adapters/config.cjs` rend `localWeb: { backend, corpus?, url?, trigger? }` seulement quand le backend est réglé.
- `runtime/conversation-runtime.cjs` : avec `questionsBackend === 'local'` et `config.localWeb`, valider la
  configuration avant tout constructeur (backend inconnu, dossier ou URL manquant, URL avec identifiants, déclencheur
  inconnu → `TVLENS_LOCAL_WEB_CONFIG_INVALID`, sans écho des valeurs), puis construire le port par une fabrique
  injectable (par défaut `FrozenCorpusRetrieval` ou `SearxngRetrieval`) et le passer à `LocalAgent` avec `webTrigger`.
  Sans `localWeb`, l'appel au constructeur est identique à celui d'aujourd'hui. Avec le backend Codex, `localWeb` n'a
  aucun effet (Codex garde son web).
- Rejeux : `localWeb` admis dans le scénario (`CONFIG_KEYS`, validation de la même forme), fusionné avec la configuration
  importée comme les rôles locaux. Le rapport relève la configuration web (backend, déclencheur, jamais de chemin
  complet ni d'URL avec identifiants) et, par question, le champ `retrieval` du résultat (résidence, statut, nombre de
  documents, durée), les URL des sources acceptées et le bilan `sourceValidation`. Une campagne dont une question a une
  récupération de résidence `hybrid` est marquée hybride dans le rapport.
- Documentation : les quatre réglages dans `.env.example` et `docs/gx10-experiment.md`, avec l'exemple GX10
  (`TVLENS_LOCAL_WEB_BACKEND=searxng`, `TVLENS_LOCAL_WEB_URL=http://127.0.0.1:8888`) et l'exemple corpus.
- Tests : `tests/portable-config.test.cjs` (lecture, absence par défaut, persistance), `tests/ollama-question-agent.test.cjs`
  ou un test de composition (port construit et passé, refus avant constructeur), `tests/local-stream-replay.test.cjs`
  (scénario avec `localWeb` corpus sur un corpus temporaire inventé et un faux Ollama, rapport par question).
- À ne pas toucher : `core/deep-ask.cjs`, la règle `callsForWeb`, les adaptateurs web hors de leur construction, aucun
  script `*:live`, aucune requête vers la GX10.

## Critères d'acceptation

1. Sans aucun réglage web, la configuration chargée ne contient pas `localWeb` et `LocalAgent` reçoit exactement les
   options d'aujourd'hui ; les tests existants de `tests/portable-config.test.cjs` passent sans modification de leurs
   assertions.
2. `TVLENS_LOCAL_WEB_BACKEND=corpus` avec un dossier : l'agent local composé reçoit un port `FrozenCorpusRetrieval` ;
   `searxng` avec une URL : un port `SearxngRetrieval` ; chaque configuration invalide est refusée avec
   `TVLENS_LOCAL_WEB_CONFIG_INVALID` avant tout constructeur, sans la valeur fautive dans le message.
3. Un rejeu dont le scénario déclare un corpus figé inventé répond à une question web avec une source validée, et le
   rapport de cette question contient `retrieval`, l'URL acceptée et `sourceValidation`, sans texte de page.
4. Un scénario avec un `localWeb` invalide est refusé avec `CONFIG_INVALID`.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/local-stream-replay.test.cjs` : un rejeu avec corpus figé inventé et faux Ollama, jusqu'au rapport par question.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 22/10, orchestrateur : ticket ouvert depuis l'exploration de la recherche web locale, après T309 et T310.
