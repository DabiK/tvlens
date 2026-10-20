# Harness asynchrone et outils contextuels : options à débattre

**Note de conception exploratoire, non implémentée.** Les objectifs viennent de l’utilisateur ; les mécanismes ci-dessous sont des propositions comparables, pas une nouvelle architecture imposée.

## Réduire les attentes inutiles

Le chemin actuel combine fermeture du segment, transport, ingestion, transcription, vision et réponse. Réduire uniquement le temps d’un modèle peut laisser les autres attentes intactes. Avec des blocs fixes de huit secondes et une phase d’événement uniforme, la fermeture seule représente en moyenne quatre secondes d’attente : calcul illustratif, pas mesure produit.

La [session actuelle](../core/session.cjs) sait publier l’audio partiel. Elle conditionne cependant l’enqueue de vision à la transcription du même segment. La vision utilise ce transcript dans son prompt : décorréler les tâches demande donc de comparer une observation visuelle autonome puis une synthèse, plutôt que de supprimer une dépendance sans changer le sens de la tâche.

Une option consiste à faire circuler des preuves indépendantes : fragment transcrit, observation visuelle, son détecté, résultat de réexamen. Chaque preuve indiquerait identifiant, intervalle source, modalité, instant de disponibilité, statut partiel/complet/échoué, version, provenance et limites. Cette proposition sert à définir les observations du futur harness ; elle ne fixe aucun schéma d’API.

Le consommateur peut utiliser une preuve partielle admissible dès publication. Une tâche nécessitant synchronisation attend uniquement les éléments pertinents, avec une règle explicite d’attente ou d’abstention. Une nouvelle version n’efface pas silencieusement celle utilisée pour une réponse déjà publiée. Mesurer publication et utilisation séparément : publier vite sans que l’agent puisse consommer la donnée ne résout pas le besoin.

## Causalité : plusieurs politiques à comparer

Le [snapshot des outils](../core/video-tools.cjs) fige aujourd’hui les passages à l’enqueue de la question. Distinguer temps de l’événement, temps de disponibilité de son analyse et ancrage de la question.

| Politique candidate | Avantage attendu | Risque ou coût à tester |
| --- | --- | --- |
| Snapshot figé actuel | Reproductibilité et périmètre stable. | Ignore une analyse publiée ensuite sur un média déjà antérieur à la question. |
| Ancrage fixe, preuves enrichies pendant la question | Accepte de nouvelles preuves portant sur le même préfixe causal. | Versions, notifications, révision et terminaison à borner ; une preuve postérieure à l’ancrage reste exclue. |
| Actualisation explicitement demandée | L’agent ou l’utilisateur choisit quand rafraîchir ; changements traçables. | Appels supplémentaires et risque d’oublier une actualisation utile. |

Déplacer l’ancrage vers des événements futurs changerait la signification de la question. Ce n’est pas une conséquence automatique de l’asynchronisme. Les comparaisons doivent journaliser exactement quelle version des preuves était admissible, disponible puis consultée. Un média capturé avant l’ancrage mais analysé après est distinct d’un média capturé après l’ancrage.

## Ressources, files et preuves manquantes

ASR, encodeur visuel, génération et récupération partagent calcul, mémoire et parfois bande passante GPU. Comparer services séparés et service commun lorsque la pile le permet ; ne pas confondre indépendance logique et simultanéité matérielle.

Les options incluent files bornées, quota de travail perception pendant les questions, priorité selon âge des données, coalescence de tâches redondantes et abandon explicite. Chaque abandon doit laisser une lacune observable. Une courbe de retard stable obtenue en jetant les gestes difficiles n’est pas un résultat satisfaisant.

La fraîcheur doit être suivie par modalité, avec couverture des intervalles. Le dernier `ready` et le dernier contexte utilisable de [session.cjs](../core/session.cjs) ne sont pas un front continu sans trou. L’expiration des originaux doit être distincte de l’existence d’un résumé : celui-ci ne permet plus un réexamen factuel détaillé.

## Navigation historique : perception et chat sont distincts

Le chat dispose déjà de recherche de moments, transcription et inspection. La perception reçoit des passages récents et un résumé du sujet actif ; son [prompt actuel](../adapters/codex-perception.cjs) interdit outils et web. Explorer des outils pour cet agent d’analyse est donc une extension possible de ses capacités, pas la découverte d’une fonction absente du chat.

Trois options doivent être comparées : contexte automatique de budget fixe ; récupération agentique uniquement ; contexte minimal avec récupération ciblée. Les outils candidats pourraient lister des repères historiques, rechercher des passages, lire leur transcription et consulter leurs preuves visuelles. Ces capacités sont descriptives : aucun nom d’API ni mécanisme de stockage nouveau n’est décidé.

Un checkpoint peut être un repère temporel, un état de sujet ou une version de mémoire reliée aux preuves. Il ne remplace pas les originaux et ne signifie pas extraction de métadonnées vidéo. Une recherche doit distinguer « rien trouvé », « non analysé » et « média expiré ». Un résumé historique peut orienter la recherche mais ne prouve pas ce qui arrive dans le passage actuel.

Garder les limites de session, sujet et intervalle ; traiter contenus et transcriptions comme des données non fiables ; borner appels, temps et calcul ; tracer les preuves consultées et maintenir l’abstention. Mesurer aussi les boucles infructueuses et omissions. Ces contraintes préservent les garanties existantes, sans imposer que l’analyse adopte exactement les budgets du chat.

## Décisions encore ouvertes

Corpus et annotations ; cibles de délai/qualité/couverture ; cadence et faisabilité LG ; granularité des fragments ; politique de snapshot ; définition et rétention des checkpoints ; budgets d’outils ; ordonnancement GPU ; matériel GX10 exact et pile compatible ; modalités et modèles candidats ; topologie distante puis proche. Ces points doivent être tranchés par preuves ou décision explicite, pas par un chiffre publié sur un autre matériel.
