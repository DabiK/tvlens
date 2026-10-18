---
id: T263
titre: Answer session questions with Ollama and the existing video tools
statut: termine
bloque_par:
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Sur les deux hôtes, une question peut être répondue par Ollama avec recherche dans la mémoire,
lecture des paroles et réexamen de clip. Le backend des questions est choisi explicitement et
reste identifiable dans le résultat de l'adaptateur, sans repli Codex. Une session Codex, un commit ;
T267 transmettra son identité aux métriques et traces des questions.

## Sources

- Décision du propriétaire du 17/10 au soir : questions locales avant le GX10. Elle étend le
  périmètre du rapport Astra du 17/10, section 5, qui les excluait de la première campagne.
- Code relu à `4599eea` : `runtime/conversation-runtime.cjs:24-45` compose l'agent Codex ;
  `:46-68` fabrique les vrais `VideoTools` liés à la consultation d'une seule session.
  `core/deep-ask.cjs:173` appelle `answer({ tools, signal, context, question, ... })`,
  `:175-203` valide les preuves et `:216-218` rend les outils au vrai retour de l'agent.
- `adapters/codex-session-agent.cjs:53-56` sérialise les réponses ; `:81-110` envoie le
  contexte et le prompt ; `:120-179` valide les pages ouvertes et répare au plus une fois.
  `adapters/codex-session-client.cjs:524-565` traduit les appels d'outils Codex.
- `core/video-tool-contracts.cjs:2-38` définit les trois outils indépendamment du fournisseur ;
  `adapters/codex-tool-definitions.cjs:3-7` n'est que leur enveloppe Codex.
  `core/video-tools.cjs:182-223` borne huit appels, 60 s de transcription, deux inspections
  de 20 s/quatre passages au plus et les baux ; `:228-248` valide les preuves du réexamen.
- `adapters/companion-prompt.cjs:75-97` sépare rôle, modes et consigne ; `:112-143`
  construit le prompt. Le mode chat y annonce le web Codex : il ne convient pas tel quel à Ollama.
  `adapters/local-vlm-agent.cjs:38-71` fait un seul échange JSON, sans boucle d'outils.
  `adapters/companion-prompt.cjs:1-39` définit le schéma de réponse attendu.
- `app/main.cjs:156-178` et `runtime/headless-runtime.cjs:120-143` composent l'agent une fois
  par hôte ; `runtime/headless-session-lifecycle.cjs:159` et `app/main.cjs:405` le ferment à
  chaque fin de session. `adapters/local-vlm-agent.cjs:73-75` ferme définitivement son instance :
  ce modèle de fermeture ne convient pas à un agent composé une fois par hôte.
  `runtime/session-warm-up.cjs:8-15` et `app/main.cjs:251` appellent aussi `prepare`.
- Le Mac affecte `model` et `authHome` à l'agent (`app/main.cjs:282`, `:289`) et lit `rpc`
  pour le quota de vérification manuelle (`:252`). Ces accès ne doivent pas modifier la sélection locale.
- `adapters/config.cjs:55-77` et `runtime/session-runtime.cjs:82-83` donnent le précédent
  de sélection explicite et de refus d'une valeur inconnue. Les priorités de configuration et
  la non-persistance du jeton sont testées dans `tests/review-regressions.test.cjs:250-266`
  et `:409-435`.
- Tests : `tests/local-vlm-agent.test.cjs:13-30` (faux serveur),
  `tests/chat-codex.test.cjs:4-41` (preuves), `tests/chat-sources.test.cjs:11-23` (sources).
  ADR 0004, 0029, 0030 et 0046 ; `docs/domaine.md:266-289`.

## Périmètre

- À créer : agent et échanges HTTP dans `adapters/ollama/`, rôle commun éventuel dans
  `adapters/inquiry/`, `tests/ollama-question-agent.test.cjs` et ADR court sur cette composition.
  À modifier : `runtime/conversation-runtime.cjs`, `adapters/config.cjs`, le prompt pour
  annoncer les capacités réelles, leurs tests ; `docs/architecture.md`, section Décisions :
  une phrase et le lien du nouvel ADR (`tests/documentation-index.test.cjs:50-55`).
  La composition commune reçoit des constructeurs injectables pour chaque backend.
  Aucun déplacement des adaptateurs existants.
- Le transport HTTP Ollama naît dans `adapters/ollama/` avec les règles de
  `adapters/local-vlm-agent.cjs:15-28` et `:47-63`, sans déplacer `LocalVlmAgent`.
  T264 et T266 réutilisent ce transport, sans second client HTTP.
- Ajouter `TVLENS_QUESTIONS_BACKEND=codex|local` → `config.questionsBackend` et
  `TVLENS_LOCAL_QUESTIONS_*` → `config.localQuestions` (URL, modèle, contexte, résidence,
  jeton facultatif), sur le modèle de `config.localVlm`. Garder le défaut Codex pour les
  configurations historiques ; les campagnes choisissent le rôle explicitement.
  Valeur inconnue ou local incomplet : refus au démarrage, avant constructeur ou appel distant.
  Import/cache/environnement suivent les priorités existantes ; le jeton n'est jamais persisté.
- Conserver le port `answer(input)`, `prepare` et `close`, la sérialisation et l'injection
  de l'agent pour les tests. Chaque question locale part de son contexte/conversation bornés
  fournis par DeepAsk, sans mémoire cachée d'une autre session. Pas de streaming dans cette tranche.
- Traduire les trois définitions d'outils pour Ollama et exécuter leurs appels exclusivement par
  `tools.call`. Vérifier nom et arguments avant dispatch ; ordonner les appels, renvoyer leurs
  résultats comme données, puis obtenir la réponse structurée. Les refus des outils gardent
  leurs limites ; une suite d'appels refusés ne doit pas créer une boucle infinie. Le plafond
  existant de huit appels et l'échéance de la question bornent aussi la boucle d'inférence.
- Garder l'ancrage, la consigne du spectateur distincte des données, les preuves et la validation
  finale DeepAsk. Aucun shell, fichier, connecteur ou outil proposé par le modèle n'est exécutable.
  Une réponse mal formée donne un refus codé ; une citation inventée est rejetée par le produit.
- Le web des questions est une capacité du client Codex, sans port web autonome établi ici.
  Le mode local annonce seulement les trois outils vidéo ; une demande exigeant une source web
  reçoit une limite explicite, aucune source externe validée ni délégation cachée à Codex.
  Le backend Codex choisi explicitement conserve son web et sa validation existants.
- L'identité effective (rôle, backend, modèle et hôte expurgé, paramètres disponibles) vient
  de l'adaptateur, jamais du JSON du modèle. L'adaptateur pose `backend` sur son résultat,
  comme `adapters/local-vlm-agent.cjs:71`, sans secrets. La propagation dans DeepAsk relève de T267.
- Respecter annulation en attente/en vol, échéance et fermeture. Aucun outil ne démarre après
  abandon ; une réponse tardive n'est ni réponse visible ni preuve. Garder les outils jusqu'au
  vrai retour de leur utilisateur selon l'ADR 0004 ; ne pas annoncer la libération du GPU.
- Hors périmètre : accès exclusif et états `queued/running` de T240, politique visionDuringAsk
  de T227, racine/vues de T220/T224–T226, traduction quota de T232 et affichage de T252.
  T240 devra étendre son octroi à cet agent ; l'agent local garde une file `tail` comme
  `adapters/codex-session-agent.cjs:53-56`.
  T234–T245, T250 et T253 gardent cycle de vie et sauvegarde. T264 choisit les embeddings,
  T265 le modèle d'inspection : choisir les questions locales ne change pas ces deux rôles.
  T267 possède l'identité consultable dès la construction, sa propagation dans DeepAsk
  et le complément d'identité Codex ; aucun de ces travaux n'entre dans cette tranche.
- Aucun essai réel dans la session Codex : faux Ollama, données temporaires et autres rôles
  doublés. Modèle local, TV, VPS et fournisseurs restent à l'orchestrateur/propriétaire, hors boucle.

## Critères d'acceptation

1. Par la vraie composition conversation → DeepAsk → VideoTools → faux Ollama, une question
   consulte des paroles puis produit une réponse avec citation acceptée. Deux autres scénarios
   exercent `search_moments` et `inspect_clip` avec recherche/inspecteur maîtrisés.
   Un passage postérieur à l'ancrage ou d'une autre session ne devient jamais consultable.
2. Les trois schémas réels sont annoncés ; appel inconnu, arguments mal formés, intervalle futur
   et dépassement du budget sont refusés. Une demande répétée après épuisement se termine,
   sans nouveau dispatch ni poursuite indéfinie des tours modèle.
3. Le modèle reçoit question, contexte et résultats d'outils comme prévu, sans instructions
   issues des médias. JSON final invalide, citation inventée et source web non ouverte ne
   produisent pas de réponse validée. Le prompt local n'annonce aucun outil web disponible.
4. Deux questions en concurrence restent sérialisées. Annuler en file n'envoie rien ; annuler
   en vol ou fermer abandonne la question en cours : aucun appel d'outil ni réponse tardive n'en sort.
   `close()` ne rend pas l'agent inutilisable : les hôtes le ferment à chaque fin de session puis
   le réutilisent (`runtime/headless-session-lifecycle.cjs:159`, `app/main.cjs:405`) ; après `close()`,
   une question de la session suivante reçoit une réponse. Un outil retenu garde
   son bail jusqu'à sa fin réelle ; aucune libération forcée ne contourne l'ADR 0004.
5. Tests de configuration avec cache temporaire : priorité de l'environnement, backend
   inconnu/incomplet refusé, jeton absent du cache et des diagnostics. Des constructeurs Codex
   piégés prouvent qu'une panne locale ou un refus HTTP ne déclenche aucun repli.
6. Une affectation `agent.model = 'gpt-…'` faite par l'hôte (`app/main.cjs:282`) ne change
   ni le modèle envoyé ni l'identité de l'agent local.
7. À l'implémentation future, jouer en séquentiel `ollama-question-agent`, `chat-codex`,
   `chat-sources`, `question-ceiling`, `portable-config`, `review-regressions` et les contrats de libération
   affectés sous `tests/` (`.test.cjs`), puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/ollama-question-agent.test.cjs` avec faux serveur sur loopback, requêtes retenues
et fichiers temporaires. Traverser la composition commune et les vrais outils ; doubler seulement
recherche/inspection et réseau fournisseur. Observer appels, citations, backend du résultat et libération,
sans comparer le texte du code. Garder les preuves Codex et les bornes produit existantes.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse de périmètre rendue visible : le rôle local demandé porte les trois outils vidéo
existants ; le web intégré à Codex n'est pas porté vers un nouveau fournisseur. Une compatibilité
web des questions locales n'est donc pas revendiquée. Le modèle Ollama capable d'appels d'outils
et de réponse structurée, sa version et sa qualité française restent à choisir/vérifier hors boucle ;
le candidat de perception `gemma3:4b` n'est pas présumé convenir aux questions.
Avec des questions locales, le quota Codex de la vérification manuelle sur le Mac s'affiche
indisponible (`app/main.cjs:252`, `adapters/codex-quota.cjs:12-17`).

La tranche tient en une session en réutilisant DeepAsk et VideoTools, sans streaming, nouveau
web ni refonte de file ; T267 prend séparément la propagation des identités dans les métriques
et traces, y compris les fins sans réponse. T240 n'est pas un prérequis : l'attente réelle de l'agent peut encore
être incluse dans le traitement annoncé avant lui. T227 est requis par la copie GX10 et T259,
pas par cette sélection d'agent qui lit déjà la consultation publique.

## Journal

- Exploration : règles, skill tests, composition commune, DeepAsk, VideoTools, agents, configuration,
  appels des hôtes et ADR 0004/0029/0030/0046 lus. État initial conservé ; détails dans
  `.harness-state/tickets/T263/exploration.md`. Aucun écart prévu.
- Configuration : `node --test --test-name-pattern='question backend imports' tests/portable-config.test.cjs`
  rouge sur `questionsBackend` absent, puis `node --test tests/portable-config.test.cjs` vert (4 cas).
- Composition et paroles : `node --test tests/ollama-question-agent.test.cjs` rouge sur la sélection,
  puis sur l'absence de `answer` ; parcours HTTP/outils/citation ensuite vert.
- Refus et cycle de vie : tests ciblés `invalid calls`, `malformed final|invented video`,
  `concurrent answers|close aborts` rouges sur leurs assertions, puis fichier complet vert (7 cas).
  Logs rouge/vert conservés dans `.harness-state/tickets/T263/`.
- Contrôle intermédiaire : `node scripts/check.mjs --changed` vert, 11 tests observés.
- Parcours complémentaires : recherche et inspection locales, stockage temporaire réel, suppression
  différée pendant le bail, ancrage/session, identité et refus réseau vérifiés par le faux Ollama.
  Échéances contrôlées par horloges injectées ; aucun fournisseur réel exercé.
- Fermeture seule : `node --test --test-name-pattern='closing the agent during' tests/ollama-question-agent.test.cjs`
  rouge (preuve tardive visible), puis vert après transmission d'un signal optionnel à `tools.call`.
  Complément technique justifié dans `ecarts.md` ; aucune libération anticipée du bail.
- Régression de configuration observée : l'assertion exhaustive de `media-asr-options` exigeait
  les nouveaux champs ; attente complétée, puis test ciblé vert, sans retrait d'assertion.
- `node --test --test-concurrency=1` sur ollama-question-agent, chat-codex, chat-sources,
  question-ceiling, portable-config, review-regressions, architecture-f04, video-research,
  evidence-refresh, codex-confinement, media-asr-options et local-vlm-agent : 140/140 verts.
  Commande dans `preuves.md` et sorties dans `regressions-green.log` du dossier d'état.
- ADR 0057 rédigé et lié dans la section Décisions de l'architecture.
- Contrôle final : `node scripts/check.mjs` vert — règles, format, lint, gel et cliquet verts ;
  2 678 tests JavaScript réussis sur 146 fichiers, 47 tests Python réussis.
  Sortie conservée dans `.harness-state/tickets/T263/check-full.log`.
- Verdict `TERMINÉ` enregistré dans le dossier d'état. Aucun commit ni push ; relecture et intégration
  laissées à la boucle. Modèle réel, TV, VPS et fournisseurs non exercés conformément au périmètre.

### Réserves à la clôture

- .harness-state/tickets/T263/relecture-1.md : **1. `adapters/ollama/question-agent.cjs:61` et `adapters/ollama/http-client.cjs:48`** (hors périmètre)
  - **Problème :** chaque requête envoie à la fois `tools` et `format: schema`. Avec Ollama, un `format` en schéma JSON contraint toute la génération. Le modèle pourrait alors ne jamais produire d'appel d'outil : il répondrait toujours directement au schéma. Dans ce cas, la recherche, les paroles et le réexamen seraient en pratique inactifs, sans qu'aucun test sur faux serveur puisse le voir. Je n'ai pas pu le vérifier ici.
  - **Attendu :** lors de l'essai réel du propriétaire, vérifier que le modèle choisi émet bien des `tool_calls` quand `format` est fourni. Sinon, n'envoyer `format` qu'au dernier tour, celui qui est proposé sans outils.
  - **Pourquoi hors périmètre :** le ticket exclut tout essai réel de la boucle (« Modèle local… restent à l'orchestrateur/propriétaire, hors boucle »). Une correction faite à l'aveugle ne pourrait pas être validée dans la session.
- .harness-state/tickets/T263/relecture-1.md : **2. `app/main.cjs:156` et `:289`** (hors périmètre)
  - **Problème :** `TVLENS_QUESTIONS_BACKEND` est maintenant persisté dans le cache comme les autres réglages. Sur le Mac, si l'on importe un fichier avec `local` mais sans URL ni modèle, l'import réussit sans rien dire et l'agent n'est pas recomposé. Au démarrage suivant, `createConversationRuntime` refuse et `app/main.cjs:593` affiche « TVLens ne peut pas démarrer ». Le gestionnaire d'import n'est enregistré qu'après ce refus : on ne peut plus corriger depuis l'application. Il faut passer par une variable d'environnement, par `--config=` ou supprimer `provider.enc`. Par ailleurs, un import valide ne change pas le backend avant un redémarrage.
  - **Attendu :** valider la sélection des questions au moment de l'import, ou recomposer l'agent après l'import.
  - **Pourquoi hors périmètre :** `app/main.cjs` n'est pas dans la liste des fichiers à modifier, et le refus au démarrage est exigé par le ticket.
- .harness-state/tickets/T263/relecture-1.md : **3. `docs/architecture.md:148` et `docs/backend-latency-optimization.md:395-396`** (hors périmètre)
  - **Problème :** la ligne 148 dit encore que `conversation-runtime` compose `CodexSessionAgent`, sans mentionner l'agent Ollama. Le tableau des réglages ne liste pas `TVLENS_QUESTIONS_BACKEND` ni `TVLENS_LOCAL_QUESTIONS_*`.
  - **Attendu :** mettre à jour ces deux passages.
  - **Pourquoi hors périmètre :** le ticket limite la modification de l'architecture à la section Décisions.
