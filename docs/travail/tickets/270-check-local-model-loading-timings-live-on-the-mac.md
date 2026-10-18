---
id: T270
titre: Check local model loading timings live on the Mac
statut: a-faire
bloque_par: T255
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent les modèles et les appareils ; avant de construire la suite dessus, l'orchestrateur vérifie en réel
la séparation entre chargement du modèle local et démarrage froid de session (T255). Tant que ce ticket n'est pas
terminé, T265 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- Sonde du 18/10, `experiments/essais/2026-10-18-perception-locale-mac/README.md` : le premier appel comptait
  3,7 s de chargement de `gemma3:4b`, mais `coldStart` restait faux.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. Ollama local, `gemma3:4b` déchargé au départ, perception réglée sur `local` ;
  2. deux passages réels d'une session archivée du Mac par la perception de production : le premier appel distingue
     l'attente dans l'agent, l'aller-retour HTTP et le chargement annoncé par Ollama, sans nouveau fil Codex ni
     démarrage froid automatique ; le second, à chaud, n'a pas de chargement ;
  3. comparer ces durées à celles de la sonde du 18/10 ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T265 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T255 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal
