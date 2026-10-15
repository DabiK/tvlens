---
id: T172
titre: Build the session providers of createSessionRuntime outside it
statut: a-faire
bloque_par: T163
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La composition partagée d'une session délègue la construction de ses fournisseurs et la persistance
de son manifeste à deux modules testables séparément. `createSessionRuntime` garde l'assemblage de la
session et son interface publique ; ses deux hôtes continuent de recevoir les mêmes objets et résultats.
La restauration et la fermeture restent pour T173.

## Sources

- `docs/audit-points-chauds.md`, sections A « Carte des points chauds » et B « Découpage des trois gros fichiers », composition de session.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code à `e92c6a6`, `runtime/session-runtime.cjs` :
  - `createSessionRuntime` commence à `runtime/session-runtime.cjs:49` et finit ligne 550 : 502 lignes
    physiques, blancs et commentaires compris, sans prétendre mesurer la complexité ;
  - validation et identité avant construction, `runtime/session-runtime.cjs:73` ; garde, store et
    miniatures, `runtime/session-runtime.cjs:101` ; budget, embeddings et index,
    `runtime/session-runtime.cjs:116` ; transcripteur et choix des modèles,
    `runtime/session-runtime.cjs:143` ; inspecteur caché puis révocable,
    `runtime/session-runtime.cjs:210` ; perception et priorité de l'override,
    `runtime/session-runtime.cjs:220` ; alimentation bornée de l'index,
    `runtime/session-runtime.cjs:255` ; vue disque en mémoire, `runtime/session-runtime.cjs:266` ;
  - historique des captures et état de fermeture, `runtime/session-runtime.cjs:293` ;
    `recordManifest`, `runtime/session-runtime.cjs:320` ; déclenchement dans `onChange`,
    `runtime/session-runtime.cjs:377` ; reprise et ajout d'une capture,
    `runtime/session-runtime.cjs:449` ; configuration locale, `runtime/session-runtime.cjs:568`.
- Appelants : composition Mac, `app/main.cjs:293` ; serveur, `runtime/headless-runtime.cjs:617` ;
  ouverture d'archive par la façade, `runtime/session-runtime.cjs:553`.
- Tests protecteurs : `tests/session-durable.test.cjs:309` (cadence du manifeste, index et lectures
  disque), `tests/session-durable.test.cjs:680` et `tests/session-durable.test.cjs:753` (confirmation
  finale et vie reprise), `tests/review-regressions.test.cjs:249` (options et index),
  `tests/disk-guard.test.cjs:101`, `tests/architecture-f05.test.cjs` (révocation de l'inspecteur),
  et les bancs IPC/HTTP existants.
- Contrats : ADR 0002, 0003 et 0005 dans `docs/adr/` ; frontières dans `docs/standards.md`.

## Périmètre

- Créer `runtime/session-providers.cjs` : fabriques nommées pour les fournisseurs de perception,
  transcription, inspection et indexation actuellement construits dans `createSessionRuntime`.
  Les dépendances de construction doivent pouvoir être remplacées par des fabriques enregistrant leurs
  arguments dans les tests. Les options, le store, les miniatures, le quota et les horloges sont remis
  explicitement ; aucun fournisseur ne démarre au chargement du module.
- Créer `runtime/session-manifest.cjs` : construction et écriture du manifeste, cadence et historique
  borné des captures. Recevoir le store, les miniatures, l'identité, les horloges et les faits de session
  nécessaires. L'état « fin confirmée de cette vie » conserve un seul propriétaire ; le déplacer ici
  ou le lire par une dépendance explicite, sans le déduire du manifeste d'une vie antérieure.
- `runtime/session-runtime.cjs` assemble ces modules. Garder le calcul de stockage, la création de
  `WatchSession`, la restauration et les méthodes de fin à leur place pour ce premier temps.
  Les constantes déjà exportées restent accessibles par la façade, réexportées si elles déménagent.
- Ajouter `tests/session-providers.test.cjs` et `tests/session-manifest.test.cjs`, ainsi qu'un ADR court
  décrivant la répartition des propriétaires et son articulation avec les ADR 0002, 0003 et 0005.
- Ne modifier ni les ports du cœur, ni les adaptateurs de stockage, ni les hôtes, ni les assertions
  des tests existants. Aucun nouveau réglage ou fournisseur, aucune installation.

## Critères d'acceptation

1. Les tests des fabriques, par leurs fonctions exportées et sans fournisseur réel, vérifient les
   branches smoke/live/local, la priorité de `overrides.perception` et `overrides.embeddings`, les
   identifiants des rôles `-observe`/`-inspect`, les modèles et le partage du transcripteur. Une option
   locale reste transmise à l'agent local ; un inspecteur exposé reste caché et révocable.
2. Les tests du manifeste conduisent les deux horloges et un store différé : première publication
   éligible, cadence de 30 s, capture ajoutée à la reprise et historique borné à 100 entrées. Une archive
   en lecture seule n'écrit rien. Les totaux, dates et valeurs de repli restent ceux du code d'entrée.
3. Un refus de manifeste courant reste absorbé selon le contrat actuel ; un refus du manifeste final
   est remis à l'appelant. Une pause tardive ne remplace pas une fin confirmée par `live`, et une vie
   reprise ne s'annonce pas archivée sur le manifeste confirmé de la vie précédente.
4. La construction des fournisseurs et le corps de `recordManifest` ne sont plus définis dans
   `createSessionRuntime`. La commande suivante rend une sortie vide (code 1), consignée au journal :
   `grep -nE "new (LocalTranscriber|CodexPerception|ClipInspector|RevocableInspector|CachedInspector|OpenRouterEmbeddings|EmbeddingStore|MomentIndex)|saveManifest[[:space:]]*\(" runtime/session-runtime.cjs`.
   `new LocalVlmAgent` du helper `localVlmAgent` (`runtime/session-runtime.cjs:568`) est déjà
   hors de `createSessionRuntime` à ce SHA ; cette preuve ne lui impose pas un déplacement supplémentaire.
   La liste des fabriques déplacées et `wc -l` avant/après complètent ce relevé ; il n’existe qu’une
   définition de chaque fabrique et de la politique de manifeste.
5. Les tests existants passent sans changement d'assertion, notamment les fichiers cités et les bancs
   `tests/mac-ipc-contract.test.cjs`, `tests/server-sessions.test.cjs` et
   `tests/server-state-views.test.cjs`. Le diff de ce ticket sous `tests/` ne contient que les deux
   nouveaux fichiers. Les contrôles sont exécutés en séquentiel.
6. `node scripts/check.mjs` est vert lors de l'implémentation ; aucun contrôle non lancé n'est déclaré
   réussi. Le harnais et son plancher restent inchangés.

## Test d'acceptation attendu

`tests/session-providers.test.cjs` appelle les fabriques avec des constructeurs de test ;
`tests/session-manifest.test.cjs` appelle le propriétaire du manifeste avec un store enregistré et
des horloges conduites. Les tests durables et des deux hôtes, inchangés, prouvent le maintien de la
composition réelle. Ni Codex, ni Whisper, ni service d'embeddings réel n'est lancé.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le périmètre est celui décidé par la file. À `e92c6a6`, les fournisseurs simulés sont encore en ligne
et T146 est `a-faire` : l'affirmation de la file selon laquelle T146 les a « déjà » sortis décrit le
prérequis attendu, pas ce worktree. T150 dépend de T149, lui-même de T146 ; au lancement, réutiliser
ses fabriques et relire les repères déplacés. Ne pas réécrire ces faux ni leur ajouter deux voies.
Les modules restent à plat dans `runtime/`, compatibles avec la garde d'architecture actuelle.

## Journal
