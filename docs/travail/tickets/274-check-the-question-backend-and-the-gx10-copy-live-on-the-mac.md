---
id: T274
titre: Check the question backend and the GX10 copy live on the Mac
statut: termine
bloque_par: T267, T276, T277, T278, T279
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
  3. avec T269 à T273 et T276 terminés et T277 et T278 intégrés, poser le tag de la copie A sur ce commit ;
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
- 18/10, orchestrateur : la copie A attend aussi T279 (réponses locales en français). Répétition élargie : essayer
  `qwen3.8:27b`, qui a la vision, en réexamen et en perception sur les mêmes passages que `gemma3:4b`, `gemma3:12b` et
  Codex ; noter la langue des réponses ; régler la langue de transcription par extrait.
- 18/10, orchestrateur : répétition concluante au commit `318c711`, sur le Mac (M5 Max, 36 Go, boucle arrêtée).
  - Identité des questions (T267), session réelle du 17/10 : Ollama `qwen3.8:27b` (réglage `local`, agent composé,
    hôte, 2 requêtes, 44 s), Codex (réglage `codex`, modèle `null`, réserve connue de T267, 11 s), Ollama injoignable
    (erreur nommée, identité conservée, 1 requête).
  - Copie A sur 4 blocs neufs de Kennedy (`media/samples`, 65 à 97 s), attendus figés avant inférence par
    l'orchestrateur (répétition, pas G2) : `gemma3:4b` 4 / 4 en français (T279), mais inventions (insigne de l'Élysée,
    drapeau tenu) ; Codex 4 / 4 sans invention ; scoreur T258 : Codex 4 réussites sur 4, `gemma3:4b` 0 sur 4, aucune
    violation de causalité ou de provenance, identités vérifiées.
  - `qwen3.8:27b` en vision : 4 / 4 refusés par le délai de 45 s de l'agent vision (raisonnement activé) ; en direct,
    25 s pour 5 images, lecture juste du sceau. Inadapté à la perception continue sur le Mac.
  - Session en direct tout en local (perception `gemma3:4b`, questions `qwen3.8:27b`, embeddings
    `qwen3-embedding:0.6b`, réexamen local), transcription réglée sur l'anglais : 4 blocs acceptés, perception 5 à 6 s,
    paroles justes, index en 3,1 s, deux questions répondues avec outils (84 et 51 s). Swap 26 Go, 13 % de mémoire
    libre. Un premier essai a reçu `400 invalid-anchor` : repère vide envoyé par le script de l'orchestrateur.
  - Trace : `experiments/essais/2026-10-18-copie-a-repetition/`. Tag `gx10-copie-a`. Statut `termine`.
