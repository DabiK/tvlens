# Relecture des six fiches GX10 et annotation à l'aveugle

Les six fiches et les trente questions utilisées sont copiées telles quelles dans
[`snapshots/`](snapshots/) et leurs SHA-256 dans [`manifest.json`](manifest.json).
Ce **gel de la version provisoire** permet d'attribuer les réponses aux entrées exactes des
campagnes closes. Il ne vaut pas validation de leurs attendus : les six statuts restent
`draft_requires_media_review` et `readyForScoring=false`. Aucun fichier original de
`experiments/gx10/evaluation/` n'est modifié.

[`annotation-aveugle.jsonl`](annotation-aveugle.jsonl) contient 90 réponses acquises ou
manquantes (six vidéos × cinq questions × trois variantes Whisper), dans un ordre mélangé
par question, sans identité de variante ni délai. Les champs de note et de justification
restent vides. Ouvrir [`correspondance-apres-notation.json`](correspondance-apres-notation.json)
**seulement après la notation** pour révéler les variantes, les fichiers bruts, leurs SHA-256
et les durées HTTP. Le mélange est reproductible par [`preparer.py`](preparer.py).
Les réponses de modèle et les transcriptions des campagnes ne servent jamais à rédiger
l'attendu. Le paquet de notation et la correspondance restent des fichiers distincts.

## Relecture prioritaire

[`priorites.json`](priorites.json) donne les passages à contrôler d'abord :

| Question | Vérification nécessaire |
| --- | --- |
| `cuisine-07` | Écouter et voir 09:00–10:56 : trois `insufficient`, ordre bouquet/champignons/oignons et preuves disponibles avant 10:56. |
| `tears-07` | Aligner le SRT officiel : 90 % à 08:24–25 et réécriture complète à 08:58–59, avant la question de 09:12. |
| `artemis-07` | Contrôler la pose à 34:56 : l'ASR à 03:24:40 annonce encore « 30 seconds … until … main engine cut off » ; le texte à 03:24:43 n'est pas, à lui seul, l'annonce d'une coupure déjà survenue. Revoir son et décalage source/local. |
| `spring-06` | Revoir l'événement visuel ancien et sa présence dans les images réellement échantillonnées ; trois `insufficient`. |
| `kennedy-06` | Réécouter 04:00–04:32, car l'ASR utile déborde l'intervalle inscrit dans la fiche ; `small` donne `insufficient`. |

Le contrôle de la source **Artemis** corrige un faux signal d'alerte de l'inventaire
préliminaire : le segment « main engine cut off » à 03:24:43 est grammaticalement la
suite de « 30 seconds now until » à 03:24:40. Il n'établit pas que la coupure a déjà eu
lieu à la pose 34:56. Aucune correction de temps n'est appliquée sans vérification sonore.

Les médias des campagnes sont identifiés par leurs empreintes dans les protocoles :
[CNRS/Kennedy/Spring](../2026-10-20-reference-gx10/),
[Bœuf/Tears/Artemis](../2026-10-21-corpus-etendu-gx10/).
Leurs poids ne sont pas copiés ici. Il faut vérifier le début réel, l'alignement du son,
les images et les trente préfixes, puis renseigner pour chaque question « conserver,
corriger ou retirer » avec nom et date du relecteur. La [grille](../../gx10/evaluation/relecture.md)
fixe les critères de note 0–3, invention, preuve temporelle et abstention justifiée.
Les corrections annoncées par le propriétaire ne sont pas encore reçues sous forme
d'identifiants/texte/temps ; elles seront appliquées à un nouvel oracle versionné, sans
réécrire ce gel ni les résultats bruts. Tant que ce contrôle manque, aucune pertinence
chiffrée ni configuration gagnante n'est publiée.

Un [audit indépendant des trente questions](audit-independant.md) distingue les accords
textuels, les attributions de locuteur à vérifier et cinq corrections candidates de temps
ou de formulation. Ces candidats ne modifient pas les attendus figés avant écoute et
visionnage humains.

## Reproduction

```sh
python3 experiments/essais/2026-10-21-relecture-fiches-gx10/preparer.py
node scripts/check.mjs --changed
```

Le script échoue si la sélection n'est plus provisoire, si une question diffère entre
export et campagne, ou si le paquet ne compte pas exactement 90 réponses uniques.
