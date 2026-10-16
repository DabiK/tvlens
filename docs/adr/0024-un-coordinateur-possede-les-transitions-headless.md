# 0024 — Un coordinateur possède les transitions headless et leur transfert synchrone

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/180-move-headless-session-transitions-into-one-coordinator.md`
- Statut : acceptée

## Contexte

Après la séparation de l'ingestion (ADR 0023), l'hôte headless compte encore 774 lignes physiques.
Il compose les ressources, publie les vues et décide des transitions de session. Une préparation
peut survivre à plusieurs fins ; une annulation de question peut empêcher de lâcher la session.
Les contrats des ADR 0002, 0003, 0006 et 0007 restent nécessaires.

## Décision

`createHeadlessSessionLifecycle` reçoit bibliothèque, construction et ouverture, conversation,
surveillance, checkpoint, ingestion, préchauffage, garde disque, publication et journal.
Le coordinateur possède seul la référence `session`, la chaîne `transition`, les faits `fresh`,
`ending`, `releasing`, `closing`, `lastEnd`, `captureEpoch` et la promesse `closed`.
La chaîne reprend après un rejet ; les demandes de fin et d'arrêt partagent leurs promesses.
Les axes de transition restent distincts. Une fin demandée bloque immédiatement l'admission.

L'adoption oublie le checkpoint précédent, restaure silencieusement les questions, remplace la
référence, renouvelle la capture et publie son instantané dans un même tour synchrone. Si la
restauration refuse une question active, la référence reste tenue. Aucun effacement n'est alors
permis par le protocole partagé ; un nouvel essai reste possible.

`HeadlessRuntime` compose et délègue. Ses getters lisent les faits du coordinateur ; ses vues ne
conservent que l'instantané publié. Les listes, questions, commandes de surveillance et minuteries
de maintenance restent dans l'hôte. L'ingestion conserve seule ses opérations et ses attentes.
Ses frontières de fermeture restent accessibles par les méthodes de compatibilité de l'hôte.

`session-closing.cjs` conserve seul le sort des sessions, les erreurs nommées et le journal de fin.
Le coordinateur lui remet l'ordre serveur : annulation des préparations avant attente, pause sauf
suppression, stockages et préparations, questions et checkpoint, surveillance, chat. L'arrêt tente
encore la fermeture de la surveillance après un refus et conserve ses erreurs dans `lastEnd`.

## Alternatives écartées

- Une seconde référence modifiable dans l'hôte : elle pourrait diverger des questions restaurées.
- Une phase exclusive unique : elle confondrait les axes de fin, de libération et d'arrêt existants.
- Recopier le protocole partagé : cela créerait un second propriétaire des sorts et diagnostics.

## Conséquences

Les courses se vérifient par une fabrique injectée, avec le vrai protocole et le vrai propriétaire
d'ingestion, sans transport ni fournisseur. L'hôte garde sa façade HTTP et ses sondes existantes.
Les formats, règles d'archive et comportement du Mac restent ceux de leurs propriétaires actuels.

## Protégée par

`tests/headless-session-lifecycle.test.cjs` utilise des ressources différées, des publications
observées et des minuteries manuelles. La garde finale de `architecture-f07` contrôle le coordinateur
et l'hôte Mac contre le même protocole. Les suites HTTP et les scénarios des deux hôtes gardent leurs
assertions ; `node scripts/check.mjs` les exécute en séquentiel.
