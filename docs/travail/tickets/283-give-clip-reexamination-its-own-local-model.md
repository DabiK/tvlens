---
id: T283
titre: Give clip reexamination its own local model
statut: termine
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
- 19/10, Codex : exploration consignée dans `.harness-state/tickets/T283/exploration.md` ; aucun écart prévu.
- 19/10, Codex : `node --test --test-name-pattern='dedicated inspection settings' tests/portable-config.test.cjs` :
  rouge observé (configuration dédiée absente), puis vert (1 test). Sorties `config-red.log` et `config-green.log` dans le dossier d'état.
- 19/10, Codex : `node --test --test-name-pattern='composed clip reexamination' tests/local-inspection.test.cjs` :
  rouge observé (requête sur A au lieu de B), puis vert (1 test). Sorties `composition-red.log` et `composition-green.log`.
- 19/10, Codex : `node --test tests/portable-config.test.cjs tests/local-inspection.test.cjs tests/session-providers.test.cjs tests/local-vlm-agent.test.cjs` :
  93 tests réussis ; faux Ollama uniquement, séparation des modèles et des hôtes, paramètres dédiés, compatibilité et refus sans repli.
- 19/10, Codex : `node scripts/check.mjs --changed` : vert, 39 tests réussis (`check-changed.log`).
- 19/10, Codex : premier `node scripts/check.mjs` : 2 907/2 908 tests JS réussis et 54 tests Python réussis ;
  le test de configuration par défaut de `media-asr-options.test.cjs` attendait encore l'objet sans `localInspection`.
  Rouge reproduit par `node --test --test-name-pattern='configuration exposes the latency' tests/media-asr-options.test.cjs` ;
  attendu complété explicitement avec les valeurs par défaut du nouveau rôle, sans retirer d'assertion.
- 19/10, Codex : même test de configuration après correction : vert, 1 test (`default-config-green.log`) ;
  `node scripts/check.mjs --changed` : vert, 47 tests (`check-changed-final.log`).
- 19/10, Codex : `node scripts/check.mjs` après correction : vert ; règles, format, lint, gel et cliquet conformes,
  2 908 tests JS et 54 tests Python réussis (`check-full.log`). Verdict `TERMINÉ`, sans réserve ; relecture laissée à la boucle.
- 19/10, Codex, reprise après relecture 1 : les deux constats mineurs sont acceptés ; test d'absence d'héritage à renforcer,
  puis clé réelle à renommer `localInspectionVlm` pour la distinguer du drapeau de simulation `localInspection`.
  Aucun écart prévu ; exploration de reprise consignée dans le dossier d'état.
- 19/10, Codex : `node --test --test-name-pattern='an unreachable dedicated inspection' tests/local-inspection.test.cjs` :
  vert, 1 test renforcé ; avec `--require ./.harness-state/tickets/T283/mutate-inspection-inheritance.cjs`,
  rouge sur l'en-tête Bearer hérité après fusion introduite uniquement en mémoire (`review-inheritance-mutation-red.log`).
- 19/10, Codex : `node --test --test-name-pattern='dedicated inspection settings' tests/portable-config.test.cjs` :
  rouge sur la clé `localInspectionVlm` absente avant renommage (`review-config-name-red.log`).
  Après renommage, `node --test tests/local-inspection.test.cjs tests/portable-config.test.cjs tests/media-asr-options.test.cjs` :
  vert, 47 tests (`review-targeted-green.log`) ; drapeau de simulation et variables d'environnement conservés.
- 19/10, Codex : après corrections, `node scripts/check.mjs --changed` : vert, 47 tests (`review-check-changed.log`) ;
  `node scripts/check.mjs` : vert, 2 908 tests JS et 54 tests Python, règles, format, lint, gel et cliquet conformes
  (`review-check-full.log`). Les deux constats mineurs sont corrigés ; nouveau verdict `TERMINÉ`, relecture laissée à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T283/relecture-2.md : 1. `scripts/local-stream-host.cjs:17-20` — hors périmètre

  **Ce qui ne va pas.** Le rejeu G3 ne fusionne par rôle que `localVlm`, `localQuestions` et `localEmbeddings`. Le scénario ne peut pas déclarer `localInspectionVlm` : `CONFIG_KEYS` le refuse (`scripts/local-stream-input.cjs:12-13`). Si le fichier `--config` porte `TVLENS_LOCAL_INSPECTION_MODEL`, le réexamen du rejeu tourne sur le modèle du fichier, pas sur celui du scénario. Les paramètres publiés ne correspondent plus non plus.

  **Ce qui est attendu.** Un ticket de suivi avant toute campagne G3 avec un modèle de réexamen dédié.
- .harness-state/tickets/T283/relecture-2.md : 2. `runtime/conversation-runtime.cjs:60-61` — hors périmètre

  **Ce qui ne va pas.** Au démarrage de l'hôte, seuls `TVLENS_LOCAL_VLM_THINK` et `TVLENS_LOCAL_QUESTIONS_THINK` sont validés. Une valeur invalide de `TVLENS_LOCAL_INSPECTION_THINK` n'est refusée qu'au démarrage d'une session. Le refus est bien nommé, donc le critère 3 reste tenu.

  **Ce qui est attendu.** Valider ce réglage dans la composition de démarrage. Cela passe par `conversation-runtime.cjs`, que le ticket ne permet pas de modifier.
