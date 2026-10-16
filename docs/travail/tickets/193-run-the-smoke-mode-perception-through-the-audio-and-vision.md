---
id: T193
titre: Run the smoke-mode perception through the audio and vision lanes the hosts use
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La perception simulée des deux hôtes passe par les voies audio et vision de la production. Un bloc
simulé publie sa transcription, puis sa description visuelle, avec les mêmes états de passage et les
mêmes règles de files que les adaptateurs réels. Les bancs d'hôte peuvent ainsi détecter une régression
de ces voies au lieu de ne vérifier que la voie série historique.

## Sources

- `docs/audit-architecture.md`, rapport A, B3 et D2. Décision du propriétaire, le 16/10 : étendre le
  simulé avant le retrait de la voie série. T178 est transitif par T199.
- Code vérifié à `8340014`, modules, appelants et tests lus :
  - `adapters/simulated-providers.cjs:40` fournit seulement `observe` et `ask` ;
    `adapters/codex-perception.cjs:113` et `:136` exposent `transcribe` et `observeVisual` ;
  - `runtime/session-providers.cjs:153` choisit le simulé pour `smoke && !liveObservation`, après
    l'override explicite ; `runtime/session-runtime.cjs:169` transmet cette perception à la session ;
  - `core/session.cjs:59` choisit les deux voies seulement si leurs méthodes existent ; `:237`
    conserve sinon la voie série. `:286` appelle la transcription, `:333` la description visuelle ;
  - `core/ports.cjs:63` documente les résultats et les états des deux voies ;
  - `tests/simulated-providers.test.cjs:65` exerce encore `observe`, puis l'ancien `ask` ;
    `tests/session-providers.test.cjs:121` protège la sélection des fournisseurs et `:218` les overrides ;
  - `tests/split-perception.test.cjs:20` distingue les deux publications et les files ;
    `tests/architecture-f08.test.cjs:93` exige encore une voie série pour un adaptateur `observe` seul ;
  - des fixtures observation-only subsistent dans `tests/session-durable.test.cjs:405`, `:571`,
    `:610`, `:973`, `:1001`, `tests/session-latency.test.cjs:68`,
    `tests/session-lifecycle.test.cjs:99` et `tests/session-optimization.test.cjs:5`.
- Bancs smoke recensés : architecture-f05/f06/f07/f10, capture-intake, capture-sources,
  chat-instruction, clip-unreadable, disk-guard, host-error-handling, remote-server,
  review-regressions, server-ingest-path, server-sessions, server-state-views, server-surveillance,
  server-warm-up, session-delete, session-durable, session-providers et timeline-server,
  chacun sous `tests/` avec le suffixe `.test.cjs`. Un `smoke: true` ne prouve pas à lui seul
  l'usage de la perception par défaut : certains bancs la remplacent.

## Périmètre

- Modifier `adapters/simulated-providers.cjs` et ses tests ; compléter les tests de composition de
  session et d'hôte nécessaires pour observer les deux voies avec le vrai fournisseur simulé.
- Ajouter `transcribe` et `observeVisual` avec le contrat des ports : patch audio distinct du patch
  visuel, conservation de la transcription reçue par la vision, coût simulé nul. Un bloc audio du
  banc donne une phrase fictive déterministe non vide pour rendre cette conservation discriminante ;
  garder le contenu cohérent avec les scénarios actuels. Aucune transcription réelle n'est requise.
- Garder provisoirement les méthodes historiques nécessaires aux tests de l'ancien chemin : leur
  retrait appartient à T194. Ne retirer ni voie série, ni `WatchSession.ask` dans ce ticket.
- Lire chaque test smoke affecté avant d'adapter une attente. Migrer seulement les fixtures qui
  prétendent représenter la production ; garder les scénarios explicitement consacrés au contrat
  historique jusqu'à T194. Toute assertion changée en raison de l'ordre audio/vision est déclarée
  dans `ecarts.md`, avec la garantie équivalente et sa preuve, avant la modification.
- Ne modifier ni capture native, ni transport, ni durées métier, ni fournisseurs réels. Aucun
  `*:live`, aucun lancement d'Electron et aucune installation ne sont nécessaires à la preuve.

## Critères d'acceptation

1. Une session construite avec `smoke: true`, sans override de perception, reçoit un bloc par son
   ingestion publique. Un test retient séparément les réponses des vraies méthodes simulées, dont
   il ne remplace pas le contenu. Il observe d'abord l'état audio publié, puis l'état visuel final
   du même passage ; `observe` est rendu inutilisable dans ce scénario pour détecter tout repli série.
2. Tant que la description du premier passage est retenue, l'audio d'un second peut être publié.
   La transcription du premier se retrouve dans l'entrée de sa vision et dans l'observation finale.
   Les statuts audio/vision, les identifiants et les intervalles restent ceux des passages ingérés.
   Les signaux/promesses du banc ordonnent les étapes, sans attente murale pour « laisser analyser ».
3. Les tests directs du simulé couvrent un bloc avec et sans audio, le patch visuel et le coût nul.
   Les tests de sélection prouvent toujours la priorité de l'override, le simulé par défaut en smoke
   et l'adaptateur réel avec `liveObservation`, sans lancer de fournisseur.
4. Au moins un scénario d'hôte serveur et le banc IPC Mac existant utilisent cette perception par
   défaut et atteignent un passage terminé par les deux voies. Une panne volontaire d'une méthode
   simulée rend leur preuve rouge sur l'observation attendue, pas sur le texte du code.
5. Le journal rapproche chaque assertion adaptée de son ancienne garantie. Les tests de la voie
   série restent présents et identifiés comme historiques ; aucun plafond de file, refus de fin,
   signal d'annulation ou contrat de persistance n'est assoupli pour retrouver le vert.
6. À l'implémentation, exécuter en séquentiel les tests simulated-providers, session-providers,
   split-perception, mac-ipc-contract et server-ingest-path, puis tous les autres fichiers touchés.
   `node scripts/check.mjs` est vert ; le harnais et le plancher restent inchangés.

## Test d'acceptation attendu

Un cas dans `tests/split-perception.test.cjs` ou `tests/session-providers.test.cjs` compose la vraie
session smoke et enveloppe ses méthodes simulées pour retenir leur règlement. La preuve passe par
`watch.ingest` et les états publiés, sans espionner `drainAudio`/`drainVision`. Les bancs d'hôte
complètent cette preuve par leurs entrées publiques, avec les mêmes fournisseurs simulés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le sous-compte de douze fichiers smoke sans override annoncé par l'audit n'est pas établi pour les
options assemblées dynamiquement ; il n'est pas un critère. La preuve vise le chemin effectivement
choisi. Les tests simulés ne prouvent ni les modèles réels ni la capture matérielle.

## Journal

- Exploration : consignes, contrat des voies, simulé, composition et bancs IPC/HTTP lus ;
  détails dans `.harness-state/tickets/T193/exploration.md`. Adaptations de l'ancien ordre
  série déclarées avant modification dans `ecarts.md`. Aucun changement du cœur nécessaire.
- Audio : `node --test tests/simulated-providers.test.cjs` rouge sur le patch absent
  (8/9), puis vert (9/9) après ajout de `transcribe`. Vision : même commande rouge
  sur le patch absent (9/10), puis verte (10/10) après ajout de `observeVisual`.
- Composition : `node --test --test-name-pattern=default.smoke.ingestion tests/session-providers.test.cjs`
  rouge sur l'état audio absent du chemin série ; `node --test tests/session-providers.test.cjs`
  vert (10/10). La vraie session smoke conserve les paroles, publie le second audio pendant
  la première vision retenue et termine les deux passages avec leurs identifiants/intervalles.
  `observe` est inutilisable ; les résultats des méthodes simulées sont retenus sans remplacement.
  Sorties et commandes conservées dans `.harness-state/tickets/T193/`.
- Hôtes : nouvelle preuve par `watch:ingest` via le vrai pont IPC et par `POST /v1/segments`
  puis `GET /v1/state`, perception smoke par défaut. Chaque preuve vérifie le patch audio
  intermédiaire et l'observation finale avec les deux statuts prêts.
- Adaptation Mac déclarée dans `ecarts.md` : l'ancienne attente de passage `queued` pendant
  une question a échoué (28/29 tests). Sa garantie de retenue/reprise est conservée pour
  la vision avec `visionDuringAsk=false`, audio publié entre-temps ; une seconde variante
  garde le réglage par défaut et prouve l'achèvement des deux voies pendant la question.
  L'injection de progrès du banc de notifications refusées vise maintenant `observeVisual` ;
  ses assertions de sauvegarde et de diagnostic sont conservées. Le test `observe`/`ask`
  est identifié comme historique, avec ses assertions inchangées.
- Mutations : `python3 .harness-state/tickets/T193/mutations.py` remplace temporairement
  `transcribe`, puis `observeVisual`, par un rejet. Les quatre exécutions filtrées IPC/HTTP
  échouent sur l'égalité de l'observation attendue (transcription absente ou description absente),
  puis l'adaptateur est restauré. Une première sonde audio avait expiré à 30 s parce que
  le signal du nouveau banc n'acceptait pas la fin partielle ; corrigé dans le banc avant
  les quatre mutations probantes, sans modifier leurs assertions.
- Contrôle ciblé : `node scripts/check.mjs --changed` vert (56/56 tests JS, règles, format,
  lint, gel et cliquet verts). Aucun plafond, refus de fin, signal ou contrat de persistance modifié.
- Séquence exigée, après restauration des mutations : `node --test tests/simulated-providers.test.cjs`
  (10/10), puis `node --test tests/session-providers.test.cjs` (10/10), puis
  `node --test tests/split-perception.test.cjs` (21/21), puis
  `node --test tests/mac-ipc-contract.test.cjs` (30/30), puis
  `node --test tests/server-ingest-path.test.cjs` (6/6). Tous verts, sorties `required-*.log`.
- Premier `node scripts/check.mjs` : règles, format, lint, gel, cliquet et 22 tests Python
  verts ; JS 1929/1930, rouge sur la sonde du disque lent de `server-sessions` qui retenait
  encore `observe`. Échec reproduit avec
  `node --test --test-name-pattern=a.slow.disk.holds.back tests/server-sessions.test.cjs`,
  sur les états publiés (deux passages déjà prêts au lieu d'une description en cours et d'une en file).
- Adaptations complémentaires déclarées dans `ecarts.md` avant modification : le disque lent
  retient maintenant `observeVisual` et attend par notification le second audio publié. L'ancienne
  garantie de file devient vision `analyzing` puis `queued`, avec les deux audios prêts ;
  toutes les assertions de sauvegarde, de tags et de barrières restent identiques. Même commande
  ciblée verte (1/1). Dans `architecture-f07`, les deux méthodes sont comptées au lieu d'`observe` ;
  l'absence d'analyse pendant la fin et les assertions d'archive restent inchangées.
- Fichiers complémentaires exécutés en séquentiel : `node --test tests/architecture-f07.test.cjs`
  vert (26/26), puis `node --test tests/server-sessions.test.cjs` vert (29/29).
  Nouveau `node scripts/check.mjs --changed` vert : 111/111 tests JS sur les six fichiers
  touchés, règles/format/lint/gel/cliquet verts ; une ligne longue de test en moins.
- Contrôle final `node scripts/check.mjs` vert : 1930/1930 tests JavaScript sur 126 fichiers
  en séquentiel, 22/22 tests Python ; règles, format, lint, gel et cliquet verts.
  Sortie intégrale du contrôle dans `.harness-state/tickets/T193/check-full-final.log`.
  Harnais et plancher inchangés. Verdict `TERMINÉ` écrit dans le dossier d'état pour
  la relecture de la boucle ; aucun commit ni push.
- Reprise après `relecture-1.md` : rapport, journal, écarts, statut et diff complet relus.
  Avant correction, `node --test --test-name-pattern=a.state.is.published.before.the.disk tests/session-durable.test.cjs`
  vert (1/1), puis `node --test tests/session-providers.test.cjs` vert (10/10).
  Le cas durable reste historique : seul son commentaire doit perdre l'attribution erronée
  aux hôtes smoke actuels ; ses assertions de publication, de refus et de barrières sont conservées.
  `docs/domaine.md` est désormais porté par le commit séparé `ad74a5d`, avec l'ADR du domaine ;
  `git diff --quiet HEAD -- docs/domaine.md` retourne 0 et le fichier est absent du diff T193.
  Aucun travail parallèle n'est annulé. L'exploration et les écarts sont corrigés avant l'édition.
- Correction du constat 1 : le commentaire de la fixture durable nomme la voie série historique
  des hôtes sans perception découpée et distingue les hôtes smoke actuels. Aucune assertion
  ni fixture de ce cas n'est changée. Le même test ciblé reste vert (1/1).
- Précision supplémentaire du banc de composition : une promesse atteste la réception du premier
  résultat visuel avant la seconde ingestion ; le comptage des visions ne dépend donc plus de
  l'ordre de fin des lectures disque. Les vraies réponses simulées et toutes les assertions
  sont conservées. `node --test tests/session-providers.test.cjs` vert (10/10).
  Ces corrections portent sur le commentaire et l'ordonnancement du banc ; aucun nouveau
  comportement applicatif n'est introduit et aucun test ne compare du texte de code source.
- Après correction, `node scripts/check.mjs --changed` vert : 135/135 tests JS sur sept fichiers,
  règles, format, lint, gel et cliquet verts. Le diff de `docs/domaine.md`, index compris, reste vide.
- Nouveau contrôle complet `node scripts/check.mjs` vert après correction : 1930/1930 tests JS
  sur 126 fichiers en séquentiel, 22/22 tests Python ; tous les contrôles statiques verts.
  Sortie `.harness-state/tickets/T193/correction-check-full.log`. Les deux constats sont traités ;
  nouveau verdict `TERMINÉ` enregistré pour la relecture de correction. Aucun commit ni push.
