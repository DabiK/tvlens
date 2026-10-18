---
id: T280
titre: Check the GX10 copy B live on the Mac
statut: termine
bloque_par: T260
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est la recette réelle de la copie B du GX10, sur le Mac, boucle
arrêtée. Une campagne soutenue de trente minutes passe par le runner de T259 et le bilan de T261 avant que la
copie soit taguée. Tant que ce ticket n'est pas terminé, T268, T251, T256 et T232 attendent.

## Sources

- Décision du propriétaire, le 18/10, sur l'avis d'Astra : une recette par copie figée, plutôt qu'un contrôle réel
  après chaque ticket interne ; G3 avant la phase Mémoire.
- Précédents : T233 (recette TV et VPS) et T274 (copie A).

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. une vidéo convertie (T262) ou un extrait du propriétaire, avec sa langue de transcription déclarée ;
  2. une campagne de trente minutes par T259 : perception locale, questions au calendrier, rôles locaux tenables
     sur le Mac (configuration consignée ; la configuration complète est celle du GX10) ;
  3. le bilan de T261 : révisions, pertes par voie, couverture de toute la campagne ;
  4. les commandes hors ligne du guide de T260, puis le tag de la copie B ;
  5. consigner le résultat dans le journal de ce ticket et dans `experiments/essais/` ; un écart devient un
     ticket correctif ; ce ticket reste à faire jusqu'à sa correction. Concluant : statut `termine`, commit de ce
     seul fichier.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T268, ni T251, ni T256.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais.

## Hypothèses bloquantes

Décision attendue du propriétaire : la recette réelle de la copie B est-elle concluante ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait cette recette et ferme ce ticket quand elle est concluante.

## Journal

- 18/10, orchestrateur : recette concluante au commit `3c500b3`, sur le Mac (M5 Max, 36 Go, boucle arrêtée), de 22 h 54
  à 23 h 24. Discours de Kennedy (7 min, `media/samples`) converti en 53 blocs, bouclé et déclaré sur 30 min (227
  envois), transcription `en` ; tous les rôles en local : perception et réexamen `gemma3:4b`, questions
  `qwen3.8:27b`, embeddings `qwen3-embedding:0.6b`, Whisper local ; 8 questions réparties.
  - Campagne `complete` : 227 envois acceptés sur 227, archivage et libération confirmés, identité locale de chaque
    rôle vérifiée (`localMeasurement: true`).
  - Bilan T261 : audio intact (0 perte) ; vision 64 passages sautés par engorgement et 6 en erreur sur 227 (31 %),
    163 appels de perception ; deux lots d'embeddings coupés à 30 s au plus fort de la charge, signalés par le
    diagnostic de T278.
  - 8 questions répondues, 56 à 169 s chacune : justes et citées ; abstentions justes sur le coût du programme
    spatial (absent de l'extrait) et sur l'identité des personnes assises ; Vénus retrouvée deux fois, Mars déclarée
    absente. Les réexamens du 4B aboutissent (15 à 18 s) sans observation retenue par la réponse.
  - Mémoire : 77 % libre au départ, 17 % au plus bas, swap jusqu'à 26 Go.
  - Lecture : sur le Mac, tout en local tient trente minutes sans perte audio mais perd un tiers des descriptions
    visuelles quand le modèle des questions tourne ; c'est la mesure que le GX10 doit refaire. Trace :
    `experiments/essais/2026-10-18-copie-b-g3-mac/`. Tag `gx10-copie-b`. Statut `termine`.
