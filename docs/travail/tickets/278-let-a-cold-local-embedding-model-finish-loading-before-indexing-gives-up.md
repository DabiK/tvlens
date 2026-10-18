---
id: T278
titre: Let a cold local embedding model finish loading before indexing gives up
statut: termine
bloque_par: T267
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Avec les embeddings sur Ollama, l'index d'une session se construit même quand le modèle d'embeddings doit d'abord être
chargé à côté d'un autre modèle local. Un lot d'embeddings qui échoue laisse une ligne de diagnostic dans le journal du
serveur, sans aucun texte de la session.

## Sources

- Contrôle réel T276, le 18/10, au commit `258d910`, sur le Mac (M5 Max, 36 Go), Ollama 0.33.2,
  `qwen3-embedding:0.6b`, 19 passages de la session `ec55a89c` (8 953 octets en un lot) :
  - modèle d'embeddings froid et seul : 1,1 s, dont 0,8 s de chargement ; chaud : 0,3 s ;
  - froid avec `gemma3:12b` résident : 13,2 s, dont 12,7 s de chargement ;
  - par le serveur headless (`TVLENS_EMBEDDINGS_BACKEND=local`), `gemma3:12b` résident : deux appels `/api/embed`
    arrêtés à 8,1 s, aucun cache écrit, modèle d'embeddings absent de `ollama ps` ensuite. La question a répondu par le
    classement textuel, sans aucune ligne dans le journal du serveur.
- Code à `258d910` :
  - `adapters/embeddings/ollama-embeddings.cjs:10` : `TIMEOUT_MS = 8000`, appliqué à chaque appel (`:33`, `:51`) ;
  - `core/moment-index.cjs:227-262` : un lot à la fois, pause partagée après un lot en échec ;
  - `core/moment-search.cjs:91-112` : la recherche attend l'index un temps borné, puis classe par texte avec un
    avertissement rendu à l'agent.
- L'expérience GX10 prévoit plusieurs rôles locaux à la fois (perception, questions, embeddings, inspection).

## Périmètre

- À modifier : `adapters/embeddings/ollama-embeddings.cjs`, la composition des embeddings locaux dans
  `runtime/session-providers.cjs` et `adapters/config.cjs` si un réglage est ajouté, leurs tests.
- Un appel d'embeddings Ollama dispose d'un délai qui couvre un chargement de modèle mesuré : 30 s par défaut, réglable
  par `TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS` (entier positif, refus nommé sinon). La recherche d'une question garde son
  attente bornée actuelle : un délai plus long ne retarde pas les réponses.
- Un lot en échec écrit une ligne de diagnostic avec un code `TVLENS_…`, sa cause (délai, indisponible, réponse
  invalide) et le nombre de passages, jamais leur texte ni l'adresse du serveur.
- À ne pas toucher : OpenRouter et son délai, le format des caches, l'identité des vecteurs (ADR 0058), le harnais.

## Critères d'acceptation

1. Par la composition réelle et un faux Ollama qui répond au premier `/api/embed` après plus de 8 s mais moins que le
   délai : l'index est construit et une recherche suivante est `hybrid`.
2. Pendant ce premier appel, une question sur la session répond dans son attente bornée actuelle, par classement
   textuel avec son avertissement.
3. Un faux Ollama qui dépasse le délai : une seule ligne de diagnostic par lot en échec, sans texte de passage ni URL.
4. `TVLENS_LOCAL_EMBEDDINGS_TIMEOUT_MS` invalide : démarrage refusé avec un message nommé.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

Un test de la composition des embeddings locaux, avec horloge injectée et faux serveur lent : premier lot plus long que
8 s, index construit, recherche hybride.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal


- Exploration Codex : règles, skill de tests, adaptateur, composition, configuration, appelants et ADR 0019/0031/0039/0058 lus. État initial conservé ; détails dans `.harness-state/tickets/T278/exploration.md`. Tests prévus avec serveur factice et temps injecté, sans modèle local.
- Reproduction puis correction : `node --test --test-name-pattern='a cold local model' tests/ollama-embeddings.test.cjs` — rouge observé (2 passages en échec à 8 s), puis vert ; index complet à 13,2 s virtuelles, première recherche lexicale à 4 s, suivante hybride. Sorties `cold-red.log` et `cold-green.log` dans le dossier d’état.
- Configuration : `node --test --test-name-pattern='embedding deadlines' tests/ollama-embeddings.test.cjs tests/portable-config.test.cjs` — 2 tests rouges (aucun refus et réglage absent), puis 2 verts. Délai par défaut 30 s, variable importable et surcharge temporaire ; refus nommé des valeurs invalides, y compris celles au-delà de la limite des minuteries Node (2 147 483 647 ms).
- Diagnostics : `node --test --test-name-pattern='configured local deadline|failed local batches classify' tests/ollama-embeddings.test.cjs` — rouge observé sur les diagnostics absents, puis 6 cas verts : délai réglé à 12 s, HTTP 503, connexion coupée, JSON invalide et vecteurs incomplets. Une ligne expurgée par lot, réponse tardive non cachée. Sorties `diagnostic-red.log` et `diagnostic-green.log`.
- Suites concernées : `node --test --test-concurrency=1 tests/ollama-embeddings.test.cjs tests/portable-config.test.cjs tests/session-providers.test.cjs` — 51 tests verts, 0 échec (`targeted.log`).
- Contrôle des fichiers modifiés : `node scripts/check.mjs --changed` — vert, règles/format/lint/gel/cliquet validés et 31 tests verts (`check-changed.log`).
- Contrôle final : `node scripts/check.mjs` — vert, 151 fichiers JS, 2 826 tests JS et 47 tests Python réussis (`check-full.log`). `git diff --check` : aucune erreur. Aucun modèle local ni fournisseur réel lancé ; fichiers non suivis préexistants conservés. Verdict `TERMINÉ` enregistré dans `.harness-state/tickets/T278/verdict.json`, relecture et intégration laissées à la boucle ; aucun commit ni push.
- Reprise après relecture 1 : constat mineur accepté sur le ternaire imbriqué ; extraction de la conversion prévue, sans changement de comportement. `node --test --test-concurrency=1 tests/portable-config.test.cjs tests/ollama-embeddings.test.cjs` lancé avant modification : 31 tests verts (`correction-1-before.log`). Nettoyage structurel couvert par les tests publics existants ; aucun nouveau test comparant le texte source. Aucun écart ni contestation.
- Correction du constat 1 : conversion extraite dans `integerSetting`, lecture du délai par un seul ternaire. Même commande de tests après modification : 31 tests verts (`correction-1-after.log`). `node scripts/check.mjs --changed` : vert, 31 tests réussis (`correction-1-check-changed.log`) ; `git diff --check` : aucune erreur. Tests et gel du lint inchangés.
- Contrôle complet après correction : `node scripts/check.mjs` — vert, 2 826 tests JS dans 151 fichiers et 47 tests Python réussis (`correction-1-check-full.log`). `git diff --check` : aucune erreur. Constat mineur 1 corrigé ; aucun constat à contester. Nouveau verdict `TERMINÉ` enregistré ; relecture et intégration laissées à la boucle, sans commit ni push. Aucun modèle local ni fournisseur réel lancé.
