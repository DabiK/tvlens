---
id: T274
titre: Check the question backend and the GX10 copy live on the Mac
statut: a-faire
bloque_par: T267, T276
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent les modèles et les appareils ; avant de construire la suite dessus, l'orchestrateur vérifie en réel
l'identité du backend dans les métriques des questions (T267), puis la copie A du GX10 de bout en bout. Tant que ce
ticket n'est pas terminé, T268 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- T258 n'a pas de contrôle à lui : sa notation s'exécute hors ligne. Elle est exercée ici sur un vrai rejeu.
- Plan GX10 du 17/10 : copie A taguée après T267 (G1, G2, vidéo, rôles locaux).

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. une question réelle avec le backend `ollama`, puis une avec `codex`, sur une session archivée du Mac : leurs
     métriques et leurs traces nomment le choix configuré, l'agent composé et les appels effectués ; une question
     qui échoue, Ollama arrêté, garde l'identité de son agent ;
  2. répétition de la copie A : une vidéo convertie (T262), rejouée par la perception locale (T257), un échantillon noté
     (T258), puis des questions locales sur cette session ;
  3. avec T269 à T273 et T276 terminés, poser le tag de la copie A sur ce commit ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T268 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T267 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal
