---
id: T148
titre: Hold the loaded Mac session in one object instead of nine host variables
statut: a-faire
bloque_par: T116, T118, T119
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

L'hôte Mac tient sa session chargée dans neuf variables : sept de module (`live`, `watch`, `store`,
`search`, `inspector`, `inspectorModel`, `perception`) et deux de fermeture (`title`, `startedAt`).
`adopt` les remplit une à une, et la fin de session les remet à `null` une à une. Une variable oubliée
d'un côté laisse un morceau de l'ancienne session visible après la fin. Après ce ticket, la session
chargée tient dans un seul objet, posé par `adopt` et remis à `null` en une affectation. Les modules
qui sortiront de `app/main.cjs` (T149, T150) liront alors une seule valeur au lieu de neuf. Le
comportement de l'hôte ne change pas.

## Sources

- Constat : ADP-06 (`docs/audit-maintenabilite.md`, ancre `ADP-06`) : « 27 variables mutables de module
  (`:31-36`) ».
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Code concerné, à la version `0d4c495` d'`app/main.cjs` (le nom d'abord, la ligne ensuite ; T118 et
  T119 auront décalé les lignes) :
  - déclarations : l. 34 (`let deep, bridge, search, inspector, videoAgent, perception, inspectorModel;`),
    l. 35 (`let window, watch, store, live, pruneTimer, …`) et l. 292
    (`let title = null, startedAt = null, storageShown = null;`) ;
  - `adopt` (l. 307) : `live = runtime; ({store,search,inspector,inspectorModel,perception,watch}=runtime);
    title = name; startedAt = at; …` ;
  - `letGo` dans `endSession` (l. 372-377) :
    `live = watch = store = search = inspector = inspectorModel = perception = title = startedAt = null;` ;
  - lectures tardives, qui doivent lire la session au moment où elles s'exécutent, pas celle d'avant :
    `getSession` de la conversation (l. 162) et de la surveillance (l. 182), le microtask
    `queueMicrotask(()=>watch?.drain())` (l. 167), `sessionState` (l. 295), le `onChange` de `compose`
    (l. 306), `sweep` (l. 311), `sessionRows` (l. 314-327) ;
  - environ 150 lectures en tout (`grep -c "\bwatch\b" app/main.cjs` rend 58, `live` 38, `store` 17,
    `title` 16).
- Bancs du Mac, qui lancent le vrai `app/main.cjs` derrière un faux Electron :
  `tests/mac-ipc-contract.test.cjs`, `tests/architecture-f05.test.cjs`, `tests/architecture-f07.test.cjs`.
  T116 y ajoute les tests du drapeau de question, du préchauffage et de la consigne active.
- Gardes de texte sur `app/main.cjs` : `tests/mac-ipc-contract.test.cjs:86-118`. Aucune ne cite les
  neuf noms. Le passage compris entre `createSurveillanceRuntime({` et `surveillanceTimer = setInterval`
  ne doit contenir ni `videoAgent` ni `verifierAdapter`.

## Périmètre

- À modifier : `app/main.cjs` seulement.
  - Une variable unique, `loaded` (ou un nom meilleur s'il s'impose), tient le runtime de la session
    chargée, son titre et sa date de début. Les champs du runtime (`watch`, `store`, `search`, …) se
    lisent sur elle, directement ou par une petite aide.
  - `adopt` pose cette variable en une affectation ; `letGo` la remet à `null` en une affectation et
    reste synchrone.
  - Chaque lecture tardive (liste des Sources) lit la variable au moment où elle s'exécute.
- À ne pas toucher :
  - les autres variables de module (`deep`, `bridge`, `videoAgent`, `surveillance`, `recap`, les
    minuteries, `config`, …) : elles appartiennent à l'hôte, pas à la session ;
  - l'ordre des étapes de `endSession` et ce qu'il passe à `closeSession` ;
  - `closeSession({` et `settleQuestions(` restent écrits dans `app/main.cjs` :
    `tests/architecture-f07.test.cjs:578-591` le vérifie ;
  - les canaux IPC, leurs noms et leurs réponses ;
  - les tests, y compris ceux de T116.

## Critères d'acceptation

1. Les déclarations `let` d'`app/main.cjs` ne listent plus aucun des neuf noms. Commande :
   `grep -nE "^\s*let " app/main.cjs | grep -wE "live|watch|store|search|inspector|inspectorModel|perception|title|startedAt"`
   ne rend rien. Sortie (vide) dans le journal.
2. La fin de session remet la session chargée à `null` en une seule affectation : la ligne de `letGo`
   est citée au journal.
3. Les tests de T116 (drapeau de question, préchauffage, consigne active), `tests/mac-ipc-contract.test.cjs`,
   `tests/architecture-f05.test.cjs` et `tests/architecture-f07.test.cjs` passent sans modification :
   `git diff --stat` ne cite que `app/main.cjs` et le ticket.
4. Mutation temporaire : `adopt` copie la session dans une constante que les lectures tardives
   gardent, au lieu de relire la variable. Le journal note le test qui échoue, ou qu'aucun test ne la
   voit. Ce critère informe le propriétaire. Le ticket n'invente pas de test pour un comportement
   qu'aucun document ne fixe. La mutation est retirée ensuite.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les bancs du Mac existants, frontière : le vrai `app/main.cjs` derrière le faux Electron, appelé par ses
canaux IPC. Ce ticket ne change aucun comportement, donc ses tests sont ceux qui existent. Le critère 4
dit si ces tests voient une lecture faite au mauvais moment.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **La session, pas l'hôte.** Seules les neuf valeurs qui naissent avec `adopt` et meurent avec `letGo`
  entrent dans l'objet. Le reste des variables de module change de forme avec T149 et T150, ou reste.
- **Après T116, T118 et T119.** T116 pose les tests qui protègent ce déplacement. T118 et T119 modifient
  les mêmes lectures (sauvegarde des questions, préchauffage, consigne active) : ce ticket part du code
  qu'ils laissent.

## Journal
