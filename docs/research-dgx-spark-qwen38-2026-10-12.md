# Analyse de dgx-spark-qwen38 face à TV Lens

Date : 12 octobre 2026. Objet : concurrence potentielle pour le hackathon ASUS GX10, maturité technique, optimisations et trajectoire de différenciation.

## Conclusion

**Ce dépôt constitue un concurrent potentiel sur la démonstration d'IA locale et l'exploitation du GX10, mais son périmètre public n'en fait pas un substitut direct à TV Lens.** Il transforme un GB10 en plateforme privée d'inférence et de génération. TV Lens organise une expérience de visionnage : capture, transcription, mémoire temporelle, recherche, réinspection et réponses référencées.

Leur avance vérifiable porte sur la profondeur du travail de serving, ses protections opérationnelles et sa documentation expérimentale. Notre différenciation est déjà implémentée dans le domaine et les interfaces, mais **ni l'inférence GX10 ni la tenue d'un flux continu ne sont actuellement validées pour TV Lens**. Il serait excessif de déclarer l'un supérieur en général ou l'autre obsolète.

Recommandation : réutiliser des capacités d'inférence disponibles et démontrer une application temporelle utile sur ce matériel. Éviter un concours de taille de modèle ou de tokens/seconde qui ne répond pas au besoin de visionnage.

## 1. Périmètre et méthode

- Dépôt public téléchargé dans un dossier temporaire, sans exécution de ses scripts.
- Snapshot analysé : [`43d440804531c6e43ec57146ecb510e41233c703`](https://github.com/hasso5703/dgx-spark-qwen38/tree/43d440804531c6e43ec57146ecb510e41233c703), commit du 12 octobre 2026, version documentée v1.28.0.
- TV Lens : HEAD `9758633f9b0324bbcbda8ef7a29cea7aecbb5225`, plus documents de travail locaux présents, dont [PRD-V2](PRD-V2.md). Ce PRD est explicitement futur ; les changements locaux existants ont été conservés.
- Lecture des sources, templates systemd, architecture, benchmarks, évaluations, tests et roadmap ; inventaires indépendants des deux dépôts.
- Documentation SGLang consultée via Context7, notamment les [options spéculatives](https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/arg_groups/fields/spec.py) et le [harness DFLASH](https://github.com/sgl-project/sglang/blob/main/benchmark/uno/README.md). Ces sources actuelles confirment les mécanismes disponibles, pas les performances des images épinglées.
- Aucun modèle, benchmark, test, installateur, service ou déploiement lancé. Aucune performance mesurée dans cet audit.

Les chiffres concurrents ci-dessous sont **des mesures publiées par l'auteur**, examinées avec leur protocole. Leur reproduction locale reste à faire. L'audit ne vérifie pas que l'auteur participe au même hackathon ; aucune évaluation du jury n'est disponible.

## 2. Ce qui a effectivement été construit

| Partie | Réalisation | Rapport à TV Lens |
| --- | --- | --- |
| Serveur texte/vision | SGLang, modèles Qwen, API compatible OpenAI/Anthropic, sept cibles, checkpoints et images épinglés | Backend potentiellement réutilisable, compatibilité avec nos requêtes à tester |
| Voie 27B | NVFP4 ou FP8, drafter DFlash2, contexte étendu, réglages mémoire/concurrence | Alternative à étudier pour perception locale ; vitesse vidéo non établie |
| Voie 176B | Modèle hybride MoE, NEXTN, table PLE/N-gram déportée sur NVMe | Démonstration matérielle ambitieuse ; pas nécessaire à notre MVP |
| Proxy | Keepalive SSE, abort des requêtes abandonnées, plafonds de requêtes, détection de corruption, attente pendant redémarrage | Forte maturité de serving, utile pour clients agentiques et longs prompts |
| Cockpit | Santé par génération réelle, métriques, mémoire, journaux, chargement de voie, actions privilégiées auditées, relais opencode | Interface d'administration de la machine |
| Décisions typées | Endpoint System One, choix/scores/probabilités via logprobs et calibration | Mécanisme possible de routage, pas preuve de compréhension audiovisuelle |
| Images | Qwen-Image 2.1, édition et variante Turbo | Autre usage produit |
| Vidéo | MiniMax-H3 : génération de clips avec son et conditionnement par références | Génération audiovisuelle, distincte de l'analyse d'une émission |
| Déploiement et tests | Installateurs convergents, systemd, guards mémoire, batteries et CI | Produit d'infrastructure nettement travaillé |

Sources : [architecture](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/ARCHITECTURE.md), [System One](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/systemone.md), [voie image](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/image-lane.md), [voie vidéo](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/video-lane.md).

Dans le périmètre audité, je n'ai pas identifié de chaîne correspondant à notre capture continue de programme TV, mémoire horodatée, recherche de passages et réponse avec relecture de la preuve. La vision des modèles peut servir à construire une telle chaîne ; elle ne remplace pas cette implémentation métier. Les routes vidéo du cockpit concernent la génération et le téléchargement de MP4.

## 3. Optimisations : mécanismes, résultats et portée

| Optimisation | Ce qu'elle change | Résultat publié | Ce qu'elle ne démontre pas |
| --- | --- | --- | --- |
| NVFP4 | Moins de poids à stocker et à lire par étape | Permet la recette 27B et contribue au fit du 176B | Équivalence générale de qualité avec BF16/FP8 |
| DFlash2 et drafter NVFP4 à profondeur 16 | Propose plusieurs tokens puis fait vérifier par la cible ; draft plus petit | Campagne v1.9 : médiane greedy ~50 → 65,3 tok/s ; migration officielle v1.14 : 71,4 | Description fiable d'un clip en quelques secondes |
| Vocabulaire réduit du draft 176B | Tête draft de 248 320 à 65 536 lignes, vérification finale sur tout le vocabulaire | A/B v1.8 : code 39,8 → 47,9 tok/s ; prose FR 27,2 → 30,9 ; gains ~14–25 % suivant tâche | Gain identique sur français, vidéo ou tous modèles |
| Table PLE sur NVMe | Retire une table FP8 de 47,7 GiB du pool résident, avec contrôle de résidence des pages | 176B servi sur un seul GB10 ; contexte nominal 262K | Démarrage instantané ou cohabitation avec les autres grosses voies |
| Prefix/radix cache | Réutilise le calcul d'un préfixe déjà vu | Exemple 27K : ~12 s froid contre ~2,5 s réutilisé | Même bénéfice avec de nouvelles images et des prompts sans préfixe commun |
| Autotuning désactivé et CUDA graphs dimensionnés | Réduit variance de boot et étapes exécutées hors graph | Ancienne campagne : c8 92–111 tok/s → résultat plus stable ; graph c8 +6,5 % | Déterminisme complet de toute conversation et invariance de batch |
| Réglage KV/GDN/Mamba et concurrence | Répartit la mémoire entre historique et requêtes actives | Débits agrégés publiés suivant version et nombre de streams | Autant de tokens/seconde pour chaque utilisateur |
| YaRN pour contexte long | Étend les positions du 27B et ajuste cible + drafter | Fenêtre configurée 1 010 000 ; requête réelle ~690K, prefill froid ~40 min | Un million de tokens immédiatement exploitables, ni bonne mémoire vidéo |
| Prompt `lean` | Réduit la réflexion générée pour certains types de requêtes | 364 problèmes publics : médiane 12,1 s xhigh, 8,8 s medium, 6,2 s lean | Non-dégradation universelle de qualité, notamment perception et preuves |
| Sleep on idle, proxy et restart guards | Réduit activité inutile et protège les sessions/la machine | Journaux et essais ciblés publiés | Haute disponibilité ou exploitation multi-tenant |
| Turbo image/vidéo | Change le modèle ou l'adaptateur et réduit les étapes | Image 1024² ~34,3 → 7,5 s ; clip 4 s ~623 → 127 s dans un essai | Compréhension de quatre secondes de télévision en 127 s |

Sources : [benchmarks, protocoles et expériences rejetées](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/BENCHMARKS.md), [changements datés](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/CHANGELOG.md), [contexte 1M](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/context-1m.md), [lean](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/LEAN.md).

### Attention aux versions et au mot « lossless »

Le README rassemble des résultats de plusieurs campagnes. Le chiffre 71,4 tok/s correspond à une campagne du 27B en septembre, pas à une mesure générale de toute la version du 12 octobre. Le snapshot sert SGLang v0.5.21 pour le 27B et un nightly CUDA 13.4 pour le 176B. Le changelog v1.28 publie pour ce dernier des médianes greedy 46,6/49,6 contre 44,3/46,9 auparavant, et un benchmark de serving c4 61 contre 58 tok/s. Les protocoles, modèles et tiers doivent rester attachés aux chiffres.

La vérification spéculative et la quantification de la cible sont deux choses distinctes. Un draft quantifié ou restreint peut diminuer son taux d'acceptation sans restreindre le vocabulaire de la cible ; cela ne garantit pas que la cible NVFP4 égale une cible BF16. Le dépôt documente lui-même des divergences avec la génération autoregressive pure en flottants sur 10/10 prompts, et une différence tool-eval de 93 contre 91 entre drafters. Les autres évaluations publiées ne montrent pas de direction systématique ; elles n'établissent pas une absence universelle de perte.

Le résultat `lean` présente une différence non significative avec medium sur le corpus public. **Absence de différence significative n'est pas, seule, une preuve formelle de non-infériorité.** Le jeu tenu à l'écart annoncé dans ce document n'a pas été exécuté et une partie du matériel OpenReq demeure hors du dépôt.

## 4. Complexité et originalité

Comptage statique des fichiers suivis d'extension py/sh/cjs/js/mjs/html/css, lignes physiques comprenant commentaires et blancs. TV Lens exclut film/promo ; les docs de travail non suivis ne sont pas comptés. Cette métrique situe le volume à maintenir et n'est pas une mesure de qualité, de talent ou d'innovation.

| Périmètre | dgx-spark-qwen38 | TV Lens |
| --- | ---: | ---: |
| Code et scripts hors tests/anciens overlays | 62 fichiers, ~28 269 lignes | 123 fichiers, ~10 743 lignes |
| Fichiers de tests | 171 fichiers, ~41 438 lignes | 29 fichiers, ~2 321 lignes |
| Overlays conservés séparément | 8 fichiers, ~4 861 lignes | Non comparable |

Une part importante de leur volume est le cockpit, le proxy (~4 010 lignes) et l'installation. Leur code de serving texte actuel utilise des images officielles : **ils n'ont pas développé un nouveau Qwen, un nouvel entraînement ou un moteur complet d'inférence propriétaire.** Leur contribution est la composition, le tuning, les corrections/contournements, l'exploitation et les mesures. Les anciennes modifications PLE/QSA ont été remplacées par des capacités upstream, ce qui réduit l'exclusivité de l'avantage.

Source : [situation upstream](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/upstream.md), [attribution des anciens overlays](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/flash-sglang/ATTRIBUTION.md).

| Difficulté | Leur projet | TV Lens |
| --- | --- | --- |
| Inférence GPU, mémoire unifiée, kernels | Élevée : travail documenté proche de la pile système | Faible dans le code livré ; apprentissage/integration GX10 à faire |
| Robustesse d'un serveur de modèles | Élevée : proxy, redémarrages, annulation upstream, clients | Robustesse applicative présente, serving GPU non validé |
| Capture et interfaces Mac/TV | Cockpit navigateur ; pas de parcours de visionnage trouvé | Élevée : Electron, capture Mac/LG, télécommande, médias, transport |
| Chronologie, expiration, provenance | Pas de domaine équivalent identifié | Élevée : ancrage temporel, absence de futur, leases, preuves consultées |
| Compréhension de scènes et causalité | Pas d'évaluation vidéo métier équivalente trouvée | Déjà quelques évaluations, corpus réduits et limites importantes |
| Exploitation/tests | Très développé, nombreuses couches de vérification | Tests et essais réels documentés, mais couverture soutenue à renforcer |

Leur qualité d'ingénierie mérite d'être prise au sérieux. La complexité de TV Lens est différente : coordonner des flux et des preuves au bon instant plutôt que seulement exécuter vite un modèle.

## 5. Preuves : forces et réserves

Le dépôt fournit des outils de bench, drivers MMLU/HumanEval, essais de concurrence et contexte long, tests unitaires, propriétés, fuzzing, mutations, tests navigateur et contrôles anti-dérive. Deux modules purs sont annoncés à 100 % de couverture de branches ; le document explique pourquoi cette couverture ne suffit pas et rapporte aussi les mutants survivants. C'est une bonne discipline expérimentale.

Mais les résultats publiés sont largement des tableaux et comptes rendus ; les sorties brutes exhaustives des campagnes ne sont pas incluses. Les drivers rendent une reproduction possible avec matériel et runtime compatibles, pas déjà accomplie. Les chiffres issus d'un seul box, de quelques prompts, de warm caches ou de campagnes anciennes ne peuvent pas être amalgamés.

Sources : [tests et limites](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/TESTING.md), [drivers d'évaluation](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/evals/README.md).

L'exploitation conserve des limites : une seule grosse voie active à la fois, ~12–15 min de boot 176B, contexte utile lié au pool réellement disponible, erreurs upstream encore ouvertes, déploiement destiné à un opérateur/réseau de confiance plutôt qu'au multi-tenant. La documentation souligne que les caps Docker ne voient pas toutes les allocations CUDA de mémoire unifiée : copier un pourcentage mémoire sans campagne correspondante serait imprudent.

Sources : [mémoire GB10](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/gb10-memory.md), [redémarrages](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/docs/engine-restarts.md), [modèle de confiance](https://github.com/hasso5703/dgx-spark-qwen38/blob/43d440804531c6e43ec57146ecb510e41233c703/SECURITY.md).

## 6. TV Lens : acquis, optimisation et retard réel

TV Lens possède déjà : capture Mac avec média WebM original, capture LG échantillonnée, Whisper local, files audio/vision séparées, transcription partielle publiée avant vision, sélection de frames, caches ASR et inspection, fil conversationnel persistant, recherche lexicale/temporelle/sémantique, inspection bornée, expiration média et réponses liées aux preuves consultées. Les contrôles de citations établissent l'admissibilité/provenance ; **ils ne prouvent pas automatiquement que la réponse est sémantiquement déduite du média**.

Sources code : [session](../core/session.cjs), [sélection](../core/frame-policy.mjs), [transcription](../adapters/local-transcriber.cjs), [inspection](../adapters/clip-inspector.cjs), [outils](../core/video-tools.cjs), [cache inspection](../core/cached-inspector.cjs), [index](../core/moment-index.cjs), [runtime actif](../runtime/session-runtime.cjs).

Les mesures conservées dans [validation](validation.md) donnent :

- ASR français, neuf blocs d'environ huit secondes : moyenne 5,182 s, sans question simultanée ni mesure de précision mot à mot.
- Ancien essai VPS : 15,447 à 21,778 s pour analyser chacun de trois blocs de huit secondes. Fonctionnement vérifié, débit continu non démontré.
- Essais physiques LG/transport et parcours produit existants, portée limitée aux appareils/sources testés.
- Tests automatisés documentés, non relancés pour cet audit.

Si une étape sérialisée prend durablement plus longtemps que l'intervalle d'arrivée de ses tâches, sa file doit croître ou des tâches être abandonnées. Les files bornées de TV Lens protègent la mémoire mais ne constituent pas une garantie de couverture du flux. Cette contrainte motive une mesure soutenue avec questions, pas une simple comparaison de tok/s.

Autres limites : LG acquiert quatre images environ toutes les deux secondes sur un bloc ; un geste entre prises ne peut être reconstruit depuis le WebM artificiel. La perception actuelle utilise transcript + images plutôt qu'une compréhension native de tous les sons et mouvements. Après expiration du média, la mémoire résumée subsiste mais la réinspection ne peut plus apporter de preuve originale.

Le [PRD V2](PRD-V2.md) propose perception GX10, indexation asynchrone bornée, consultation fraîche et éventuellement ASR résident. Le premier candidat décrit est Gemma 3 4B via le backend Ollama du playbook Live VLM, avec repli Codex. Ce sont des pistes non livrées. **Ajouter une perception locale ne rendrait pas à elle seule le chat et la recherche web entièrement locaux.**

Une comparaison historique de stratégies native-slow et planches existe, mais le runtime actif force les planches adaptatives hors smoke ; le score d'une ancienne expérience ne représente pas automatiquement la production présente. Sources : [comparaison et corpus](strategy-comparison.md), [runtime](../runtime/session-runtime.cjs).

## 7. Niveau à comprendre et à développer

| Niveau | Savoir utile | Objectif | Priorité |
| --- | --- | --- | --- |
| Application | Capture réelle, chronologie, files, fraîcheur, expiration, preuve et UX | Répondre correctement sur le présent et le passé, sans inventer ce qui n'a pas été capturé | Immédiate ; déjà largement dans notre code |
| Serving | Chargement chaud/froid, préfill vs decode, KV/prefix cache, quantification, concurrence, annulation, mémoire GB10 | Intégrer un VLM local fiable et mesurer le délai utilisateur complet | Nécessaire pour fermer notre écart GX10 |
| Évaluation | Protocoles figés, mêmes médias, cold/warm séparés, p50/p95, couverture, abstention, causalité | Prouver un avantage produit plutôt qu'une promesse de vitesse | Nécessaire pour le hackathon |
| Kernels/recherche | CUDA, FlashInfer/Triton, layouts, transferts mémoire, nouveaux drafters | Optimiser un goulot restant réellement identifié | Différé ; pas indispensable pour battre une infrastructure sur notre usage |

Nous devons atteindre une bonne maîtrise de l'intégration et des mesures, pas reproduire leur profondeur kernels pour livrer une application utile. Inversement, prétendre surpasser leur serving demanderait des expériences matériel/protocole comparables.

## 8. Trajectoire recommandée pour le hackathon

1. **Conserver le domaine et le parcours TV Lens.** Une infrastructure généraliste peut fournir nos modèles mais n'apporte pas automatiquement notre mémoire ni nos garanties de consultation.
2. **Fermer l'écart local avec un backend étroit.** Garder le candidat et les gates du PRD V2 comme première tranche. Étudier SGLang/Qwen comme alternative si le candidat ne passe pas ou si un bench montre un gain pertinent. Ne pas installer toutes les voies ni commencer par le 176B.
3. **Mesurer la chaîne complète.** Capture → fermeture du bloc → transport/file → ASR/vision → publication → recherche/inspection → réponse. Distinguer fraîcheur des preuves, premier texte utile et réponse complète.
4. **Appliquer les cas G2 existants.** Parole, visuel, synchronisation, ordre inversé, geste bref, détail ancien, trou de capture, expiration, futur interdit. Comparer sur mêmes modalités/frames/budgets.
5. **Prouver la tenue sous charge avec G3.** Session soutenue, questions intercalées et rafale ; retard, pertes, mémoire et annulations visibles. Les durées/seuils du PRD restent des propositions sauf objectifs utilisateur explicitement identifiés.
6. **Faire une démo distincte.** Montrer un programme, demander un détail ancien, retrouver son passage, l'inspecter, répondre avec intervalle et relecture ; montrer aussi l'abstention lorsqu'une preuve est absente. Nommer les composants encore cloud.

Ces étapes sont des recommandations documentaires. Elles ne déclenchent pas d'installation ni de benchmark.

## 9. Quand peut-on parler de supériorité ou d'obsolescence ?

Sur un scénario de visionnage, TV Lens peut rendre un serveur/chat générique insuffisant en apportant des preuves temporelles automatiquement acquises, une mémoire consultable et une expérience TV utile. Une démonstration soutenue de ces capacités constituerait un avantage concret.

Cela ne rendrait pas leur serveur obsolète : il resterait utile pour servir des modèles, générer des médias et exécuter des agents, éventuellement sous TV Lens. Leur avance de configuration est plus accessible à réutiliser depuis son intégration upstream ; leur travail opérationnel demeure conséquent. Notre avantage serait, lui aussi, copiable et doit être renforcé par qualité, simplicité d'usage et mesures.

**Décision proposée : considérer ce dépôt comme référence d'infrastructure et adversaire possible de démonstration locale. Concentrer notre effort sur la perception locale mesurée et la mémoire audiovisuelle vérifiable.**
