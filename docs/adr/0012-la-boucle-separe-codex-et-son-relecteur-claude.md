# 0012 — La boucle sépare Codex et son relecteur Claude

- Date : 2026-10-15
- Ticket : `docs/travail/tickets/158-run-a-ticket-with-codex-reviewed-by-claude-through-the-loop.md`
- Statut : acceptée

## Contexte

La boucle lançait uniquement Claude Code, dont la skill ticket orchestre exploration, implémentation
et relecture par sous-agents. Codex doit aussi traiter les tickets, avec le même arbitre Claude.
Ses sous-agents héritent du bac à sable du parent : une relecture indépendante exige ici un processus
séparé. Le flux Codex fournit les jetons, les tours et un identifiant de session, sans coût en dollars.

## Décision

La boucle choisit le moteur par `--engine claude|codex`, avec Claude par défaut. Le module
`scripts/loop/codex.mjs` lance Codex pour explorer et implémenter, enregistre l'état avec
`reviewed-state.mjs`, puis lance Claude avec l'agent `relecteur` et le modèle Claude du palier.
Le rapport est conservé avec son verdict. Un refus du relecteur ou rapport illisible entraîne une nouvelle
session `codex exec`, dans la limite de trois corrections par tentative. Sa consigne nomme le ticket et le
chemin du rapport `relecture-<n>.md`, transmet le rapport complet et demande de reprendre le travail présent
dans l'arbre. Chaque session relit ainsi les consignes et retrouve le contexte sur disque.
Après refus, une nouvelle tentative monte dans l'échelle Codex. Les contrôles, l'intégration,
la rétrospective et l'harmonisation restent ceux de la boucle ; les deux dernières utilisent Claude.

Seul un verdict d'implémentation TERMINÉ est relu. BLOQUÉ rend immédiatement sa question au
propriétaire ; un verdict absent, illisible ou PARTIEL refuse la tentative sans relecture.
Le relecteur ne reçoit pas le mode ticket : ses hooks ne doivent pas remplacer son rapport par une
réponse aux contrôles d'implémentation.

## Alternatives écartées

- Relecteur Codex dans la session qui écrit : son indépendance de permissions n'est pas imposée.
- Relecture Codex séparée : le propriétaire conserve Claude comme arbitre commun aux deux moteurs.
- Config utilisateur sans réglages imposés : elle peut ouvrir le bac à sable et des serveurs MCP étrangers au ticket.
- Config utilisateur ignorée : les approbations des hooks seraient perdues, aucun hook du projet ne tournerait.

## Conséquences

Les réglages sont imposés à chaque session, corrections comprises : `-s workspace-write`, `-C` vers
la racine, aucune approbation, réseau autorisé, confiance du projet et
`--dangerously-bypass-hook-trust`. La config utilisateur reste chargée pour l'approbation des hooks.
La boucle neutralise ses extensions par `--disable plugins`, `--disable apps`, `--disable memories`,
`--disable image_generation` et `-c 'notify=[]'`. Avant chaque session, le même binaire
(`TVLENS_CODEX_BIN`) liste les serveurs par `codex mcp list --json`, avec ces mêmes `--disable`.
Chaque serveur actif reçoit `-c mcp_servers.<nom>.enabled=false` ; une liste en échec ou illisible
refuse la session avant son lancement. Le constructeur exporté des arguments sert aussi à la preuve réelle. La boucle exige un témoin de démarrage propre à chaque
session et à chaque lancement avant toute relecture.

L'approbation donnée par le propriétaire dans `codex`, puis `/hooks`, est enregistrée dans la config
utilisateur pour le chemin absolu de `.codex/hooks.json`. La boucle Codex est donc limitée au dépôt
approuvé ; un worktree ou une copie exige sa propre approbation. `hooks.json` reste figé et appelle les
scripts partagés : modifier un script conserve l'approbation, modifier une définition de hook impose
une nouvelle approbation par `/hooks`. Le refus « hooks Codex non chargés » donne cette cause probable
et ce remède au propriétaire.

Une expérience sur Codex CLI 0.162.1 a établi que `codex exec resume` ne charge aucun hook du projet,
alors que `codex exec` les charge. Une session neuve garantit donc les mêmes gardes pour chaque
correction ; une reprise laisserait la correction sans gardes et serait refusée faute de témoin.
Le flux de toutes les sessions d'une tentative est ajouté au même `codex-<tentative>.jsonl`, les
jetons et tours sont cumulés et le coût reste inconnu.

Les hooks partagent les gardes existantes et examinent chaque chemin d'un patch, déplacements compris.
Un hook Codex en erreur laisse passer l'appel ; les contrôles après session restent indispensables.
Le bac à sable garde `.git`, `.codex` et `.agents` en lecture seule : leur installation ou mise à jour
demande un contexte habilité. `AGENTS.md` pointe vers `CLAUDE.md`, une seule source de consignes.
Le coût de la relecture séparée et la pertinence des paliers restent à calibrer sur des tickets réels.

## Protégée par

`tests/ticket-loop.test.cjs` vérifie le protocole des processus, les corrections par session neuve
avec le ticket, le chemin du rapport et son contenu complet, les réglages et le témoin de chaque
session, la limite de corrections, l'escalade, la signature et le refus des changements de harnais.
`tests/agent-guards.test.cjs` vérifie les patches, le lien de consignes et les hooks déclarés.
Le retrait du rapport de correction ou de la vérification du témoin doit faire échouer les tests.
