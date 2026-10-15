---
id: T032
titre: Refuse any growth of the frozen lint violations in the quality check
statut: a-faire
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
