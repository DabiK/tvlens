---
id: T278
titre: Let a cold local embedding model finish loading before indexing gives up
statut: a-faire
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

