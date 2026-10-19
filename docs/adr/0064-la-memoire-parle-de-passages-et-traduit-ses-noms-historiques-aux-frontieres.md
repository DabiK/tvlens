# 0064 — La mémoire parle de passages et traduit ses noms historiques aux frontières

- Date : 2026-10-19
- Ticket : `docs/travail/tickets/226-speak-of-passages-inside-the-viewing-memory.md`
- Statut : acceptée ; complète l'ADR 0063

## Contexte

Après son déplacement (ADR 0063), `ViewingMemory` gardait ses listes sous leurs noms d'archive, en champs
publics `segments`, `history` et `sequence`. Les bancs (`scripts/bench-backend.cjs`, `scripts/bench-perceived.cjs`,
`scripts/simulate-stream.cjs`) et vingt et un fichiers de test (inventaire à `d26337d`) les lisaient ou les
écrivaient pour fabriquer leurs jeux.
Les deux hôtes y cherchaient la disponibilité d'un média (`server/session-routes.cjs:30`, `app/main.cjs:583` et
`:587`), et la racine se passait elle-même au contexte de perception (`core/memory/viewing-memory.cjs:128`).
Le glossaire (`docs/domaine.md`) nomme pourtant ces éléments des passages.

## Décision

- **Listes privées.** La racine garde ses passages dans trois champs privés sans accesseur :
  `#passages`, `#historicalPassages` et `#passageSequence`. Les voies, la vue, le résumé de sujet et les
  événements de passage nomment eux aussi leurs paramètres `passage`.
- **Ce qui ne bouge pas.** `CapturedSegment` reste le nom de l'entrée Capture. Le message de refus d'ordre
  et son code `TVLENS_CAPTURE_ORDER_INVALID` restent aussi.
- **Accès extérieurs.** Un appelant consulte la mémoire par :
  - `memoryView`, `memoryPassage` et `memoryPassages` ;
  - `recentMemoryPassages` ;
  - `snapshot()`, qui donne le modèle d'archive.

  Une fixture se fabrique par `restore`, puis `resume` si le scénario doit être actif. Personne n'affecte
  plus les listes ni la séquence.
- **Médias.** Les deux hôtes lisent la disponibilité d'un média par le port de session `memory.passage(id)`
  (`runtime/session-runtime.cjs`, qui délègue à `memoryPassage`). Côté Mac, ce sont
  la vignette et la relecture ; côté serveur, `/v1/media`, avec l'origine `retained` et la cause tirée de
  `availability.reason`.

Les données persistées et publiées gardent leurs noms historiques, conformément à l'ADR 0029. La
traduction est écrite à un endroit par frontière :

| Frontière | Traduction |
| --- | --- |
| `restore` et `snapshot()` de la racine | clés `segments` et `history` de `session.json` v1 ↔ listes internes (ADR 0047) |
| contexte de perception, module plat gelé | la racine lui passe `{ history, segments }` construit depuis ses listes, jamais elle-même |
| sources de la vue (`memory-view.cjs`) | `passages` et `historicalPassages` ; la vue publie `origin: 'retained' \| 'history'` et `coverage.retainedPassages` / `historyPassages` |
| projection applicative (`runtime/memory/memory-projection.cjs`) | `origin` vers les champs `segments` et `history` de `/v1/state` (ADR 0042) |
| convertisseurs d'archive (`core/memory/archive.cjs`) et `scripts/memory-fixture.cjs` | format d'archive inchangé |

Les identifiants `moment-N`, les URL `tvlens-media://`, la route `/v1/segments` et son champ de
transport `sequence`, les noms de fichiers, les outils et les canaux IPC ne changent pas.

## Alternatives écartées

- Renommer aussi les clés d'archive et de `/v1/state` : demanderait une migration du corpus et casserait les corps figés.
- Ouvrir à la garde une exception vers les listes privées pour les tests : laisserait les fixtures fabriquer des états
  que `restore` refuserait.
- Continuer à passer la racine au contexte de perception : il dépendrait de toute la forme interne au lieu des seuls
  passages qu'il lit.
- Fabriquer le témoin HTTP synthétique par `restore` : `restore` interrompt ses états en vol arbitraires, par exemple
  une analyse plus récente que la file.

## Conséquences

Un appelant ne peut plus créer d'état que `restore` refuserait. Le faux port HTTP de
`tests/helpers/state-view-scenario.cjs` garde des états en vol arbitraires en passant par les vraies fonctions de vue
et de projection. À la réouverture, `restore` complète chaque passage d'historique avec `mediaReason: 'expired'` :
les bancs qui fabriquent leurs jeux par `restore` comptent donc ce champ dans leurs octets en disposition
historique, avec les mêmes jeux et les mêmes tailles. Le contexte de perception reste un module plat qui lit
l'ancienne forme ; la traduction de l'activité des questions reste à faire.

## Protégée par

- `tests/memory-view.test.cjs` et `tests/memory-projection.test.cjs` : consultation bornée avec témoin positif,
  nuls publiés fidèlement, équivalence entre projection et snapshot.
- `tests/mac-ipc-contract.test.cjs` et `tests/server-routes.test.cjs` : lectures média des deux protocoles par l'accès
  public d'un passage, y compris pour un passage d'historique.
- `tests/topic-summary.test.cjs` : traduction de l'historique dans le contexte de perception après `restore`.
- `tests/archive-compat.test.cjs`, `tests/session-durable.test.cjs` et `tests/wire-contract.test.cjs` : corpus figé,
  numérotation au-delà des orphelins et fil existant inchangés ; `node scripts/check.mjs` les joue en séquentiel.
