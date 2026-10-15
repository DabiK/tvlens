---
id: T162
titre: Resume the Codex session for a correction, and prove its hooks run on resume
statut: termine
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

### Exploration

Consignes, moteur, appelant, tests et ADR lus ; état et choix consignés dans
`.harness-state/tickets/T162/exploration.md` et `ecarts.md`. L’aide du vrai CLI a été refusée par le garde
PreToolUse (session imbriquée) ; la boucle vérifiera les options avant chaque reprise, avec repli sur une session neuve.

### Reprise et repli

- `node --test --test-name-pattern='Codex resumes a guarded correction' tests/ticket-loop.test.cjs` :
  rouge sur `exec resume <thread_id>`, puis vert (1 test).
- `node --test --test-name-pattern='a Codex resume without a current witness' tests/ticket-loop.test.cjs` :
  rouge sur l'intégration attendue après repli, puis vert (1 test).
- `node --test --test-name-pattern='a Codex correction uses a fresh session when resume cannot accept' tests/ticket-loop.test.cjs` :
  rouge sur le repli requis, puis vert (2 tests).
- `node --test --test-name-pattern='Codex|codex' tests/ticket-loop.test.cjs` : 66 tests verts, 0 échec.
  L'escalade reste une session neuve ; une erreur de reprise après début d'un tour avec témoin valide refuse la tentative.

### Preuve préparée

`prouver-les-hooks.sh` et `validate-proof.cjs` sont dans `.harness-state/tickets/T162/`.
`node --test .harness-state/tickets/T162/validate-proof.cjs` : 9 tests verts, 0 échec.
La reprise utilise le constructeur de la boucle ; son témoin, le refus du vrai garde et le fichier intact sont vérifiés.
Les sorties détaillées sont conservées dans ce dossier, avec `preuves.md`. Aucun vrai modèle lancé ;
le lancement réel revient à l'orchestrateur après intégration, selon le critère 4.

### Contrôles

- `node scripts/check.mjs --changed` : vert, 161 tests réussis ; règles, format et cliquet verts.
  ESLint non lancé (absent ou non configuré).
- `node --test --test-name-pattern='a Codex resume without a current witness' tests/ticket-loop.test.cjs` :
  2 tests verts après ajout du cas de témoin périmé. Le contrôle complet est lancé ensuite.

### Vérification finale et remise à la boucle

`node scripts/check.mjs` : vert. 90 fichiers JS, 1 059 tests réussis, 0 échec ; Python : 84 tests,
OK, 1 ignoré. Règles, format et cliquet verts. ESLint non lancé (absent ou non configuré).
`git diff --check` : code 0. Sorties : `.harness-state/tickets/T162/check-full.log` et `preuves.md`.
Verdict `TERMINÉ` écrit dans le dossier d'état. Aucun commit ni push ; relecture et intégration laissées à la boucle.
La preuve contre le vrai Codex reste à lancer par l'orchestrateur après intégration, selon le critère 4.

### Reprise après relecture 1

Rapport, journal, écarts, état Git et diff relus. Les deux constats mineurs sont confirmés ;
correction prévue à la frontière `run.mjs --engine codex`, sans nouvel écart.
Exploration complémentaire dans `.harness-state/tickets/T162/exploration.md`.

### Corrections des deux constats

- `node --test --test-name-pattern='a Codex resume that changes thread' tests/ticket-loop.test.cjs` :
  rouge sur la raison qui accusait les hooks, puis vert (1 test). Le témoin valide de la session différente
  est conservé par la doublure ; le repli nomme désormais les identifiants attendu et reçu.
- `node --test --test-name-pattern='a Codex correction uses a fresh session when resume cannot accept' tests/ticket-loop.test.cjs` :
  rouge sur l'appel d'aide non enregistré, puis vert (2 tests). L'aide interrogée doit commencer par
  `exec resume` ; la doublure ne refuse les options de reprise que pour cette sous-commande.
- `node --test --test-name-pattern='a Codex correction outside the harness' tests/ticket-loop.test.cjs` :
  vert (1 test), comportement existant désormais couvert : reprise sans `--add-dir` ni `reprise-impossible`.
- `node .harness-state/tickets/T162/validate-correction-mutations.cjs` : code 0 ; trois mutations dans
  une copie jetable déclenchent les assertions attendues (contrôle de session retiré, mauvaise sous-commande
  d'aide, `--add-dir` imposé hors harnais). Aucun fichier du harnais de travail modifié par ces mutations.
  Sorties conservées dans `.harness-state/tickets/T162/`.

### Contrôles après correction

- `node scripts/check.mjs --changed` : vert, 164 tests réussis, 0 échec ; règles, format et cliquet verts.
  ESLint non lancé (absent ou non configuré). Sortie : `check-changed-correction.log` dans le dossier d'état.
- `node --test .harness-state/tickets/T162/validate-proof.cjs` : vert, 9 tests réussis, 0 échec.
  Sortie : `proof-tests-correction.log`. Aucun vrai fournisseur lancé.
- `node scripts/check.mjs` : vert, 1 061 tests JS réussis dans 90 fichiers, 0 échec ; Python :
  84 tests, OK, 1 ignoré. Règles, format et cliquet verts ; ESLint non lancé (absent ou non configuré).
  Sortie : `check-full-correction.log` dans le dossier d'état.
- `git diff --check` : code 0. Nouveau verdict `TERMINÉ`, les deux constats mineurs corrigés,
  sans contestation. Aucun commit ni push ; relecture et intégration laissées à la boucle.
  La preuve contre le vrai Codex reste à l'orchestrateur après intégration, selon le critère 4.

### Reprise après relecture 2

Rapport, ticket et journal, écarts, état Git et diff relus. Le constat mineur de complexité est confirmé.
Exploration et choix consignés dans le dossier d'état : extraire la validation après session,
conserver le comportement et les tests existants, reproduire d'abord le dépassement avec un contrôle
d'architecture sur AST (parseur déjà installé, chaînage optionnel compris). Aucun nouvel écart.

### Découpe de la validation après session

- `node --test .harness-state/tickets/T162/validate-session-complexity.cjs` : rouge observé sur
  l'assertion `hookedSession: complexity 16 exceeds 15`, puis vert après extraction :
  `hookedSession` à 8 et `sessionProblem` à 9. Sorties : `red-session-complexity.log` et
  `green-session-complexity.log`. Contrôle local sur AST, sans installation ni exécution d'ESLint.
- Commande ciblée ci-dessous : 8 tests réussis avant et après extraction, 0 échec. Sorties :
  `before-session-extraction.log` et `after-session-extraction.log`. Changement de session, témoin absent
  ou périmé, erreurs avant et après tour et conservation de la raison initiale restent couverts sans modification des tests.

```sh
node --test --test-name-pattern='a Codex resume|a Codex session without its startup hook|'\
'a failed Codex process without its hook witness|a fresh Codex fallback without its hook witness' tests/ticket-loop.test.cjs
```

### Contrôle des fichiers modifiés après découpe

`node scripts/check.mjs --changed` : code 0, 164 tests réussis, 0 échec ; règles, format et cliquet verts.
ESLint non lancé (absent ou non configuré). Sortie : `check-changed-session-extraction.log` dans le dossier d'état.

### Contrôle complet et nouveau verdict

- `node scripts/check.mjs` : code 0, 1 061 tests JS réussis dans 90 fichiers, 0 échec ; Python :
  84 tests, OK, 1 ignoré. Règles, format et cliquet verts. ESLint non lancé (absent ou non configuré).
  Sortie : `check-full-session-extraction.log` dans le dossier d'état.
- `git diff --check` : code 0. Le constat mineur de la relecture 2 est corrigé par extraction,
  sans changement de comportement ni modification des tests existants ; aucune contestation.
- Nouveau verdict `TERMINÉ` écrit dans le dossier d'état. Aucun commit ni push ; la boucle assure
  la relecture et l'intégration. La preuve réelle reste à lancer par l'orchestrateur après intégration,
  conformément au critère 4 ; aucun vrai fournisseur lancé dans cette correction.

### Réserves à la clôture

- ESLint non lancé : absent ou non configuré. Le contrôle de complexité est un contrôle local sur AST avec le parseur déjà installé, sans installation de dépendance.
- La preuve contre le vrai Codex reste à lancer par l'orchestrateur après intégration, conformément au critère 4 ; le script et sa validation sur doublure livrés précédemment sont conservés.
- .harness-state/tickets/T162/relecture-3.md : **Écart accepté, périmètre « vérifier avec `codex exec resume --help` ».** Rien n'a changé depuis les relectures 1 et 2. Avant chaque reprise, la boucle interroge l'aide de `exec resume` avec le binaire réellement utilisé, ligne 31. Si une option manque, elle lance une session neuve.
