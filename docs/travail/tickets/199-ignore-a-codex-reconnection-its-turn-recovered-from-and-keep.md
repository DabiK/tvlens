---
id: T199
titre: Ignore a Codex reconnection its turn recovered from, and keep every out-of-scope finding of a correction review
statut: a-faire
bloque_par: T178
adr: non
installe: non
harnais: oui
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une reconnexion suivie d'un tour Codex terminé laisse la tentative aller en relecture. Les vrais échecs
continuent de la refuser. Une relecture de correction acceptée transmet tous ses constats hors périmètre,
avec leur texte complet et la référence du rapport, au journal et au compte des réserves de l'intégration.

## Sources

- Décision du propriétaire, le 16/10 : corriger ces deux défauts du harnais avant la vague 1.
  `docs/audit-architecture.md`, rapport A, C, ligne « Bruit d'extraction » : neuf clôtures concernées.
- Code vérifié à `8340014`, modules et bancs lus en entier :
  - `scripts/loop/codex.mjs:89` consomme le flux ; à `:99`, `turn.completed` compte le tour, mais
    `:103` met indistinctement `turn.failed` et `error` dans `state.problem`. Rien n'efface ce problème
    après un tour terminé. `:119` archive le flux ; `:112` et `:126` refusent aussi délais et échecs de processus ;
  - `scripts/loop/codex.mjs:247` exige un repère dans le titre d'un constat ; `:254` découpe les blocs,
    `:282` extrait les réserves et remplace les constats par un diagnostic quand le compte diffère ;
  - `scripts/loop/codex.mjs:295` orchestre la session et ses corrections ;
    `scripts/loop/run.mjs:405` réunit les réserves, les écrit au journal, au commit et à l'événement ;
  - `tests/helpers/codex-session.cjs:93` construit les événements du faux Codex ; `:109` ajoute
    actuellement l'échec après le tour terminé. `tests/ticket-loop.test.cjs:2422` protège ce refus ;
  - `tests/ticket-loop.test.cjs:1745` prouve la transmission des réserves de la dernière relecture ;
    `:1790` protège le repli sur discordance, `:1837` les blocs structurés. Le banc de hooks est
    `tests/agent-guards.test.cjs`, avec le dépôt isolé de `tests/helpers/harness-repo.cjs:11`.
- Traces réelles lues en lecture seule dans `/Users/Dabi/Documents/ISN/tvlens/.harness-state/tickets/` :
  `T179/codex-1.jsonl` contient une reconnexion à la ligne 89 puis `turn.completed` à la ligne 152 ;
  `T179/echec-1.txt` ne donne que cette reconnexion comme refus. Ce sont des traces historiques.
- Rapports réels lus dans ce même dossier, exemples de syntaxe et non preuves du produit actuel :
  `T032/relecture-2.md`, `T147/relecture-2.md`, `T148/relecture-2.md`, `T168/relecture-3.md`,
  `T173/relecture-2.md`, `T174/relecture-2.md`, `T177/relecture-2.md`, `T181/relecture-2.md`,
  `T182/relecture-2.md`. Ils annoncent respectivement 2, 2, 2, 2, 1, 1, 1, 1 et 4 hors périmètre.
  Exemples : le titre en gras de T147, la section « Réserves hors périmètre », le titre sans repère
  de T181 suivi d'une ligne « Où », les puces et la section de réserves de T182.
- `.agents/skills/ticket-codex/SKILL.md:55` et `:88` demandent encore de recopier les constats
  hors périmètre dans `reste`, alors que la boucle les extrait déjà du rapport accepté.
- ADR 0012 : session, témoin de hooks, flux cumulé et relecteur séparé restent les garanties du moteur.

## Périmètre

- Modifier `scripts/loop/codex.mjs`, `tests/ticket-loop.test.cjs`, `tests/helpers/codex-session.cjs`
  les éventuelles fixtures de rapports sous `tests/helpers/` et `.agents/skills/ticket-codex/SKILL.md`. Relire les tests de hooks sans
  déplacer leur responsabilité dans le produit. `harnais: oui` se limite à ce traitement du flux
  à cette extraction et à la consigne de `reste` ; aucun contrôle de qualité ou de permissions n'est ouvert.
- Distinguer une erreur de flux suivie d'un tour terminé d'un échec définitif. La décision repose
  sur les événements de cette invocation, pas sur la présence du mot « Reconnecting » dans un message.
  Un problème de processus, de délai, de témoin ou un `turn.failed` reste un refus.
  Chaque reconnexion récupérée émet un événement `reconnexion` et une ligne `[boucle]` identifiant
  ticket, tentative et invocation ; le flux JSONL original reste conservé.
- Étendre le découpage aux formes des rapports réels, repère éventuellement placé dans le corps,
  titre numéroté en gras, puce, section dédiée aux réserves. Conserver les paragraphes et champs
  d'un constat ; ne pas compter ses rappels dans une synthèse, un tableau de suivi ou les critères.
- La skill Codex ne fait garder dans `reste` que ses propres réserves, sans recopier les constats
  hors périmètre du relecteur, que la boucle extrait déjà. La skill ne modifie pas les rapports du relecteur ; le texte d'une
  skill ne se teste pas (`docs/standards.md`), sa règle se vérifie par le scénario de boucle et par une
  commande consignée au journal.
- Conserver le diagnostic de repli quand le rapport reste réellement discordant. Les fixtures sont
  autonomes : les tests ne lisent jamais le dossier d'état du dépôt principal. Les extraits gardent
  leur structure réelle ; leur provenance est consignée dans le journal de ce ticket.
- Ne modifier ni rapports réels, ni clôtures passées, ni règles de verdict, ni nombre de corrections,
  ni contrats du produit. Ce ticket ne répare pas les réserves historiques dans les autres tickets.

## Critères d'acceptation

1. Par `run.mjs --engine codex` dans le dépôt temporaire du banc, le faux Codex produit `turn.started`,
   une ou plusieurs erreurs de reconnexion, puis `turn.completed`, avec témoin valide, verdict TERMINÉ
   et sortie 0. La première tentative est relue et intégrée ; le flux conserve les erreurs, le tour
   et ses jetons sont comptés. L'événement `reconnexion` et la ligne `[boucle]` sont observés par
   le banc, avec ticket/tentative/invocation. Même preuve sur une correction reprise.
2. Un `turn.failed`, une erreur sans tour terminé après elle, une sortie non nulle et un témoin invalide
   refusent toujours la tentative sans intégration. Tester aussi une erreur après un tour déjà terminé
   et un `turn.failed` suivi d'un `turn.completed` : aucun succès ultérieur ne gomme cet échec explicite.
   Une reconnexion récupérée d'une invocation ne couvre pas l'échec de la suivante.
3. Chaque forme réelle citée a un cas construit sur un extrait, au minimum titre en gras, puce et
   section de réserves avec repère dans le corps. Les neuf rapports conservés en fixtures donnent
   leurs comptes annoncés, sans « Nombre de constats discordant ». Les titres sans `chemin:ligne`
   ne disparaissent pas. Les rappels d'un même constat ne créent pas une réserve supplémentaire.
4. Après une première relecture refusée puis une correction acceptée, chaque constat complet de cette
   dernière est dans le journal committé et dans `integre.reserves`, avec `relecture-2.md` ; le commit
   annonce le même nombre. Aucun ancien constat corrigé, résumé ou critère n'est ajouté. Les écarts
   acceptés et les réserves propres à Codex restent conservés. La skill ne fait pas recopier les
   réserves du relecteur dans `reste` : chacune apparaît une seule fois dans le journal,
   `integre.reserves` et le compte `Reserves: N`, en plus des seules réserves propres à Codex.
   La consigne de la skill se vérifie au journal par `rg -n "reste" .agents/skills/ticket-codex/SKILL.md`,
   sortie citée, en plus de ce scénario.
5. Les cas de discordance véritable gardent le repli référencé et les écarts acceptés. Les assertions
   existantes sur les refus de session, la fraîcheur des témoins et l'indépendance du relecteur restent
   actives ; aucun test ne compare le texte du parseur ou du moteur.
6. À l'implémentation, `node --test --test-concurrency=1 tests/ticket-loop.test.cjs tests/agent-guards.test.cjs`,
   puis `node scripts/check.mjs`, sont verts. Aucun fournisseur réel n'est appelé.

## Test d'acceptation attendu

Le banc de `tests/ticket-loop.test.cjs` lance la vraie boucle avec le faux Codex de
`tests/helpers/codex-session.cjs` et le faux relecteur. Il observe les tentatives, les appels de
relecture, le journal intégré, le message du commit et les événements. Les fixtures issues des
rapports réels prouvent l'extraction par ce même parcours, sans test limité à une regex exportée.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La fréquence réelle des reconnexions n'est pas mesurée. L'incident historique et la disposition du
code sont établis ; les nouveaux scénarios restent à exécuter pendant le traitement du ticket.
Les intitulés exacts « Hors périmètre (réserve) » et les puces parenthésées du plan ne sont pas tous
retrouvés tels quels dans les neuf rapports : couvrir les formes effectivement relevées, puis ces
variantes comme cas complémentaires, sans les présenter comme des extraits observés.

## Journal
