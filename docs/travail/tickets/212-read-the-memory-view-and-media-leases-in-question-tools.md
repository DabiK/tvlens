---
id: T212
titre: Read the memory consultation view and leased media in question tools
statut: a-faire
bloque_par: T207
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Les outils d'une question lisent `MemoryView` et ses ports de médias, sans atteindre les structures
internes de la session. Leur ancrage, leur préfixe consultable et leurs preuves gardent leurs garanties.

## Sources

- Cible : `docs/domaine.md`, sections 3 (Mémoire et Questions), 6, 9 et 11 ; ADR 0029/0030.
  L'ADR 0004 impose de retenir outils et baux jusqu'au retour réel de l'agent et des appels en vol.
- Code vérifié à `dd5efc9` : `core/video-tools.cjs:17` construit les outils ;
  `core/video-tools.cjs:19` fige session, ancrage et passages ; `core/video-tools.cjs:29` ne rafraîchit
  que les mêmes identifiants et bornes, dans la même session.
- `core/video-tools.cjs:85` porte la libération différée ; `core/video-tools.cjs:142` rafraîchit
  les transcriptions ; `core/video-tools.cjs:157-158` contrôle les médias de l'inspection et `:162` prend le bail. Un clip `unreadable` peut encore être réexaminé sur ses images conservées.
- `runtime/conversation-runtime.cjs:41` choisit le snapshot figé de portée ou celui de la session ;
  `runtime/conversation-runtime.cjs:49` lie la relecture en direct à cette seule session.
  `adapters/local-store.cjs:105` accorde les baux seulement sur une paire média complète.
- `core/viewing-actions.cjs:32-40` fabrique la portée conservée du réexamen ; `:9-29` lit
  identité, horloge et `capturedThroughMs` pour `freeze`, `resolve` et `mark`. Appelants :
  `app/moment-actions.cjs:9-11`, `:60-61`, `:66` et `app/main.cjs:514`.
  `tests/viewing-actions.test.cjs` protège ces actions.
- Appelants lus : `core/deep-ask.cjs`, `app/moment-actions.cjs`, `app/main.cjs`,
  `runtime/headless-runtime.cjs`, `server/question-routes.cjs`.
  Tests lus : video-research, evidence-refresh, reinspection-transcript-reuse, clip-unreadable,
  question-freshness et moment-actions sous `tests/`, suffixe `.test.cjs`.
- État attendu : T207 a fixé les champs de consultation, révisions, disponibilité, modalités,
  couverture et ports média avec baux ; T194 a retiré l'ancien chemin de réponse, sans effacer
  les questions historiques. Relire le contrat T207 et ses tests avant d'adapter les outils.

## Périmètre

- Modifier `core/video-tools.cjs`, `runtime/conversation-runtime.cjs` et les producteurs de portée
  réellement utilisés par les questions et actions de moment. Remplacer l'entrée et le fournisseur
  de snapshot par les accès de consultation ; faire passer les lectures et baux par les ports T207,
  au lieu de donner le store complet à `VideoTools`.
- Le réexamen transmet sa portée conservée sous la nouvelle entrée des outils ; `freeze`,
  `resolve` et `mark` lisent identité, horloge et `capturedThroughMs` par la vue. La recherche Mac
  (`app/moment-actions.cjs:46-48`) est hors de ce ticket. Adapter aussi `core/viewing-actions.cjs`
  et `tests/viewing-actions.test.cjs`.
- Établir dans le journal la correspondance entre les champs lus et le contrat T207 : identité,
  ancrage, début de portée, identifiants et bornes figés, révisions, modalités, disponibilité et
  raisons, trous, texte et statuts audio/vision. Aucun champ interne ne sert de repli caché.
- Conserver l'ancrage de chaque question à sa soumission, même si elle attend dans la file.
  Aux frontières de consultation existantes, rafraîchir uniquement les passages de son préfixe,
  sans en ajouter ni en déplacer. Journaliser les révisions effectivement lues et conserver la
  distinction entre contexte de départ, mémoire consultée et preuve de réexamen.
- Garder les bornes d'outils, la validation des citations, l'ordre des refus, les contrôles de
  session et l'annulation. Une disponibilité absente ou expirée reste explicite ; `unreadable`
  ne signifie pas absence des images ou du son conservés.
- Garder `DeepAsk` propriétaire de `release`. Annulation ou plafond visibles ne rendent pas les
  baux d'un appel en vol ; les actions de moment conservent leur intervalle pour le réexamen.
  Les contextes MCP externes gardent leur propriétaire et ne sont pas libérés par la file.
- Pas de déplacement de ces modules, de changement de fil, de nom persisté ou de recherche.
  Élaguer toute suppression ESLint rendue inutile. Aucun import du domaine Mémoire dans le
  domaine Questions : l'application injecte la vue et les ports publiés.

## Critères d'acceptation

1. Une question soumise puis mise en attente conserve son ancrage et ses identifiants consultables
   malgré de nouveaux passages. Un changement de session, de bornes ou une révision étrangère
   n'élargit pas sa portée et ne fournit aucune preuve supplémentaire.
2. Une transcription puis un visuel tardif du même passage sont visibles aux mêmes frontières de
   consultation qu'avant ; le journal et les citations reflètent les révisions réellement lues.
   Texte manquant, analyse partielle et trous gardent leurs avertissements.
3. Une inspection prend le bail des seuls médias admis, le garde pendant tout son appel et le rend
   en succès comme en erreur. Un média absent ou expiré est refusé ; un clip illisible dont les
   images sont présentes garde son chemin de réexamen et son libellé distinct.
4. Avec agent et outil retenus séparément, annulation et plafond règlent la question visible mais
   ne libèrent pas son contexte avant les retours réels. Une question annulée en attente le rend
   immédiatement. Après libération, aucun appel ne lit de média ni ne produit de preuve nouvelle.
5. Les actions de moment peuvent relire leur intervalle conservé ; les questions ordinaires finies
   ne gardent pas leur préfixe complet. Les preuves, réponses et mesures restent disponibles.
6. Les lecteurs de question et actions migrés ici ne reconstruisent pas leur vue en lisant `watch.segments`, `watch.history` ou
   `watch.snapshot()`. À l'implémentation, jouer en séquentiel les suites citées et les tests de
   l'ADR 0004 (`tests/architecture-f04.test.cjs`), puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Étendre `tests/evidence-refresh.test.cjs` avec la vraie composition de conversation et la vue T207,
en faisant échouer tout accès à l'ancien snapshot dans ce banc. Les outils sont invoqués par leur
frontière publique. Compléter `tests/video-research.test.cjs` pour les baux et conserver les preuves
de l'ADR 0004 avec promesses différées, sans horloge murale, Electron ni fournisseur réel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La forme exacte des ports est celle livrée par T207, encore absente au commit vérifié. Si une
information établie ci-dessus manque au contrat, nommer le manque et étendre explicitement son
test de contrat ; ne pas importer la racine ou les structures privées pour contourner ce manque.

## Journal
