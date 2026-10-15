# Vérification externe par port hexagonal

> **Mise à jour du 13 octobre 2026.** Le vérificateur manuel ne lance plus `codex exec`. Il passe par le client App Server du chat, sous un rôle sans outil. Les sections « Adaptateur » et « Isolation » ci-dessous sont à jour ; l’ancien lancement est gardé plus bas, à titre d’historique. Ce changement n’est pas déployé. Preuves et limites : [SECURITY.md](../SECURITY.md) et [livrable de la nuit](night-features-delivery.md).

Le domaine ne lance pas Codex. `VerificationService` dépend seulement de
`VerificationPort.verify({ claim, context })` et reçoit une conclusion structurée,
des preuves et des sources. Le choix du moteur reste dans la composition du script.

| Couche | Implémentation de cet essai |
| --- | --- |
| Domaine | `core/verification.cjs` : validation de l’affirmation, une tâche à la fois, contrôle des résultats, abstention sans preuves |
| Contrat | `VerificationPort` dans `core/ports.cjs` |
| Adaptateur | `adapters/codex-verifier.cjs` : un client App Server par vérification (`CodexSessionClient`, rôle `verifier`), consigne de recherche, schéma JSON, délai maximal, fermeture du processus |
| Hôte de test | `scripts/probe-verify.cjs` : compose le service et l’adaptateur, sauvegarde le résultat |

Le contrat de sortie contient `normalizedClaim`, `assessment`, `conclusion`,
`sources`, `limitations` et des métadonnées `research`. Les sources comprennent
une URL HTTPS, un titre, l’éditeur, une éventuelle date, le contenu de la preuve
paraphrasé et sa relation avec l’affirmation. `assessment` sert à structurer les
preuves (`supported`, `contradicted`, `mixed`, `insufficient`), pas à remplacer le
jugement du spectateur par un badge vrai/faux.

## Exécuter le test

```sh
npm run test:verify:live
npm run test:verify:live -- "Le premier alunissage habité a eu lieu en 1972."
```

Prérequis : Codex CLI installé et connexion existante (`codex login status`).
Ce script ne charge pas `.env.local`, n’utilise pas OpenRouter et ne transmet
aucun média. Il utilise la connexion Codex existante : sa consommation relève de
ce compte, séparément du plafond OpenRouter de 1 $. Aucun coût en dollars n’est
déduit des tokens Codex. Le rapport est écrit dans `docs/verification-live.json`.

## Isolation

Depuis le 13 octobre 2026, une vérification manuelle tourne ainsi :

- Un processus App Server par vérification, fermé à la fin, à l’annulation et au délai (180 secondes).
- Rôle `verifier` : recherche web seule, **aucun outil déclaré**, fil ouvert sans environnement d’exécution. Le rôle ne peut pas être élargi par l’appelant.
- Mêmes contrôles que le chat : réponse de Codex relue à l’ouverture du fil, liste blanche des éléments publiés, refus de toute requête du serveur, dossiers temporaires séparés des identifiants, environnement en liste blanche, réglages qui empêchent la création de sous-agents.
- Effort de raisonnement fixé à `low`. L’ancien lancement ne fixait rien et prenait le défaut du modèle ; la qualité à cet effort n’a été jugée que sur une réponse réelle.
- Une source n’est gardée que si sa page a été réellement ouverte pendant la recherche. Une ouverture qui rend plusieurs pages les compte toutes ; un résultat seulement listé par une recherche ne compte jamais. `research.openedUrls` porte ces pages, `research.confinement` les faits de l’exécution.
- L’affirmation et son contexte voyagent comme des données, dans un bloc délimité déclaré non fiable.

Mesuré avec un vrai modèle sur un Mac (`codex-cli 0.160.1`), consigne de rôle neutralisée : le vérificateur n’a ni shell, ni lecteur de fichiers, ni outil de patch, et n’atteint que l’horloge et la recherche web. L’écartement d’une source réellement non ouverte n’a été observé que dans des tests hors ligne. Rien n’est mesuré sous Linux.

Cela reste une isolation de contexte, d’environnement et d’outils, **pas une VM ni un conteneur**. Le web est un canal de sortie : le modèle peut y envoyer des mots de l’affirmation dans une requête. Voir [SECURITY.md](../SECURITY.md) pour ce qui est empêché, détecté ou inconnu.

### Premier essai (historique) : lancement `codex exec`

Ce lancement ne sert plus à l’application. Il reste utilisé par `adapters/codex-video-agent.cjs`, pour des scripts d’évaluation ; il n’est pas confiné en lecture.

- Répertoire temporaire distinct du projet; aucun fichier TVLens transmis.
- Entrée par stdin, arguments de processus passés sans shell.
- Environnement filtré : pas de `OPENROUTER_API_KEY`, `OPENAI_API_KEY` ou `CODEX_API_KEY` héritée.
- Authentification CLI existante conservée, sans copie de ses secrets dans le projet.
- `--ignore-user-config`, session `--ephemeral`, sandbox `read-only`.
- Outils shell, exécution, navigateur local, ordinateur, images locales,
  connecteurs/apps, plugins, hooks et sous-agents désactivés. Recherche web intégrée activée.
- Pas de chargement des instructions de projet ni de découverte des skills hôte pour ce processus.
- Audit des événements JSONL; arrêt si un événement d’exécution locale, modification
  de fichier ou appel MCP est malgré tout observé.
- Délai maximal de 180 secondes; terminaison du groupe de processus, puis nettoyage.

Il s’agit d’une isolation de contexte, d’environnement et d’outils, **pas d’une VM
ni d’un conteneur**. Le programme Codex doit toujours accéder à son authentification
et à son fonctionnement interne. Un sandbox en lecture seule ne constitue pas, à
lui seul, une interdiction de lecture de tout le disque. Pour une distribution
produit, une frontière de processus distant/conteneur et une authentification
de service devront être validées indépendamment.

## Intégration dans TVLens

L’interface affiche une affirmation éditable avant de déclencher le port :
les tests audio ont montré qu’un chiffre peut être mal transcrit. La tâche Verify indépendante reçoit actuellement uniquement l’affirmation corrigée
et une indication générique de provenance; aucun média ni historique de session
n’est envoyé à Codex. Capture et Ask continuent pendant la recherche.

Le port est maintenant branché dans « Pose ta question » :

1. Saisir une affirmation puis cliquer **Vérifier cette affirmation**, ou écrire
   **Vérifie : …** et envoyer. Un bouton sous chaque réponse Ask permet aussi d’en
   reprendre le texte.
2. Relire/corriger la phrase dans l’éditeur, puis **Lancer la vérification**.
3. La recherche s’affiche dans la conversation, avec sa progression, une option
   d’annulation, sa conclusion et les sources ouvrables dans le navigateur.
4. Capture et Ask restent disponibles pendant la recherche. Une seule vérification
   externe à la fois est acceptée. Les erreurs permettent de réessayer.

Aucun appel Codex n’est déclenché automatiquement par la capture. Une question Ask
ordinaire reste traitée par l’adaptateur de réponse existant. La reconnaissance de
la commande « Vérifie… » est explicite, pas une classification générale d’intention.

L’extraction automatique de l’affirmation dans « ce qu’il vient de dire » et le
rattachement automatique à un passage live ne sont pas encore implémentés. Une
formulation déictique ouvre un éditeur vide : l’utilisateur doit préciser la phrase.
La vérification peut aussi être utilisée sans session de capture.

Le domaine publie les états `running`, `done`, `error` via `onChange`, sans dépendre
d’Electron. Chaque résultat est sauvegardé par `VerificationArchive` dans le dossier
`verifications` des données utilisateur. Les archives ne sont pas encore rechargées
à l’ouverture de l’interface. Les liens externes sont ouverts par le processus
principal à partir des sources enregistrées, uniquement en HTTPS public.

Le lanceur `npm run open:mac` conserve le répertoire d’authentification Codex existant
lorsque `CODEX_HOME` est défini dans le terminal. Ce chemin peut être conservé avec
la configuration chiffrée pour les lancements suivants. Pour une configuration
explicite, `TVLENS_CODEX_AUTH_HOME` peut être défini dans `.env.local`. Aucun secret
Codex n’est copié dans le projet.

La validité d’une URL et la présence d’appels web ne prouvent pas à elles seules
que chaque phrase de la conclusion est étayée. `research.openedUrls` permet
d’auditer les ouvertures de pages rapportées par Codex. Les sources et conclusions
doivent rester visibles et contestables.

Depuis le 13 octobre 2026, une question posée pendant une vérification ne l’annule
plus, et la surveillance continue vérifie elle aussi des affirmations, par un rôle
distinct : voir [architecture](architecture.md), « Surveillance et résumé progressif ».

Documentation officielle utilisée :
[mode non interactif et schéma de sortie](https://learn.chatgpt.com/docs/non-interactive-mode),
[configuration des outils](https://learn.chatgpt.com/docs/config-file/config-reference).
