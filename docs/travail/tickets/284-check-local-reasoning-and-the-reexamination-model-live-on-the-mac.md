---
id: T284
titre: Check local reasoning and the reexamination model live on the Mac
statut: a-faire
bloque_par: T283
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est le dernier contrôle réel avant l'accès au GX10, sur le Mac, boucle
arrêtée, borné à une heure. Il mesure l'effet de T282 et T283, puis fige la copie finale `gx10-copie-b2`. Tant qu'il
n'est pas terminé, T224, T251 et T256 attendent.

## Sources

- Avis d'Astra du 18/10 : comparaisons appariées, ordre alterné, cinq répétitions, froid et chaud séparés ; retenir un
  réglage s'il fait gagner au moins 20 % sans nouvelle erreur critique ; protéger l'accès au GX10 contre une
  préparation sans fin.
- Décision du propriétaire, le 18/10 : les deux tickets, puis un dernier gel borné ; à défaut, `gx10-copie-b` sert.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, une heure au plus :
  1. raisonnement de `qwen3.8:27b` en questions, `off` contre `default`, par le chemin produit : mêmes questions sur
     une session archivée, ordre alterné, cinq répétitions, durée et justesse relevées ;
  2. réexamen par `qwen3.8:27b` (`think: off`) pendant que la perception reste sur `gemma3:4b` : durée, preuve
     retenue par la réponse ;
  3. un modèle de questions plus petit capable d'outils, s'il est disponible, téléchargé avec l'accord du propriétaire ;
  4. consigner dans `experiments/essais/` ; si les résultats le justifient, poser le tag `gx10-copie-b2` et avancer
     `main` ; sinon garder `gx10-copie-b`. Statut `termine`, commit de ce seul fichier.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T224, ni T251, ni T256.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel du raisonnement et du modèle de réexamen est-il concluant ? Le
propriétaire a décidé le 18/10 que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal

