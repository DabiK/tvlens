# Préparation traçable des deux premiers essais GX10

Préparation du 20 octobre 2026, **aucune nouvelle inférence**. Les propositions antérieures restent intactes.
Les skills `research-autoresearch` et `research-phoenix` guident le protocole et l'inventaire des mesures.
Les résultats qualité restent `readyForScoring: false` ; à qualité égale, comparer ensuite la vitesse.

## Ce qui est réellement prêt

| Élément | État et preuve |
| --- | --- |
| Douze blocs CNRS, cinq puis trois images | Médias rapatriés et vérifiés, 10 601 210 octets ; `preuves/rapatriement.json` |
| Validation des deux corpus par le vrai runner | 12/12 cas `validated` dans chaque bras ; `preuves/validation-perception-finale/` |
| Budget, code sortie, SIGTERM du wrapper | Exercés sans modèle ; `preuves/exercice-wrapper-v2/verification.json` |
| Flux `visionDuringAsk` | Scénarios figés ; validation avec les 110 blocs **à faire sur GX10** |
| Exécution GPU | Bloquée : lot non terminé à la capture 20:33:40 UTC ; réservation exclusive nécessaire |
| Qualité | Bloquée : références humaines non validées, aucun attendu fourni aux modèles |

`orchestrer.py` appelle exclusivement les deux CLI existantes. Il ne compose aucun agent et ne remplace
ni le calendrier ni les métriques applicatives. La validation est le mode par défaut.
Les fichiers dans `entrees-source/` sont les douze copies exactes distantes ; `entrees-perception/`
est produit par le script antérieur `../2026-10-20-propositions/prepare-visual-ablation.py`, sans réencodage.
Le manifeste initial, les transcriptions et leur provenance sont conservés. L'archive originale est
`preuves/medias-selectionnes.tar` : aucun autre bloc, vidéo complète ou poids n'a été téléchargé.

## Plan pré-enregistré

`plan.json` fixe les entrées, sources exécutables, digests Ollama et poids Whisper base.
Il est scellé avant toute inférence par `preregistration.json`. Toute révision future doit être un nouveau
plan identifié ; aucune sélection a posteriori de la meilleure répétition ni remplacement d'un échec.

| Expérience | A | B | Ordre fixé | Budget global |
| --- | --- | --- | --- | --- |
| Perception isolée | Images 0,1,2,3,4 | Images 0,2,4 | A puis B ; B puis A | 45 min, 48 cas maximum |
| Flux CNRS | `visionDuringAsk: true` | `visionDuringAsk: false` | A puis B ; B puis A | 80 min, 20 questions planifiées |

Le budget inclut copie locale des entrées, empreintes, pré-vol et validations. Aucun runner ne commence
après expiration. Le superviseur suit l'horloge monotone toutes les 250 ms ; les relevés système tournent
sur un thread distinct. Au budget ou à SIGINT/SIGTERM : SIGTERM au seul groupe enfant possédé, puis SIGKILL
après 35 s au maximum si nécessaire. Les fermetures et écritures finales sont hors fenêtre de mesure.
Une réservation borne aussi ce délai, avec 35 s réservées à la fermeture avant son expiration.
Les opérations de copie/scellement ne sont pas interrompues octet par octet ; elles ne déclenchent aucune inférence.
Le monitor est arrêté et rejoint ; son état est enregistré. Un SIGKILL du wrapper ou une panne disque reste
un arrêt brutal : index `running` possible, bruts conservés, aucune reprise automatique.

Le wrapper coupe aussi après trois erreurs/refus consécutifs d'une voie, perte de service Ollama,
moins de 8 Gio de mémoire disponible ou moins de 40 Gio de disque libre. Les erreurs sont observées
sur `campaign.json`, la santé par échantillonnage nominal de cinq secondes ; ce n'est pas une protection
matérielle instantanée. Une CLI non nulle interrompt la suite ; tous les cas déjà acquis restent conservés.
Les retries de langue et retries produit restent ceux du produit : **48 cas ne signifie pas 48 requêtes HTTP**.

Perception : six témoins (blocs 2,10,25,57,96,108), deux erreurs historiques (46,79) et leurs voisins
(45,47,78,80). Sélection issue de la campagne CNRS/base, conservée dans le dossier de propositions.
Même ASR base non corrigée, même ordre de cas et contexte `null` dans les quatre parcours. Le texte ASR
est disponible pour ce nouveau rejeu par apport opérateur ; cela ne prouve pas sa disponibilité au départ
historique de la vision. Les trois images sont la première, médiane et dernière des cinq échantillons,
pas nécessairement la dernière image du bloc. Aucun contexte final ou futur n'est reconstruit.
Cette expérience mesure un composant ; elle ne reproduit pas les files du flux ni exactement ses timeouts.

Flux : CNRS complet, mêmes blocs, cinq questions, modèle questions, index de fond et Whisper **base**.
Base est une référence fixée pour cette ablation, pas le gagnant supposé du lot Whisper. Adopter un autre
Whisper exige un nouveau plan/configuration figés. La suspension empêche de nouveaux départs vision,
mais n'annule pas nécessairement une requête déjà en vol. L'index reste actif dans les deux bras.
L'ablation d'index existe séparément dans `plans/scenario-index-paused.json` ; le wrapper ne la lance pas.
Elle nécessitera une nouvelle expérience ; ne pas combiner simultanément les deux variations.

Aucun démarrage froid normalisé : pas de déchargement, chauffe artificielle ou réinitialisation de service.
`/api/ps` et les durées de chargement observées documentent la résidence ; ils ne certifient pas une condition
chaude identique. Le premier appel de chaque passage reste dans les résultats. A/B puis B/A réduit
un biais d'ordre sans faire disparaître les effets de cache et de température.

## Traces et limites

| Donnée | Capturé | Absent ou à instrumenter |
| --- | --- | --- |
| Identité | UUID essai/runner, répétition, bras, SHA Git réel, archive sources, configuration sans secret, entrées SHA-256 | Binaire Whisper figé par empreinte avant son premier usage ; pas de preuve de compilation reproductible |
| Horloges | UTC et monotone wrapper, horloges produit conservées sans conversion implicite | Aucun alignement supposé entre horloge session et durée brute fournisseur |
| Perception | Prompt, images envoyées, ASR, diagnostics, tokens, préremplissage/génération lorsque exposés | Contexte historique d'origine absent ; modèle `coldStart:false` ne prouve rien |
| Questions | Texte, réponses, citations, abstentions/erreurs, délai complet, file, métriques produit et HTTP sondé | **Premier token, attente agent, réseau pur et détail question préremplissage/génération : null** |
| Retard/pertes | `journal`, `consultation`, `summary` intégraux du runner flux | Pas de mesure de transport TV réel |
| Machine | `/proc`, processus sans arguments, `nvidia-smi`, processus GPU, `/api/ps`, services tmux avant/pendant/après | **Charge GPU précise par processus absente** ; mémoire GPU peut être N/A sur GB10 ; cadence nominale, pas profilage continu |
| Modèles/services | Digests tags vérifiés ; version Ollama ; Whisper binaire/poids empreintés | Réglages effectifs du lancement Ollama non relus depuis son environnement ; aucune copie d'environnement global |
| Qualité | Export `a-annoter.json`, résultats et champs jugement `null`, prêt à relire | Aucun score automatique, oracle non validé, aucune réussite déduite de `complete` |

Chaque sortie contient `index.json`/`index.jsonl`, `plan.json`, sources en `code.tar.gz`, manifeste
`inputs.sha256.json`, et `before.json`/`after.json`. Les sous-dossiers de phase ont `execution.json`,
`stdout.log`, `stderr.log`, `systeme.jsonl`, signaux éventuels et le `run/campaign.json` du runner.
`index.json` décrit la fin de l'orchestration, pas une réussite scientifique. `synthese.json` garde la
synthèse produit séparée du jugement ; `a-annoter.json` conserve toutes les issues, y compris validations,
erreurs, annulations et absences. Filtrer son champ `trial` et le mode du rapport pour analyser les mesures.
Les exports pointent vers le cas/runner et gardent diagnostics/prompt/images ; `campaign.json` reste la preuve primaire.

Les attendus se préparent hors des entrées modèles et doivent être figés avant lecture des réponses.
Aucun attendu n'est fabriqué ici. Annoter dans un **nouveau fichier**, hors des sorties scellées ; lier
chaque jugement au SHA du rapport et aux images réellement reçues. Distinguer preuve absente de
l'échantillonnage, erreur ASR, perception, résumé, récupération puis synthèse finale.
Rapporter les délais individuels, médianes, pertes et retard séparément ; pas de p95 robuste sur cinq questions.
Une proportion « pertinente sous 20 s » attend la validation humaine. Spring et les holdouts ne font pas partie de ce lot.

## Isolation et prérequis des autres pistes

Exécution seulement sur Linux ARM64. Le wrapper refuse tant que `termine.txt` n'existe pas, prend le verrou
existant du lot en lecture sans le modifier, puis un verrou commun de futurs essais et refuse un autre
rejeu détecté. Il conserve ces verrous jusqu'à la fin. Il ne tue ni service ni processus extérieur.
La réservation est une attestation opérateur que TVLens/les autres clients n'utiliseront pas Ollama
pendant le créneau. Le verrou est coopératif : il ne peut interdire à un client externe ignorant ce verrou
de lancer une requête. Les services existants restent en place ; aucune observation ne prouve leur inactivité future.

| Piste | Prérequis qui bloque réellement |
| --- | --- |
| Instrumentation questions/Phoenix | Ticket produit pour durées/tokens Ollama, corrélation campagne/question et mesure distincte du surcoût ; Phoenix non installé et non requis pour commencer |
| Questions seules sur mémoire figée | Aucun CLI disponible ; composition dédiée à développer et à valider, même préfixe et mêmes prompts, sans relancer ASR/perception |
| Mémoire longue/index | Questions de rappel ancien et abstentions à construire/valider ; trace de recherche et couverture d'index ; l'ablation actuelle mesure seulement le coût avec questions actuelles |
| vLLM | Pré-vol ARM64/SM121, image et checkpoint/digests, JSON/outils/template, adaptateur API ; quantification différente = comparaison de stack ; aucun téléchargement/serveur ici |
| Cosmos | Checkpoint exact, support moteur/GB10, mêmes images/ASR et format, français/chronologie ; aucune installation ni recette présumée exécutable |

## Incidents et validations de cette préparation

La première validation s'est arrêtée **avant le runner** : SHA local `d4183da` contre distant `2035a2f`.
L'écart ajoute seulement agent/skills/documents ; le plan admet explicitement ces deux SHA, avec contrôle
identique de chaque source exécutable. Le refus et son index sont conservés dans `preuves/validation-perception/`.
Les validations intermédiaires réussies sont archivées sans perte (`validation-perception-v2.tar.gz`, `v3.tar.gz`),
avec vérification de toutes leurs empreintes avant retrait des copies décompressées. Cela évite de présenter
leurs copies de sources comme de nouveaux modules du dépôt lors du contrôle de qualité.

Les exercices sans modèle prouvent seulement gestion des sorties, code 7 conservé, budget et interruption
sur un processus léger. Ils ne mesurent aucune performance GX10 ni la fin d'une requête Ollama réelle.
Les contrôles supplémentaires, leurs sorties, limites et code retour sont dans `preuves/verification.json`
et `preuves/check-changed.*`. Le statut final de ces contrôles doit être lu dans ces fichiers.

Les commandes reproductibles et le rapatriement sont dans [commandes.md](commandes.md).
Aucun commit/push, écriture distante, arrêt de lot ou modèle lancé pendant cette préparation.
