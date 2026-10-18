---
id: T272
titre: Check the perception replay live on the Mac
statut: termine
bloque_par: T257
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent les modèles et les appareils ; avant de construire la suite dessus, l'orchestrateur vérifie en réel
le rejeu d'entrées capturées par la perception de production (T257). Tant que ce ticket n'est pas terminé, T262
attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- T257, « Périmètre » : le manifeste d'une capture conservée est préparé par l'orchestrateur, hors boucle.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. un manifeste préparé depuis une capture conservée du Mac (session du 17/10) ;
  2. rejeu par la commande de T257 avec le backend `local`, puis `codex` sur quelques cas seulement, quota surveillé :
     chaque cas rend un résultat ou un refus identifié, avec ses mesures brutes ;
  3. les sorties sont lisibles par la notation (T258) et utilisables pour G1 ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T262 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T257 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal

- 18/10, orchestrateur : contrôle réel concluant au commit `b9f5d56`, sur le Mac (M5 Max, 36 Go, boucle arrêtée).
  Corpus de 4 passages de la capture du 17/10 (`ec55a89c`), médias copiés octet pour octet, transcript de l'archive
  marqué `availability: unknown`, contexte inconnu, `lightweight` des métriques sauvegardées.
  - Validation : 4 cas `validated`, aucun agent construit.
  - Local, Ollama 0.33.2, `gemma3:4b` : 4 / 4 `succeeded`, 5,1 à 6,8 s par cas, chargement 1,8 s au premier.
  - Référence Codex, `gpt-6-luna` : 4 / 4 `succeeded`, 4,1 à 5,8 s, étiquetée `reference: codex`.
  - Un octet ajouté à un média : `TVLENS_REPLAY_HASH_MISMATCH`, campagne incomplète, code 1, aucun appel à Ollama.
  - Sorties lisibles pour G1 ; `g2Eligible: false` faute d'annotations. Codex résume la parole, le 4B décrit l'image.
  - Trace : `experiments/essais/2026-10-18-rejeu-perception-mac/`. Statut `termine`.
