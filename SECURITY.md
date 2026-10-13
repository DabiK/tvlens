# Confidentialité et signalement

Ne pas ouvrir une issue publique contenant une clé, un jeton, des médias privés ou une configuration de TV/VPS. Utiliser le signalement privé GitHub si disponible ; sinon contacter le propriétaire sans joindre le secret dans un premier message.

Les fichiers `.env.local`, les identifiants Codex, les jetons d’appairage et les profils VPN restent hors Git. Le serveur est conçu pour un réseau privé : écoute loopback ou adresse Tailscale explicite, jeton requis, aucun App Server Codex exposé. Les permissions du tailnet restent à configurer par son propriétaire.

Le POC transmet images et transcriptions aux fournisseurs décrits dans le README. Un réseau privé ne signifie pas que l’inférence est locale. Le root TV et les adaptateurs système ciblent un appareil de test précis ; aucune compatibilité universelle n’est garantie.

L’audit préalable à la publication comprend un scan Gitleaks et une comparaison avec les secrets connus sur toutes les versions de fichiers accessibles par les branches et tags. Il réduit les risques sans garantir l’absence de toute information sensible. Les rapports détaillés et sauvegardes non anonymisées restent privés.

## Cloisonnement des agents Codex

Les rôles Codex (chat, surveillance, description des passages, réexamen, résumé, vérificateur manuel) travaillent sur des contenus non fiables : la vidéo, ses transcriptions et les pages web. Une consigne ne suffit pas à les contenir.

**Ce cloisonnement n'est pas absolu.** Il vaut pour une version de Codex, un modèle et une machine. Cette page sépare partout ce qui est **empêché** par un contrôle technique, ce qui n'est que **détecté après coup**, et ce qui reste **inconnu**.

Deux choses sont souvent confondues et sont séparées ici : le **contrôle des outils**, qui décide de ce que le modèle peut appeler, et le **bac à sable du système**, qui borne ce qu'une commande peut faire une fois lancée. Le cloisonnement de TVLens repose sur le premier. Le second n'apporte presque rien dans la configuration actuelle.

Niveaux de preuve : **[réel]** observé pendant un tour de modèle sur le Mac de développement ; **[scripté]** vrai binaire Codex dont le modèle est remplacé par un script local, qui montre ce que le moteur fait d'un appel d'outil et non ce qu'un modèle tenterait ; **[réel, sans tour]** vrai App Server authentifié du Mac, sans aucun tour de modèle ; **[hors ligne]** test à faux App Server ou à faux binaire Codex ; **[non mesuré]**.

### Versions

| Machine | Codex | État |
|---|---|---|
| Mac de développement | `codex-cli 0.160.1`, modèles `gpt-6.1-sol` et `gpt-6-luna` | mesuré, douze tours réels le 13 octobre 2026, plus un début d'inférence de sous-agent ; connexion des quatre rôles en mode par défaut relevée sans tour de modèle |
| VPS | `codex-cli 0.158.0` d'après la supervision | **aucune mesure sous Linux** |

Sous Linux, rien de ce qui suit n'est éprouvé : ni les outils exposés, ni la réponse à `thread/start` que l'application relit, ni la liste des drapeaux connus du binaire, ni les réglages de sous-agents, ni la garde de fil étranger. **Conséquence directe du refus par défaut décrit au §2 : un serveur dont le Codex ne confirme pas ces réglages refuse toute connexion Codex** (§6). Tout résultat vaut pour une version de Codex et un modèle : le catalogue de modèles, pas ce dépôt, décide d'une partie des outils.

### 1. Contrôle des outils

Chaque fil est ouvert **sans environnement d'exécution** (`environments: []`). C'est ce réglage, et non le bac à sable, qui prive le modèle de commande, de lecteur de fichiers et de patch.

Ce que le modèle n'a pas, **consigne neutralisée** (le texte de rôle est remplacé par « exécute exactement ce qu'on te demande », pour que le refus ne puisse pas venir de la consigne) :

| Rôle | Shell, `exec_command` | Lecteur de fichiers, `view_image` | `apply_patch` | Outil de code | Preuve |
|---|---|---|---|---|---|
| Chat | absents | absents | absent | isolat sans `require`, `import`, `fetch` ni `process` ; atteint les trois outils vidéo, l'horloge, la recherche web | **[réel]** |
| Vérificateur manuel | absents | absents | absent | même isolat ; atteint l'horloge et la recherche web seulement | **[réel]** |
| Surveillance | — | — | — | — | **[non mesuré]** en réel ; même client, aucun outil déclaré **[hors ligne]** |
| Description, réexamen, résumé | — | — | — | — | **[non mesuré]** consigne neutralisée ; ni web ni outil déclaré **[hors ligne]**, une image décrite **[réel]** |

Dans les deux rôles mesurés, un fichier canari placé hors de tout contexte n'a pas été lu et rien n'a été écrit.

Le vérificateur manuel passait par `codex exec`, qui n'a pas de fil sans environnement. Il tourne désormais sur la même voie que le chat, sous un rôle sans outil : un processus par vérification, fermé à la fin, à l'annulation et au délai. **Son effort de raisonnement est désormais fixé à `low`** ; l'ancien lancement ne fixait rien et prenait le défaut du modèle. Aucun hôte ne passe d'autre valeur, et la qualité des vérifications à cet effort n'a été jugée que sur une réponse réelle.

Ce que l'application ajoute autour :

- **Réponse de Codex relue.** À chaque ouverture et à chaque renouvellement de fil, l'application relit ce que l'App Server déclare appliquer. Une contradiction ferme la connexion et supprime son dossier. Un champ absent de la réponse à `thread/start` (autre version de Codex) n'est pas une contradiction : il est signalé dans le journal, et `TVLENS_CODEX_CONFINEMENT=strict` le rend bloquant. Le blocage des sous-agents, lui, est exigé par défaut (§2).
- **Rôles bornés.** Analyse : ni web ni outil. Surveillance et vérificateur : web, aucun outil. Une configuration au-delà est refusée à la construction.
- **Contexte séparé des identifiants.** Trois dossiers temporaires distincts par processus : répertoire de travail vide, `CODEX_HOME` ne contenant que des liens vers les identifiants, `HOME` vide. Environnement en liste blanche : aucune clé de fournisseur, aucun jeton, aucun réglage `TVLENS_*`.
- **Requêtes refusées.** Approbation, saisie utilisateur, outil non déclaré : jamais accordés. Les entrées média sont des images incluses dans la requête, jamais un chemin ni une adresse.
- **Sources.** Une source n'est gardée que si sa page a été ouverte. Une ouverture peut rendre plusieurs pages : toutes comptent, pour le chat, la surveillance et le vérificateur. Les résultats d'une simple recherche ne comptent jamais. **[réel]** pour l'ouverture groupée ; l'écartement d'une source non ouverte n'a été vu que **[hors ligne]**.
- **Consigne.** Demande et consigne active du spectateur à part ; vidéo, conversation et web dans un bloc délimité, déclaré non fiable.
- **Arrêt d'un processus.** Fermer un processus Codex envoie SIGTERM à son groupe, puis SIGKILL à ce qui en reste : après trois secondes, ou à la sortie de l'hôte si elle arrive avant (`process.exit` ou fin normale). Dans ce second cas l'hôte attend d'abord 300 ms au plus que le groupe se termine de lui-même, ce que Codex fait en quelques millisecondes **[hors ligne]**, sur de vrais processus. Non couvert : un hôte tué sans préavis (SIGKILL, plantage) n'envoie rien, et un processus Codex qu'il n'avait pas encore fermé non plus. Sous Electron, la sortie de l'hôte n'a pas été exercée. Sur le serveur, l'unité systemd fournie arrête tout le groupe de contrôle du service (`KillMode=control-group`, lu dans `deploy/tvlens.service`, non essayé).

Les drapeaux `--disable` ne sont pas une preuve. Le catalogue de modèles de Codex impose à `gpt-6.1-sol` et à `gpt-6-luna` l'outil de code et les outils multi-agents (`tool_mode: code_mode_only`, `multi_agent_version: v2`) : `--disable unified_exec`, `multi_agent` et `multi_agent_v2` ne les retirent pas.

### 2. Sous-agents

Sans réglage particulier, ces modèles reçoivent six outils `collaboration.*`, dont `spawn_agent`. Un sous-agent a été créé ainsi le 13 octobre **[réel]**. Sur ces fils éphémères, c'est l'appel sans reprise du contexte (`fork_turns: "none"`) qui aboutit ; la reprise du contexte, valeur par défaut, échoue sur une erreur interne de Codex qui n'est pas un contrôle **[scripté]**.

#### Empêché

Le lancement de chaque rôle (chat, surveillance, vérificateur, analyse) porte deux réglages de configuration de Codex :

| Réglage | Effet mesuré sur `codex-cli 0.160.1` | Preuve |
|---|---|---|
| `agents.enabled=false` | les six outils `collaboration.*` ne sont plus déclarés au modèle ; un appel forcé reçoit « unsupported call » | **[réel]** un tour de chat, consigne neutralisée : le modèle n'énumère aucun outil de collaboration et sa tentative par l'outil de code échoue (« is not a function ») ; **[scripté]** les quatre rôles |
| `features.multi_agent_v2.max_concurrent_threads_per_session=1` | une seule place de fil, celle du fil principal : la création est refusée par le moteur, « collab spawn failed: agent thread limit reached » | **[réel]** un tour de chat où le premier réglage était retiré exprès : deux variantes de paramètres refusées, `list_agents` ne montre que `/root` ; **[scripté]** trois variantes |

Dans ces deux tours réels, l'application n'a vu aucun fil qu'elle n'avait pas ouvert, et le canari n'est pas revenu. Chacun des deux réglages suffit seul ; les deux sont transmis.

Ce que l'application fait pour ne pas se tromper sur leur application :

- **Seulement si le binaire les accepte.** Une clé inconnue arrête Codex au démarrage : `agents.enabled`, par exemple, est refusée par les versions 0.139.0 à 0.144.5 installées sur le Mac. Chaque clé est donc essayée à part par `codex features list -c <clé>`, qui charge la configuration comme l'App Server. Seules les clés acceptées sont transmises.
- **Relu, pas supposé.** Une fois Codex démarré, et **avant d'ouvrir le moindre fil**, l'application lui demande sa configuration effective (`config/read`). L'état exposé (`client.confinement.subAgents`) vaut `blocked` seulement si Codex y déclare au moins un des deux réglages, `not-blocked` s'il n'en déclare aucun ou si rien n'a pu être transmis, `unknown` s'il ne répond pas dans les deux secondes. Cette lecture ajoute un aller-retour à chaque connexion : 2 à 3 ms sur quatre connexions, 14 et 17 ms sur la première d'un processus hôte, mesurées sur le Mac.

#### Refus par défaut

**Tant que l'état n'est pas `blocked`, la connexion est refusée**, dans le mode par défaut (`enforce`) comme en `strict`, pour les quatre rôles : chat, surveillance, vérificateur, analyse. Il n'y a pas de repli silencieux vers un lancement moins protégé.

| Cas | Ce qui se passe | Preuve |
|---|---|---|
| Le binaire refuse les deux clés | refus avant tout lancement : aucun processus Codex, aucun fil, dossier de contexte supprimé | **[hors ligne]**, chemin réel de lancement avec un faux binaire |
| Le binaire ne peut pas être interrogé (`codex features list` en échec, binaire absent) | même refus ; l'interrogation est retentée dix secondes plus tard | **[hors ligne]**, idem |
| Clés transmises, `config/read` sans réponse, en erreur, ou sans les réglages | refus après `config/read` et avant `thread/start` : processus fermé, aucun fil ouvert, dossier supprimé | **[hors ligne]**, idem |
| Réglages relus | connexion ouverte, `subAgents: "blocked"` | **[hors ligne]** ; **[réel, sans tour]** pour les quatre rôles, renouvellement de fil compris |

Le message de refus, en français, est l'erreur de la connexion : la vérification manuelle le rend tel quel **[hors ligne]**, le chat en fait le message de la question en échec (lu dans le code, non essayé dans l'interface), et il est écrit une fois dans le journal. Il dit ce qui n'est pas confirmé, la version de Codex installée quand `codex --version` répond, la version sur laquelle le blocage a été mesuré (`codex-cli 0.160.1`) et les deux issues : mettre Codex à jour puis relancer TVLens, ou demander explicitement le mode diagnostic.

- **Échec passager.** Un échec d'exécution de `codex features list` (délai, signal, lancement impossible), pour la liste ou pour l'essai d'une seule clé, n'est gardé que dix secondes : pendant ce délai les connexions sont refusées, puis le binaire est réinterrogé. Une réponse du binaire lui-même (clé refusée par un code de sortie) est gardée jusqu'au redémarrage de l'hôte : après une mise à jour de Codex, relancer TVLens.
- **Mode diagnostic, non confiné : `TVLENS_CODEX_CONFINEMENT=report`.** Il ne refuse rien : ni un blocage non confirmé, ni un fil contredit par l'App Server. Il n'existe que pour diagnostiquer. Quand le blocage n'est pas confirmé, la connexion est lancée quand même, expose `client.confinement.confined: false` avec la raison (`reasons` contient `sous-agents`), et le journal le dit. Une ligne y est écrite **à chaque connexion**, y compris quand tout est confirmé. Aucun code de l'application ne le pose : seule la variable d'environnement de l'hôte le peut, et un test statique le vérifie.
- **`TVLENS_CODEX_CONFINEMENT=strict`** refuse en plus un fil dont la réponse à `thread/start` ne déclare pas le confinement (§1).
- **Tests.** Les tests des autres parties de l'application remplacent le processus Codex par une doublure sans binaire. Cette couture est nommée dans le client (`transportDouble`), n'est franchie par aucun code de l'application (même test statique), et une doublure n'annonce jamais `blocked`.

Limites de cette prévention :

- **Le refus porte sur ce que Codex déclare, pas sur ce qu'il fait.** Une version qui relirait les deux réglages sans les appliquer passerait ce contrôle. Là où la prévention ne s'appliquerait pas, il ne resterait que les gardes réactives ci-dessous, et **ce qu'un sous-agent atteindrait alors n'est pas mesuré**.

- `blocked` dit que Codex déclare le réglage. Que le réglage empêche bien la création n'est mesuré que sur `0.160.1` (macOS), avec un modèle et deux tours réels. Sur le binaire macOS `0.158.0`, les clés sont acceptées et relues **[scripté]**, sans mesure de leur effet sur une création.
- Elle dépend de clés de configuration de Codex. Une nouvelle version peut les renommer ou en changer le sens : la sonde est à rejouer à chaque changement de version ou de modèle.
- Pour le rôle d'analyse, la surveillance et le vérificateur, l'effet des réglages n'est couvert que **[scripté]**, pas par un tour réel. Leur connexion et la relecture des deux réglages sont **[réel, sans tour]**.

#### Détecté après coup

Si la prévention n'est pas appliquée (mode diagnostic, ou réglage relu mais sans effet sur une autre version de Codex), deux gardes de l'application réagissent **après** la création. Elles sont réactives : elles ne remplacent pas la prévention.

- toute notification nommant un fil que l'application n'a pas ouvert ferme le processus, pendant un tour ou entre deux tours **[réel]** une fois, **[scripté]** ;
- un élément `subAgentActivity` ou `collabAgentToolCall` publié sur le fil de l'application ferme aussi le processus : il arrive parfois avant toute notification du nouveau fil **[scripté]**, **[hors ligne]**.

Ce que ces gardes valent, mesuré sans les désactiver :

- **Délai.** Sur l'enregistrement du tour réel, une milliseconde sépare le premier signe de la fermeture ; l'appel de création lui-même n'y est daté par aucun évènement. Face au fournisseur scripté, de 2 à 17 ms séparent l'appel de la fermeture, et le processus se termine de 3 à 18 ms plus tard.
- **Un sous-agent existe pendant cet intervalle.** Lors du tour réel, son tour avait démarré quand le processus a été fermé. Il n'avait publié aucun élément.
- **Une requête d'inférence d'un sous-agent est partie après le signal de fermeture**, une fois sur 259 essais scriptés. La fermeture au premier signe n'établit donc pas qu'un sous-agent n'a rien reçu ni rien émis.
- Un sous-agent qui ne produirait aucune notification passerait inaperçu.
- Une notification légitime nommant un autre fil ferait rejeter un tour à tort. Aucun cas sur les tours mesurés, ce qui est peu.

#### Inconnu

- **Ce qu'un sous-agent peut réellement atteindre.** L'unique requête de sous-agent captée **[scripté]** lui déclarait l'outil de code, `wait`, `request_user_input` et les six outils de collaboration ; ni shell, ni lecteur de fichiers, ni `apply_patch`, aucun des outils vidéo, et un contexte sans répertoire ni terminal. C'est ce que Codex lui annonce, sur un essai, sans le fournisseur réel, et d'après un relevé dont le fichier brut n'a pas été conservé. Ce que ferait un appel de son outil de code n'est pas mesuré, et aucun sous-agent n'a jamais été laissé tourner.
- L'effet des deux réglages sous Linux, sur une autre version de Codex ou avec un autre modèle.
- Le comportement de Codex 0.158.0 avec le catalogue de modèles que reçoit le serveur.

### 3. Ce qui reste exposé, et ce que l'application n'en voit pas

Dans tous les rôles, quels que soient les réglages, le modèle garde `functions.exec` (l'outil de code), `functions.wait`, `functions.request_user_input` et sa variante asynchrone. Aucun réglage connu ne les retire.

**La liste blanche d'évènements de l'application ne voit pas ce qui passe par l'outil de code.** Elle contrôle les éléments que Codex publie sur le fil (messages, recherche web, outils vidéo). Un appel fait depuis l'outil de code ne publie aucun élément. C'est l'isolat de cet outil, sans entrées-sorties, et l'absence d'environnement d'exécution qui bornent ce qu'il peut faire, pas la liste blanche.

`request_user_input` n'a jamais été appelé pendant les mesures ; le refus de sa requête est **[hors ligne]**.

### 4. Bac à sable du système

Les fils sont ouverts avec `sandbox: read-only` et `approvalPolicy: never`. Ce bac à sable est à comprendre pour ce qu'il est :

- **Il laisse lire tout le disque.** « Lecture seule » interdit l'écriture, pas la lecture.
- **Il ne s'applique qu'aux commandes** lancées par l'agent. Il ne couvre ni le processus Codex ni l'outil de code.
- Sans environnement d'exécution, aucune commande n'existe : il n'est pas sollicité. Il redeviendrait la seule barrière si un environnement réapparaissait, par exemple dans un sous-agent, et il ne protégerait alors aucun fichier lisible par le compte du service.

Des **profils de permissions à lecture restreinte** existent dans Codex. Ils ne sont **pas activés**, n'ont pas été essayés avec un fil sans environnement, et ne sont **pas validés sous Linux**. Ne pas les compter comme une protection.

`deploy/hardening.conf.example` propose un durcissement systemd, non déployé et non essayé.

### 5. Autres limites

- **L'injection n'est pas éliminée.** Une phrase de la vidéo ou d'une page web peut orienter une réponse. Une injection placée dans un passage n'a entraîné ni lecture ni appel vers l'adresse indiquée **[réel]**, sur un seul essai. Le cloisonnement borne les conséquences, pas l'influence.
- **Le web est un canal de sortie.** Un rôle qui cherche sur le web peut y envoyer du contenu de son fil dans une requête ou une adresse. L'application le constate après coup, elle ne peut pas l'empêcher. Aucune restriction de domaine.
- **Texte provisoire.** Le message provisoire et l'aperçu d'une réponse s'affichent avant la validation des citations et des sources.
- **Compte du service.** Le processus TVLens lit ses propres secrets et les médias des sessions. Le confinement repose sur l'absence d'outil de lecture donné au modèle.
- **Chemin historique.** `adapters/codex-video-agent.cjs` lance encore `codex exec`. Il ne sert qu'à des scripts d'évaluation, pas à l'application ; il n'est **pas confiné en lecture** et ne porte pas les réglages de sous-agents.
- **Fournisseurs.** Images, transcriptions et questions partent chez les fournisseurs décrits dans le README.

### 6. Avant tout déploiement

Rien n'est à mettre en service sur un serveur sur la foi des mesures du Mac.

**Conséquence opérationnelle du refus par défaut.** Un serveur dont le Codex ne connaît pas les deux réglages, ou ne les relit pas, **refusera toute connexion Codex dès que cette branche y sera déployée** : chat, surveillance, vérification manuelle, description des passages, réexamen et résumé. Ce qui ne passe pas par Codex (capture, transcription locale) n'est pas visé par ce refus ; l'application n'a pas été essayée dans cet état. Cela dure tant que Codex n'est pas mis à jour, ou tant que le mode diagnostic `TVLENS_CODEX_CONFINEMENT=report` n'est pas posé explicitement, auquel cas le service tourne **non confiné**. Le VPS est en `codex-cli 0.158.0` d'après la supervision : **non mesuré**. Le binaire macOS de cette version accepte et relit les deux clés **[scripté]** ; cela ne dit rien du binaire Linux installé sur le serveur.

**Sur le serveur de référence (13 octobre 2026).** La supervision a installé cette branche avec l'autorisation de Dabi et relevé que Codex 0.158.0 y confirme les deux réglages : les quatre rôles se connectent confinés, sous-agents bloqués. Cela couvre les étapes 1 à 3 ci-dessous pour la connexion seulement ; les étapes 4 et 5 (sondes adverses avec tours de modèle) n'y ont pas été rejouées. Preuves et limites : `docs/night-features-delivery.md`, section 13.

Procédure, dans cet ordre, avant de mettre en service :

1. Relever `codex --version` sur le serveur, avec le binaire et le compte du service.
2. Vérifier que `codex features list`, `codex features list -c agents.enabled=false` et `codex features list -c features.multi_agent_v2.max_concurrent_threads_per_session=1` sortent en code 0. Sinon : mettre Codex à jour avant d'aller plus loin.
3. Rejouer sous Linux, sans aucun tour de modèle : `node scripts/probe-confinement.cjs --out <dossier neuf> --steps r --max-turns 0`. Les quatre rôles doivent se connecter dans le mode par défaut, avec `subAgents: "blocked"` et les deux réglages relus, puis **renouveler leur fil sur le même processus** sous la limite d'un fil par session. Si le renouvellement échouait, chaque renouvellement des rôles d'analyse et de surveillance retomberait sur une reconnexion complète.
4. Rejouer `node scripts/probe-confinement.cjs --out <dossier neuf> --steps a,b,c,d,e,g,h,i,k,m --max-turns 10`, avec un compte de test. Les étapes k et m ne sont pas dans la liste par défaut : si la prévention ne tient pas, elles déclenchent une inférence de sous-agent. Lire la sortie brute, pas seulement le code de retour.
5. Vérifier en particulier : fil sans environnement confirmé, absence de shell, de lecteur et d'`apply_patch` consigne neutralisée, aucun outil `collaboration.*` énuméré à l'étape k, création refusée par le moteur à l'étape m, aucun fil étranger.
6. Seulement ensuite, mettre en service. `TVLENS_CODEX_CONFINEMENT=strict` peut alors être posé pour refuser aussi une réponse à `thread/start` incomplète.
7. Rejouer les étapes 1 à 5 à chaque changement de version de Codex ou de modèle.

Sur un binaire dont le blocage n'est pas confirmé, la sonde est refusée dès l'étape 0, comme l'application. Elle n'y mesure le reste qu'avec `TVLENS_CODEX_CONFINEMENT=report`, et signale alors le blocage manquant comme un échec.

La sonde ne met jamais la garde de l'application en observation. L'étape m retire un des deux réglages préventifs le temps d'un tour, pour observer l'autre ; la garde de fil étranger y reste active.

Même après cette procédure, **le cloisonnement n'est pas absolu** : la portée d'un sous-agent, là où la prévention ne s'appliquerait pas, n'est pas mesurée, et la garde de l'application reste réactive.

Les dossiers laissés par un arrêt brutal sont supprimés par `sweepStaleContexts` au démarrage de l'hôte ; un dossier dont le processus vit encore n'est jamais touché.

Réglages de repli, pour diagnostiquer une régression seulement, chacun retirant un contrôle : `TVLENS_CODEX_CONFINEMENT=report` (mode diagnostic, **non confiné** : plus aucun refus, une ligne au journal à chaque connexion), `TVLENS_CODEX_ITEM_GUARD=legacy` (retire aussi les deux gardes de sous-agent ; les réglages préventifs restent transmis et exigés), `TVLENS_CODEX_REAL_HOME=1`, `TVLENS_COMPANION_PROMPT=legacy`.
