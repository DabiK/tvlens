---
id: T258
titre: Score replay results against frozen human annotations
statut: termine
bloque_par: T257, T262, T273
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une commande entièrement hors ligne agrège la revue humaine des résultats du rejeu, avec erreurs
sémantiques et abstentions examinées cas par cas. G2 dispose d'un format d'annotation et d'une
comparaison traçable. Tranche D d'Astra : une session Codex, un commit, 1–2 h après T257.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, D, « Score replay results against frozen human annotations »,
  base `beb9589` ; décision du propriétaire du 17/10 sur corpus français et préparation par l'orchestrateur.
- `docs/action-evaluation-rubric.md`, relu en entier à `16be86b` : critères d'action, absence
  d'invention et références ; revue explicite liée au rapport exact, jamais un score par mots-clés.
  La tolérance historique de 500 ms appartient seulement à l'ancien corpus à 10 fps.
- `docs/PRD-V2.md`, sections 4 et 5 : causalité, provenance, suffisance des observations,
  ordre et citation séparés ; tailles de corpus et seuils exploratoires ne sont pas des engagements.
- `adapters/codex-perception.cjs:140` borne les images reçues et `:179` valide la structure,
  sans vérifier la vérité sémantique. La sélection réellement envoyée sera consignée par T257.
  ADR 0016 : l'ancien banc temporel a été retiré, sans remplacement ni équivalence revendiquée.

## Périmètre

- À créer : `scripts/score-perception-replay.cjs`, `tests/perception-replay-scoring.test.cjs`,
  schéma documenté et exemple de grille sans données réelles, près de ces outils sous `scripts/`.
  Réutiliser les identités et résultats de T257, sans nouvelle inférence ni réécriture de ses sorties.
- Distinguer annotations attendues figées avant inférence et revue humaine d'une sortie précise.
  Lier corpus, annotations, rapport exact et identité d'exécution par empreintes ; une revue ne
  s'applique pas automatiquement à une autre exécution, même sur les mêmes cas.
- Prévoir pour chaque cas exactitude juste/partielle/fausse, invention, ordre, suffisance des
  images/paroles reçues, abstention justifiée/injustifiée et références quand elles existent.
  Identifier les violations de causalité et de provenance et chaque régression face à la référence.
  Conserver justification humaine, absence de revue et dimensions non applicables explicitement.
- Produire totaux, dénominateurs et écarts individuels entre deux exécutions revues séparément.
  Les contrôles automatiques d'identité et d'intervalle ne valent pas jugement de vérité.
- À ne pas toucher : modèle, prompt, sélection, capture, Mémoire, ancien générateur ou anciens
  adaptateurs retirés. Aucun juge par modèle, score sémantique par mots-clés ou seuil produit nouveau.
- Aucun essai réel dans la session Codex : modèle local, TV, VPS et fournisseurs restent à
  l'orchestrateur ou au propriétaire. La notation s'exécute sans accès réseau ni modèle.

## Critères d'acceptation

1. Une revue valide désigne les empreintes exactes du corpus, des annotations et du rapport T257.
   Une revue dont l'empreinte d'annotations diffère de celle du rejeu est refusée ; l'absence
   d'empreinte acquise avant inférence est aussi un refus, jamais une invitation à la compléter après coup.
   Modifier une entrée, un résultat ou l'identité d'exécution invalide sa réutilisation ; une revue
   périmée est refusée explicitement et ne fournit aucun score accepté.
2. Des fixtures couvrent juste, partiel, faux, invention avec action correcte, ordre erroné,
   abstention justifiée/injustifiée et cas non revu. Ce dernier reste « non évalué » ; il ne
   rejoint jamais les réussites. Une action correcte accompagnée d'une invention n'est pas réussie.
   Les dénominateurs de chaque dimension sont explicités.
3. Les rapports séparent preuve absente des images reçues et preuve présente mais mal décrite,
   en s'appuyant sur la revue humaine. Un intervalle valide ne rend pas vraie une observation ;
   un mot-clé présent ne rend pas correcte une trajectoire fausse.
4. Une comparaison de deux exécutions, avec leurs propres revues, donne les totaux et les écarts
   attendus sur un jeu maîtrisé, y compris couverture de revue différente. Les cas non appariés
   et dimensions non applicables sont visibles, sans succès implicite ni moyenne trompeuse.
   Les régressions de causalité/provenance sont identifiées cas par cas, sans être masquées par un total.
5. Aide, validation de grille et notation complète s'exécutent hors ligne ; les tests de CLI
   prouvent l'absence d'appel fournisseur. À l'implémentation future, jouer
   `node --test tests/perception-replay-scoring.test.cjs`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/perception-replay-scoring.test.cjs` par l'API publique et la CLI du scoreur, avec
rapports et revues temporaires. Vérifier les résultats exportés, les refus d'empreinte, les
dénominateurs et la comparaison de deux exécutions ; aucun test ne lit le texte du source.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le propriétaire constitue une dizaine d'extraits français réels pour G2 ; l'orchestrateur prépare
le format et la grille à partir de T257 et de ce ticket, puis organise annotations et revue humaine.
Le logiciel est vérifiable avant cette livraison humaine ; un corpus absent ou non revu interdit
seulement de déclarer G2 réussi. Les annotations attendues restent hors des requêtes de perception.

Décision du 17/10 : copie après T227, répétition Mac avant accès et `hackathon-rc` en repli ; T254
retient la phase 2. Ni 8/10 historique ni quelques extraits ne prédisent la qualité générale du
français ou des films. Les arbitrages produit après mesure restent au propriétaire, hors de ce ticket.

## Journal

- 18/10, propriétaire : ordre de la copie GX10 A : questions et recherche locales d'abord (T263, T264), puis T255,
  T265, T257, T262, T258, T267. Dépendance d'ordre ajoutée (`T262`), sans lien de code ; la retirer rend l'ordre par
  numéro.
- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T273.
- 18/10, Codex : exploration du rejeu, de ses identités, des tests et des ADR 0016/0031 terminée.
  Scoreur hors ligne prévu sur corpus revérifié, attendus figés et revue distincte liée aux octets du rapport.
  Exploration et découpage prévu consignés dans `.harness-state/tickets/T258/` ; aucun essai réel.
- 18/10, Codex : cycles rouge/vert par `node --test tests/perception-replay-scoring.test.cjs` observés :
  identités, intégrité du corpus/sélection, jugements humains et dénominateurs, comparaison, références/échecs,
  CLI et racines JSON invalides. Journaux `*-red.log` et `*-green.log` dans le dossier d'état.
  La fixture traverse le vrai runner et la vraie perception avec un agent Codex doublé ; aucun fournisseur réel.
- 18/10, Codex : scoreur et deux aides sous `scripts/`, schéma documenté et grille intégralement fictive livrés.
  Les 15 tests couvrent notamment revue périmée, empreinte absente avant inférence, invention avec action correcte,
  abstentions, preuves absentes/mal décrites, couverture différente, cas non appariés et violations individuelles.
  L'aide, la validation, la notation et la comparaison passent avec imports fournisseurs, réseau et processus interdits.
- 18/10, Codex : premier `node scripts/check.mjs --changed` vert (14 tests) ; contrôle après ajout de l'exemple :
  15 tests verts, format du rapport JSON fictif rouge. Format corrigé puis empreinte de revue recalculée ;
  aucune règle ni aucun test assoupli. Aucun essai réel et aucune conclusion de réussite G2.
- 18/10, Codex : `node --test tests/perception-replay-scoring.test.cjs` : 15 tests réussis, 0 échec (`acceptance.log`).
  `node scripts/check.mjs --changed` : vert, 15 tests réussis (`check-changed-corrected.log`).
  `node scripts/check.mjs` : vert, 151 fichiers JS, 2 793 tests réussis, aucun échec ; 47 tests Python réussis
  (`check-full.log`). Journaux conservés dans `.harness-state/tickets/T258/`.
- 18/10, Codex : `node scripts/score-perception-replay.cjs --help` : sortie 0. Les commandes d'exemple de
  `scripts/perception-replay-scoring.md`, avec et sans `--validate` : sorties 0 ; 3 cas fictifs, 1 revu, 2 non évalués.
  `git diff --check` : sortie 0. Verdict `TERMINÉ` remis à la boucle pour relecture ; aucun commit ni push.
- 18/10, Codex, reprise : relecture 1, ticket/journal, écarts, état et diff relus ; trois constats acceptés.
  Prévu : isoler les mutations d'empreintes dans le test, borner les images reçues de l'exemple à six,
  renommer les deux validations ambiguës. Aucun nouvel écart, fournisseur réel, commit ou push.
- 18/10, Codex, correction du constat 1 : `saveReport` conserve désormais le JSON indenté du runner.
  Le test vérifie une revue acceptée avant chaque mutation isolée et après restauration ; le `runId` de la revue
  est également altéré seul. `node --test --test-name-pattern='stale reviews reject'
  tests/perception-replay-scoring.test.cjs` : rouge sur le changement de formatage, puis vert après correction.
  Le retrait temporaire du garde commun fait échouer le refus attendu ; retirer séparément son contrôle
  `annotationsSha256` puis `manifestSha256` rend chaque fois le test rouge sur le champ concerné.
  Garde restauré et vert observé ; preuves `reprise-format-*`, `reprise-review-identity-mutation-red.log`,
  `reprise-mutation-*-red.log` et `reprise-identity-restored-green.log` dans le dossier d'état.
- 18/10, Codex, correction du constat 2 : le test de l'exemple vérifie les indices reçus 0 à 5 pour chaque cas,
  parmi huit candidats. `node --test --test-name-pattern='documented synthetic review'
  tests/perception-replay-scoring.test.cjs` : rouge (indices 6 et 7 en trop), puis vert après correction de
  `request.frames` et recalcul de `review.reportSha256` ; preuves `reprise-example-red.log` et `reprise-example-green.log`.
- 18/10, Codex, correction du constat 3 : `rows` devient `validateCaseRows`, `text` devient `isNonEmptyText`.
  `node --test tests/perception-replay-scoring.test.cjs` : 15 tests réussis, 0 échec (`reprise-acceptance.log`).
  `node scripts/check.mjs --changed` : vert, 15 tests réussis (`reprise-check-changed.log`).
  Aucun constat contesté ni critère assoupli ; les deux aides privées restent l'écart accepté en relecture.
- 18/10, Codex, fin de correction : `node scripts/check.mjs` : vert, 151 fichiers JS,
  2 793 tests réussis, aucun échec ; 47 tests Python réussis (`reprise-check-full.log`).
  `git diff --check` : sortie 0. Trois constats traités, aucune contestation ni réserve.
  Nouveau verdict `TERMINÉ` remis à la boucle pour relecture ; aucun essai réel, commit ou push.

### Réserves à la clôture

- .harness-state/tickets/T258/relecture-2.md : **Écart accepté, critère « Périmètre / À créer » : deux aides privées sous `scripts/`** (`perception-replay-scoring-input.cjs`, `perception-replay-scoring-cli.cjs`). Je maintiens la décision de la relecture 1. Ces aides servent uniquement le scoreur, reprennent le découpage du rejeu, ne modifient aucun module existant et ne retirent aucun critère.
