---
id: T032
titre: Refuse any growth of the frozen lint violations in the quality check
statut: termine
bloque_par: T031
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

T031 créera le gel des infractions ESLint dans `eslint-suppressions.json`. Sans ce ticket, rien n’empêche une
session de ticket de relancer `eslint --suppress-all` pour faire passer un contrôle rouge, ni de couper
une règle dans `eslint.config.mjs`, ni d'ajouter un fichier à `.prettierignore`.

Après ce ticket, le contrôle unique compare le fichier de suppressions à sa version de `HEAD`. Un
compteur qui monte, une règle ou un fichier qui apparaît font passer le contrôle au rouge. Un compteur
qui baisse ou une entrée qui disparaît sont acceptés : une session de ticket peut toujours élaguer ce
qu'elle a corrigé. Les fichiers de configuration du formatage et du lint rejoignent le harnais
protégé.

## Sources

- Constats : OPS-03
- Code concerné, à la version `e92c6a6` :
  - `scripts/check.mjs` : fonction `inHead` (ligne 64), qui lit la version de `HEAD` d'un fichier ;
    fonction `fileRules` (ligne 70), qui compare déjà un fichier à sa version de `HEAD` ; fonction
    `lint` (ligne 96).
  - `scripts/loop/run.mjs`, constante `PROTECTED` à `scripts/loop/run.mjs:53`, utilisée par `gates` : un
    ticket sans `harnais: oui` qui touche l'un de ces chemins est refusé.
  - `.claude/hooks/guard-write.mjs`, constante `PROTECTED` à `.claude/hooks/guard-write.mjs:16` : même liste, appliquée aux
    écritures de l'agent.
  - `tests/quality-check.test.cjs`, test « the check refuses an empty catch added to production code »
    (ligne 60) : modèle d'un test qui committe un état dans le dépôt temporaire puis vérifie le refus
    d'un ajout.
  - `tests/agent-guards.test.cjs`, test « the harness cannot be edited from a ticket session unless the
    ticket allows it » à `tests/agent-guards.test.cjs:84`.
  - `tests/helpers/harness-repo.cjs`, fonction `harnessRepo` : dépôt Git temporaire avec une copie du
    harnais, sans `node_modules`.
- Ni le gel ni sa comparaison n’existent à ce commit. T031 doit d’abord livrer le fichier et prouver
  son format, le refus des suppressions inutiles et leur élagage limité au fichier demandé. Le présent
  ticket utilise ce format observé ; aucun résultat d’ESLint n’est présumé déjà obtenu.
- `.prettierignore:23` conserve encore son bloc JavaScript temporaire ; l’ADR 0013 fixe les réglages
  Prettier. Les trois fichiers de configuration restent hors des deux listes de protection actuelles.
- Décision du propriétaire, le 15/10 : seule dépendance T031, qui attend T150 ; retrait de T145.
  La fiche n’avait pas de niveau : `standard`, selon l’exception décidée pour T031/T032.

## Périmètre

- `scripts/check.mjs` (`harnais: oui`) : une étape « gel du lint », lancée en mode complet et en mode
  `--changed`, indépendante de la présence d'ESLint :
  - si `eslint-suppressions.json` n'existe ni dans l'arbre ni dans `HEAD`, l'étape est `ok` ;
  - sinon, pour chaque couple fichier et règle de l'arbre, le compteur ne dépasse pas celui de `HEAD`,
    et un couple absent de `HEAD` compte comme une hausse ;
  - un fichier illisible ou un JSON invalide est un échec explicite, avec son chemin, jamais un gel vide ;
  - le message de refus nomme chaque couple et ses deux compteurs, et dit qu’une infraction nouvelle se
    corrige au lieu de se geler.
  Cette règle est écrite comme une fonction pure, exportée si besoin, qui reçoit deux objets et rend
  la liste des hausses.
- `scripts/loop/run.mjs` et `.claude/hooks/guard-write.mjs` : `PROTECTED` reçoit `eslint.config.mjs`,
  `.prettierrc.json` et `.prettierignore`, dans les deux listes. `eslint-suppressions.json` n'y entre
  pas, pour que l'élagage reste possible.
- `docs/standards.md` : le paragraphe du gel, posé au ticket précédent, dit que le contrôle refuse
  toute hausse par rapport au dernier commit.
- Tests :
  - `tests/quality-check.test.cjs` : cas nouveaux. Dans un dépôt temporaire où un
    `eslint-suppressions.json` est committé, le contrôle complet est rouge si un compteur monte, si un
    couple apparaît ou si un fichier apparaît ; il est vert si un compteur baisse ou si une entrée
    disparaît. Le message nomme le couple. Ces cas sont vérifiés en mode complet et `--changed`, sans
    ESLint installé dans le dépôt temporaire ; ajouter le refus d’un JSON invalide et le cas sans gel ;
  - `tests/agent-guards.test.cjs` : un test nouveau, sur le modèle de celui de la ligne 84, pour les
    trois fichiers ajoutés à `PROTECTED`.
- À ne pas toucher : `eslint.config.mjs`, `eslint-suppressions.json`, le code de production, les autres
  tests. Aucun test existant n'est modifié ni retiré.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande, avec sa sortie dans le journal.

1. `tests/quality-check.test.cjs` et `tests/agent-guards.test.cjs` passent, lancés un fichier à la fois
   avec `node --test`. Les nombres de cas avant et après sont consignés ; les tests existants restent.
2. Le test nouveau de `tests/quality-check.test.cjs` couvre les cinq cas du périmètre : trois rouges
   (compteur qui monte, règle nouvelle pour un fichier gelé, fichier nouveau) et deux verts (compteur
   qui baisse, entrée qui disparaît), dans les deux modes et sans ESLint. Il vérifie aussi l’acceptation
   en l’absence de gel dans l’arbre et dans HEAD, et le refus explicite d’un JSON invalide.
3. Faute injectée dans le dépôt, consignée au journal puis défaite : un compteur de
   `eslint-suppressions.json` augmenté de 1 fait afficher par `node scripts/check.mjs --no-tests` le
   couple fichier et règle, avec ses deux compteurs, et le contrôle sort en rouge.
4. Le test nouveau de `tests/agent-guards.test.cjs` montre, pour `eslint.config.mjs`,
   `.prettierrc.json` et `.prettierignore` : `deny` en session de ticket, `ask` en session interactive,
   `none` avec `TVLENS_HARNESS=1`. `eslint-suppressions.json` donne `none` en session de ticket.
5. `node -e` lit les deux constantes `PROTECTED` (par expression régulière sur les deux fichiers) et
   affiche `identiques` si elles contiennent les mêmes chemins.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Des cas nouveaux dans les deux fichiers. Dans `tests/quality-check.test.cjs`, frontière : `node scripts/check.mjs` lancé
dans un dépôt temporaire de `harnessRepo`, avec un `eslint-suppressions.json` committé puis modifié.
Dans `tests/agent-guards.test.cjs`, frontière : le crochet `guard-write.mjs` appelé comme Claude Code
l'appelle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La comparaison en mode `--changed` est une exigence : modifier seulement le JSON ne doit pas permettre
une hausse silencieuse. Il n’y a pas de repli au seul mode complet. Si le fichier livré par T031 ne
permet pas la comparaison décrite, la session expose ce prérequis manquant avant de modifier la règle.
`eslint-suppressions.json` reste éditable pour élaguer ; son éditabilité n’autorise aucune hausse.
Les dispositions existantes de portée du harnais continuent de s’appliquer aux trois configurations.

## Journal

Rafraîchi le 15/10 contre `e92c6a6` : dépendance réduite à T031, repères des deux protections corrigés,
prérequis du gel rendu explicite et ancien repli qui omettait `--changed` retiré. Aucun résultat ESLint
présumé ; aucun test exécuté pendant ce rafraîchissement.

- Relecture documentaire le 15/10 contre `e92c6a6` : sources rendues pérennes dans
  `docs/audit-points-chauds.md` ou attribuées à la décision du propriétaire, le 15/10.

- Exploration Codex le 15/10 : format du gel confirmé (`fichier → règle → count`), deux listes
  `PROTECTED` identiques et comparaison absente du contrôle. Lecture des ADR 0012 à 0014 et des
  frontières de test. Exploration et écarts consignés dans `.harness-state/tickets/T032/` ; aucun
  écart prévu. Les fichiers hors périmètre présents avant la session sont conservés.

- Référence avant modification : `node --test tests/quality-check.test.cjs` → 9/9, puis
  `node --test tests/agent-guards.test.cjs` → 33/33. Sorties : `avant-quality-check.log` et
  `avant-agent-guards.log` dans le dossier d'état.
- Rouge observé : `node --test --test-name-pattern='lint freeze' tests/quality-check.test.cjs`
  → 6 échecs sur l'assertion du code de sortie (0 obtenu, 1 attendu), pour les trois hausses dans les
  deux modes. Après ajout de la comparaison pure et de l'étape indépendante d'ESLint, même commande
  → 6/6. Sorties : `rouge-gel.log`, `vert-gel.log`.
- Rouge observé : `node --test --test-name-pattern='lint and formatting' tests/agent-guards.test.cjs`
  → échec sur `eslint.config.mjs` (`none` obtenu, `deny` attendu). Ajout des trois configurations
  dans les deux listes, sans y ajouter les suppressions. Sortie : `rouge-protections.log`.
- Après implémentation : `node --test tests/quality-check.test.cjs` → 33/33, puis
  `node --test tests/agent-guards.test.cjs` → 34/34. Tous les tests préexistants sont conservés.
  Couverture ajoutée : hausses, baisses, retraits de règle, d'entrée et du fichier, absence des deux
  côtés, JSON invalide dans l'arbre et HEAD, fichier illisible et affichage de plusieurs couples,
  dans les deux modes sans ESLint. Les gardes couvrent `deny`, `ask`, `none`, le maintien de la portée
  des consignes et l'édition des suppressions. Sorties : `apres-quality-check.log`,
  `apres-agent-guards.log`.
- Injection prescrite : compteur `adapters/chat-trace.cjs : no-empty` augmenté de 1 ;
  `node scripts/check.mjs --no-tests` → code 1, étape « gel du lint » rouge avec
  `adapters/chat-trace.cjs : no-empty : 1 → 2` et le conseil de corriger l'infraction.
  Fichier immédiatement restauré à ses octets originaux ; aucune modification du gel conservée.
  Sortie intégrale : `injection-gel.log`.
- Vérification des protections : `node -e` extrait par expression régulière les deux constantes
  `PROTECTED`, trie leurs chemins et compare les tableaux → `identiques`, code 0.
  Commande exacte et sortie : `protections-identiques.log`.
- Contrôle des fichiers modifiés : `node scripts/check.mjs --changed` → code 0, règles, format,
  lint, gel du lint et cliquet verts ; 67/67 tests JS dans les deux fichiers modifiés.
  Sortie : `check-changed.log`.
- Contrôle final : `node scripts/check.mjs` → code 0, toutes les étapes vertes ; 1 148/1 148 tests JS
  dans 97 fichiers ; 84 tests Python, `OK (skipped=1)`. Sortie : `check-complet.log`.
  `git diff --check` → code 0 ; `git diff --exit-code -- eslint.config.mjs eslint-suppressions.json`
  → code 0. Aucun commit ni push ; verdict `TERMINÉ` écrit pour la relecture par la boucle.

- Reprise après relecture 1 le 15/10 : rapport, ticket/journal, écarts, état Git et diff relus.
  Les deux constats mineurs sont confirmés manuellement avant correction ; vérifications et
  périmètre consignés dans `.harness-state/tickets/T032/correction-1.md`. Aucun écart prévu.
  Le constat sur les trois consignes reste hors périmètre et sera porté en réserve dans le verdict.
- Avant correction : `node --test tests/quality-check.test.cjs` → 33/33, code 0
  (`correction-1-avant-tests.log`). Les corrections de texte et de noms ne changent aucun comportement ;
  aucun test rouge automatisé nouveau n'est revendiqué. Attendus vérifiés manuellement avant/après
  dans `correction-1.md`, sans test comparant le texte source, conformément aux standards.
- Correction : en-tête des deux modes complété avec « gel du lint » ; objets renommés `headFreeze`
  et `treeFreeze` dans `lintFreeze`. `--file` inchangé. `node scripts/check.mjs --changed` → code 0,
  toutes les étapes vertes, 67/67 tests JS (`correction-1-check-changed.log`). `git diff --check` → code 0.
- Contrôle complet de la correction : `node scripts/check.mjs` → code 0, toutes les étapes vertes,
  1 148/1 148 tests JS dans 97 fichiers, 84 tests Python, `OK (skipped=1)`
  (`correction-1-check-complet.log`). Les diffs des tests, protections et standards sont identiques
  à l'état relu (`correction-1-perimetre.log`). Configurations et gel inchangés, vérifiés par
  `git diff --exit-code -- eslint.config.mjs eslint-suppressions.json` → code 0.
  Nouveau verdict `TERMINÉ`, avec le constat 3 hors périmètre en réserve ; aucun commit ni push.

### Réserves à la clôture

- Constat 3 de relecture-1.md, hors périmètre : mettre à jour .claude/skills/decoupage/SKILL.md:45, CLAUDE.md:35 et .claude/agents/implementeur.md:33 pour citer eslint.config.mjs, .prettierrc.json et .prettierignore parmi les fichiers du harnais, dans un ticket autorisé à modifier ces consignes.
- .harness-state/tickets/T032/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
