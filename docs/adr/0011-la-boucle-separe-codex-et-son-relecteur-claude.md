# 0011 — La boucle sépare Codex et son relecteur Claude

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
Le rapport est conservé avec son verdict. Un refus du relecteur ou rapport illisible entraîne une reprise de la
même session Codex avec le rapport complet, dans la limite de trois corrections par tentative.
Après refus, une nouvelle tentative monte dans l'échelle Codex. Les contrôles, l'intégration,
la rétrospective et l'harmonisation restent ceux de la boucle ; les deux dernières utilisent Claude.

Seul un verdict d'implémentation TERMINÉ est relu. BLOQUÉ rend immédiatement sa question au
propriétaire ; un verdict absent, illisible ou PARTIEL refuse la tentative sans relecture.
Le relecteur ne reçoit pas le mode ticket : ses hooks ne doivent pas remplacer son rapport par une
réponse aux contrôles d'implémentation.

## Alternatives écartées

- Relecteur Codex dans la session qui écrit : son indépendance de permissions n'est pas imposée.
- Relecture Codex séparée : le propriétaire conserve Claude comme arbitre commun aux deux moteurs.
- Config utilisateur : elle peut ouvrir le bac à sable et des serveurs MCP étrangers au ticket.

## Conséquences

Les réglages sont imposés au lancement et à la reprise : `workspace-write`, aucune approbation,
réseau autorisé, config utilisateur ignorée et hooks de projet explicitement autorisés.
La reprise utilise `-c sandbox_mode="workspace-write"` et le répertoire courant de la racine,
puisque `resume` n'accepte ni `-s` ni `-C`. Le flux entier est conservé par tentative et le coût reste
inconnu. Les sessions restent persistantes pour permettre la reprise.

Les hooks partagent les gardes existantes et examinent chaque chemin d'un patch, déplacements compris.
Un hook Codex en erreur laisse passer l'appel ; les contrôles après session restent indispensables.
Le bac à sable garde `.git`, `.codex` et `.agents` en lecture seule : leur installation ou mise à jour
demande un contexte habilité. `AGENTS.md` pointe vers `CLAUDE.md`, une seule source de consignes.
Le coût de la relecture séparée et la pertinence des paliers restent à calibrer sur des tickets réels.

## Protégée par

`tests/ticket-loop.test.cjs` vérifie le protocole des processus, la reprise avec le rapport complet,
la limite de corrections, l'escalade, la signature et le refus des changements de harnais.
`tests/agent-guards.test.cjs` vérifie les patches, le lien de consignes et les hooks déclarés.
La mutation supprimant le rapport à la reprise doit faire échouer le test de reprise.
