---
name: ticket
description: Traite un ticket de docs/travail/tickets/ de bout en bout dans une session fraîche — exploration, implémentation et relecture par trois sous-agents, boucle de correction, ADR, contrôle qualité, verdict. À utiliser dès qu'on demande d'exécuter, de traiter ou de reprendre un ticket.
---

# Traiter un ticket

Tu es l'orchestrateur. Tu gardes les décisions et tu délègues le travail : l'exploration à
`explorateur`, le code et les tests à `implementeur`, la relecture à `relecteur`. Tu ne lis pas le code
en détail toi-même et tu n'écris pas de code : ton contexte sert à décider.

Dossier d'état du ticket : `.harness-state/tickets/<ID>/` (hors Git). Crée-le au début.

## 1. Cadrer

Lis le ticket en entier et `docs/standards.md`. Si le journal du ticket contient déjà des jalons, ou si
`.harness-state/tickets/<ID>/` contient un rapport d'échec, c'est une **reprise** : lis-les, regarde
`git status` et `git diff`, et repars du dernier jalon au lieu de recommencer.

## 2. Explorer

Délègue à `explorateur` avec le chemin du ticket. Écris son rapport dans
`.harness-state/tickets/<ID>/exploration.md` et résume-le en cinq lignes dans le journal du ticket.

Si l'exploration contredit le ticket sur un point qui change le périmètre, **arrête-toi** : verdict
BLOQUÉ, avec l'écart constaté. Tu ne réécris pas le ticket et tu n'improvises pas un autre périmètre.

## 3. Implémenter

Délègue à `implementeur` : le ticket, le rapport d'exploration, et le plan d'incréments retenu. Un seul
implémenteur à la fois.

## 4. Écrire l'ADR

Si le ticket porte `adr: oui`, écris l'ADR dans `docs/adr/` à partir de `docs/adr/0000-gabarit.md`,
avec le numéro suivant, avant la relecture : il en fait partie. Un ADR dit la décision, son contexte et
ses conséquences ; l'historique des essais va dans le journal du ticket.

## 5. Relire

Enregistre l'état relu, puis délègue à un `relecteur` neuf :

```sh
node scripts/loop/reviewed-state.mjs record      # hors boucle : ajouter --ticket <ID>
```

La commande écrit dans le dossier d'état `revue-<n>.diff` (les fichiers suivis par rapport à `HEAD`,
puis chaque fichier nouveau en entier), `revue-<n>.fichiers` (la liste des fichiers) et
`reviewed-state.json`, et affiche leurs chemins. Donne au relecteur le chemin du ticket et ces deux
fichiers `revue-<n>`, rien d'autre : pas ton avis, pas le compte rendu de l'implémenteur.

Après une relecture, toute modification autre que le journal du ticket demande une nouvelle relecture,
y compris une correction exigée à la fin par un contrôle rouge. La boucle compare l'état final à la
dernière relecture enregistrée et refuse le ticket s'ils diffèrent, ou si aucune relecture n'est
enregistrée.

## 6. Corriger, puis relire de nouveau

Verdict « à corriger » : renvoie les constats bloquants à `implementeur`, puis enregistre de nouveau
l'état relu et fais relire par un **nouveau** `relecteur`. Trois tours au plus. Au-delà, verdict
PARTIEL avec les constats restants.

## 7. Laisser une trace

Mets à jour le journal du ticket : un jalon par étape, avec la commande lancée et son résultat réel.
Tu ne modifies rien au-dessus de la ligne `## Journal`.

## 8. Conclure

Lance `node scripts/check.mjs` en entier. S'il est rouge, la correction repasse par l'implémenteur et
par une nouvelle relecture (étapes 5 et 6). Puis écris `.harness-state/tickets/<ID>/verdict.json` :

```json
{ "statut": "TERMINÉ", "resume": "ce qui est livré, en deux phrases", "revue": "accepté", "adr": "docs/adr/0011-….md", "preuves": ["node scripts/check.mjs : vert, 602 tests"], "reste": [] }
```

- `TERMINÉ` : critères couverts, relecture acceptée, contrôle vert.
- `PARTIEL` : du travail utile est fait mais il en reste ; dis quoi dans `reste`.
- `BLOQUÉ` : impossible d'avancer sans une décision ; dis laquelle dans `resume`.

Un statut est un constat, pas un objectif : PARTIEL dit la vérité vaut mieux que TERMINÉ faux, que la
boucle refusera de toute façon après ses propres contrôles.

Tu ne committes pas et tu ne pousses pas : la boucle le fait après avoir tout revérifié.
