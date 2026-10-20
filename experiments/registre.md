# Registre proposé des expériences

**Toutes les expériences ci-dessous sont non exécutées ; tous les résultats sont inconnus.** L’ordre est proposé pour séparer les causes avant de comparer des systèmes complets. Les critères d’acceptation restent à définir, à l’exception de l’objectif utilisateur explicite d’E02 : obtenir une description complète en moins de cinq secondes pour un clip d’environ cinq secondes. Cet objectif n’est pas une performance mesurée ni une garantie.

## Protocole commun à préparer

Constituer un corpus autorisé, français lorsque la parole intervient, avec gestes brefs, changements persistants, actions inversées, répétitions, petites manipulations, coupes, mouvement caméra, sons non parlés et événements traversant les frontières de blocs. Annoter les intervalles qui justifient les réponses et les cas où les observations ne permettent pas de répondre. Prévoir rappel ancien et expiration des médias.

Rejouer les mêmes médias et questions aux mêmes instants, en respectant l’arrivée progressive du flux. Séparer tests de composants et replay de bout en bout. Comparer par paires, distinguer démarrage froid et état chaud, répéter les configurations finalistes ; le nombre de répétitions et l’incertitude statistique attendue restent à définir. Une poignée de questions ne stabilise pas un p95.

Tracer sur une horloge commune : intervalle source, capture, arrivée serveur, entrée/sortie de chaque file, début/fin de calcul, publication de preuve et première utilisation effective. Pour une machine distante, conserver aussi les durées de transport ; ne soustraire des horloges de machines différentes qu’après caractérisation de leur décalage. Identifier modèle, poids, runtime, matériel, quantification, paramètres, cadence réellement encodée, budgets et versions de preuves.

| Famille | Mesures communes |
| --- | --- |
| Fraîcheur | Âge audio et visuel, délai arrivée → preuve disponible → preuve utilisée ; premier token, première information utile provisoire et première réponse vérifiée distingués. |
| Réponse | Délai complet depuis la demande, attente en file et calcul, p50/p95, nombre d’appels et coût par réponse. |
| Couverture | Intervalles observés/compris par modalité, trous, captures perdues, tâches abandonnées, erreurs, expirations. Le dernier segment `ready` ne prouve pas une couverture continue. |
| Qualité | Exactitude sémantique, ordre, direction, comptage, gestes brefs, omissions, abstention justifiée, citations étayées et provenance. Une citation valide structurellement n’est pas une preuve de vérité. |
| Charge | Débit soutenu, pente du retard sur session longue, questions pendant capture, rafales et surcharge distinguées, CPU/GPU, mémoire, calcul, transfert et énergie si mesurable. |

La [file actuelle des questions](../core/deep-ask.cjs) admet un actif et cinq attentes : un afflux supérieur est un test de surcharge, à analyser séparément. Conserver une baseline produit complète, avec outils et web lorsque nécessaires, pour détecter les régressions de capacité.

## E01 — Quelles preuves de mouvement survivent à la capture ?

- **Question :** un geste est-il absent des observations, écarté par la sélection ou mal interprété ?
- **Hypothèse proposée :** un tampon temporel dense et une sélection adaptée préservent davantage de gestes que des captures espacées, à coût documenté.
- **Baseline :** chemin LG actuel ; chemin Mac natif traité séparément.
- **Variantes :** échantillonnage régulier à plusieurs cadences et phases ; observation légère fréquente + sélection et marge avant/après déclenchement ; média natif conservé. La faisabilité de capture LG reste à établir, sans installation à cette étape.
- **Protocole :** partir d’un original à cadence connue, simuler les captures puis faire annoter la suffisance des preuves avant de consulter un modèle. Inclure événements revenant au même état entre deux prises et changements durables.
- **Mesures :** couverture du geste, suffisance des observations, faux déclenchements, coût capture/transport/stockage.
- **Critère à définir :** gain minimal de couverture sous budget d’acquisition acceptable. **Résultat : inconnu.**

## E02 — A/B demandé : clip vidéo ou images sélectionnées depuis la vidéo dense

- **Question :** quelle variante produit une description utile, complète et temporellement juste à un débit compatible avec des fenêtres de cinq secondes ?
- **Variante A — vidéo :** transmettre un clip d’environ cinq secondes à un modèle acceptant la vidéo ; objectif utilisateur explicite : description complète en **moins de cinq secondes de traitement**. Mesurer jusqu’à la fin de génération/validation, pas seulement le premier token. Des clips successifs ne constituent pas automatiquement un modèle de streaming avec état persistant ; relever le prétraitement et les images réellement encodées.
- **Variante B — images :** conserver environ cinq minutes de vidéo dense, observer ses changements à faible coût et sélectionner un budget X d’images ordonnées sur les mêmes fenêtres d’environ cinq secondes ; alimenter le modèle images existant. X = 6 est un point de départ proposé, pas une exigence utilisateur. Garder avant/pendant/après lorsque nécessaire. Comparer aussi au sélecteur Mac actuel alimenté environ toutes les 400 ms.
- **Réemploi décidé pour B :** d’abord [visualChange/selectFrameCandidates](../core/frame-policy.mjs) avec candidats plus denses tirés du WebM Mac ; [frame-selection](../adapters/frame-selection.cjs) reste le sélecteur de réexamen existant. Ensuite seulement, si une faiblesse sur les coupes le justifie, [FFmpeg scdet](https://ffmpeg.org/ffmpeg-filters.html#scdet), [code](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_scdet.c). Ce signal global n’est pas un sélecteur X ni une garantie de petit événement. [Farnebäck/OpenCV](https://github.com/opencv/opencv/blob/4.x/samples/python/opt_flow.py) et PySceneDetect sont différés ; [méthodes, limites et licences](bibliographie.md).
- **Bornes du prototype B :** score précédent/courant, sélection à clôture de la fenêtre, jamais après l’ancrage ; ancrages réguliers et avant/pendant/après à vérifier sous budget X. Le plafond actuel de 64 candidats et la réduction 64×36 doivent être évalués : une balle de 100 ms peut rester invisible au score. Traitement progressif, JPEG des seules images retenues, sans redécodage des cinq minutes à chaque fenêtre ; compter tout le travail. Changement visuel ne signifie pas importance sémantique. Le test de deux heures est hors ligne ; une intégration continue estimée à 0,5–1 journée dans la recherche n’est ni approuvée ni comprise automatiquement dans ce budget.
- **Candidat A local à considérer :** [Nemotron 3 Nano Omni NVFP4](https://huggingface.co/nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-NVFP4), exécutable localement sans abonnement NVIDIA imposé, sous [NVIDIA Open Model Agreement](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-agreement/). Français et débit réel restent à vérifier ; ne pas confondre licence des poids et service NIM/cloud payant. Ce candidat n’est pas une obligation d’installation ni un second modèle à ajouter à la campagne.
- **Longueur de description Nemotron Omni — demande utilisateur :** sur le même clip de cinq secondes et le même modèle, comparer court, moyen et environ 100 tokens ; puis une politique adaptative bornée, plus concise sur scène stable et plus détaillée sur séquence riche, sans appel supplémentaire obligatoire pour estimer la complexité. Le clip de quinze secondes est une variante facultative. La sortie publiée de 15 tokens en 0,64 s ne prouve ni une mémoire assez informative ni une durée extrapolable à 100 tokens.
- **Contrôles de cette comparaison :** média, frames, résolution, runtime, quantification, langue, thinking et caches fixés ; froid/chaud séparés, plusieurs répétitions des configurations retenues dans le budget existant. Chronométrer prétraitement, prefill et décodage complet si exposés, sinon signaler la limite. Compter les tokens réels, distinguer plafond `max_tokens`, arrêt naturel, troncature, JSON incomplet et budget de raisonnement éventuellement non visible. Comparer omissions, ordre, précision et citations avant d’adopter la longueur adaptative. L’objectif cinq secondes→description complète en moins de cinq secondes reste inchangé ; ni une estimation à six secondes ni une règle de proportionnalité ne sont adoptées.
- **Hypothèses à départager :** A peut mieux exploiter le mouvement ; B peut réduire le coût d’inférence. Ni supériorité de qualité, ni vitesse, ni « perte légère » de B ne sont acquises. Le Mac conserve déjà un média dense et sélectionne des candidats ; le LG à quatre prises ne permet pas cette comparaison sans autre source dense.
- **Protocole compact :** utiliser un seul extrait dense autorisé de cinq minutes et les cas G2 existants du PRD, dont apparition de 100 ms, ordre inversé, répétition, petite région, coupe et mouvement caméra. Même source, mêmes fenêtres, même demande de description et mêmes modalités pour A/B ; relever les différences de backbone et d’observations, sans attribuer automatiquement leurs effets au format. Vérifier présence de l’événement dans la source puis dans les entrées effectives. Si l’API masque son échantillonnage, le déclarer inconnu. Les cinq minutes sont une conservation, pas une attente avant analyse.
- **Temps :** isoler fermeture du clip, décodage/sélection, transfert, file, encodage et génération complète. Pour B, inclure le travail du sélecteur, même s’il tourne en amont. L’objectif `< 5 s` vise le traitement du clip disponible ; publier aussi le délai complet depuis l’événement. Le respect isolé de ce seuil ne suffit pas : vérifier retard et pertes lors de clips consécutifs et de questions concurrentes dans G3.
- **Mesures :** information sémantique, exactitude/omissions, présence versus trajectoire, ordre/comptage, abstention et provenance ; temps première information utile/description complète, p50/p95 exploratoires, coût de calcul, mémoire, transfert et débit soutenu.
- **Décision :** A est candidate si elle atteint l’objectif de traitement et préserve la qualité ; B est candidate si son compromis qualité/coût est meilleur sans masquer de geste perdu. Ni absence de runtime ni absence de chiffre publié ne vaut échec d’A. La cadence produit actuelle de huit secondes ne change pas automatiquement.
- **Budget :** comparaison intégrée à G2, deux heures maximum sur le poste optionnel J3 déjà prévu, remplaçant l’ASR résident ; pas de nouvelle campagne ni de migration de runtime en chaîne. Si A ne peut pas être essayée dans ce budget, résultat « non testé », et aucune conclusion comparative.
- **État documentaire :** les [résultats publiés et leurs limites sont consolidés dans le PRD](../docs/PRD-V2.md) : Nemotron Omni/Spark, 0,64 s annoncée pour 15 s de vidéo et 15 tokens ; Qwen3-VL-8B/Spark, cycle médian 5,94 s pour classification en deux tokens (relevé parallèle, article non revérifiable ici) ; VSS/Spark, bloc de 10 s décrit en 8,61 s après disponibilité, p95 8,65 s, contre 6,04 s en mode fichier. Protocoles et sorties non comparables ; aucun ne valide directement cinq secondes décrites en français en moins de cinq secondes. Un seul candidat vidéo dans le budget. Aucun débit TV Lens/GX10 mesuré ; **résultats A et B inconnus**.

### Note rattachée à E02 — reranking visuel guidé par la question

Verdict après challenge Fable 5.1 **medium** et revue Astra : **brique différée**, diagnostic éventuellement utile à la place d’une variante G2, dans les deux heures existantes. Comparer trois ou quatre questions visuelles muettes : personne statique, objet rare, action, répétition. Suivre présence dans le média puis candidats, description/transcript, recherche et inspection `sheets-diverse`. Aucun résultat mesuré à ce jour.

Un essai +reranking n’est justifié que si la preuve existe dans un petit pool mais est mal retrouvée/sélectionnée. Même pool, même modèle final, même budget d’images, avant/pendant/après conservés ; mesurer séparément les manqués du filtre amont, qualité finale/citations et coût de toute la chaîne. Si la baseline suffit, si la preuve est absente en amont, si le runtime manque ou si le gain net n’apparaît pas, conserver le chemin actuel. Pas de scan systématique de cinq minutes, embeddings visuels en fond, juge par image ni grounding régional ajouté au sprint. La stratégie de crop présente dans le code n’est pas branchée à l’adaptateur de production actuel. Voir le [verdict complet dans le PRD](../docs/PRD-V2.md) et la [source CLIP](bibliographie.md). « JEV » reste non identifié ; OpenCV est une bibliothèque, pas un LLM.

## E03 — Publication partielle et dépendances du flux

- **Question :** quelles attentes entre modalités sont nécessaires, et lesquelles retardent une preuve utilisable ?
- **Hypothèse proposée :** publier et utiliser les résultats partiels sans barrière globale réduit le délai entrée-sortie ; certaines synthèses nécessitent toujours une jointure audio-visuelle.
- **Baseline :** publication audio actuelle, vision du segment lancée après transcription, synthèse habituelle.
- **Variantes :** audio et vision indépendants lorsque la tâche le permet ; observations partielles versionnées puis synthèse ; mode synchronisé pour tâches nécessitant le son et l’image.
- **Protocole :** injecter retards/échecs d’une modalité dans un futur harness contrôlé ; comparer disponibilité et utilisation effective sans changer le préfixe causal. Voir les [options de snapshot](harness-et-contexte.md).
- **Mesures :** délai par étape et chemin critique, fraîcheur utilisée, corrections de réponses, cohérence, citations et charge supplémentaire.
- **Critère à définir :** suppression d’attentes sans régression de justesse/provenance. **Résultat : inconnu.**

## E04 — Concurrence, ressources et régulation de charge

- **Question :** quelle répartition ASR/vision/chat maintient couverture et réponses utiles pendant une longue session ?
- **Hypothèse proposée :** un ordonnancement borné peut mieux concilier les besoins que la pause complète de nouveaux travaux vision ou leur lancement illimité.
- **Baseline :** files et priorité des questions actuelles.
- **Variantes :** parts de service réservées, priorités avec vieillissement, coalescence ou abandon explicite ; services partagés ou séparés si compatibles. Deux processus ne garantissent pas une isolation GPU.
- **Protocole :** montée en charge, questions espacées puis rafales contrôlées, surcharge distincte ; comparer mesures isolées et concurrentes sur la même machine. Inclure transfert vers GX10 distant, puis simuler ou mesurer séparément la topologie proche.
- **Mesures :** débit, pente du retard, couverture et pertes, p50/p95, ressources et coût réseau.
- **Critère à définir :** compromis de couverture, délai et ressources, y compris comportement dégradé. **Résultat : inconnu.**

## E05 — Navigation contextuelle par l’agent d’analyse

- **Question :** quand l’analyse doit-elle recevoir l’historique automatiquement ou aller chercher les preuves pertinentes ?
- **Hypothèse proposée :** une récupération ciblée limite le contexte inutile, mais peut omettre des passages ou multiplier les appels.
- **Baseline :** contexte historique fourni actuellement à la perception ; outils du chat inchangés.
- **Variantes :** contexte automatique à budget contrôlé ; outils de navigation de checkpoints/transcription/preuves visuelles pour la perception ; hybride avec contexte minimal et outils. Checkpoint désigne ici un repère historique, pas nécessairement un checkpoint de poids ou de KV.
- **Protocole :** références anciennes, ambiguïtés de sujet, éléments omis d’un résumé, médias expirés et recherche infructueuse. Comparer aussi les preuves réellement consultées, pas seulement la réponse finale. Garder les limites de sujet et de temps.
- **Mesures :** justesse, omissions, citations, contamination passé/présent, appels, tokens, latence/coût et abstention.
- **Critère à définir :** bénéfice net de récupération, avec budget d’appels et risque d’omission acceptables. **Résultat : inconnu.**

## E06 — Apport propre des modalités

- **Question :** quelles tâches gagnent avec audio, visuel ou synchronisation des deux ?
- **Hypothèse proposée :** la parole, les sons non parlés et la synchronisation apportent des preuves différentes ; un modèle omni n’est pas nécessairement le meilleur compromis.
- **Baseline :** transcription + images actuelle.
- **Variantes :** audio seul, visuel seul, transcript + visuel, audio brut + visuel synchronisé ; pipelines séparés et modèle conjoint comme options.
- **Protocole :** tâches où chaque modalité est indispensable, complémentaire ou trompeuse ; mêmes préfixes et mêmes budgets documentés, sources audio et vidéo alignées.
- **Mesures :** qualité française, sons/locuteurs si pertinents, synchronisation, erreurs, abstention, ressources et délai complet.
- **Critère à définir :** gain par catégorie sans imposer de modèle unique. **Résultat : inconnu.**
