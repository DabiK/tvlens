---
id: T252
titre: Show the Codex quota cause on passage cards and details
statut: a-faire
bloque_par: T232
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les cartes et détails des passages sur Mac et TV affichent la cause de quota de la description
perdue : « Quota Codex épuisé, reprise le … » ou « Quota Codex épuisé. ». Les paroles utilisables,
les passages correctement décrits et les archives anciennes gardent leur rendu défini.

## Sources

- Coupe de T232, relecture A, constat 3 ; `docs/domaine.md`, sections Mémoire, 6 et 9.
  T232 livre code d'adaptateur, cause générique persistée fixée par son ADR et reprise bornée,
  dans la consultation, l'archive et `PassageLost`. Il implique T227 et toute la phase 1.
- Code vérifié à `1d8aa48` : `core/session-timeline.cjs:67` agrège les cartes, `:109` projette
  les passages du détail ; `runtime/state-views.cjs:45` allège les passages sans leur erreur.
  Les projections T219/T224 remplacent ces entrées : relire leurs API effectivement livrées.
- `app/renderer.js:181` affiche les passages ; `tv/app/timeline-view.js:244-257` rend les cartes
  avec des textes fixes et `:350-372` le détail, aujourd'hui limité aux paroles. Ajouter un
  champ aux seuls passages légers ne suffit donc pas pour la cause des cartes groupées.
- Filets : `tests/wire-contract.test.cjs:51`, `tests/mac-ui.test.cjs`, `tests/tv-panel.test.cjs`.
  `eslint-suppressions.json:606-619` gèle notamment `no-nested-ternary:5`, `complexity:3`
  et `max-lines-per-function:2` pour `tv/app/timeline-view.js`.

## Périmètre

- Étendre les projections de T219/T224, la frise et le détail issus de
  `core/session-timeline.cjs`, ainsi que les passages légers de `runtime/state-views.cjs`.
  Le code de cause et la reprise de T232 atteignent les cartes et détails sans nouveau format
  persisté ni traduction fournisseur supplémentaire. Garder les champs et statuts historiques.
- Une carte groupée garde bornes et statut ; sa cause ne s'applique qu'aux passages concernés,
  sans attribuer une perte à ceux qui ont été décrits. Les métadonnées restent bornées.
  Un ancien passage sans cause garde son repli actuel ; aucun champ existant de `/v1` ne disparaît.
- Adapter `app/renderer.js` et `tv/app/timeline-view.js`, avec des aides de libellés si utile.
  Le libellé est choisi par le code, la reprise insérée comme texte ; aucun diagnostic fournisseur
  brut, chemin, URL ou HTML reçu ne devient du contenu exécutable ou un message affiché.
- `tv/app/timeline-view.js` est gelé (`no-nested-ternary:5`, `complexity:3`,
  `max-lines-per-function:2`) : le libellé par code passe par une aide séparée, sans nouveau
  ternaire imbriqué dans la fonction des cartes. Élaguer toute suppression devenue inutile.
- Conserver la priorité des messages de stockage/sauvegarde, la sélection, le focus télécommande
  et la réouverture d'une archive. Aucun changement de chat, de file de questions, de capture,
  d'horloge ou de politique quota ; T232 a déjà livré la classification et les erreurs de chat.
- Étendre `wire-contract`, `mac-ui` et `tv-panel` par leurs frontières réelles, avec les champs
  ajoutés seulement. Ni accès à une TV ni installation ou fournisseur réel ne sont nécessaires.

## Critères d'acceptation

1. Un passage transcrit mais privé de description pour quota montre sur Mac et TV le libellé
   fixe et sa reprise quand elle existe, dans la carte et dans le détail. Les paroles restent
   accessibles ; sans reprise, aucune date n'est inventée. Un message contradictoire ne prime pas
   sur le code et aucun diagnostic hostile n'est affiché.
2. Une carte réunissant passages réussis et passages concernés garde ses bornes/statut et la
   cause des seuls passages perdus. Une autre cause, une réussite ultérieure ou une nouvelle
   session ne change pas l'identité de la perte. Les archives anciennes sans cause gardent leur repli.
3. La vraie projection publiée, son passage par HTTP et le vrai client T038 conservent les champs
   ajoutés, puis un 304 garde l'état. Réouvrir l'archive conserve cause et reprise sans réécrire
   ses fichiers ; les comportements et textes de repli d'un ancien client restent définis.
4. À l'implémentation, jouer en séquentiel les suites de projection/frise affectées,
   `wire-contract`, `mac-ui` et `tv-panel`, puis `node scripts/check.mjs`. Aucun test, plancher
   ou gel ESLint n'est augmenté ou affaibli.

## Test d'acceptation attendu

Dans `tests/mac-ui.test.cjs` et `tests/tv-panel.test.cjs`, injecter la vraie projection d'un
passage perdu pour la cause T232 et inspecter les nœuds rendus, avec/sans reprise et carte mixte.
`tests/wire-contract.test.cjs` exerce le vrai client contre le vrai serveur, champs puis 304 ;
les tests de projection vérifient que la cause arrive aussi sur les cartes, pas seulement le détail.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les noms de champs et la cause générique sont ceux de l'ADR et des interfaces livrés par T232 ;
ne pas persister ici un code fournisseur ni supposer une nouvelle forme de quota. La TV ne
montrait pas cette cause sur ses cartes à `1d8aa48` : c'est le comportement nouveau de ce lot.

## Journal
