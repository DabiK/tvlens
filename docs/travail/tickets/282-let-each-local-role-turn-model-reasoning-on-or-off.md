---
id: T282
titre: Let each local role turn model reasoning on or off
statut: termine
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

- Exploration : chemins de configuration, composition et publication lus ; raccords nécessaires aux compteurs et identités consignés dans `.harness-state/tickets/T282/{exploration,ecarts}.md`. Tests prévus avec faux Ollama, aucun fournisseur réel.

- Questions, rouge puis vert : `node --test --test-name-pattern='composed local questions send' tests/ollama-question-agent.test.cjs`.
  Quatre cas : `off`, `on`, `default`, absent ; deux tours HTTP chacun, identité et traces vérifiées.
- Perception/réexamen, rouge puis vert :
  `node --test --test-name-pattern='composed perception and inspection send' tests/local-vlm-agent.test.cjs` : quatre cas réussis.
- Configuration : `node --test --test-name-pattern='local thinking settings' tests/portable-config.test.cjs`.
  Refus du cache invalide d’abord absent, puis deux tests réussis : valeurs nommées, cache et priorité de l’environnement.
- Compteurs, rouge puis vert : cinq cas ciblés dans `local-vlm-agent`, `local-inspection`, `ollama-question-agent`.
  Commande exacte et sorties dans `.harness-state/tickets/T282/commands.jsonl` et `metrics-{red,green}.log`.
  Longueurs cumulées, réponses invalides, remise à zéro et absence de texte dans résultats, diagnostics, traces et requêtes.
- Six suites exécutées en séquentiel : 146 tests réussis, zéro échec (`suites-verified.log`, commande dans `commands.jsonl`).
  Attentes d’identité complétées ; omission du filtre de provenance des preuves corrigée après rouge observé.
- `node scripts/check.mjs --changed` : vert, 102 tests JS réussis (`check-changed-first.log`).
- Cache mal formé : régression de la séparation lecture/validation exposée, assertion rouge conservée, puis corrigée.
  `node --test tests/portable-config.test.cjs` : 10 tests réussis (`config-verified.log`).
- Guide GX10 : réglages, valeurs HTTP, identité effective et portée du compteur documentés. Aucun modèle réel lancé.
- Contrôle final : `node scripts/check.mjs` : **vert**, 2 899 tests JS (152 fichiers) et 47 tests Python réussis.
  Règles, format, lint, gel et cliquet verts ; `check-full.log`. `git diff --check` : code 0.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T282/verdict.json` ; relecture et intégration laissées à la boucle.

- Reprise après `relecture-1.md` : deux constats acceptés. Le refus du chargeur était absorbé par Electron.
  Correction prévue : garder les valeurs brutes et les valider dans la composition de démarrage partagée ; nom explicite du réglage dans le helper.

- Correction du constat bloquant :
  `node --test --test-name-pattern='invalid local thinking settings survive' tests/portable-config.test.cjs`.
  Rouge observé sur la configuration de secours, puis sur le refus manquant dans la composition ; vert après correction.
  Deux variables, six valeurs, trois sources ; composition partagée et constructeur headless ; choix locaux/Codex, clé importée conservée.
- Correction du constat mineur : `node --test tests/ollama-thinking.test.cjs` : rouge sur le nom absent, puis 2 tests verts.
  Chaque appelant nomme son réglage. Les commandes et sorties de correction sont dans `commands.jsonl` et `revision-*.log`.
- `node scripts/check.mjs --changed` après les deux corrections : vert, 105 tests JS réussis ; `revision-check-changed.log`.
- Contrôle complet de correction : `node scripts/check.mjs` : **vert**, 2 901 tests JS (153 fichiers) et 47 tests Python réussis.
  Règles, format, lint, gel et cliquet verts ; `revision-check-full.log`. `git diff --check` : code 0.
- Les deux constats de `relecture-1.md` sont corrigés, sans contestation. Nouveau verdict `TERMINÉ` écrit ; relecture laissée à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T282/relecture-2.md : `app/main.cjs:289` (avec `adapters/config.cjs:28-34`) — hors périmètre

  **Ce qui ne va pas.** L'import de configuration en cours d'exécution ne valide aucun réglage. Si le fichier importé contient `TVLENS_LOCAL_QUESTIONS_THINK=offf` :
  - l'import réussit sans message ;
  - la valeur est écrite dans `provider.enc` ;
  - chaque démarrage suivant de l'app empaquetée est ensuite refusé, avec un message qui nomme bien le réglage ;
  - le bouton d'import n'est alors plus accessible. Il faut relancer l'app avec la variable dans l'environnement, qui reste prioritaire, ou avec `--config=`.

  C'est le comportement existant pour tous les réglages du cache, par exemple `TVLENS_QUESTIONS_BACKEND` mal tapé. C'est aussi le principe écrit dans `config.cjs`. Le critère 3, qui porte sur le démarrage, est tenu.

  **Ce qui est attendu.** Une validation des réglages au moment de l'import, avant leur écriture dans le cache. Elle passe par `app/main.cjs`, que le ticket ne permet pas de modifier : à reporter en réserve.
- .harness-state/tickets/T282/relecture-2.md : **Écart accepté, `runtime/conversation-runtime.cjs`.** C'est la composition partagée que les deux hôtes appellent au démarrage. C'est exactement la voie demandée par le constat 1, sans modifier `app/main.cjs`.
- .harness-state/tickets/T282/relecture-2.md : **Écart accepté, test de refus renforcé jusqu'à la composition et à `HeadlessRuntime`.** Il renforce le test : rien n'est retiré.
- .harness-state/tickets/T282/relecture-2.md : **Écart accepté, nom de réglage obligatoire et nouveau fichier `tests/ollama-thinking.test.cjs`.** Le module n'avait pas de test propre, et le nom du fichier suit celui du module.
- .harness-state/tickets/T282/relecture-2.md : **Écart accepté, retour au `try/catch` d'origine du cache.** Il retire du diff un changement qui n'avait plus de raison d'être, et le test du cache mal formé reste vert.
