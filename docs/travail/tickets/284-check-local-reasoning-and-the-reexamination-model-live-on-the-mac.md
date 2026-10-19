---
id: T284
titre: Check local reasoning and the reexamination model live on the Mac
statut: termine
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
- 19/10, orchestrateur : contrôle réel sur le Mac, de 08:49 à 09:11, à `479b376`, boucle arrêtée ; dossier
  `experiments/essais/2026-10-19-raisonnement-reexamen-mac`.
  - Questions, `qwen3.8:27b`, cinq paires en ordre alterné : `default` 30,1 s et 39,2 s de médiane, 5 réponses sur 5 à
    la question de résumé, avec 1 à 4 citations ; `off` 13,6 s, mais 10 réponses sur 10 refusées par la validation des
    preuves, aucun outil appelé. Perte critique : `off` n'est pas retenu.
  - Réexamen, trois paires : `gemma3:4b` 3 réponses sur 3 avec citation, 60 à 99 s ; `qwen3.8:27b` en `off` 3 abstentions
    sur 3, 117 à 154 s, observations datées refusées. Non retenu.
  - Étape 3 non faite : aucun modèle local plus petit n'a la capacité `tools`, et le GX10 fait tourner le 27B.
  - Conclusion : aucun réglage ne justifie `gx10-copie-b2` ; `gx10-copie-b` reste la copie du GX10. Statut `termine`.
