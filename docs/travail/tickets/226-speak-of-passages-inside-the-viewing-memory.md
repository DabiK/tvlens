---
id: T226
titre: Speak of passages inside the viewing memory
statut: a-faire
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
