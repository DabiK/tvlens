---
id: T162
titre: Resume the Codex session for a correction, and prove its hooks run on resume
statut: a-faire
bloque_par: T161
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Depuis T159, chaque correction demandée par le relecteur lance une session Codex neuve. Elle relit les consignes, le
ticket, le journal, le rapport et le diff : elle refait une partie de l'exploration que la session précédente avait
déjà faite. Ce choix venait d'un constat faux. Avec `--ignore-user-config`, une reprise ne lançait aucun hook. Avec
les réglages de T159, une reprise lance le hook de démarrage et écrit le témoin.

Après ce ticket, une correction reprend la session Codex de la tentative (`codex exec resume <thread_id>`). Elle garde
son contexte et ses gardes, et le témoin est vérifié à chaque reprise. Si la reprise ne peut pas se faire, la boucle
lance une session neuve, comme aujourd'hui. Une escalade vers le palier suivant reste une session neuve, avec le
modèle du palier.

## Sources

- Décision du propriétaire, le 15/10 : une correction mineure reprend la session de dev, sans refaire l'exploration ;
  l'escalade garde un regard neuf.
- Constat de l'orchestrateur, `.harness-state/tickets/T159/constat-reprise.md`, correction de 10 h 55 :
  - dans le dépôt approuvé, avec les réglages de la boucle, `codex exec` puis `codex exec resume <thread_id>` ;
  - chaque appel écrit le témoin, avec son propre `TVLENS_HOOK_RUN` et le même identifiant de session ;
  - `PreToolUse` et `Stop` n'ont pas été observés sur une reprise.
- Codex CLI 0.162.1 : `exec resume` accepte `-c`, `-m`, `--json`, `--dangerously-bypass-hook-trust` et `-o`, mais
  pas `-s` ni `-C`. Le bac à sable passe alors par `-c sandbox_mode="workspace-write"`, et le processus part de la
  racine. `--add-dir` et `--disable` sur une reprise ne sont pas vérifiés.
- Réserve de T159 : le README, l'ADR 0012 et la skill Codex disent qu'une reprise ne charge aucun hook.
- Code concerné, à la version de T161 :
  - `scripts/loop/codex.mjs` : `codexArgs`, `hookedSession`, la boucle des corrections ;
  - `.harness-state/tickets/T159/prouver-les-hooks.sh` et `validate-proof.cjs` : la preuve réelle des hooks, à
    reprendre dans `.harness-state/tickets/T162/` ;
  - `tests/ticket-loop.test.cjs`, `tests/helpers/codex-session.cjs`.

## Périmètre

- À modifier :
  - `scripts/loop/codex.mjs` :
    - une correction après une relecture reprend la session de la tentative, avec les réglages de `codexArgs`
      adaptés à `exec resume` : neutralisation de la config, confiance, modèle et effort du palier ;
    - le témoin est vérifié après chaque reprise, avec un nouveau `TVLENS_HOOK_RUN`. Si le témoin manque après une
      reprise, ou si la reprise échoue avant tout tour, la boucle lance une session neuve pour la même correction, et
      l'écrit dans les événements (`reprise-impossible`, avec la raison) ;
    - une tentative démarre toujours par une session neuve ;
    - si `exec resume` refuse `--add-dir` ou `--disable` (à vérifier avec `codex exec resume --help`), la correction
      d'un ticket qui en a besoin passe par une session neuve ;
  - `docs/travail/README.md`, `docs/adr/0012-la-boucle-separe-codex-et-son-relecteur-claude.md` et
    `.agents/skills/ticket-codex/SKILL.md` : la reprise pour une correction, la session neuve en repli et pour une
    escalade. La phrase « une reprise ne charge aucun hook » disparaît ;
  - les tests des critères ;
  - la preuve réelle, dans `.harness-state/tickets/T162/`.
- À ne pas toucher :
  - l'escalade, qui reste une session neuve ;
  - `scripts/check.mjs`, `scripts/quality/`, le plancher du cliquet ;
  - le code du produit.

## Critères d'acceptation

1. Avec le faux `codex` et un faux relecteur qui refuse puis accepte, la correction est un `exec resume` avec le
   `thread_id` de la première session. Ses arguments neutralisent la config comme `codexArgs`, et passent le bac à sable
   par `-c sandbox_mode="workspace-write"`. Le témoin de la reprise est vérifié.
2. Une reprise dont le faux `codex` n'écrit pas le témoin est suivie d'une session neuve pour la même correction.
   L'événement `reprise-impossible` est écrit, et le ticket est intégré si la relecture suivante accepte.
3. Une tentative refusée, suivie d'une tentative sur le palier suivant : cette tentative est un `exec` neuf, pas une
   reprise.
4. **Preuve réelle, préparée.** La session écrit `.harness-state/tickets/T162/prouver-les-hooks.sh`, sur le modèle de
   celui de T159. Après la session `exec`, le script reprend cette session par la reprise que construit la boucle, et
   lui demande d'écrire une ligne dans `scripts/check.mjs`. Il vérifie ensuite trois choses :
   - le témoin de la reprise, avec son propre lancement ;
   - le refus de cette écriture par `guard-write` ;
   - le fichier intact.

   Le script est vu fonctionner sur un faux `codex`. L'orchestrateur le lance contre le vrai Codex, après
   l'intégration, et un échec ouvre un ticket de suivi.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/ticket-loop.test.cjs`, frontière : `run.mjs --engine codex` dans le dépôt temporaire des tests, avec le faux
`codex` et un faux relecteur. Le critère 4 est la seule preuve que les gardes tournent sur une vraie reprise.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Reprise pour corriger, session neuve pour escalader.** La reprise garde le contexte d'un modèle qui a presque
  réussi. Un modèle plus fort part d'un regard neuf, avec les faits : le rapport d'échec, le journal, le diff et la
  dernière relecture.
- **Repli sur une session neuve plutôt que refus.** Une session neuve est déjà sûre, et son témoin est vérifié ; un
  refus ferait perdre le palier pour une raison technique.
- **Niveau `standard`, proposé par l'orchestrateur le 15/10, comme T159 et T160.**
- **Pas d'ADR.** Le ticket corrige l'ADR 0012 sur un fait, pas sur un choix.

## Journal
