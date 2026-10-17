---
id: T240
titre: Start a question only once the shared agent is granted to it
statut: a-faire
bloque_par: T239
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une question attend l'accès réel à l'agent partagé de l'hôte avant de devenir « en cours » et
de consommer son plafond ; fin visible, agent rendu et outils libérés restent trois faits (ADR 0004).

## Sources

- `docs/domaine.md`, section 3 Questions ; ADR 0030 et ADR 0004.
  T239 a migré toutes les fins Mac ; T227 a sorti la politique vision de la mémoire.
- Code vérifié à `1d8aa48` : `core/deep-ask.cjs:79` soumet, `:106` draine et marque running
  à `:109`, `:133` arme le plafond avant l'appel d'agent à `:173`. L'attente interne de
  `adapters/codex-session-agent.cjs:53` peut donc déjà consommer ce plafond.
- Une seconde chaîne existe dans `adapters/codex-session-client.cjs:167` ; le tour attend
  encore le drainage d'un tour refusé à `adapters/codex-session-run.cjs:150`. L'octroi ne peut
  être déduit du seul appel de la méthode publique answer. La préparation/connexion suit à `:152`.
- `core/deep-ask.cjs:114` poursuit la file après la fin visible ; `:218` attend séparément
  le vrai retour pour rendre les outils. `:43` annule, `:62` annule toute la file et `:69`
  restaure silencieusement. Fin visible et libération sont déjà distinctes ; ne pas les fusionner.
- `runtime/conversation-runtime.cjs:73` construit un DeepAsk par hôte ;
  `runtime/headless-session-lifecycle.cjs:78` oublie le checkpoint puis restaure les questions
  avant le transfert de référence à `:80`. `runtime/session-closing.cjs:29` annule et attend les fins visibles.
- `runtime/question-checkpoint.cjs:25` remet le dernier état au store d'origine ;
  `app/main.cjs:162` filtre les questions sauvegardées et `runtime/headless-runtime.cjs:135`
  déclenche leur checkpoint. Les formats et la cadence ADR 0003 restent conservés.
- Tests lus : architecture-f04, deep-ask-restore, question-ceiling, question-checkpoint,
  conversation-runtime, chat-codex, mac-ipc-contract et server-sessions sous `tests/`.
  `tests/architecture-f04.test.cjs:96` retient séparément agent et inspection après timeout.

## Périmètre

- Modifier la coordination de conversation et le raccord au coordinateur sous `runtime/`,
  `core/deep-ask.cjs`, le contrat d'accès agent et son adaptateur si nécessaire, les deux compositions
  et leurs tests. Tout nouveau service applicatif Questions va dans `runtime/inquiry/`, avec les
  permissions exactes de la garde T205 ; aucun import de Questions dans le domaine Mémoire.
- Le déchargement est livré par T236, T238 et T239, sous le contrat de test T234 ; T250 fournit
  les faits de fin. Ce lot ne réécrit pas le déchargement.
- Rendre explicite l'octroi de l'accès exclusif à l'agent partagé par l'hôte. Tant qu'il n'est pas
  accordé, la question reste queued, sans `startedAt` effectif ni minuterie de traitement. L'attente
  est annulable ; une demande annulée avant octroi n'appelle jamais l'agent, même après son retour.
  L'adaptateur ne mute pas la question : il expose l'accès effectif par un contrat injecté et testé.
  Couvrir aussi la file du client et son drainage : aucun tour n'est dit commencé pendant ces
  attentes internes. La connexion nécessaire à un agent désormais accordé garde son coût de traitement.
- Le retour réel de l'agent rend sa disponibilité ; le dernier appel d'outil rend ses ressources
  selon l'ADR 0004. Annulation ou timeout visibles ne prouvent aucun de ces deux faits. Une
  inspection encore en vol garde son bail même si un autre travail peut désormais utiliser l'agent.
- Préserver cinq attentes au plus, ancrage figé à l'envoi, plafond depuis le départ effectif,
  mesures séparées d'attente/traitement, validation de preuves et identifiants historiques. Coordonner
  aussi fermeture/préchauffage du même agent : aucun close tardif de A n'interrompt un tour de B.
  La préparation du contexte de départ reste après octroi, dans le préfixe figé à l'envoi ;
  attendre l'agent n'élargit ni la portée ni les preuves admissibles de la question.
- Ce lot ne déplace pas tout DeepAsk dans `core/inquiry/`, ne crée pas l'agrégat complet QuestionQueue
  et n'ordonnance pas plusieurs sessions déchargées. Il fixe l'accès exclusif nécessaire à la
  Bibliothèque ; les extractions Questions restent une phase ultérieure.
- Ajouter un ADR court sur l'octroi et les trois états de la question (fin visible, agent rendu, outils libérés), lié
  dans `docs/architecture.md`, section Décisions, et tout index documentaire nécessaire. Élaguer les suppressions ESLint inutiles ;
  ne déplacer aucun fichier gelé ni augmenter le stock d'accès globaux au temps.

## Critères d'acceptation

1. A est finie visiblement alors que son agent ignore l'abandon : une question de B peut attendre
   l'accès, reste queued et n'épuise pas son plafond. Quand l'agent revient, un unique octroi
   marque running et `startedAt`, puis le plafond complet commence. Aucune réponse tardive n'est adoptée.
2. Annuler B ou la décharger pendant cette attente empêche tout départ après libération de l'agent.
   Une file encore chargée progresse après un refus d'accès ; il n'y a ni double octroi ni fuite d'attente.
   Un client encore en drainage ne fait pas démarrer le plafond par la seule entrée dans sa file.
3. Avec agent puis inspection libérés séparément, l'agent redevient disponible après son retour,
   mais les outils et leur bail restent retenus jusqu'au dernier appel. Aucun nettoyage forcé
   par délai et aucune écriture de résultat après fin visible.
   `tests/architecture-f04.test.cjs:105-108` change volontairement : « Suivante ? » reste
   `queued`, sans `startedAt`, jusqu'au retour de l'agent de « Longue ? » (`:114`), puis répond ;
   les assertions `:109-123` restent identiques.
4. À l'implémentation, jouer en séquentiel les suites citées, le contrat T234,
   `tests/headless-session-lifecycle.test.cjs` (ou le fichier du coordinateur nommé au journal
   de T236) et les nouveaux tests d'accès, puis `node scripts/check.mjs`. Seul change dans les suites existantes
   `tests/architecture-f04.test.cjs:105-108` ; `tests/question-ceiling.test.cjs` reste identique
   (sa doublure rend la main à l'abandon, `:20-24`).

## Test d'acceptation attendu

Créer `tests/question-agent-access.test.cjs` : vraie conversation et contrat d'accès injecté ;
retenir retour d'agent et outil par des promesses distinctes. Une horloge maîtrisée prouve
l'absence de plafond avant octroi. Une doublure sans sérialisation cachée vérifie l'exclusivité,
l'annulation avant accès et la progression après refus. Le vrai raccord Codex couvre sa file
et son drainage ; son seul test interne ne suffit pas. Garder `tests/question-ceiling.test.cjs`
identique et conserver les assertions de libération de F04.

## Hypothèses bloquantes

Aucune décision n'est attendue.

L'attente d'accès dure jusqu'au retour réel de l'agent ; le client Codex ferme un tour abandonné
après `INTERRUPT_GRACE_MS` (`adapters/codex-session-run.cjs:6`, `:111-120`). Un agent qui ne
revient jamais laisse la suivante `queued` et annulable, sans plafond consommé ; une borne
indépendante de l'adaptateur serait une décision du propriétaire.

Le plan ne demande pas ici l'extraction complète du domaine Questions. Le propriétaire de la file
peut encore être la façade DeepAsk, mais sa liaison de session et l'octroi doivent être explicites.
T239 implique T227, dernier successeur de phase 1 des deux compositions. Le protocole d'octroi
est une interface à livrer, pas une capacité réputée présente dans l'agent actuel.

## Journal
