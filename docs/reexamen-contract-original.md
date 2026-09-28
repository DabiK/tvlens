> Archive de cadrage initial : certaines décisions ont évolué. Voir [état actuel](viewing-upgrade.md) et le README.

# TVLens — Contrat proposé pour le réexamen vidéo

Statut : confirmé par l’utilisateur ; implémentation autorisée avec objectif suivi, configuration MCP et documentation d’installation.

## Expérience acceptée

- Ask rapide conserve son rôle ; les questions nécessitant de nouvelles preuves déclenchent automatiquement un approfondissement Codex, via MCP, sur le Mac du POC.
- Afficher la progression et proposer l’annulation. Après 30 secondes, indiquer que la recherche continue. À 60 secondes au total depuis le déclenchement, arrêter au mieux les opérations et restituer seulement les éléments établis avec leurs limites.
- Toute nouvelle question arrête l’approfondissement précédent et prend la priorité. Préserver ses observations déjà reçues, sans publier tardivement une réponse devenue obsolète.
- La capture reste indépendante. Distinguer faits observés, hypothèses et vérification Web.
- Recherche temporelle selon l’ordre d’observation ; aucun média postérieur à l’ancrage de la question pour établir les faits de cette réponse.

## Capacités à construire

1. Index des passages : session, intervalle temporel, transcript, description visuelle, embedding et disponibilité du média.
2. Recherche hybride : temps explicites, termes exacts et proximité sémantique. Les horodatages sont des métadonnées, pas des valeurs inventées par le modèle.
3. Réexamen réel : extraire de nouvelles images du média enregistré, avec audio aligné et voisins temporels si nécessaire. Densité et résolution bornées.
4. Outils search_moments, get_transcript et inspect_clip, exposés à Codex via un adaptateur MCP entrant.
5. Orchestration avec routage rapide/approfondi, limites de temps et de coût, annulation et références temporelles vérifiables.
6. Résultats dans le chat avec passages cliquables et progression.

## Choix techniques proposés

- Core indépendant d’Electron, MCP, Codex et OpenRouter ; ports réutilisables par l’interface et le serveur MCP.
- Recherche sur la session courante pour cette tranche ; pas de nouveau moteur multi-session ni d’extension du mode Auto.
- Stockage local existant et embeddings via OpenRouter, sans serveur vectoriel dédié imposé. Vérifier modèle, tarif et disponibilité avant les appels.
- inspect_clip délègue l’analyse au modèle multimodal derrière un port ; Codex reçoit des observations horodatées. Adaptateur local GX10 ultérieur.
- En cas d’ambiguïté, examiner un petit nombre de candidats puis demander une précision si nécessaire.
- Médias expirés : résumé éventuellement exploitable, mais absence de réexamen explicitement signalée. Protéger temporairement un extrait en cours d’analyse de la purge, au plus pendant le travail borné, puis libérer.
- Codex indisponible : Ask rapide continue ; approfondissement annoncé indisponible.
- Recherche Web explicitement demandée conservée et séparée des preuves vidéo ; pas de navigation Web ajoutée automatiquement aux questions sur un film.
- Une annulation peut ne pas interrompre la facturation d’un appel déjà accepté par le fournisseur. Comptabiliser aussi ces appels et ignorer les résultats tardifs pour une recherche annulée.

## Budget et validation acceptés

- 1 USD supplémentaire autorisé pour toute la nouvelle campagne API : embeddings et analyses vidéo inclus. Minimiser ; ne pas dépenser le plafond par principe. Quotas Codex séparés.
- Lire le compteur existant, conserver ses charges et tracer distinctement les dépenses de cette campagne.
- Démonstration prioritaire : action absente des images échantillonnées mais présente dans le média conservé.
- Corpus fixé de dix clips distincts ; au moins huit réponses avec action correcte et intervalle justificatif correct. Comparaison à Ask actuel sur les mêmes questions.
- Ajouter des cas sans preuve, médias expirés, événements aux frontières de segments, annulation et capture pendant la recherche.
- Mesurer justesse, coût, latence et continuité de capture. Ce petit corpus ne justifie pas une promesse générale de fiabilité.

## Livraison proposée

1. Recherche des passages avec timestamps et mesures.
2. Réexamen dense avec références temporelles et limites.
3. Connexion MCP/Codex, routage automatique et intégration complète dans Ask.
4. Évaluation comparative et rapport des résultats.

Aucune modification applicative lancée dans les rounds de grilling. Prochaine étape après confirmation de cette synthèse : implémenter et valider ces tranches.

## Extension confirmée pendant l'implémentation

- Comparer les stratégies de planches 3×2, recadrage fixe et sélection adaptative
  à la vidéo ralentie sur les mêmes clips/questions/modèle/intervalles.
- Coût réel, délai total et revue des réponses complètes ; conserver les échecs.
- S'inspirer de recherches récentes, sans revendiquer une nouveauté scientifique.
- **Plafond de campagne porté explicitement à 5 USD au total le 28 septembre 2026**
  (« Oui, 5 $ au total, dépenses précédentes incluses »). Le compteur antérieur,
  ses coûts et réservations sont conservés ; aucune remise à zéro. Cette extension
  remplace uniquement le plafond additionnel de 1 USD indiqué plus haut.
