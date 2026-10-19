---
id: T226
titre: Speak of passages inside the viewing memory
statut: termine
bloque_par: T220
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La mémoire et ses appelants parlent de passages sans lire ou écrire ses listes internes. Les
archives et les fils gardent leurs noms historiques grâce à des traductions explicites ; le
renommage ne change ni preuve, ni identifiant, ni résultat.

## Sources

- Deuxième lot de T220, relecture B, constat 6 ; `docs/domaine.md`, sections 9 et 11 ; ADR 0029.
  T220 livre `ViewingMemory` et son entrée ; T207 vue et accès bornés ; T208 convertisseur ;
  T225 projection. Relire leurs interfaces réellement livrées avant d'adapter les appelants.
- Code vérifié à `dd5efc9` : `scripts/bench-backend.cjs:62-63` et `:85` ;
  `scripts/bench-perceived.cjs:134-135`, `:238-239`, `:284` lisent ou écrivent history, segments
  et sequence ; `scripts/simulate-stream.cjs:223` et `:294` les relisent.
  `core/session.cjs:332` transmet `this` à `perceptionContext` (voie active).
- Lecteurs média : `app/main.cjs:531`, `:535` et `server/session-routes.cjs:27`.
  Le routage et ses valeurs historiques restent, seule la lecture passe par une frontière publique.
- Recherche reproductible `rg -l 'watch\.(segments|history)' tests` : 17 fichiers à cette version,
  pas les 27 annoncés dans la relecture. Exemples discriminants :
  `tests/server-state-views.test.cjs:44` écrit les listes et la séquence ;
  `tests/question-ceiling.test.cjs:55` lit un snapshot public et n'appartient pas à cet inventaire.

  | Fichier avec accès interne vérifié | Premier repère |
  | --- | --- |
  | `tests/architecture-f08.test.cjs` | `:43` |
  | `tests/chat-instruction.test.cjs` | `:56` |
  | `tests/clip-unreadable.test.cjs` | `:101-102` |
  | `tests/disk-guard.test.cjs` | `:140` |
  | `tests/review-regressions.test.cjs` | `:268` |
  | `tests/server-sessions.test.cjs` | `:240` |
  | `tests/server-state-views.test.cjs` | `:44` |
  | `tests/server-surveillance.test.cjs` | `:72` |
  | `tests/server-warm-up.test.cjs` | `:55` |
  | `tests/session-delete.test.cjs` | `:38` |
  | `tests/session-durable.test.cjs` | `:87-88` |
  | `tests/session-latency.test.cjs` | `:26` |
  | `tests/session-optimization.test.cjs` | `:7` |
  | `tests/session-timeline.test.cjs` | `:101-111` |
  | `tests/session.test.cjs` | `:21` |
  | `tests/split-perception.test.cjs` | `:24` |
  | `tests/topic-summary.test.cjs` | `:96-103` |

- Faux objets et copies publiques sont distincts : `tests/server-routes.test.cjs:627-630` construit
  un faux watch ; ne pas annoncer qu'il lit les listes du vrai agrégat. Le décompte sera refait
  après T194/T223, qui ont retiré certains cas.

## Périmètre

- Aussi, réserves de clôture de T220 (`.harness-state/tickets/T220/relecture-1.md`, constats 2 et 3) : une instruction
  par ligne dans `core/memory/viewing-memory.cjs` (lignes à plusieurs instructions en `:116-117`, `:241`, `:325` à
  `41ef3e3`) ; `docs/domaine.md:72`, `:92`, `:99` cessent de citer `WatchSession` et `core/session.cjs` comme état
  d'aujourd'hui (seules ces mentions, la cible DDD figée ne change pas).
- Renommer variables, paramètres et listes internes de la mémoire de segment vers passage,
  selon le glossaire. Garder `CapturedSegment` à l'entrée Capture ; ne pas renommer les autres
  usages du mot dans les hôtes et domaines sans correspondance établie.
- Adapter les lecteurs/écrivains directs inventoriés : consulter par T207, projection ou accès
  média public ; fabriquer les fixtures par restauration/commandes, sans affecter history,
  segments ou sequence. Les scripts de mesure gardent leurs jeux, leurs tailles et résultats.
- Ne plus transmettre la racine elle-même à `perceptionContext` : lui fournir les seules données
  de passages nécessaires, avec traduction explicite si son interface historique subsiste.
  Un module gelé reste à son chemin et ne subit pas de refonte de ses règles de sujet.
- Traduire aux frontières les clés historiques `segments`, `history`, `questions`, `observation`,
  `moments`, identifiants `moment-N`, intentions, causes, compteurs, noms de fichiers et URL
  `tvlens-media://`. Les convertisseurs et projections en restent les propriétaires ; aucune
  migration sur place ni régénération de corpus, aucun nom d'outil ou canal IPC changé.
- Préserver le protocole média Mac/serveur, l'ancrage des questions, les historiques et la
  numérotation au-delà des orphelins. La traduction de l'activité des questions reste à T227.
  Compléter l'ADR T220 et garder la garde T205 sans exception générale vers des listes privées.

## Critères d'acceptation

1. Les règles internes de la mémoire utilisent passage ; chaque nom historique restant est
   relié à une frontière de traduction dans le journal. Aucun appelant réel ne lit/écrit les
   listes ou la séquence de l'agrégat ; les faux objets d'hôte sont identifiés séparément.
2. Les tests et scripts cités utilisent consultation publique ou restauration. Les assertions
   utiles sur ordre, bornes, pertes, files, enrichissements et résultats de mesure sont conservées,
   sans remplacement par des comparaisons du texte des noms internes.
3. Les archives T222/T215 se lisent et se réécrivent via T208 avec les mêmes clés/valeurs
   historiques, hors évolutions déjà décidées. Aucun identifiant ni fichier renommé ; les sommes
   des témoins restent intactes. Numérotation et refus d'un bloc répété restent prouvés.
4. Les corps figés T213, le fil T038, les lectures média Mac/serveur et les baux conservent leur
   contrat. Les jeux de mesure ne réactivent aucune rétention active.
5. À l'implémentation, jouer les suites touchées, contrats de consultation/archive/projection,
   bancs média et gardes en séquentiel, puis `node scripts/check.mjs`. Aucun cas ni plancher retiré.

## Test d'acceptation attendu

Les suites publiques de mémoire et le runtime conduisent ingestion/restauration et lectures T207.
Les tests de médias invoquent les vrais protocoles avec store temporaire ; le corpus et les corps
HTTP figés prouvent que le nouveau vocabulaire interne n'a pas renommé les données historiques.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères décrivent l'avant-extractions ; refaire l'inventaire après T220. Un test supprimé par
T194/T223 n'est pas recréé pour satisfaire le compte initial. Les scripts avec fournisseur réel
sont seulement adaptés, jamais exécutés dans ce lot.

## Journal
- 19/10, orchestrateur : réserves 2 et 3 de la clôture de T220 ajoutées au périmètre.

- 19/10, Codex : skill et standards lus, témoin hooks présent ; inventaire refait à d26337d.
  Exploration et adaptations prévues consignées dans `.harness-state/tickets/T226/`.
  Les accès de `server-routes` appartiennent à un faux hôte ; les accès réels supplémentaires
  de consultation, projection et protocole Mac sont inclus. Aucun fournisseur réel prévu.
- 19/10, orchestrateur : quota Codex épuisé pendant ce ticket ; relève native refusée (HEAD déplacé par un commit de
  ticket de l'orchestrateur, d26337d). Travail de Codex conservé en patch, arbre remis propre :
  `.harness-state/archives/T226-quota-codex-20261019-2230/code.patch` (34 fichiers, `git apply --check` vérifié sur
  `d26337d`), état et preuves rouges/vertes dans `etat/` du même dossier. Reprise par Claude : appliquer ce patch,
  le relire contre ce ticket, le terminer et refaire les contrôles ; il n'est pas une preuve en soi.
- 19/10, Claude (reprise) : patch Codex appliqué sur `1e43ebf` (`git apply`, 33 fichiers et non 34). Exploration
  neuve dans `.harness-state/tickets/T226/exploration.md`, sans écart de périmètre :
  - aucun accès réel restant aux listes ni à la séquence ;
  - un rouge latent en `session-durable:275` ;
  - sept lignes longues ;
  - un cas `available: null` devenu vacant dans `memory-projection` ;
  - une sentinelle de vue sans témoin positif ;
  - des octets de banc modifiés par `mediaReason` ;
  - ADR 0063 à compléter, sans 0064 (écart 4).

  Écarts déclarés dans `ecarts.md` : périmètre élargi, faux port HTTP, bancs, ADR.
- 19/10, implémenteur, corrections :
  - le test de `session-durable` relit le snapshot ;
  - lignes longues et instructions multiples ajoutées : scindées ;
  - `core/passage-events.cjs` en passages ;
  - publication d'un `available` nul prouvée par la projection : rouge avec la conservation du null neutralisée,
    puis vert ;
  - témoin positif de la sentinelle : rouge avec une copie profonde dans `restore`, puis vert ;
  - mutation du contexte de `topic-summary` de nouveau prouvée.

  Bancs hors ligne, HEAD extrait comparé à l'arbre (`bancs-avant-apres.md`) :
  - seuls les octets en disposition historique changent : +32 o par passage d'historique dans l'archive, +24 o dans
    le sondage ;
  - la disposition durable et la disposition tout-en-segments sont à 0 o d'écart ;
  - les états, sans `mediaReason`, sont identiques.

  Suites touchées et liées en séquentiel : 34 fichiers, 0 échec. `node scripts/check.mjs` : vert, 3036 cas, à
  contrôler de nouveau après la relecture.
- 19/10, orchestrateur : ADR 0063 complété (vocabulaire interne et table des traductions). Noms historiques
  restants, reliés à leur frontière :

  | Nom historique | Frontière qui traduit |
  | --- | --- |
  | `segments`, `history` (`session.json` v1) | `ViewingMemory.restore` et `snapshot()`, convertisseurs `core/memory/archive.cjs` |
  | `{ history, segments }` du contexte de perception | `contextFor` de la racine, `core/memory/viewing-memory.cjs` |
  | `origin: 'history' \| 'retained'`, `coverage.historyPassages` et `retainedPassages` | vue `core/memory/memory-view.cjs` |
  | `segments`, `history`, `questions`, `observation`, `moments` de `/v1/state` | projection `runtime/memory/memory-projection.cjs` |
  | `moment-N`, `tvlens-media://`, `/v1/media` | `memory.passage(id)` du port de session, hôtes `app/main.cjs` et `server/session-routes.cjs` |
  | `/v1/segments`, champ de transport `sequence` | `server/ingest-routes.cjs`, numérotation de transport sans lien avec `#passageSequence` |
  | `CapturedSegment`, `TVLENS_CAPTURE_ORDER_INVALID` | entrée Capture, gardée par le ticket |

  Faux objets d'hôte, à part : `server-routes`, `surveillance(-runtime)`, `mac-ui`, `moment-actions`,
  `architecture-f04`, `evidence-refresh` et le faux port `tests/helpers/state-view-scenario.cjs` (écart 2).
- 19/10, relecture 1 (`relecture-1.md`) : à corriger, 3 mineurs et 1 hors périmètre. Les écarts 1 à 4 sont acceptés.
  - Mineurs :
    - lectures média d'historique non prouvées sur les deux hôtes ;
    - traduction de l'historique dans `contextFor` non prouvée ;
    - une ligne à deux instructions.
  - Correction 1, par l'implémenteur :
    - trois tests sur les vrais protocoles et la frontière publique, chacun vu rouge sous mutation puis vert
      (`server-routes` 49 cas, `mac-ipc-contract` 42, `topic-summary` 11) ;
    - `node scripts/check.mjs --changed` : vert.
- 19/10, relecture 2 (`relecture-2.md`, correction) : accepté, non corrigés 0, 1 hors périmètre (`docs/domaine.md:99`).
- 19/10, contrôle final : `node scripts/check.mjs` vert.
  - 154 fichiers, 3039 cas, 0 échec ; Python 73 OK.
  - Cliquet : `lignes_longues_tests` 1581 → 1575 et `cas_de_test_produit` 1640 → 1645.
  - Journal : `.harness-state/tickets/T226/check-final.log`.
- 19/10, orchestrateur, tentative 2 : la boucle a refusé la tentative 1, car aucun ADR n'avait été ajouté
  (`echec-1.txt`). Le complément de l'ADR 0063 passe dans l'ADR 0064
  (`docs/adr/0064-la-memoire-parle-de-passages-et-traduit-ses-noms-historiques-aux-frontieres.md`, « complète l'ADR
  0063 »). L'ADR 0063 y renvoie désormais.
  - Écart 4 révisé dans `ecarts.md`.
  - `node scripts/loop/reviewed-state.mjs record` : `revue-3`. L'interdiff ne touche que les deux ADR.
- 19/10, relecture 3 (`relecture-3.md`, complète) : à corriger, 1 bloquant et 1 hors périmètre. Les écarts 1 à 4
  sont acceptés.
  - Bloquant : l'ADR 0064 manquait dans la section « Décisions » de `docs/architecture.md`. Rouge observé :
    `node --test tests/documentation-index.test.cjs` échoue en `:121` (`rouge-index-adr.log`).
  - Correction 1, par l'implémenteur : entrée ADR 0064 ajoutée.
    - `documentation-index` : 12 cas sur 12 (`vert-index-adr.log`).
    - `node scripts/check.mjs --changed` : vert, 332 cas (`check-changed-tentative-2.log`).
- 19/10, relecture 4 (`relecture-4.md`, correction) : accepté, non corrigés 0, 1 hors périmètre (`docs/domaine.md:99`).
- 20/10, contrôle final, tentative 2 : `node scripts/check.mjs` vert.
  - 154 fichiers, 3039 cas, 0 échec ; Python 73 OK.
  - Lancé en même temps qu'un contrôle complet de la boucle `lg-launcher` (autre dépôt) : charge partagée, aucun échec.
  - Journal : `.harness-state/tickets/T226/check-final-tentative-2.log`.

### Réserves à la clôture

- Hors périmètre : docs/domaine.md:99 cite encore core/topic-summary.cjs au lieu de core/memory/topic-summary.cjs.
- Écart accepté, critère 1 : périmètre élargi à tests/memory-view, tests/memory-projection, tests/mac-ipc-contract et scripts/memory-fixture.cjs, vrais accès découverts après T220 ; tests/server-routes reste un faux hôte.
- Écart accepté, critère 4 : tests/helpers/state-view-scenario.cjs est un faux port de consultation, parce que restore interromprait ses états en vol ; il passe par les vraies fonctions de vue et de projection, et les JSON figés sont intacts.
- Écart accepté, critère 2 : les bancs fabriqués par restore comptent mediaReason: 'expired' en disposition historique (+32 o par passage en archive, +24 o en sondage), avec les mêmes jeux, tailles et rétention.
- Écart accepté, ADR : le complément de l'ADR 0063 passe dans l'ADR 0064 (« complète l'ADR 0063 »), et l'ADR 0063 y renvoie.
- Non vérifié : le rouge du test de contexte historique (topic-summary) a été observé sur une version plus courte d'une ligne ; la version actuelle n'a pas été rejouée sous mutation.
