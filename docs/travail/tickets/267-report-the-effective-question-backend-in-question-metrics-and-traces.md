---
id: T267
titre: Report the effective question backend in question metrics and traces
statut: a-faire
bloque_par: T263
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Chaque question conserve l'identité de son agent dans ses métriques et ses traces, même sans
réponse du fournisseur. L'expérimentateur distingue le choix configuré, l'agent effectivement
composé et les appels effectués, pour les backends Ollama et Codex. Une session Codex, un commit.

## Sources

- Décision du propriétaire du 17/10 au soir : choisir et consigner les backends des rôles
  avant l'expérience GX10, sans repli implicite. Coupe demandée par la relecture Opus, constat 2 :
  T263 livre l'agent local et sa composition ; ce ticket livre la propagation de son identité.
- Code relu à `4599eea` : `runtime/conversation-runtime.cjs:37-45` choisit l'agent et
  `:70-82` l'injecte dans DeepAsk. T263 étend cette composition à Ollama avec des constructeurs
  injectables, sans transmettre encore cette identité aux métriques du cœur.
- `core/deep-ask.cjs:173` appelle l'agent ; `:175-203` valide les preuves et publie la réponse
  ou l'erreur. `:212-214` construit `job.metrics` et la trace `job.finished` sans identité de backend.
  Les traces `job.accepted`, `job.timeout`, `job.started` et `job.error` sont en `:99`, `:119`,
  `:131`, `:198` ; elles sont actuellement limitées au mode `chat`.
- `core/deep-ask.cjs:43-53` termine une annulation en file sans passer par `run` ;
  `:116-127` publie un timeout avant le retour éventuel du fournisseur. L'identité ne peut donc
  pas dépendre d'un résultat réussi. `:216-218` garde les outils jusqu'au vrai retour de l'agent.
- `adapters/local-vlm-agent.cjs:69-71` pose `backend` après le JSON du modèle ; T263 applique
  cette règle au résultat des questions locales. `adapters/codex-session-agent.cjs:168-179`
  n'ajoute comme identité que `model`, à côté des temps ; `:30-40` délègue modèle et compte au client.
- `adapters/chat-trace.cjs:13-42` fournit sérialisation d'erreur expurgée et trace injectée.
  `tests/chat-codex.test.cjs:4-41` couvre preuves et isolation des sessions ;
  `tests/question-ceiling.test.cjs:59-114` couvre fins, annulations et métriques sous horloge maîtrisée.
  `tests/ollama-question-agent.test.cjs` sera livré par T263 avec un faux serveur Ollama.
  ADR 0004 et 0046 : cette mesure ne change ni libération ni consultation des preuves.

## Périmètre

- À modifier : `core/deep-ask.cjs`, `runtime/conversation-runtime.cjs` pour transmettre le
  choix configuré et l'origine de l'agent, l'agent Ollama livré par T263 dans `adapters/ollama/`,
  `adapters/codex-session-agent.cjs` pour compléter son identité, et leurs tests.
  Adapter `adapters/chat-trace.cjs` seulement si le diagnostic expurgé l'exige.
  Aucun déplacement de fichiers ni nouvel ADR : la composition est celle décidée par T263.
- L'agent expose dès sa construction une identité diagnostique en données simples : rôle
  questions, backend, modèle, hôte expurgé et paramètres disponibles. DeepAsk lit cette identité,
  jamais le JSON du modèle. Elle existe avant tout appel et reste disponible après un refus.
  Une donnée indisponible reste inconnue ; le modèle Codex effectif n'est pas inventé depuis
  sa sélection par défaut. Un changement de sélection ne réécrit pas l'identité des questions finies.
- Écrire cette identité dans `job.metrics` et dans les traces `job.*`, pour les issues `done`,
  `error`, `cancelled` et `timeout`, en modes `chat` et `inspect`. Inclure l'annulation en file,
  qui ne passe pas par la construction actuelle des métriques dans `run`.
  Les traces déjà émises conservent leurs noms et leur sens ; chaque fin reste identifiable.
- Distinguer choix configuré, agent injecté ou simulé, et appel effectivement effectué.
  Un agent doublé ne prouve pas un appel au backend configuré ; une question annulée avant
  envoi garde l'identité de son agent et l'absence d'appel. L'entrée dans `answer` ne prouve
  pas un envoi fournisseur après la file interne : utiliser les faits de l'adaptateur,
  sinon laisser cet envoi inconnu. Ne pas mesurer ici l'octroi d'accès réservé à T240.
- Garder le champ `backend` du résultat local livré par T263 sous l'autorité de l'adaptateur.
  Une tentative d'usurpation dans la réponse, une erreur ou une réponse tardive ne remplace
  ni l'identité composée ni l'issue terminale. Les diagnostics ne contiennent ni jeton,
  URL privée complète, `authHome`, consigne, contenu de question ou média.
- Les rôles recherche et inspection gardent leurs propres identités ; choisir Ollama pour
  les questions ne permet pas de déclarer tout le traitement local. T259 consomme les faits
  des questions ; T261 possède le bilan et la table de tous les rôles.
- À ne pas toucher : configuration, transport, boucle d'outils, prompt et fermeture réutilisable
  livrés par T263 ; backends des autres rôles T264/T265/T266 ; politique de file, plafonds,
  ancrage, validation des preuves, baux, accès exclusif de T240, politique vision de T227.
  Conserver les métriques temporelles existantes et la libération de l'ADR 0004.
- Aucun essai réel dans la session Codex : faux Ollama, client Codex doublé, temps maîtrisé
  et fichiers temporaires. Modèle local, TV, VPS et fournisseurs restent à l'orchestrateur
  ou au propriétaire, hors boucle. Aucun téléchargement ni installation.

## Critères d'acceptation

1. Par la composition conversation → DeepAsk → faux Ollama, une question terminée publie
   la même identité effective dans son `job.metrics` et ses traces `job.*`. Traces et métriques
   portent l'identité de l'agent réel même si le JSON tente de l'usurper.
2. Refus HTTP, réponse mal formée, annulation en file, annulation en vol et timeout conservent
   cette identité sans attendre de réponse réussie. Les issues `done`, `error`, `cancelled`
   et `timeout` sont couvertes en modes `chat` et `inspect`. Une annulation avant envoi ne
   compte aucun appel ; une réponse tardive ne change ni l'identité ni l'issue publiée.
3. Codex explicite avec client doublé expose aussi son identité avant l'appel et après une
   erreur. Configuration locale avec agent injecté ou simulé reste déclarée comme telle,
   sans être comptée comme inférence locale. Modèle ou preuve d'envoi inconnus restent inconnus.
4. Les rôles recherche et inspection gardent leurs propres identités ; choisir Ollama pour
   les questions ne permet pas de déclarer tout le traitement local. Aucun secret ni contenu
   de modèle ne figure dans les champs diagnostiques ajoutés ; une erreur du diagnostic
   n'empêche pas la réponse ni la progression de la file.
5. Les preuves, temps, plafonds et baux existants restent valides. Retenir le retour de l'agent
   après annulation ou timeout laisse ses outils détenus jusqu'à sa fin réelle, sans nouvel
   appel de mesure ni libération forcée pour compléter la télémétrie.
6. À l'implémentation future, jouer en séquentiel `ollama-question-agent`, `question-ceiling`,
   `chat-codex` et les contrats de conversation/libération affectés sous `tests/` (`.test.cjs`),
   puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Étendre `tests/ollama-question-agent.test.cjs` par la vraie composition et le faux serveur
livrés par T263. Capturer les traces par le callback injecté et lire le snapshot public de
DeepAsk ; comparer l'identité de l'adaptateur aux métriques et traces, avec un JSON hostile.
Dans `tests/question-ceiling.test.cjs`, maîtriser temps et promesses pour les fins sans réponse
et l'annulation avant envoi ; dans `tests/chat-codex.test.cjs`, couvrir l'identité Codex et
les agents injectés. Aucune lecture du texte du code, aucun fournisseur réel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T263 est le seul prérequis direct : il livre l'agent Ollama, sa composition et le `backend`
de ses résultats. Ce ticket ajoute l'identité consultable avant réponse et sa propagation.
Les chemins définitifs de l'agent sont à relire après T263 ; aucun fichier futur n'est réputé
présent à `4599eea`. T264 et T265 ne bloquent pas cette mesure du seul rôle questions.
T240 reste distinct : avant lui, l'attente interne de l'agent peut encore être incluse dans
le traitement annoncé. Ni l'identité composée ni ces tests ne prouvent le GPU, la qualité
ou le débit du modèle réel ; ces mesures restent hors boucle.

## Journal
