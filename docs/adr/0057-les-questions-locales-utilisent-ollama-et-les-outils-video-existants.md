# 0057 — Les questions locales utilisent Ollama et les outils vidéo existants

- Date : 2026-10-18
- Ticket : `docs/travail/tickets/263-answer-session-questions-with-ollama-and-the-existing-video-tools.md`
- Statut : acceptée ; amendée par l'ADR 0066 (récupération web locale)

## Contexte

Les deux hôtes composent leurs questions dans `runtime/conversation-runtime.cjs`. DeepAsk fournit
le contexte borné, la conversation de la session et les outils liés à son ancrage. Il valide les
citations et ne rend les outils qu'au retour effectif de l'agent (ADR 0004). Les hôtes réutilisent
leur agent après l'avoir fermé à chaque fin de session ; LocalVlmAgent se ferme définitivement.

## Décision

La composition choisit explicitement `config.questionsBackend`, avec Codex par défaut pour les
configurations historiques. `TVLENS_QUESTIONS_BACKEND=local` exige URL et modèle dans
`TVLENS_LOCAL_QUESTIONS_URL` et `TVLENS_LOCAL_QUESTIONS_MODEL`. `NUM_CTX`, `KEEP_ALIVE` et `TOKEN`
complètent ce même préfixe. La sélection et la configuration locale sont validées avant les
constructeurs, qui restent injectables. Un refus local ne déclenche aucun repli vers Codex.
Les réglages importés persistent comme les réglages de perception ; l'environnement est prioritaire
et le jeton n'est jamais conservé dans le cache.

`adapters/ollama/question-agent.cjs` satisfait `answer`, `prepare` et `close`. Une file `tail`
sérialise les questions. Chaque question reconstruit ses messages depuis les seules données de
DeepAsk ; aucun fil fournisseur ni historique implicite n'est conservé. Le prompt local sépare
demande, consigne du spectateur et données non fiables ; il annonce seulement les trois outils
vidéo. Le web reste une capacité du backend Codex. Une proposition locale de source externe
devient une réponse insuffisante avec une limite explicite.

Les schémas de `core/video-tool-contracts.cjs` sont traduits pour Ollama. Nom et arguments sont
contrôlés avant le seul dispatch autorisé, `tools.call`. Les appels sont attendus dans l'ordre et
leurs résultats reviennent comme données. Huit tentatives au plus, refus compris, utilisent le
même plafond que VideoTools. Un dernier tour sans outils peut produire la réponse structurée ;
une nouvelle demande d'outil termine la question par un refus codé. Les limites de transcription,
d'inspection et d'ancrage restent dans VideoTools, et les citations dans DeepAsk.

`adapters/ollama/http-client.cjs` porte les échanges HTTP non diffusés, leurs erreurs expurgées
et leurs signaux d'abandon. Ce transport est réutilisable par les prochains rôles locaux, sans
déplacer les adaptateurs existants. Le modèle envoyé et l'identité du résultat viennent de ses
paramètres privés, indépendamment du JSON du modèle et des affectations de modèle par l'hôte.
L'identité rendue contient rôle, backend, modèle, hôte sans chemin ni identifiants, contexte et résidence.

Annulation et échéance interdisent tout nouveau dispatch et toute réponse tardive. `close()`
annule la génération courante, questions en attente comprises, puis permet une nouvelle session.
Comme dans le protocole des hôtes, DeepAsk annule les questions avant de fermer l'agent.
L'agent transmet aussi son signal effectif dans l'option de `tools.call` ; VideoTools le combine
avec le signal de la question pour écarter les preuves tardives après une fermeture de l'agent seul.
Un outil retenu reste attendu avec son bail jusqu'à son retour réel ; aucune libération de GPU
n'est annoncée. `prepare()` ne charge aucun modèle implicitement.

## Alternatives écartées

- Réutiliser LocalVlmAgent : il ne boucle pas sur les outils et sa fermeture est définitive.
- Employer le prompt chat Codex tel quel : il annoncerait un web absent du backend local.
- Retenter sur Codex après un échec local : cela rendrait le backend effectif ambigu.
- Rendre les outils dès l'annulation : cela contournerait leurs baux et l'ADR 0004.

## Conséquences

La sélection des questions ne change ni les embeddings, ni la perception, ni l'inspection.
Les questions locales ne disposent pas de RPC Codex pour le quota manuel du Mac. L'identité
consultable à la construction et sa propagation dans les métriques et traces restent à traiter.
Le modèle capable d'outils et de JSON structuré, sa version et sa qualité française restent à
valider hors boucle ; aucun fournisseur réel n'est exercé ici.

## Protégée par

`tests/ollama-question-agent.test.cjs` traverse la composition, DeepAsk, les vrais outils et un
faux serveur sur loopback. Il contrôle citations, ancrage, refus, budgets, sérialisation, fermeture,
réutilisation, baux et échéances. `tests/portable-config.test.cjs` protège les priorités et le cache.
Les suites Codex, sources, plafond et libération gardent les contrats existants.
