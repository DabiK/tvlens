---
id: T114
titre: Make CONTRIBUTING the entry page that points to the rules and the one check
statut: a-faire
bloque_par: T100, T101, T103, T106, T109, T110
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`CONTRIBUTING.md`, la page qu'un contributeur humain ouvre en premier, a 31 lignes.
- Ses frontières ignorent `runtime/`, `server/`, `mcp/` et `tv/`, alors que `CLAUDE.md` les nomme.
- Il prescrit `npm test` comme vérification, comme `README.md`. La commande de référence est pourtant
  `node scripts/check.mjs` : tests en séquentiel, tests Python, règles et cliquet.
- Il ne renvoie ni aux règles (`docs/standards.md`), ni aux gabarits de ticket et d'ADR, ni à la skill
  `ticket` qui porte la définition de terminé.

Après ce ticket, `CONTRIBUTING.md` est la page d'entrée humaine. On y trouve une carte des dossiers, la
commande de contrôle et l'endroit où vit chaque règle et chaque document de travail. Elle renvoie aux
règles sans les recopier. `README.md` donne la même commande de contrôle.

## Sources

- Constats : DOC-01, OUBLI-20
- Documents, à la version `0d5a954` :
  - `CONTRIBUTING.md` :
    - « Frontières à conserver » (lignes 5-13) : `core/`, `adapters/`, `app/main.cjs`, `app/renderer.js`,
      `app/ui/`, `scripts/`, `tests/` ;
    - « Vérifier une modification » (lignes 15-21) : `npm ci`, `npm test`, `npm run test:electron` ;
    - ligne 25 : commandes `*:live` ;
    - « Documents et médias » (lignes 27-31).
  - `README.md`, section « Ce qui est prouvé, ce qui reste à mesurer », bloc de code (lignes 175-180) :
    `npm test`, `npm run test:electron`, `node scripts/smoke-lg-ui.mjs`,
    `node scripts/smoke-tv-timeline.mjs`.
  - `package.json`, scripts : `test` (ligne 11, `node --test tests/*.test.cjs`, fichiers en parallèle, sans
    Python) et `check` (ligne 28, `node scripts/check.mjs`).
  - `CLAUDE.md`, sections « Frontières » et « Contrôler » ; `docs/standards.md` ; gabarits
    `docs/travail/tickets/_gabarit.md` et `docs/adr/0000-gabarit.md` ; skill `.claude/skills/ticket/SKILL.md`.
  - Dossiers suivis de premier niveau (`git ls-files | grep / | cut -d/ -f1 | sort -u`) : `adapters`, `app`, `core`,
    `deploy`, `design`, `docs`, `film`, `media`, `mcp`, `promo`, `prototypes`, `runtime`, `screenshots`,
    `scripts`, `server`, `tests`, `tv`, plus `.claude`.
- Ce que le relecteur de DOC-01 écarte et que ce ticket ne fait pas :
  - pas de pied de commit « Refs: » : la boucle committe `ID: titre` ;
  - pas de limite de 72 caractères ;
  - pas de second gabarit d'ADR ;
  - pas de nouvelle règle dans `docs/standards.md` ou `CLAUDE.md`, qui sont protégés.

## Périmètre

- `CONTRIBUTING.md` est réécrit, en français, en cinq sections :
  1. Carte des dossiers : une ligne par dossier suivi de premier niveau, avec ce qu'il contient et ce
     qu'il peut importer. Le sens des dépendances reprend `CLAUDE.md`, section « Frontières », sans règle
     nouvelle.
  2. Contrôler : `node scripts/check.mjs` (ou `npm run check`) comme commande de référence, et
     `--changed` pour les fichiers modifiés. Une phrase dit ce qu'elle lance, d'après `scripts/check.mjs`.
     Les commandes ajoutées par les lots L01 et L09 (`npm test`, parcours Electron, sondes, scripts `:live`)
     restent, chacune avec son rôle, sans en changer la lettre.
  3. Où vivent les règles : liens vers `docs/standards.md`, `CLAUDE.md` (règle de langue, interdits), la
     skill `ticket`, les gabarits de ticket et d'ADR, `docs/adr/`, `docs/travail/dettes.md` et
     `docs/decisions-produit.md`.
  4. Documents : la référence, les rapports datés et les archives, avec un renvoi à `docs/README.md`.
  5. Ce qui ne se publie pas : le paragraphe actuel sur `.env.local`, les clés et les médias, gardé.
- `README.md`, bloc de code de la section « Ce qui est prouvé » : `node scripts/check.mjs` y vient en
  premier ; les parcours Electron et les deux scripts de fumée restent.
- À ne pas toucher : `docs/standards.md`, `CLAUDE.md`, `.claude/`, `package.json`, le code.
  `CONTRIBUTING.md` ne recopie aucune règle de `docs/standards.md` : il y renvoie.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Chaque dossier suivi de premier niveau est nommé dans `CONTRIBUTING.md`, entre accents graves et
   suivi d'une barre oblique. La commande suivante ne renvoie rien :

   ```sh
   for d in $(git ls-files | grep / | cut -d/ -f1 | sort -u); do
     grep -qF "\`$d/\`" CONTRIBUTING.md || echo "manque $d"
   done
   ```
2. `grep -c "node scripts/check.mjs" CONTRIBUTING.md README.md` vaut au moins 1 pour chacun des deux.
3. Les sept renvois existent. La commande suivante ne renvoie rien :

   ```sh
   for l in docs/standards.md CLAUDE.md .claude/skills/ticket/SKILL.md docs/travail/tickets/_gabarit.md \
            docs/adr/0000-gabarit.md docs/travail/dettes.md docs/decisions-produit.md; do
     grep -qF "]($l)" CONTRIBUTING.md || echo "manque $l"
   done
   ```
4. `grep -nE "Refs:|72 caract" CONTRIBUTING.md` ne renvoie rien.
5. Aucune règle recopiée : aucune ligne de `docs/standards.md` de plus de 40 caractères ne se retrouve à
   l'identique dans `CONTRIBUTING.md`. Commande à consigner dans le journal :
   `grep -Fxf <(awk 'length>40' docs/standards.md) CONTRIBUTING.md` ne renvoie rien.
6. `node --test tests/documentation-links.test.cjs` et `node --test tests/documentation-index.test.cjs`
   passent. Le premier vérifie les commandes `npm run` et `node <chemin>` citées.
7. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. `tests/documentation-links.test.cjs` vérifie les liens et les commandes de la page,
`tests/documentation-index.test.cjs` l'absence de décompte de tests et de nom de branche. Les critères 1 à
5 se vérifient par commande.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le ticket passe après les lots L01 et L09, qui modifient les mêmes
sections de `CONTRIBUTING.md` (version de Node, tests Python, lanceur, sondes, suffixe `:live`). Il reprend
leur texte tel qu'il est à ce moment-là.

## Journal
