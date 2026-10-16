---
id: T194
titre: Remove the unused answer path, the serial lane and the masked-overlay declaration from the watch session
statut: a-faire
bloque_par: T193, T190
adr: oui
installe: non
harnais: oui
supprime_tests: oui
niveau: standard
---

## Ce que le ticket livre

`WatchSession` ne porte plus une seconde conversation ni une troisième voie de perception. Les
questions restent à `DeepAsk`, les deux voies audio/vision deviennent le contrat unique et la
déclaration d'images masquées sans émetteur disparaît de l'ingestion. Les questions et les textes
des anciennes archives restent lisibles. Le niveau standard suit la règle des tickets de harnais ;
le retrait touche la session mais n'autorise aucun changement des règles actives de réponse.

## Sources

- `docs/audit-architecture.md`, rapport A, B3 et D2 ; rapport B, B12 et D5.
  Décision du propriétaire, le 16/10 : retrait après la migration smoke et la possession de l'activité
  des questions. T199 et T178 sont transitifs. L'autorisation de suppression reste à décider ci-dessous.
- Code vérifié à `8340014` et appels recherchés dans le produit, scripts et tests :
  - `core/session.cjs:48` reçoit le port `answer`, `:237` porte la voie série, `:386` l'ancien `ask`,
    `:524` `selectEvidence`. `runtime/session-runtime.cjs:170` câble encore `answer: perception` ;
  - aucun appel produit à `watch.ask` n'a été identifié. Les questions actives passent par
    `runtime/conversation-runtime.cjs:59`, `app/main.cjs:132` et `runtime/headless-runtime.cjs:427` ;
  - `core/session.cjs:408` filtre les citations ; `:414` transforme une observation sans citation
    en réponse insuffisante. `core/deep-ask.cjs:129` rassemble les preuves, `:132` valide les citations
    et `:142` distingue les réponses externes et conversationnelles avant la décision à `:145` ;
  - `core/session.cjs:29` et `:38` interprètent l'overlay de capture et ajoutent sa note ; `:122`
    le conserve à l'ingestion. `adapters/remote-media.cjs:13`, `:37` et `:128` le valident et le relaient.
    `tv/capture.py:120` produit les images sans cette déclaration ;
  - `core/session.cjs:478` restaure `saved.questions`, `:498` les conserve dans le snapshot ;
    `core/ports.cjs:10` décrit l'ancien `AnswerPort`, distinct du `SessionAgentPort` actif à `:34` ;
  - tests directs : `tests/session.test.cjs:32`, `tests/topic-summary.test.cjs:127`,
    `tests/watch-session-ending.test.cjs:112`. Fixtures série : `tests/architecture-f08.test.cjs:93`
    et `tests/session-durable.test.cjs:365`, `:405`, `:420`, `:571`, `:610`, `:973`, `:1001`,
    `tests/session-latency.test.cjs:68`, `:210`, `tests/session-lifecycle.test.cjs:99` et
    `tests/session-optimization.test.cjs:5` ;
  - autres câblages à retirer : `scripts/simulate-stream.cjs:220` et
    `tests/question-ceiling.test.cjs:36` (`answer: perception`), `scripts/bench-backend.cjs:58` et
    `scripts/bench-perceived.cjs:282` (`answer: {}`) ;
  - `tests/deep-ask-restore.test.cjs:8` protège des explications sans citation ;
    `tests/evidence-refresh.test.cjs:108` couvre une observation citée. Aucun test explicite
    d'observation sans citation dans `DeepAsk` n'a été identifié pendant cette lecture ;
  - `tests/server-ingest-path.test.cjs:70` protège encore l'ancienne déclaration de capture.
- ADR 0016 et 0017 : précédents de retrait avec conservation de l'historique et baisse exacte du
  plancher. L'API de surveillance overlay est distincte et reste conservée par l'ADR 0017.

## Périmètre

- Retirer `WatchSession.ask`, `selectEvidence`, le port `answer` de son constructeur et son câblage,
  puis la branche observation-only de `drain`. Adapter `core/ports.cjs` au contrat à deux voies.
  Les adaptateurs et fixtures de perception conservés exposent les deux méthodes ; les méthodes
  de compatibilité devenues sans appelant dans le simulé et `CodexPerception` peuvent être retirées.
- Retirer `declaredOverlay`, `withOverlayNote` et le relais de cette déclaration dans
  `adapters/remote-media.cjs`. L'ancien champ facultatif d'entrée peut être ignoré ; ne pas créer
  de nouveau refus d'ingestion. Garder les métadonnées d'identité, de séquence et de source.
- Migrer vers `DeepAsk` les garanties utiles des tests de l'ancien chemin avant leur retrait :
  citations, cible temporelle, contexte disponible et refus après la fin. T190 fournit déjà la
  commande d'activité de question ; ne pas réintroduire ses mutations directes dans les fixtures.
- Conserver la lecture, la validation et la restitution des `questions` historiques, ainsi que les
  observations archivées et leurs notes existantes. Aucun réexamen ni fournisseur à l'ouverture.
- Modifier les modules cités et leurs tests propres, les fixtures série réellement consommatrices,
  les scripts `scripts/simulate-stream.cjs`, `scripts/bench-backend.cjs` et `scripts/bench-perceived.cjs`,
  `tests/question-ceiling.test.cjs`, et ajouter un ADR court qui acte le retrait, la compatibilité et l'inventaire des tests supprimés.
  Garder les fichiers mixtes : seuls les cas devenus sans objet en sortent.
- `harnais: oui` n'ouvre que la ligne `cas_de_test` de `scripts/quality/baseline.json`, pour la baisse
  décidée ci-dessous. Aucun autre changement de harnais. Ne retirer ni `close({ purge })`, ni
  `saveAuto`, ni délégations headless, ni routes ou file de surveillance overlay dans ce ticket.

## Critères d'acceptation

1. Avant de retirer l'ancien `ask`, un test par `DeepAsk.start` fait répondre l'agent avec une
   observation sans citation : le résultat est insuffisant et ne présente aucune preuve inventée.
   Les tests distinguent l'observation citée, la citation inconnue ou hors cible et les explications
   sans citation autorisées en chat. Les règles actives ne sont pas alignées artificiellement sur
   les anciens textes de réponse. Chaque garantie migrée est reliée à un test public dans le journal.
2. Les recherches de symboles dans le code, scripts et tests ne trouvent plus l'ancien appel
   `WatchSession.ask`, `selectEvidence`, `AnswerPort`, `answer: perception`, ni la sélection d'une
   voie série. `DeepAsk` et les ports `answer` de ses agents restent actifs. Les documents historiques
   (`docs/audit-*.md`, tickets et ADR) sont exclus de ces critères d'absence.
3. Un bloc normal, et un bloc portant encore l'ancien champ facultatif, sont ingérés par le serveur
   sans déclaration d'images masquées ni ajout d'une nouvelle note. Leurs images, séquence et source
   restent intactes. La recherche des anciens symboles de déclaration est vide dans le code actif ;
   les routes et données de surveillance overlay restent couvertes par leurs tests existants.
4. Une fixture d'archive contenant `questions` et une ancienne observation avec sa note est ouverte,
   lue et refermée sans perte ni réécriture, sans appel fournisseur. Les tests de restauration restent
   actifs ; la disparition de l'API historique n'efface pas les données qu'elle a écrites.
5. Le journal donne les cas retirés, leur fichier, leur ancien comportement et leur remplacement
   éventuel. Soit P le plancher au début, n le nombre exact de lignes `test(` retirées et a les ajouts :
   le nouveau plancher est P − n et la mesure finale M vérifie M ≥ P − n + a. Aucun cas de remplissage
   ne compense un retrait. Aucun autre compteur du plancher n'est relâché. Si T196 est déjà livré,
   la même autorisation s'applique seulement à son plancher produit, en adaptant le journal au nom réel.
6. La commande suivante ne liste que `scripts/quality/baseline.json` :

   ```sh
   git status --porcelain -- .claude .codex .agents AGENTS.md CLAUDE.md docs/standards.md scripts/check.mjs scripts/quality scripts/loop
   ```

   `git diff -- scripts/quality/baseline.json` ne touche que la ligne du plancher `cas_de_test`,
   ou celle du plancher produit si T196 est déjà livré, avec la baisse exacte du critère 5.
   Aucun autre fichier protégé ni aucune autre ligne du fichier n'est modifié.
7. À l'implémentation, exécuter en séquentiel les fichiers touchés, split-perception, deep-ask-restore,
   evidence-refresh, session-durable et server-ingest-path, puis `node scripts/check.mjs`. Le contrôle
   est vert avec l'autorisation de baisse exacte ; aucun autre comportement ni test n'est affaibli.

## Test d'acceptation attendu

La première preuve est un agent factice appelé par le vrai `DeepAsk`, avec outils et preuves maîtrisés,
et l'observation de son résultat public. Elle précède la contraction. Une ancienne archive complète
est ensuite ouverte par le runtime et la bibliothèque réels, sur disque temporaire, avec comparaison
avant/après. Les scénarios de perception de T193 continuent d'exercer les deux voies des hôtes.

## Hypothèses bloquantes

Décision attendue du propriétaire : supprimer ces chemins et leurs tests propres, en abaissant le
plancher `cas_de_test` du nombre exact de cas supprimés, avec `harnais: oui` limité à cette ligne,
comme pour T139 ? Recommandation : oui.

Le nombre exact de cas retirés sera établi sur la version livrée par T193 et T190 ; il n'est pas
inventé ici. Les garanties d'archives et de citations sont obligatoires même après cet accord.

## Journal
