# 0014 — ESLint gèle les infractions existantes par fichier et par règle

- Date : 2026-10-15
- Ticket : `docs/travail/tickets/031-lint-with-eslint-in-the-quality-check-and-freeze-the.md`
- Statut : acceptée

## Contexte

`scripts/check.mjs` sait lancer ESLint, mais l'outil était absent et l'étape lint non lancée.
Les standards fixent déjà des seuils de 400 lignes par fichier, 80 lignes par fonction et une
complexité maximale de 15, ainsi que l'interdiction des ternaires imbriqués.
La mesure sur cet arbre avec ESLint 9.39.5 relève 405 infractions dans 95 fichiers.
Les corriger ensemble élargirait l'activation du contrôle à une réécriture du produit et des tests.

## Décision

ESLint 9.39.5, `@eslint/js` 9.39.5 et `globals` 14.0.0 sont des dépendances de développement en
versions exactes. `eslint.config.mjs` active la configuration recommandée, `noInlineConfig`, et les
seules règles supplémentaires listées par le ticket : `complexity`, `max-lines`,
`max-lines-per-function`, `no-nested-ternary`, `eqeqeq` (avec `null` ignoré) et `no-console`.
`no-unused-vars` ignore les noms préfixés par `_` et les frères d'une propriété rest.
Aucune règle de style supplémentaire ni `eslint-config-prettier` n'est ajoutée.

Les fichiers CommonJS et les modules utilisent ECMAScript 2024. Les globales Node s'appliquent hors
de `app/ui/**`, `app/*.js` et `tv/app/**/*.js`, exclus du bloc Node commun. Les vues Mac
reçoivent les globales navigateur ; les scripts TV conservent `sourceType: "script"`, ECMAScript 2022,
les globales navigateur et `module` en lecture. Leurs fonctions globales voulues sont exemptées de
`no-unused-vars` par `vars: "local"`. Les scripts disposent des globales Node et navigateur.
Les deux points d'entrée des hôtes et les scripts sont exemptés de `no-console` ; les tests sont
exemptés de `max-lines` et `max-lines-per-function`, sans exemption de complexité.
Les lignes vides et les commentaires ne comptent pas dans les seuils de longueur.
Les trois appels conditionnels à `require` des vues TV sont gelés en `no-undef` ; `require` n'est
pas une globale déclarée pour le navigateur.

Le gel par suppressions est retenu : il active les erreurs tout en isolant le stock existant.
`eslint --suppress-all .` établit le stock initial dans `eslint-suppressions.json`, par fichier et par
règle. Ce fichier est exclu de Prettier. `npm run lint` lance `eslint .` et le contrôle unique active
son étape lint sans modification de `scripts/check.mjs`. Le produit et les tests restent inchangés.
Les sous-projets `film/` et `promo/`, les données, les essais, les prototypes, les fixtures et la
documentation sont ignorés. Le harnais (`.claude/`, `.codex/`, `.agents/`, `scripts/check.mjs`,
`scripts/quality/` et `scripts/loop/`) n'est ni formaté ni analysé pour l'instant.

## Alternatives écartées

- Tout corriger avant d'activer : retarde le contrôle et mélange son installation à de nombreux
  changements de comportement potentiels.
- Avertissements seulement : ne fait pas échouer le contrôle quand une nouvelle infraction apparaît.

## Conséquences

Une infraction nouvelle fait échouer ESLint. Une suppression devenue inutile échoue aussi jusqu'à
son élagage par `eslint --prune-suppressions <fichier>`. Le ticket qui corrige l'infraction élague sa
suppression, même si le fichier de gel n'était pas dans son périmètre. Aucune suppression ne s'ajoute
pour obtenir un contrôle vert.

Un déplacement de code gelé vers un nouveau fichier crée une infraction nouvelle : le ticket de
déplacement corrige les infractions du code déplacé. T032 empêchera l'augmentation du gel, y compris
lors d'un déplacement ; ESLint seul n'interdit pas de régénérer le fichier de suppressions.
Les règles de couches restent dans `tests/architecture.test.cjs`, conformément à l'arbitrage A3.
Les exemptions et les dossiers ignorés pourront être revus par un ticket autorisé à toucher au harnais.

## Protégée par

`node scripts/check.mjs` et `npm run lint` vérifient les nouvelles infractions et les suppressions
inutiles. Le journal du ticket contient les versions, la mesure initiale, les configurations résolues,
les refus de fautes injectées avec et sans commentaire de désactivation, et l'élagage d'une
suppression réellement devenue inutile sur une copie temporaire. Aucun test nouveau n'est ajouté.
