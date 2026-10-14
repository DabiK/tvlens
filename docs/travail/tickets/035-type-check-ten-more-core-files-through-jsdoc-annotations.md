---
id: T035
titre: Type-check ten more core files through JSDoc annotations
statut: a-faire
bloque_par: T034
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Après le ticket qui installe TypeScript, seuls deux fichiers de `core/` sont vérifiés. Dix autres,
fermés par leurs imports, sont à portée : leurs erreurs sont presque toutes des paramètres sans type.

Après ce ticket, ces dix fichiers sont listés dans `tsconfig.json` et passent `tsc` en mode strict. Les
erreurs se corrigent par des annotations JSDoc, sans changer le comportement. La mesure
`fichiers_types` passe de 2 à 12.

## Sources

- Constats : OPS-14
- Code concerné, à la version `0d5a954` :
  - le lot : `core/clip-container.cjs`, `core/latency-trace.cjs`, `core/passage-text.cjs`,
    `core/perception-context.cjs`, `core/session-timeline.cjs`, `core/topic-summary.cjs`,
    `core/transcription-language.cjs`, `core/session-clock.cjs`, `core/viewing-actions.cjs`,
    `core/frame-policy.mjs` ;
  - imports (relevé par `grep -oE "require\(['\"][^'\"]+" core/<fichier>`) : seuls
    `perception-context.cjs` et `session-timeline.cjs` importent un autre fichier du cœur,
    `./topic-summary.cjs`, qui est dans le lot ;
  - `tsconfig.json`, `files`, et la mesure `fichiers_types` : posés par le ticket qui ajoute l'étape
    « types » (`T034`), qui y liste `core/ports.cjs` et `core/video-tool-contracts.cjs`.
- Mesure au découpage, sur les douze fichiers (ces dix et les deux déjà listés, 566 lignes) :
  ```sh
  promo/node_modules/.bin/tsc --noEmit --allowJs --checkJs --strict --module nodenext \
    --moduleResolution nodenext --types node --skipLibCheck --target es2022 <les douze fichiers>
  ```
  74 erreurs, dont 61 `TS7006` (paramètre implicitement `any`) et 5 `TS2532` (objet peut-être
  `undefined`, `core/viewing-actions.cjs` lignes 16 à 22). Par fichier : `viewing-actions` 26,
  `clip-container` 13, `frame-policy` 7, `latency-trace` 6, `perception-context` 6, `session-timeline` 6,
  `topic-summary` 6, `passage-text` 2, `session-clock` 1, `transcription-language` 1, `ports` 0,
  `video-tool-contracts` 0.

## Périmètre

- `tsconfig.json` : les dix chemins du lot ajoutés à `files`, nommés un par un. Aucune option du
  compilateur ne change, aucun chemin n'est retiré.
- Annotations : les erreurs se corrigent par des commentaires JSDoc (`@param`, `@returns`, `@typedef`,
  `@type`, et la conversion `/** @type {T} */ (expression)`). Une ligne de code hors commentaire ne
  change que si aucune annotation ne suffit ; elle garde le même comportement, et le journal la cite avec
  sa raison. Aucun `@ts-ignore`, `@ts-expect-error` ni `@ts-nocheck`. Aucun type `any` explicite.
- À ne pas toucher : les options de `tsconfig.json`, le harnais (`scripts/check.mjs`,
  `scripts/quality/`, `scripts/loop/`, `.claude/`), `eslint.config.mjs`, `eslint-suppressions.json`,
  les fichiers de `core/` hors du lot, les tests.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. Au début de la session, la commande de mesure des sources, lancée avec `node_modules/.bin/tsc`, est
   recopiée au journal avec son nombre d'erreurs. En fin de session, `node_modules/.bin/tsc -p
   tsconfig.json` sort en 0 et `npm run typecheck` aussi.
2. `node -p "require('./tsconfig.json').files.length"` affiche `12`, et
   `node scripts/quality/ratchet.mjs` affiche `fichiers_types` à 12.
3. `grep -rnE "@ts-(ignore|expect-error|nocheck)|\{any\}" <les douze fichiers>` ne rend rien.
4. Le journal liste chaque ligne de code hors commentaire modifiée dans les dix fichiers, avec sa
   raison, ou dit qu'il n'y en a aucune. `git diff --stat -- core/` est recopié au journal.
5. Les tests qui citent un fichier du lot passent :
   `node --test --test-concurrency=1 $(grep -lE "clip-container|latency-trace|passage-text|perception-context|core/ports|session-timeline|topic-summary|transcription-language|video-tool-contracts|session-clock|viewing-actions|frame-policy" tests/*.test.cjs)`
   (16 fichiers au découpage ; si la sélection est vide, la commande n'est pas lancée et le journal le
   dit).
6. `node scripts/check.mjs --no-tests` affiche `✔ types`.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Aucun test nouveau : la preuve est l'étape « types » du contrôle unique, qui vérifie les douze
fichiers, et la mesure `fichiers_types`, qui empêche d'en retirer un. Les tests existants des dix
fichiers, sans modification, montrent que le comportement n'a pas changé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Verdict BLOQUÉ, avec la sortie constatée, dans deux cas :
- une erreur de `tsc` ne se corrige ni par une annotation, ni par une ligne de code de même
  comportement : le journal nomme le fichier, la ligne et l'erreur ;
- plus de dix lignes de code hors commentaire doivent changer pour faire passer `tsc`.

## Journal
