# Refactor des runtimes — 30 septembre 2026

## Responsabilités et flux actuels

| Composant | Responsabilité | Ne fait pas |
| --- | --- | --- |
| `CodexSessionClient` | Processus isolé, RPC, fil, streaming des événements, annulation, journal des URL consultées | Choisir les passages ou construire la politique de réponse |
| `CodexSessionAgent` | Chat : prompt, mises à jour du contexte, continuité, validation des sources, réparation bornée | Transcrire ou décrire lui-même un flux continu |
| `CodexAnalysisAgent` | Inférence structurée sans outil ni web, utilisée par perception et résumé | Recherche historique autonome |
| `CodexPerception` | Transcription locale puis description/réexamen des images avec Luna | Recherche web, embeddings |
| `VideoTools` | Accès aux passages borné à la question, réexamen, preuves et limites | Transport MCP ou RPC |
| `MomentSearch` | Sélection temporelle, classement lexical/hybride, repli | Appeler directement un fournisseur |
| `MomentIndex` | Création à la demande et réutilisation des embeddings via ports injectés | Classement ou planification en arrière-plan |

Le flux est : capture → stockage → transcription locale → Luna → observations horodatées. Une question passe par `DeepAsk` (file, ancrage, 60 secondes hors attente), puis le chat reçoit les observations récentes et la conversation. Il peut répondre directement ou appeler les outils. `inspect_clip` redonne images et transcription à l’adaptateur de perception ; ce dernier ne devient pas un agent de recherche.

Les prompts et schémas de réponse vivent dans `adapters/companion-prompt.cjs`, sans dépendance au transport historique. `CodexAnalysisAgent` déclare une liste d’outils vide ; le client refuse aussi les appels non déclarés au niveau RPC. `CodexRecap` utilise ce même rôle sans outils. Les événements de raisonnement n’exposent pas le raisonnement interne.

## Outils directs et MCP

`core/video-tool-contracts.cjs` définit noms, descriptions et arguments. L’adaptateur Codex ajoute l’enveloppe des outils dynamiques ; `mcp/tool-definitions.cjs` convertit les champs pour le SDK MCP. Le pont HTTP et l’ancien adaptateur utilisent le même catalogue de noms autorisés.

`runtime/conversation-runtime.cjs` compose le chat, `DeepAsk` et la fabrique `VideoTools` pour les deux hôtes. Le snapshot gelé d’une question prime sur l’état courant. `runtime/session-runtime.cjs` compose la capture analysée, le stockage, la recherche et le réexamen.

Electron lance encore `VideoBridge` pour les clients MCP externes. Le serveur TV ne l’expose pas : le chat interne utilise les outils dynamiques directement. Ce refactor n’ajoute ni serveur MCP public ni nouvelle dépendance réseau.

`CodexVideoAgent` reste disponible pour les scripts historiques d’évaluation (`evaluate-actions.cjs`) et leurs tests. Ce n’est plus une dépendance de la classe de chat active. Son retrait casserait encore ces consommateurs ; il est conservé explicitement.

## Quand les embeddings sont-ils créés ?

1. Le chat appelle `search_moments`, un client MCP le demande, ou l’utilisateur lance une recherche de passages dans l’interface Mac.
2. Si la référence temporelle suffit, `MomentSearch` renvoie le passage sans embeddings.
3. Sinon `MomentIndex.ensure` indexe les textes manquants des passages antérieurs à l’ancrage. Les vecteurs déjà présents sont réutilisés.
4. La requête est vectorisée et mise en cache ; le classement reste 55 % lexical / 45 % sémantique.

L’index reste un fichier `embeddings.json` par session. Pas d’indexation automatique pendant la capture, pas de nouveaux coûts implicites, pas d’embeddings multimodaux. Une première recherche longue peut toujours payer le coût et le délai d’une indexation tardive : c’est une limite connue, pas une optimisation revendiquée par ce refactor.

## Validation

- Suite Node : 106 tests passent, dont les tests existants de file, ancrage, annulation, expiration, sources et cache, plus régressions sur séparation des capacités, parité des contrats, changement de modèle et indexation annulée.
- MCP : le test existant démarre réellement le transport stdio et le pont authentifié ; il ne se limite pas aux définitions.
- UI LG : navigateur headless, réponses de contrôle simulées ; ne constitue pas un nouveau test physique de télécommande.
- Tests Python : 4 tests de contrôle capture/reprise réseau et 6 tests de géométrie/watchdog de panneau passent.
- Essai réel isolé : `node scripts/probe-refactor-live.cjs`, vidéo Kennedy de démonstration (30–38 s), vrais JPEG/WAV, Whisper local, Luna et chat Codex. HTTP d’ingestion, outil `get_transcript`, deux questions FIFO dans un même fil, pause/reprise et réexamen réel `inspect_clip`. Aucune réponse attendue fournie au modèle. Les appels d’outil y sont demandés explicitement : cela valide le raccordement, pas l’initiative spontanée du modèle. OpenRouter désactivé pour ce test ; ni TV ni serveur utilisateur redémarrés. Rapport : [refactor-live-report.json](refactor-live-report.json).
- Première exécution du smoke Electron : délai dépassé lors de la relecture depuis une citation du résumé (`readyState >= 2`, ligne 122 avant instrumentation). Échec conservé ; instrumentation de diagnostic ajoutée, puis nouvelle exécution réussie (14 segments, audio WAV, relecture WebM, chat et vérification simulés). La cause de ce premier délai n’est pas établie : aucune correction de relecture n’est revendiquée.

Ce refactor conserve les limites précédentes : cinq minutes de médias détaillés, pas de restauration complète du fil après fermeture, facturation Codex non mesurée par les adaptateurs, pas de preuve de robustesse sur plusieurs heures. L’indexation proactive et une politique de récupération plus systématique restent des évolutions fonctionnelles séparées.
