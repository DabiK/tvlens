# Essai du 19/10/2026 — répétition de la copie C sur le Mac, par l'exécuteur des campagnes GX10

Répétition de 18:16 à 18:25, boucle de TVLens en pause, avant la fenêtre GX10 du 20/10 : la copie `gx10-copie-c`
tourne-t-elle avec de vrais modèles locaux, et l'exécuteur des campagnes (kit GX10) la conduit-il de bout en bout ?
Une exécution par campagne, courte : c'est une répétition, pas une mesure.

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | tag `gx10-copie-c` = `2035a2f` (worktree détaché, dépendances du dépôt) |
| Exécuteur | `/Users/Dabi/Documents/TVLens-GX10/kit/executeur.mjs`, plan `scripts/plan-mac-copie-c.json` ; versé au dépôt après la GX10 |
| Machine | MacBook Apple M5 Max, 36 Go ; mémoire libre 40 à 46 % pendant l'essai, swap déjà plein (21,8 Go) ; boucle de `lg-launcher` active |
| Source | `media/samples/kennedy-rice-7min.mp4`, blocs de 8 s à 5 images (comme le 18/10) |
| Rôles | perception `gemma3:4b` (`68ceab7e468a`, voir incidents) ; questions `qwen3.8:27b` (contexte 16 384) ; embeddings `qwen3-embedding:0.6b` ; Whisper base, réglages par défaut du produit |
| Campagnes | G1 sur 2 min (15 blocs) ; G3 de 6 min, 2 questions ; banc Whisper sur 3 fichiers |

## Résultats

| Campagne | Résultat |
| --- | --- |
| G1 perception | 15 / 15 cas, 5,4 s par cas en moyenne (6,8 s au plus), 105 jetons par seconde |
| G3 de 6 min | 45 / 45 envois acceptés ; audio 100 % ; vision 60 % (18 passages sautés) ; 2 / 2 questions, 63 et 81 s ; archivage et libération confirmés |
| Banc Whisper | base, 4 fils : 0,3 à 0,4 s par fichier de 8 s |

Réponses : « De quoi parle l'orateur ? » cite l'énumération des inventions ; « Quelles inventions cite-t-il ? » donne
la machine à vapeur, l'électricité, le téléphone, l'automobile, l'avion, la pénicilline, la télévision et le nucléaire.

## Lecture

- **La copie C et l'exécuteur fonctionnent avec de vrais modèles** : chaque campagne est complète, ses mesures et
  son résumé sont écrits, la reprise saute une campagne finie.
- **La vision cède sur le Mac quand le modèle de 27 milliards répond** : 40 % de passages sautés sur 6 minutes
  (31 % sur 30 minutes le 18/10). C'est l'écart que la GX10 doit mesurer.

## Limites et incidents

- Répétition courte, une exécution, aucune annotation.
- **`gemma3:4b` remplacé sur le Mac** : le premier essai (`brut/journal-essai-1-interrompu.log`) lançait `ollama
  pull` même pour un modèle présent ; 851 Mo téléchargés, poids `a2af6cc3eb7f` (référence du 18/10) remplacés par
  `68ceab7e468a`, sans accord du propriétaire. L'exécuteur ne retire plus un modèle présent. La GX10 recevra de toute
  façon la version publiée : la comparaison avec le 18/10 n'est pas à poids identiques pour la perception.
- Le premier essai a aussi montré qu'un arrêt laissait démarrer la campagne suivante : corrigé avant le second.
