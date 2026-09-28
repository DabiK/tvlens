# Goal actif — Fiabilité, outils de visionnage et optimisation

Extension demandée le 29 septembre 2026. Le goal reste actif jusqu'à implémentation et validation ; ce fichier en suit le périmètre étendu.

## Inventaire et priorité

- [x] Correction du remplacement d'une réponse externe par des résumés : preuve consultée, confirmation bornée des liens, abstention explicite.
- [x] Persona utile/proactif, sources primaires, accusations attribuées ; test réel Kennedy → date → liens.
- [x] File FIFO (5 questions en attente), annulation ciblée, snapshot à l'envoi, délai 60 s hors attente.
- [x] Fil Codex persistant et pause/reprise existants ; régressions automatisées.
- [x] P0 : visualiser capture/analyse/lacunes et ancrage/attente ; étapes réelles et réponse provisoire ; actions contextuelles.
- [x] P1 : marque-pages persistants (média + texte, suppression explicite), overlay + raccourci configurable.
- [x] P1 : exposer la recherche existante dans une interface de cartes, relecture/expiration.
- [x] P1 : Auto ciblé, activation prospective, fréquence/dédoublonnage, priorité manuelle, preuves.
- [x] P2 : réemploi du port de recherche, cache transcription/source ; cache de réexamen borné ; sélection adaptative de fond.
- [x] P2 : métriques avant/après, retard et coût facturé ; suivi quota Codex.
- [ ] Validation complète réelle et régressions, documentation, packaging/relance.

## Existant réutilisé

`MomentSearch` fournit déjà recherche hybride horodatée et cache embeddings. `LocalTranscriber` possède un cache audio. `frame-selection` choisit déjà des images diverses pour le réexamen. `WatchSession` borne la file d'analyse et marque les segments sautés ; stockage brut à rétention 5 min. `VideoTools` fige un préfixe par question. `CodexSessionAgent` conserve sources consultées et fil. Aucun besoin de dupliquer ces moteurs.

## Contrats

Architecture hexagonale ; Codex chat/vision, Whisper local, OpenRouter embeddings texte seulement. Budget total OpenRouter 5 USD avec dépenses antérieures. Pas d'embeddings multimodaux. Conserver tous les échecs de tests live. Le temps d'attente est distinct des 60 s de traitement. Les données vidéo ne deviennent pas des faits vérifiés. Sources consultées ≠ authenticité de chaque affirmation prouvée.

Quota demandé : seuil conservateur 55 % restants en attente de clarification. Relevé initial : 37 % utilisés / 63 % restants, fenêtre 10080 minutes ; seconde fenêtre absente. Aucun achat ni crédit de reset automatique.

Livraison supplémentaire autorisée : créer un dépôt GitHub privé avec `gh`, vérifier les exclusions (secrets, médias locaux, sessions, modèles, builds), puis pousser code, tests et documentation nettoyés. Ne pas déclarer le goal terminé avant cette livraison. Seuil quota confirmé : au moins 55 % disponibles sur chaque fenêtre exposée.


Avancement : 61 tests Node passent ; test Electron synthétique et test vidéo réel
P0/P1 passent. Enregistrement/remplacement du raccourci macOS vérifiés. Dernière
validation Auto avec recherche externe réussie. Packaging/relance et push privé en cours.
Rapport courant : `docs/viewing-upgrade.md`. Le quota reste à 63 % disponibles.
