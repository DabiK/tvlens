# Recherche et adaptation à TVLens — 28 septembre 2026

Objectif : augmenter la détection d'actions manquées entre les images habituelles,
sous une limite de 60 secondes et le plafond API global déjà autorisé. Ce document
complète [le contrat original](reexamen-contract-original.md) ; les embeddings multimodaux restent
uniquement dans la roadmap.

## Sources primaires consultées

- [VideoAgent, ECCV 2024](https://arxiv.org/abs/2403.10517) : un agent recherche et
  rassemble itérativement des preuves visuelles via des outils. Application ici :
  `search_moments` puis `inspect_clip`, sans donner à Codex les réponses attendues.
- [VideoTree, CVPR 2025](https://arxiv.org/abs/2405.19209) : représentation
  hiérarchique et sélection guidée par la question, du grossier au fin. Application :
  mémoire textuelle légère, puis réexamen plus dense d'un court intervalle.
- [LENS, dépôt officiel annoncé ECCV 2026](https://github.com/zhangce01/LENS) :
  allocation entre détails spatiaux et couverture temporelle ; vues de voisinage
  2×2, sélection de pics de pertinence et graphe SSIM. Application partielle ici :
  vues globales et recadrage fixe complémentaire, avec ablation du choix des frames.
  Nous n'implémentons ni leur graphe SSIM ni leur modèle CLIP/BLIP.
- [VideoTreeSearch, prépublication juillet 2026](https://arxiv.org/abs/2607.16189) :
  navigation temporelle avec retour arrière explicite pour corriger un mauvais
  candidat. Le papier entraîne une politique ; TVLens ne reproduit pas cet
  entraînement. Les deux inspections autorisées peuvent déjà réviser un candidat,
  mais ne constituent pas une reproduction des résultats de ce papier.

Ces travaux concernent principalement les vidéos longues. Leurs chiffres ne
mesurent pas notre cas de gestes brefs et ne sont pas transférables au POC.

## Choix testés

1. MP4 ralenti quatre fois, audio ralenti au même rythme, timestamps reconvertis
   par le code. Le fournisseur garde le contrôle de son sampling interne.
2. Planches 3×2 avec six frames numérotées et horodatées. Même cadre et échelle.
3. Même présentation avec sélection par changement visuel et couverture temporelle.
4. Variante 3 + proposition de rectangle par le même modèle, à partir des vues
   complètes et de la question uniquement. Un rectangle normalisé fixe sert à
   toute la séquence. Le modèle peut refuser le crop ; aucune annotation du corpus
   n'intervient. Les deux vues gardent exactement les mêmes temps.

Le sélecteur local examine au plus 160 candidats à 8 fps. Il conserve début, fin,
des repères pour limiter les trous temporels, puis les paires avant/après les plus
forts changements. Le delta est la proportion de pixels qui changent de plus de
16 niveaux RGB après réduction à 64×64 ; ce n'est pas une similarité sémantique.
Un seuil de « 98 % identique » ne permet pas, à lui seul, de supprimer une frame :
un petit objet pertinent peut occuper moins de 2 % de l'image.

Le budget final est de 30 frames, au plus cinq planches complètes et cinq planches
recadrées. Le maintien d'images similaires sert parfois à conserver la durée d'un
état et à montrer une absence entre deux apparitions. Une scène statique ne devient
pas artificiellement une succession de nouveaux événements.

## Part d'adaptation propre au POC

L'apport visé est une combinaison testable : preuves ancrées dans la session,
paires avant/après, couverture temporelle, crop fixe conservant les coordonnées,
et possibilité de changer de représentation sans changer le domaine. C'est une
adaptation d'ingénierie inspirée de ces travaux, pas une revendication de nouveauté
scientifique ni un résultat état de l'art.

L'expérience compare les entrées du port à modèle/question/intervalle identiques.
Le coût est la somme des `usage.cost` réellement retournés, sélection de zone
comprise. La latence comprend décodage, sélection, rendu, appels et analyse ;
Codex/recherche sont exclus de cette comparaison contrôlée et mesurés séparément
dans l'intégration complète. Les appels sont bornés par le même signal d'annulation.
