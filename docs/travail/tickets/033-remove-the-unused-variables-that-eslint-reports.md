---
id: T033
titre: Remove the unused variables that ESLint reports
statut: a-faire
bloque_par: T032, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le gel d'ESLint contient seize variables inutilisées hors du harnais. C'est la seule règle gelée dont
la correction est mécanique et sans risque de comportement. Après ce ticket, aucune infraction
`no-unused-vars` ne reste dans le périmètre analysé, et leurs suppressions sont élaguées : une nouvelle
variable inutilisée, où que ce soit, fait passer le contrôle au rouge.

## Sources

- Constats : OPS-03
- Code concerné, à la version `0d5a954` (lignes avant formatage) :
  - production :
    - `adapters/codex-confinement.cjs:442`, constante `OPEN_ACTIONS`, jamais lue : `openedPages`
      (ligne 443) décide par la référence `turnNviewM`, pas par le nom de l'action ;
    - `app/main.cjs:34`, variable `inspectorModel`, affectée lignes 307 et 373 mais jamais lue ;
    - `core/deep-ask.cjs:166`, paramètre `mode` de la méthode `partial`, jamais lu ;
  - scripts : `scripts/bench-backend.cjs:56` (`saved`), `scripts/probe-refactor-live.cjs:149`
    (`first`), `scripts/smoke-tv-overlay.mjs:253` et `:488` (`controller`) ;
  - tests : `tests/inspection-strategies.test.cjs:2` (`makeSheet`), `tests/quality-check.test.cjs:115`
    (`error`), `tests/refactor-boundaries.test.cjs:42` (`error`), `tests/remote-server.test.cjs:24`
    (`a`), `tests/server-surveillance.test.cjs:30` (`assembled`), `tests/surveillance.test.cjs:296`,
    `:304` et `:306` (`request`), `tests/video-research.test.cjs:5` (`wait`).
- Mesure au découpage, sur la copie formatée et avec la configuration d'essai du ticket qui installe
  ESLint : 16 infractions `no-unused-vars`, par
  `eslint --suppressions-location <fichier contenant {}> -f json .` filtré sur `ruleId`. Les cinq du
  harnais (`scripts/check.mjs`, `scripts/loop/run.mjs`) sont hors du périmètre analysé. Les globales
  voulues de `tv/app/surveillance-overlay.js:495-499` ne sont pas signalées grâce à `vars: "local"`.

## Périmètre

- Le dossier d'état du ticket est `.harness-state/tickets/$TVLENS_TICKET/`, noté `$ETAT`. La mesure se
  fait avec un fichier de suppressions vide :
  ```sh
  echo '{}' > "$ETAT/vide.json"
  node_modules/.bin/eslint --suppressions-location "$ETAT/vide.json" -f json . > "$ETAT/lint.json"
  node -e 'const r=require(process.argv[1]);for(const f of r)for(const m of f.messages)if(m.ruleId==="no-unused-vars")console.log(f.filePath+":"+m.line+" "+m.message)' "$PWD/$ETAT/lint.json"
  ```
  Au début de la session, `$ETAT/lint.json` est copié en `$ETAT/lint-avant.json`. La liste relevée
  alors est recopiée dans le journal ; elle fait foi si elle diffère de celle des sources.
- Pour chaque infraction de cette liste, une seule de ces corrections :
  - retirer la déclaration, l'import ou le paramètre de fin de liste ;
  - retirer le nom d'une liaison de `catch` (`catch {`), en gardant le commentaire qui dit pourquoi
    l'erreur est ignorée ;
  - préfixer par `_` un paramètre qu'on ne peut pas retirer, parce qu'un paramètre suivant est lu ;
  - pour `app/main.cjs`, retirer `inspectorModel` de la déclaration, de la déstructuration de la
    ligne 307 et de l'affectation en chaîne de la ligne 373, sans retirer les autres noms ;
  - pour `core/deep-ask.cjs`, retirer le paramètre `mode` de `partial` et l'argument correspondant à
    ses appels dans ce fichier.
- Une expression de droite qui a un effet (appel, `await`, affectation) est gardée : seul le nom
  disparaît.
- `eslint-suppressions.json` : élagué par
  `node_modules/.bin/eslint --prune-suppressions <fichiers modifiés>`, jamais édité à la main.
- À ne pas toucher : `eslint.config.mjs`, le harnais, toute autre règle gelée, toute ligne sans
  rapport avec une infraction de la liste. Aucun test n'est retiré ni renommé ; aucune assertion ne
  change.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. La commande de mesure du périmètre ne liste plus aucune ligne.
2. `grep -c '"no-unused-vars"' eslint-suppressions.json` affiche `0`. Les autres compteurs du fichier
   sont égaux ou inférieurs à ceux du début de la session (commande du ticket qui installe ESLint,
   critère 4, sortie avant et après dans le journal).
3. Entre `$ETAT/lint-avant.json` et le `$ETAT/lint.json` de fin de session, le nombre d'infractions de chaque
   règle autre que `no-unused-vars` est le même (commande :
   `node -e 'const r=require(process.argv[1]),c={};for(const f of r)for(const m of f.messages)c[m.ruleId]=(c[m.ruleId]||0)+1;console.log(c)' <fichier>`,
   deux sorties dans le journal). Le journal nomme, pour chaque fichier modifié, la correction appliquée.
4. Pour chaque fichier de test modifié, `grep -c "^\s*test("` ne change pas.
5. `node --test --test-concurrency=1 tests/deep-ask-restore.test.cjs tests/chat-codex.test.cjs tests/codex-confinement.test.cjs`
   passe.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests existants, sans modification de leurs assertions : `tests/codex-confinement.test.cjs` pour
`openedPages`, `tests/deep-ask-restore.test.cjs` et `tests/chat-codex.test.cjs` pour `DeepAsk`, et la
suite complète par le contrôle unique. La règle `no-unused-vars`, désormais sans suppression, garde le
résultat.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une infraction ne se corrige pas sans changer un comportement (par
exemple une variable inutilisée qui révèle un oubli de lecture) : elle reste gelée, le journal la
nomme avec la raison, et les critères 1 et 2 l'admettent, elle seule. Si plus de trois infractions
sont dans ce cas : verdict BLOQUÉ.

## Journal
