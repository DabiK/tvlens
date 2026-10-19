# 0060 — La boucle reprend sur Claude après quota sur demande

- Date : 2026-10-19
- Ticket : `docs/travail/tickets/251-resume-a-quota-stopped-ticket-with-claude-when-asked.md`
- Statut : acceptée

## Contexte

Un quota Codex laisse le ticket à faire et conserve son travail, sans consommer de tentative utile.
La relève de l'[ADR 0056](0056-la-boucle-releve-son-processus-apres-integration-de-ses-modules.md)
conserve déjà le lancement et le verrou, mais exige un arbre propre. Reprendre un travail partiel
demande une autorisation distincte et une vérification de l'état transmis.

## Décision

`--engine codex --fallback-engine claude` demande une seule relève après un quota reconnu par
le traitement existant. Toute autre valeur, une répétition ou l'option avec Claude est refusée
avant agent. Sans cette option, l'arrêt 5 de Codex conserve son comportement.

`quota-handoff.mjs` capture le dépôt réel, la branche, HEAD, le ticket et sa spécification, les
statuts et empreintes des chemins modifiés, le diff binaire, l'index et le journal des relectures.
Les contenus et statuts des non-suivis initiaux sont vérifiés contre leurs empreintes prises au
lancement. Les nouveaux fichiers du travail entrent dans le diff transmis et dans la revue.
Un dépôt imbriqué qui ne peut pas être représenté comme un fichier est refusé.

Le manifeste et le diff restent dans le dossier d'état du ticket. Leur empreinte d'autorisation
passe uniquement sur le canal IPC de la relève ; les fichiers seuls n'autorisent aucun démarrage.
Le successeur vérifie l'état entier et crée un marqueur exclusif de consommation. Un changement,
une absence ou une consommation précédente refuse la reprise sans réécrire le travail ni l'index.

Les options communes, le budget effectif de tentatives du ticket, `--max`, la cadence
d'harmonisation et les exclusions initiales sont conservés. Les options `--model` et `--effort`
propres au lancement Codex sont retirées : Claude et son relecteur utilisent le palier Claude du
niveau et de la tentative utile courante. Le quota ne monte pas ce palier. Le secours est retiré
des options effectives ; la suite du lancement reste sur Claude, sans cycle entre moteurs.

Claude reçoit le journal, le diff capturé et la consigne de reprendre le travail présent. Une
nouvelle revue enregistrée après le quota, l'état réellement relu et tous les contrôles ordinaires
conditionnent l'intégration. Les anciens non-suivis restent protégés jusqu'à cette intégration.
Les traces et consommations Codex restent dans les événements et dans la rétrospective. Le bilan
d'intégration conserve leur coût inconnu et compte seulement les tentatives utiles.

## Alternatives écartées

- Autoriser globalement un arbre sale : permettrait de reprendre un travail différent sans contrôle.
- Committer, remiser ou réinitialiser au quota : masquerait le diff qui doit être relu.
- Repartir avec le modèle Codex ou une nouvelle échelle complète : perdrait le moteur et le budget effectifs.

## Conséquences

Le superviseur de l'ADR 0056 reste propriétaire du lancement et attend chaque processus avant son
successeur. L'instant du verrou, les sorties et les compteurs ne changent pas d'identité. La
rétrospective et l'harmonisation dues ne partent qu'après le traitement final du ticket.
Un lancement Claude refusé laisse un diagnostic explicite, le ticket récupérable et les fichiers
intacts. Aucun fichier d'état ne constitue une commande publique de reprise d'un arbre sale.

## Protégée par

`tests/ticket-loop.test.cjs` observe la modification réelle d'un dépôt jetable, les arguments,
les paliers, le verrou, les traces, les revues et les commits. Les relèves retenues refusent les
divergences de HEAD, branche, spécification, statut, contenus, modes, index, exclusions et fichiers
d'état. La consommation unique, les refus de démarrage, les contrôles et les compteurs globaux
sont vérifiés sans fournisseur ni dépôt réel.
