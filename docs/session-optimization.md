# Pause, fil Codex et perception Luna — 29 septembre 2026

## Changements

- Pause/reprise conserve `WatchSession`, IDs, mémoire, médias et fil conversationnel.
  Horloge d'observation figée pendant la pause. Nouvelle session explicite.
- Processus Codex App Server maintenu ouvert et préchauffé, un fil par session.
  Les outils dynamiques internes passent par les ports existants ; le MCP externe
  reste disponible. Évite le lancement d'un CLI/MCP à chaque question.
- Mises à jour de contexte : uniquement les résumés nouveaux/modifiés. Les réponses
  successives utilisent le contexte du fil ; aucune réponse préfabriquée en cache.
- Les nouvelles analyses de fond attendent pendant une question ; la capture et
  son stockage continuent avec leur file bornée. Une analyse déjà en vol se termine.
- Activité réelle des outils, compteur d'attente et début de réponse diffusé dans
  le chat. Le texte partiel est marqué non validé. Aucun raisonnement interne brut.
- Images/résumés et réexamen sur GPT-6 Luna. Audio transcrit localement avec Whisper
  base multilingue. Capture par segments de 8 s au lieu de 15 s.
- OpenRouter uniquement pour les embeddings. Cache réutilisé pour des descriptions
  identiques entre passages et pour les requêtes identiques.

## Mesures observées

Scénario de développement : cercle synthétique + extrait audio JFK public fourni
par Whisper.cpp ; ce n'est pas un benchmark indépendant sur des programmes réels.

| Étape | Réponse complète | Début de texte |
| --- | ---: | ---: |
| Première question, fil froid | 5,93 s | 3,63 s |
| Question suivante, même fil | 3,59 s | 1,99 s |
| Relance courte, même fil | 2,94 s | 1,74 s |
| Description Luna + transcription, premier essai | 5,93 s | — |
| Deuxième description, audio identique déjà transcrit en cache | 2,89 s | — |

[Réponses, identifiant de fil et mesures](codex-speed-live.json).
La deuxième mesure de perception bénéficie du cache audio : elle ne représente pas
le coût d'une nouvelle transcription. Le tout premier lancement Whisper séparé
avait pris 18,5 s avec initialisation Metal. Un test français synthétique ensuite
transcrit la phrase correctement en **0,65 s** : [résultat](local-speech-live.json).
Les chiffres ne garantissent pas une latence constante.

Intégration réelle dans Electron : chat **4,06 s puis 3,82 s**, réexamen forcé
**16,32 s**. Même fil vérifié, outils `search_moments` et `inspect_clip`, capture
continue, annulation, pause/reprise et nouvelle session testées. Capture et perception
de fond simulées ; réexamen Luna, Whisper, embeddings et chat réels.
[Rapport](reexamen-ui-live.json).

La recherche web de suivi « Tu peux chercher ? » passe dans le nouveau fil avec une
page primaire ouverte : [rapport](chat-web-live.json).

## Qualité et limites

Les 8/10 de la campagne Gemini ne s'appliquent **pas** à Luna. La vidéo native ralentie
n'est pas envoyée à Luna : son entrée est une séquence de planches adaptatives.
Dans l'intégration synthétique, Luna a jugé le cercle pratiquement immobile alors
que l'animation se déplace : le test valide les connexions, pas l'exactitude de cette
réponse. Cette erreur est conservée dans le rapport. Une nouvelle comparaison
qualitative sur dix clips serait nécessaire pour attribuer un score à Luna.

La reprise conserve le fil tant que l'app et son processus Codex restent ouverts.
Après fermeture ou panne, les archives textuelles ne constituent pas une reprise
complète du fil LLM. Les paroles et OCR peuvent encore être erronés ; ils ne sont pas
des faits vérifiés. La recherche web peut rester plus lente qu'une question locale.

47 tests Node passent, incluant horloge de pause, continuité des IDs, fil unique,
contexte incrémental, interruption sans changement de fil, streaming, cache embeddings et tests précédents. Le test UI
simulé et le parcours avec Codex/Luna réels passent. Un premier test UI a lu l'état
avant la fin du nettoyage asynchrone « Nouvelle session » ; l'attente a été corrigée,
puis le parcours entier relancé avec succès.

Dernier coût OpenRouter relevé : **0,5026976 USD sur 5 USD**, dépenses précédentes
conservées. Les nouveaux essais de vision/chat utilisent le compte Codex, pas ce
compteur. Le zéro dans `cost` de perception signifie zéro OpenRouter seulement.
