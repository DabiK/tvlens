# Validation du réexamen — 28 septembre 2026

## Livraison retenue

Gemini 3.8 Flash et vidéo native ralentie ×4 pour le réexamen. Ask rapide et
observation conservent Gemini 2.5 Flash Lite. Embeddings texte OpenRouter, mémoire
locale et recherche hybride ; embeddings audio/image uniquement dans la roadmap.

La comparaison contrôlée de dix clips donne **8/10** en vidéo et **8/10** en planches
adaptatives, contre **4/10** en planches uniformes, avec le même modèle. La vidéo
coûte moins et répond plus vite sur ce corpus : elle reste donc le défaut. Le crop
coûte davantage et obtient 7/10. Les échecs font partie des résultats.
[Rapport, mesures et limites](strategy-comparison.md).

## Preuves de validation

| Exigence | Vérification |
| --- | --- |
| Cœur portable, ports injectés | Test d'architecture interdit Electron, API, fichiers ou adaptateurs dans le domaine |
| Recherche temps/lexical/sémantique | Tests domaine et [essai embeddings réel](retrieval-live.json) ; référence temporelle court-circuite les embeddings |
| Trois outils MCP | Test SDK stdio réel + Codex réel dans Electron ; serveur empaqueté énuméré séparément |
| Pas de futur, pas de média expiré | Préfixe figé et références invalides rejetées dans `video-research.test.cjs` |
| Six frames, ordre, crop fixe, audio séparé | Test des pixels réels des six cellules ; mêmes timestamps entre vues, même audio |
| Sélection diverse et couverture temporelle | Test de deux transitions brèves avec paires avant/après, intervalle maximal et plafond |
| FFmpeg réel et frontière entre segments | Deux clips décodés, audio PCM recadré, ralentissement et conversion des temps testés |
| Capture indépendante et annulation | Tests Electron ; capture continue, nouvelle question annule le job précédent |
| Progression à 30 s, arrêt à 60 s | Timers testés avec horloge courte ; restitution seulement des observations acquises, résultats tardifs ignorés |
| Annulation pendant sélection de crop | Test attend l'entrée dans le sélecteur avant d'annuler, pas seulement un signal déjà annulé |
| Protection contre purge pendant lecture | Bail média testé sur fichiers réels puis suppression à sa libération |
| Abstention sans preuve | Réponse pourtant affirmative du faux agent remplacée par une abstention sans citation |
| Budget sans remise à zéro | Anciennes charges conservées ; passage à 5 USD tracé, budget initial Ask séparé ; refus 402 réconcilié |
| Package Mac | Sharp/libvips sortis de l'ASAR, chargement testé ; serveur MCP du package testé ; aucun `.env.local`, compteur ou secret chiffré dans l'archive |

Dernière exécution : **35 tests Node réussis**, zéro échec.

Le dernier package a également été lancé avec Playwright : fenêtre TVLens visible,
clé chargée et compteur de campagne conservé. La liste des sources macOS a retourné
`Failed to get sources` dans ce lancement automatisé. La capture d’une fenêtre réelle
dans ce dernier package reste donc à confirmer manuellement ; vérifier les droits
de capture macOS si le message persiste. L’application a ensuite été rouverte normalement.

## Intégration

- `npm run test:electron:sheets` : vraie capture synthétique, vrai FFmpeg/Sharp,
  planches et crop, inférence simulée ; passe sans API.
- Codex réel + MCP + préparation locale des planches : passe ; rapport
  [MCP dans l'interface](mcp-ui-live.json). L'inférence multimodale est simulée dans cet essai.
- `npm run test:electron:full-live` : Codex/MCP, embeddings et réexamen OpenRouter
  réels avec le modèle sélectionné. Capture synthétique et observation/Ask rapide
  simulés. **27,034 s**, capture continue, replay au bon offset et annulation
  vérifiés. [Résultat complet](reexamen-ui-live.json).
- Une campagne antérieure de dix questions avec choix du passage par Codex et
  Flash 2.5 avait obtenu **8/10**, contre 0/10 sur les frames initiales.
  [Revue des réponses intégrales](action-evaluation-review.json).

Le test synthétique ne remplace pas une validation de la capture de toute fenêtre
macOS ni une mesure de qualité sur les films. La capture utilisateur, Ask et replay
avaient déjà été confirmés manuellement sur Spring avant cette tranche. La rétention
à cinq minutes est vérifiée par horloge simulée, pas par une nouvelle attente réelle.

## Budget de la campagne

Au dernier relevé après le test intégré : **0,49877676 USD**, aucune réservation
non réglée. Ce total inclut les essais abandonnés, les comparaisons, les erreurs
facturées de sélection de crop et tous les embeddings de la campagne.

Plafond actuel explicitement autorisé : **5 USD au total**, remplaçant le plafond
initial de 1 USD. Les 0,2598036 USD déjà consommés au changement de plafond ont été
conservés ; les charges antérieures à cette tranche restent dans leur compteur
séparé. La configuration MCP ne contient aucune clé OpenRouter.

## Installation et limites restantes

[Installation et connexion Codex](installation.md). Les chemins du CLI et du MCP
sont configurés sur le Mac courant. Une session Codex déjà ouverte doit être relancée
pour découvrir un nouveau serveur ; l'agent lancé par l'app configure ses outils
explicitement.

Le corpus est un corpus de développement muet et géométrique, pas un test indépendant
sur des films. Les modèles inventent encore certains mouvements. Un horodatage valide
ne prouve pas la vérité du texte ; la relecture reste nécessaire. Aucune revendication
d'état de l'art : les [travaux consultés](temporal-research.md) inspirent les adaptations,
et leurs scores ne sont pas ceux de TVLens.
