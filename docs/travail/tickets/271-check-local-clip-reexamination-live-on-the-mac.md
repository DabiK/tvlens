---
id: T271
titre: Check local clip reexamination live on the Mac
statut: termine
bloque_par: T265
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent les modèles et les appareils ; avant de construire la suite dessus, l'orchestrateur vérifie en réel
le réexamen d'un clip par le backend d'inspection Ollama (T265). Tant que ce ticket n'est pas terminé, T257 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- T265, « Hypothèses » : aucune compatibilité réelle d'Ollama avec les planches envoyées n'est déduite des tests.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. backend d'inspection `ollama` explicite avec un modèle vision local ; questions et perception de fond laissées à
     leur réglage par défaut ;
  2. un réexamen réel de 20 s au plus dans une session archivée du Mac : réponse valide, backend effectif, preuves et
     limites présents dans les diagnostics ; les backends des questions et de la perception ne changent pas ;
  3. Ollama arrêté ou modèle absent : refus nommé, sans repli silencieux sur Codex ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T257 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T265 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal

- 18/10, orchestrateur : contrôle réel concluant au commit `258d910`, sur le Mac (M5 Max, 36 Go, boucle arrêtée), Ollama
  0.33.2. Session réelle `ec55a89c` du 17/10 (copies temporaires), serveur headless, questions sur Codex (défaut),
  `TVLENS_INSPECTION_BACKEND=local` avec `gemma3:12b`.
  - « Qu'est-ce qui est écrit à l'écran au début du live ? » : un réexamen local, 29 s ; diagnostic `inspection`,
    `ollama`, `gemma3:12b`, modèle appelé, 4,4 s de chargement ; preuve gardant sa provenance. Lecture « RD SECQURS »,
    signalée incertaine, là où Codex et `qwen3.8:27b` lisaient « SECOURS ».
  - « Décris précisément ce qu'on voit à l'image dans les vingt dernières secondes » : deux réexamens locaux, 53 s,
    chargement 17 ms à chaud ; quatre citations ; la réponse signale elle-même une contradiction entre les résumés
    d'origine et la description locale.
  - Modèle absent (`modele-absent:1b`) : réexamen en échec nommé `TVLENS_LOCAL_VLM_UNAVAILABLE`, backend `ollama`
    conservé, aucun repli sur Codex ; la réponse est `insufficient` avec la limite « backend indisponible (HTTP 404) ».
  - Backends des questions et de la perception inchangés. Qualité visuelle du 12B en retrait : à mesurer en G2.
    Statut `termine`.
