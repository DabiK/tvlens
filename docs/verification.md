# Vérification externe par port hexagonal

Le domaine ne lance pas Codex. `VerificationService` dépend seulement de
`VerificationPort.verify({ claim, context })` et reçoit une conclusion structurée,
des preuves et des sources. Le choix du moteur reste dans la composition du script.

| Couche | Implémentation de cet essai |
| --- | --- |
| Domaine | `core/verification.cjs` : validation de l’affirmation, une tâche à la fois, contrôle des résultats, abstention sans preuves |
| Contrat | `VerificationPort` dans `core/ports.cjs` |
| Adaptateur | `adapters/codex-verifier.cjs` : processus CLI, prompt de recherche, schéma JSON, délai maximal, nettoyage |
| Hôte de test | `scripts/probe-verify.cjs` : compose le service et l’adaptateur, sauvegarde le résultat |

Le contrat de sortie contient `normalizedClaim`, `assessment`, `conclusion`,
`sources`, `limitations` et des métadonnées `research`. Les sources comprennent
une URL HTTPS, un titre, l’éditeur, une éventuelle date, le contenu de la preuve
paraphrasé et sa relation avec l’affirmation. `assessment` sert à structurer les
preuves (`supported`, `contradicted`, `mixed`, `insufficient`), pas à remplacer le
jugement du spectateur par un badge vrai/faux.

## Exécuter le test

```sh
npm run test:verify
npm run test:verify -- "Le premier alunissage habité a eu lieu en 1972."
```

Prérequis : Codex CLI installé et connexion existante (`codex login status`).
Ce script ne charge pas `.env.local`, n’utilise pas OpenRouter et ne transmet
aucun média. Il utilise la connexion Codex existante : sa consommation relève de
ce compte, séparément du plafond OpenRouter de 1 $. Aucun coût en dollars n’est
déduit des tokens Codex. Le rapport est écrit dans `docs/verification-live.json`.

## Isolation de l’essai

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

## Intégration future dans TVLens

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
d’auditer les ouvertures de pages rapportées par le CLI. Les sources et conclusions
doivent rester visibles et contestables.

Documentation officielle utilisée :
[mode non interactif et schéma de sortie](https://learn.chatgpt.com/docs/non-interactive-mode),
[configuration des outils](https://learn.chatgpt.com/docs/config-file/config-reference).
