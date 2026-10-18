---
id: T282
titre: Let each local role turn model reasoning on or off
statut: a-faire
bloque_par: T268
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Chaque rôle local qui converse avec Ollama (perception et réexamen d'un côté, questions de l'autre) a un réglage de
raisonnement : `default` (rien n'est envoyé, le modèle décide), `on` ou `off`. Le réglage réellement envoyé figure dans
l'identité du rôle, ce qui permet de comparer avec et sans raisonnement sur le Mac puis sur le GX10.

## Sources

- Essais réels du 18/10 (`experiments/essais/2026-10-18-copie-a-repetition/`, `2026-10-18-copie-b-g3-mac/`) :
  `qwen3.8:27b` raisonne avant de répondre ; en vision il dépasse le délai de 45 s de l'agent, et une question locale
  prend 56 à 169 s sous charge. Une mesure isolée et biaisée donne 25 s avec raisonnement et 4 s sans : à refaire.
- Avis d'Astra du 18/10 : ticket validé, avec un mode « défaut du fournisseur » conservé, parce que la désactivation
  dépend du modèle et de la version d'Ollama (https://docs.ollama.com/capabilities/thinking).
- Décision du propriétaire, le 18/10 : « go pour les tickets de recommandation ».
- Code à `70501e3` : `adapters/local-vlm-agent.cjs:98` envoie `model`, `stream`, `format`, `keep_alive`, `options`,
  sans `think` ; `adapters/ollama/http-client.cjs:39` et `:48`, même chose pour les questions et les embeddings ;
  `adapters/config.cjs:83-89` lit `TVLENS_LOCAL_VLM_*` et `TVLENS_LOCAL_QUESTIONS_*`.

## Périmètre

- À modifier : `adapters/config.cjs`, `adapters/local-vlm-agent.cjs`, `adapters/ollama/http-client.cjs`, la composition
  dans `runtime/session-providers.cjs` si l'identité y est construite, leurs tests, et le tableau des réglages de
  `docs/gx10-experiment.md`.
- Réglages `TVLENS_LOCAL_VLM_THINK` et `TVLENS_LOCAL_QUESTIONS_THINK` : `default` (ou absent), `on`, `off`. Une autre
  valeur refuse le démarrage avec un message nommé. `default` n'envoie aucun champ `think` : le comportement d'aujourd'hui
  est inchangé. `on` et `off` envoient `think: true` ou `think: false` dans chaque requête `/api/chat` du rôle.
- L'identité publiée du rôle (métriques de perception, diagnostic d'inspection, identité des questions) porte le réglage
  effectif. Un appel où Ollama rend du texte de raisonnement le compte dans ses métriques (nombre de caractères), sans
  publier ce texte.
- À ne pas toucher : les embeddings (aucun raisonnement), le chemin Codex, les prompts, les délais, le harnais.

## Critères d'acceptation

1. Par la vraie composition et un faux Ollama : `off` envoie `think: false` dans les requêtes de perception et de
   questions ; `on` envoie `think: true` ; `default` n'envoie aucun champ `think`.
2. L'identité du rôle publie le réglage effectif dans les trois cas.
3. Une valeur invalide refuse le démarrage avec un message qui nomme le réglage.
4. Un faux Ollama qui rend un champ `thinking` : sa longueur figure dans les métriques, son texte nulle part.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

Par la composition des rôles locaux et un faux Ollama : la requête de questions avec `TVLENS_LOCAL_QUESTIONS_THINK=off`
contient `think: false`, et l'identité publiée l'indique.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

