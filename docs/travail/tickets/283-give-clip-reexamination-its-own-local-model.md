---
id: T283
titre: Give clip reexamination its own local model
statut: a-faire
bloque_par: T282, T287, T288
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le réexamen d'un clip peut utiliser un modèle vision local différent de celui de la perception de fond : par exemple
`gemma3:4b`, rapide, pour la perception toutes les 8 s, et un modèle plus fort pour le réexamen ponctuel. Sans réglage
propre, le réexamen garde exactement la configuration d'aujourd'hui.

## Sources

- Essais réels du 18/10 : le réexamen par `gemma3:4b` aboutit (15 à 18 s) sans observation que le modèle des questions
  retienne (`experiments/essais/2026-10-18-copie-b-g3-mac/`) ; `gemma3:12b` lit mal le texte à l'écran
  (`2026-10-18-reexamen-local-mac/`) ; `qwen3.8:27b` lit juste mais trop lentement pour la perception continue.
- Avis d'Astra du 18/10 : ticket validé, avec configuration et identité propres et compatibilité conservée.
- Décision du propriétaire, le 18/10 : « go pour les tickets de recommandation ».
- Code à `70501e3` : `runtime/session-providers.cjs:92-102` compose l'inspection locale avec `config.localVlm`, le
  réglage de la perception ; `adapters/config.cjs:83-85` lit `TVLENS_LOCAL_VLM_*`.

## Périmètre

- À modifier : `adapters/config.cjs`, `runtime/session-providers.cjs`, leurs tests, et le tableau des réglages de
  `docs/gx10-experiment.md`.
- Réglages `TVLENS_LOCAL_INSPECTION_URL`, `_MODEL`, `_NUM_CTX`, `_KEEP_ALIVE`, `_TOKEN` et `_THINK` (valeurs de T282).
  Quand `TVLENS_LOCAL_INSPECTION_MODEL` est absent, le réexamen local utilise `TVLENS_LOCAL_VLM_*` comme aujourd'hui.
  Quand il est présent, l'URL est requise et validée comme celle de la perception ; une configuration incomplète
  refuse le démarrage avec un message nommé.
- Le diagnostic d'inspection publie le modèle et l'hôte réellement utilisés. Aucun repli silencieux sur la perception
  ou sur Codex quand le modèle de réexamen est injoignable.
- À ne pas toucher : la perception de fond, les questions, les embeddings, le chemin Codex, le harnais.

## Critères d'acceptation

1. Par la vraie composition et un faux Ollama : perception sur le modèle A, réexamen sur le modèle B ; chaque requête
   porte le bon modèle, et le diagnostic d'inspection nomme B.
2. Sans `TVLENS_LOCAL_INSPECTION_MODEL` : requêtes et identités identiques à aujourd'hui.
3. Configuration de réexamen incomplète ou invalide : démarrage refusé avec un message nommé.
4. Modèle de réexamen injoignable : refus nommé, aucun appel au modèle de perception ni à Codex.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

Par la composition et un faux Ollama : un réexamen avec `TVLENS_LOCAL_INSPECTION_MODEL=modele-b` interroge `modele-b`
pendant que la perception interroge `modele-a`.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal
- 19/10, propriétaire : les tickets TV T285 à T288 passent avant ce ticket, « de façon prioritaire ».
