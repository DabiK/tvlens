---
id: T193
titre: Run the smoke-mode perception through the audio and vision lanes the hosts use
statut: a-faire
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
