---
id: T027
titre: Prove the full suite passes on a Prettier-formatted copy of the tree
statut: a-faire
bloque_par: T016, T017, T018, T019, T020, T021, T022, T024, T025, T026, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le commit de formatage ne doit casser aucun test. Plusieurs tests lisent le texte du code source, et
une mise en page différente peut les faire échouer. Le lot L02 en découple déjà la
plupart, mais sa liste repose sur un essai incomplet : sept modules `app/ui/*.mjs` n'avaient pas été
formatés.

Ce ticket formate une copie de l'arbre, hors de Git, avec la configuration retenue. Il prouve que le
formatage ne change aucun arbre syntaxique, puis lance toute la suite JS sur cette copie. Chaque test
qui échoue encore y est corrigé dans le dépôt, de sorte qu'il passe sur les deux arbres. Le ticket de
formatage n'a plus ensuite qu'à appliquer Prettier.

## Sources

- Constats : OPS-02, OUBLI-43
- Code concerné, à la version `0d5a954` (les numéros de ligne peuvent avoir bougé avec le lot L02) :
  - `tests/mac-ipc-contract.test.cjs`, test « every bridge call has its handler, every event its
    listener, and the host no longer purges, preempts or knows Auto » (ligne 86). Il lit le texte aux
    lignes 94, 107, 109, 116 et 117.
  - `tests/mac-ui.test.cjs` :
    - test « freshness of a question is shown from what the core measured… » (ligne 105), lecture
      ligne 138 ;
    - test « a saved history still being read is told as a restoration… » (ligne 275), lignes 335 à
      339 ;
    - test « search cards name the session they were searched in… » (ligne 615), lignes 645 à 656 ;
    - test « the renderer parses, imports only what its modules export, and finds every element it asks
      for » (ligne 664), qui lit `app/renderer.js`, `app/recording.js` et
      tous les `app/ui/*.js` et `app/ui/*.mjs` comme du texte (liste `rendererFiles`, ligne 661) ;
    - test « the renderer talks to the bridge of the contract only… » (ligne 685), lignes 688, 705,
      710 et 716.
  - Autres lectures de texte dont la tolérance a été vérifiée au découpage :
    - `tests/codex-confinement.test.cjs`, test de la ligne 457, ligne 481 : il attend des guillemets
      doubles, que les réglages par défaut gardent ;
    - `tests/architecture-f09.test.cjs`, fonction `reception()` (ligne 236), qui extrait une fonction
      de `app/renderer.js` ;
    - `tests/tv-app-compat.test.cjs` : la ligne 92 attend `route("…")` en guillemets doubles, que les
      réglages par défaut gardent ; la ligne 82 lit du CSS, que le lot ne formate pas ; le test de la
      ligne 48 compile chaque script de `tv/app` comme script classique.
- Mesures au découpage, avec Prettier 3.8.1 en réglages par défaut, sur une copie des fichiers suivis
  hors `media/`, `film/`, `promo/` et `screenshots/` :
  - `prettier --debug-check .`, lancé sur la copie non formatée, sort en 2 avec un seul message
    d'erreur : `core/video-tools.cjs: prettier(input) !== prettier(prettier(input))`. Ce fichier
    demande deux passes. Aucun message `ast(input) !== ast(prettier(input))`.
  - Une première passe de `--write` modifie 201 fichiers. Une seconde ne modifie que
    `core/video-tools.cjs`. Après elle, `prettier --check .` sort en 0.
  - Cliquet mesuré sur la copie formatée : `lignes_longues_prod` passe de 545 à 103,
    `lignes_longues_tests` de 1725 à 141 et `cas_de_test` de 617 à 618. Les autres mesures ne
    changent pas.
  - Par fichier, aucun des 214 fichiers ne gagne de ligne de plus de 160 caractères ni de `catch`
    vide : l'étape « règles par fichier » du contrôle, qui compare chaque fichier modifié à `HEAD`,
    restera verte au commit de formatage.
  - La suite n'a pas été lancée sur la copie au découpage.

### Méthode

Le dossier d'état du ticket est `.harness-state/tickets/$TVLENS_TICKET/`, hors Git, noté `$ETAT`.

```sh
ETAT=.harness-state/tickets/$TVLENS_TICKET; P="$PWD/node_modules/.bin/prettier"
rm -rf "$ETAT/fmt" && mkdir -p "$ETAT/fmt"
git ls-files -z | tr '\0' '\n' | grep -vE '^(media|film|promo|screenshots)/' | tr '\n' '\0' \
  | tar --null -T - -cf - | tar -xf - -C "$ETAT/fmt"
node -e 'const f=process.argv[1],fs=require("fs");
fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/^# >>> [^\n]*\n[\s\S]*?^# <<< [^\n]*\n/m,""))' "$ETAT/fmt/.prettierignore"
(cd "$ETAT/fmt" && "$P" --debug-check . > ../debug-check.txt 2>&1; echo "exit=$?")
(cd "$ETAT/fmt" && "$P" --list-different app/ui > ../app-ui-avant.txt)
(cd "$ETAT/fmt" && "$P" --write . > /dev/null && "$P" --write . && "$P" --check .)
(cd "$ETAT/fmt" && node --test --test-concurrency=1 tests/*.test.cjs > ../suite-copie.txt 2>&1; echo "exit=$?")
```

La copie se trouve sous le dépôt : les dépendances s'y résolvent en remontant jusqu'au
`node_modules` de la racine. `.gitignore` l'écarte de Prettier, et le cliquet l'ignore parce que son
chemin commence par un point. La suite n'est lancée qu'une fois sur le dépôt, par le contrôle complet
du critère 7.

Après chaque correction, le fichier corrigé est recopié dans la copie et formaté là par
`"$P" --write <fichier>`, puis son test est rejoué sur les deux arbres. Si un test échoue parce qu'un
fichier exclu de la copie lui manque, ce fichier est ajouté à la copie et le journal le dit. La copie
est supprimée en fin de session.

## Périmètre

- À modifier : seulement les fichiers de `tests/` dont un test échoue sur la copie formatée. Chaque
  correction rend l'assertion indépendante de la mise en page, par l'une de ces façons :
  - comparer un texte aux espaces normalisés ;
  - accepter les deux sortes de guillemets ;
  - appeler le module importable plutôt que lire son texte.
  Une correction doit passer à la fois sur le dépôt et sur la copie.
- Les aides partagées de lecture du source, s'il y en a, sont celles que le lot L02 a créées dans
  `tests/helpers/`. Ce ticket n'en crée pas d'autre.
- À ne pas toucher : le code de production, `.prettierrc.json`, `.prettierignore` du dépôt, le
  harnais. Le dépôt lui-même n'est pas formaté ici.
- Aucune assertion n'est retirée, aucune valeur attendue n'est changée, aucun test n'est renommé.
  Aucun délai n'est allongé et un test n'est jamais relancé jusqu'à ce qu'il passe.
- Les tests Python ne lisent aucun fichier JavaScript (vérifié au découpage par grep) : ils ne sont pas
  rejoués sur la copie.

## Critères d'acceptation

Chaque critère se vérifie par une commande, avec sa sortie dans le journal.

1. `$ETAT/debug-check.txt` ne contient aucune ligne `ast(input) !== ast(prettier(input))`. Ses seules
   lignes `[error] <fichier>: …` sont des messages d'idempotence
   (`prettier(input) !== prettier(prettier(input))`), et chacun de leurs fichiers est nommé dans le
   journal.
2. Sur la copie, après les deux passes de `--write`, `prettier --check .` sort en 0. Sur la copie non
   formatée, `$ETAT/app-ui-avant.txt` cite les sept modules `app/ui/*.mjs`.
3. Sur la copie formatée, `node --test --test-concurrency=1 tests/*.test.cjs` sort en 0 avec `ℹ fail 0`.
   Le nombre `ℹ tests` est égal à celui que rapporte le contrôle complet du critère 7 sur le dépôt.
4. Chaque test qui échouait sur la copie avant correction est nommé dans le journal avec la ligne
   fautive et sa cause. Après correction, il passe sur les deux arbres.
5. Pour chaque fichier de test modifié, `grep -c "^\s*test("` ne baisse pas.
6. Un `node --input-type=module -e` importe `measureText` de `scripts/quality/metrics.mjs` et compare,
   pour chaque fichier de `git ls-files '*.js' '*.cjs' '*.mjs'` (lancé à la racine) présent dans
   la copie, `lignes_longues` et `catch_vides` entre le dépôt et la copie formatée : il affiche `0 fichier en hausse`. Sinon, chaque fichier en hausse est
   nommé au journal et le verdict est BLOQUÉ.
7. `node scripts/check.mjs` est vert sur le dépôt ; le journal recopie ses lignes `ℹ tests` et `ℹ fail`.

## Test d'acceptation attendu

Les tests existants, rejoués sur une copie formatée de l'arbre. Frontière : les mêmes que celles des
tests eux-mêmes. Si un test est modifié, il garde sa frontière actuelle, ou passe par le module
importable quand celui-ci existe déjà (par exemple `ui()` dans `tests/mac-ui.test.cjs`, ligne 10).

## Hypothèses bloquantes

Aucune décision n'est attendue. Verdict BLOQUÉ, avec l'écart constaté, dans quatre cas :
- `debug-check.txt` contient une différence d'arbre syntaxique ;
- un fichier gagne une ligne de plus de 160 caractères ou un `catch` vide (critère 6) ;
- une correction exige de modifier le code de production ;
- `tests/tv-app-compat.test.cjs` échoue sur la copie pour une raison qui ne tient pas à la lecture du
  texte, ce qui voudrait dire qu'un fichier de `tv/app` change de comportement.

## Journal
