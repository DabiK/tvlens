---
id: T141
titre: Refuse resuming a reviewer or a sub-agent of unknown role in a ticket session
statut: a-faire
bloque_par: T003
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Dans une session de ticket, l'orchestrateur peut aujourd'hui reprendre un sous-agent déjà lancé avec
l'outil `SendMessage`. Aucun hook ne voit cet appel. Repris ainsi, un relecteur relit sans regard neuf,
et son verdict n'est pas enregistré : la boucle juge le ticket sur une relecture qui n'est pas la
dernière. Après ce ticket, une session de ticket ne peut plus reprendre un relecteur, ni un sous-agent
dont elle ne connaît pas le rôle. Elle peut toujours reprendre son implémenteur ou son explorateur, et
la skill `ticket` lui dit comment attendre leur rapport.

## Sources

- Constat : ESSAI-07.
- Faits observés dans `.harness-state/tickets/T003/session-1.jsonl`, deuxième lancement de T003, le
  14/10 :
  - l'orchestrateur a repris l'implémenteur deux fois par `SendMessage` ;
  - l'entrée de l'outil porte les clés `to`, `message`, `summary`, `recipient`, `recipient_kind`,
    `type` et `content`, mais ni `subagent_type` ni `run_in_background`. `to` est l'identifiant du
    sous-agent, par exemple `aab8d76f4baf519d4` ;
  - la réponse est immédiate (`{"success":true,"message":"Resuming agent aab8d76", "resumedAgentId": …}`).
    Le rapport arrive plus tard, par un message `system` de sous-type `task_notification` qui porte
    `handback_report` et `usage` ;
  - la réponse de l'outil `Agent` donne `agentId` et `agentType` dans `tool_use_result`. C'est le seul
    endroit du flux où un identifiant est relié à un rôle.
- Lors du premier lancement de T003, l'explorateur a été repris par `SendMessage`. La session a ensuite
  attendu son transcript avec une boucle Bash en arrière-plan. Elle est restée suspendue après son
  verdict, jusqu'à l'arrêt manuel du processus.
- Code concerné, à la version `a5b9dd3` :
  - `.claude/hooks/guard-agent.mjs`, lignes 1 à 20 : il corrige l'appel `Agent` en mode boucle (premier
    plan, modèle du relecteur). Il ne voit pas `SendMessage`.
  - `.claude/hooks/record-review.mjs`, ligne 9 : il n'enregistre qu'un appel dont l'entrée porte
    `subagent_type: "relecteur"`.
  - `.claude/settings.json` : PreToolUse, filtre `Agent|Task` (ligne 44), et PostToolUse, filtre
    `Agent|Task` (ligne 68).
  - `.claude/skills/ticket/SKILL.md`, lignes 41 à 62 : la skill demande un relecteur neuf à chaque
    tour (« fais relire par un **nouveau** `relecteur` »). Elle ne dit rien de `SendMessage`.
  - `tests/agent-guards.test.cjs` : tests « a ticket session runs its sub-agents in the foreground… »
    (ligne 139) et « in a ticket session, each reviewer verdict is recorded… » (ligne 160).

## Périmètre

- À modifier :
  - `.claude/hooks/` : `guard-agent.mjs`, ou un nouveau hook de même rôle ; `record-review.mjs` s'il
    tient la correspondance entre identifiant et rôle ;
  - `.claude/settings.json` : le filtre PreToolUse doit couvrir `SendMessage`, ainsi que le filtre
    PostToolUse si la correspondance y est tenue ;
  - `.claude/skills/ticket/SKILL.md` ;
  - `tests/agent-guards.test.cjs` ;
  - `scripts/quality/baseline.json`, si le nombre de tests monte.
- `harnais: oui` parce que les hooks et les skills sont le harnais. Le contrôle ajouté est plus strict
  que l'existant : il retire des appels permis aujourd'hui, il n'en ajoute aucun.
- Forme attendue :
  - la correspondance entre identifiant et rôle vient de la réponse de l'outil `Agent` (`agentId`,
    `agentType`) ;
  - elle est propre à la session en cours : un identifiant vu dans une autre session est inconnu ;
  - pour le reste, la forme est libre : fichier sous `.harness-state/tickets/<id>/`, ou lecture du
    transcript donné au hook.
- À ne pas toucher :
  - `scripts/loop/` et `scripts/check.mjs` ;
  - les agents de `.claude/agents/` ;
  - les autres hooks ;
  - les tickets existants et le code du produit.
- Les tests existants de `tests/agent-guards.test.cjs` gardent toutes leurs assertions.

## Critères d'acceptation

Les critères 1 à 4 se vérifient par des tests de `tests/agent-guards.test.cjs`. Ces tests passent au
hook l'entrée qu'il reçoit de Claude Code.

1. En mode boucle, un `SendMessage` adressé à un sous-agent que la session a lancé comme `relecteur`
   est refusé. Le message de refus dit de lancer un nouveau `relecteur` par l'outil `Agent`.
2. En mode boucle, un `SendMessage` adressé à un identifiant que la session en cours n'a pas lancé est
   refusé, avec le même conseil. Sont concernés un identifiant inconnu, un nom et un identifiant
   enregistré par une autre session.
3. En mode boucle, un `SendMessage` adressé à un sous-agent lancé comme `implementeur` ou `explorateur`
   passe.
4. En session interactive, `SendMessage` passe sans décision du hook, quel que soit le destinataire.
5. `.claude/settings.json` fait passer `SendMessage` par le hook de garde. Vérification : la commande
   `jq '.hooks.PreToolUse[] | select(.matcher | test("SendMessage")) | .hooks[].command'
   .claude/settings.json` rend la commande du hook. Sa sortie va dans le journal.
6. La skill `ticket` dit trois choses :
   - on ne reprend jamais un relecteur ;
   - reprendre un implémenteur ou un explorateur par `SendMessage` rend la main tout de suite ;
   - son rapport arrive plus tard, sous forme de message, et on l'attend sans finir le tour et sans
     tâche Bash en arrière-plan.

   Vérification : `grep -n SendMessage .claude/skills/ticket/SKILL.md`, sortie dans le journal.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un nouveau test dans `tests/agent-guards.test.cjs`, nommé d'après le comportement, par exemple « a
ticket session cannot resume a reviewer, nor a sub-agent whose role it does not know ». Frontière : les
hooks lancés comme processus par la fonction `hook` du fichier, comme dans le test de la ligne 139. Le
test reproduit dans l'ordre :

- la réponse de l'outil `Agent` qui fait connaître le rôle, avec la forme observée (`agentId`,
  `agentType`) ;
- puis l'appel `SendMessage` (`to`, `message`, `summary`).

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Relecteur.** Un relecteur repris est refusé plutôt que suivi par `record-review`. La skill demande
  déjà un relecteur neuf à chaque tour, et un refus ne laisse aucun verdict hors du registre.
- **Implémenteur et explorateur.** Leur reprise reste permise : elle garde leur contexte et a réussi
  deux fois sur T003.

Un fait n'est pas vérifiable sans une session réelle : que Claude Code passe bien `SendMessage` aux
hooks PreToolUse quand le filtre le nomme. Les tests prouvent le comportement du hook, pas son
déclenchement. Le journal doit le dire, et la première session de la boucle qui reprend un sous-agent le
confirmera.

## Journal
