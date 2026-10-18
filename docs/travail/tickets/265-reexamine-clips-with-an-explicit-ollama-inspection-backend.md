---
id: T265
titre: Reexamine clips with an explicit Ollama inspection backend
statut: termine
bloque_par: T255, T270
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le réexamen d'un clip peut utiliser le modèle vision local, indépendamment du backend des
questions et de la perception de fond. L'expérimentateur retrouve le backend effectif, les
preuves et les limites du réexamen dans les diagnostics. Une session Codex, un commit, avant GX10.

## Sources

- Décision du propriétaire du 17/10 au soir : réexamen local avant le GX10, derrière le port actuel.
- Code relu à `4599eea` : `runtime/session-providers.cjs:86-95` choisit un modèle simulé
  lorsque `localInspection` vaut vrai, sinon Codex. `:97-106` compose le vrai inspecteur
  et les planches `sheets-diverse` hors smoke ; `:111-115` place la révocation autour du cache.
  Le drapeau `localInspection` n'est donc pas un backend Ollama.
- `adapters/clip-inspector.cjs:12-58` extrait les images, conserve la portée des paroles,
  prépare les planches et appelle `model.inspect`. `adapters/inspection-strategies.cjs:31-62`
  prépare ces planches sans changer les règles du réexamen.
- `adapters/codex-perception.cjs:230-311` fournit déjà prompt, transcription et schéma
  d'inspection via un agent injectable ; `:267-271` envoie des images et `:305-311`
  conserve l'intervalle propre des paroles. Pas d'inférence sur vidéo native à ajouter.
- `adapters/local-vlm-agent.cjs:15-71` satisfait ce contrat d'agent ; T255 complète ses
  métriques. `core/video-tools.cjs:209-248` borne l'inspection, ses baux et ses preuves.
  `runtime/session-lifecycle.cjs:66-76` ferme séparément perception et modèle d'inspection.
- `tests/session-providers.test.cjs:157-204` caractérise smoke/live/localInspection ;
  `tests/local-vlm-agent.test.cjs:180-200` traverse déjà le rôle de perception et le faux Ollama.
  `tests/reinspection-transcript-reuse.test.cjs:43-56` fournit un faux décodeur.
- ADR 0004, 0019, 0029 et 0030 ; `docs/domaine.md:266-289` distingue rôle et plateforme.
  T263 livre les questions avec leurs outils ; il ne choisit pas ce modèle.
  T240 possède l'accès exclusif et la libération des questions, T250/T234–T245/T253 leur cycle.

## Périmètre

- À modifier : `runtime/session-providers.cjs`, `adapters/config.cjs`, propagation
  diagnostique dans le rôle d'inspection, `ClipInspector` et `VideoTools` si nécessaire,
  leurs tests ; créer `tests/local-inspection.test.cjs`.
  La sélection reste dans `createSessionInspection` (`runtime/session-providers.cjs:69-116`),
  à côté de celle de la perception ; `CodexPerception` et `LocalVlmAgent` suffisent.
  Réutiliser l'agent existant sans le déplacer ni recopier son transport.
- Ajouter `TVLENS_INSPECTION_BACKEND=codex|local` → `config.inspectionBackend`.
  La voie locale reçoit `config.localVlm`, déjà configuré par `TVLENS_LOCAL_VLM_*` :
  c'est le même choix de modèle vision pour cette première tranche, avec une instance distincte
  possédée par l'inspection. Le backend de perception reste sélectionnable indépendamment.
- Conserver le défaut historique Codex et refuser une valeur inconnue ou un local incomplet.
  Le choix local compose la vraie `CodexPerception` avec `LocalVlmAgent`, puis le vrai
  `ClipInspector`, son cache et sa révocation. Ni le nom historique du rôle ni
  `selectedModels.inspectionModel` Codex ne deviennent l'identité du modèle réellement appelé.
  L'inspection locale garde la limite de 45 s de `LocalVlmAgent` ; son dépassement est consigné
  comme tel (`adapters/local-vlm-agent.cjs:15`, `runtime/session-providers.cjs:118-128`).
- Conserver les modes de test existants : `localInspection` continue à désigner une
  simulation explicitement identifiée, jamais une preuve Ollama. La combinaison demandant
  simultanément simulation et mesure locale est refusée comme mesure réelle, sans en changer
  silencieusement le sens. Aucun repli Codex après panne du modèle local.
- Préserver stratégie de planches, images et paroles séparées, réutilisation des transcriptions,
  option `exactSpeech`, validation des observations, cache et révocation avant lecture du cache.
  Dans le cache, un changement de backend/modèle ne réutilise pas un résultat d'inspection
  d'une autre identité ; une observation réutilisée d'une question antérieure garde l'identité
  de son réexamen d'origine (`core/deep-ask.cjs:177`).
  Une erreur de transcription reste une limite, jamais une preuve de paroles.
- Transmettre rôle/backend/modèle effectifs et métriques disponibles T255 jusqu'au diagnostic
  d'appel `inspect_clip`, aux traces et aux rapports T259/T261. Un résultat en cache porte
  son identité d'origine et `cacheHit` ; il ne représente pas un nouvel appel au modèle.
  Le contrat `detail`, réservé aux compteurs (`core/video-tools.cjs:181`), s'étend à l'identité
  diagnostique de l'adaptateur, sans texte produit par le modèle.
  Une inspection non sollicitée est marquée non exercée ; la configuration seule ne la valide pas.
- Hors périmètre : modèle des questions T263, embeddings T264, surveillance T266, délais,
  limites de réexamen, concurrence de T240, retenue vision de T227, migrations de Mémoire
  T220/T224–T226, causes quota de T232 et affichage T252. Les phases déplacent les fichiers existants.
- Aucun essai réel dans la session Codex : faux Ollama, ffmpeg/Whisper doublés et fichiers
  temporaires. Modèle local, TV, VPS et fournisseurs restent à l'orchestrateur/propriétaire, hors boucle.

## Critères d'acceptation

1. Par la composition réelle et `VideoTools.call('inspect_clip', ...)`, une inspection
   sur médias temporaires traverse planches → rôle `inspect` → faux Ollama et fournit
   une observation admissible avec l'identité locale. Aucun agent ou client du backend Codex
   n'est construit ; la classe de rôle historique `CodexPerception` reste réutilisable.
2. Une seconde inspection identique utilise le cache avec la même provenance ; une révocation
   refuse aussi ce cas sans appel au modèle. Une réponse livrée après révocation/annulation
   n'est ni conservée ni rendue comme preuve ; les baux restent détenus jusqu'à la fin réelle.
   Un changement d'identité ne réutilise pas l'ancien cache ; une observation admise d'une
   question précédente conserve l'identité de son réexamen d'origine.
3. Les bornes de 20 s, quatre passages, deux inspections et l'ancrage restent celles des
   vrais outils. Les paroles d'un passage entier ne deviennent pas une citation sur un extrait
   plus court ; une transcription échouée ne fournit aucune preuve de paroles.
4. Local, Codex explicite, smoke et `localInspection` sont distingués par les tests de
   composition. Backend invalide, configuration locale manquante, refus HTTP et JSON invalide
   ne provoquent aucun repli. Les priorités fichier/cache/environnement sont couvertes.
   Le dépassement de la limite locale de 45 s est consigné comme tel avec un temps maîtrisé.
5. Traces et métriques conservent l'identité réelle et les mesures T255, y compris échec,
   cache ou absence d'appel. Un champ backend fourni par le JSON modèle ne les remplace pas ;
   aucun jeton ni contenu média ne part dans ces diagnostics.
6. À l'implémentation future, jouer en séquentiel `local-inspection`, `session-providers`,
   `local-vlm-agent`, `revocable-inspector`, `reinspection-transcript-reuse`,
   `inspection-strategies`, `portable-config` et `review-regressions` sous `tests/` (`.test.cjs`), puis
   `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/local-inspection.test.cjs` sur le modèle du faux serveur de
`tests/local-vlm-agent.test.cjs`, avec médias temporaires et faux décodeur. Garder réels
le rôle d'inspection, la stratégie, le cache, la révocation et les outils ; contrôler Whisper.
Retenir la réponse du serveur jusqu'après abandon pour observer refus, bail et absence de cache tardif.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T255 est requis pour transmettre ses métriques sans les redéfinir. La réutilisation du modèle
de `config.localVlm` est un choix technique de cette tranche, pas une preuve de sa qualité sur
les planches. Le nombre d'images effectivement accepté et la qualité du modèle réel restent
à vérifier hors boucle. La voie actuelle sait envoyer les planches ; aucune compatibilité réelle
Ollama n'est déduite des seuls tests. T263 n'est pas nécessaire pour exercer le port d'inspection.

## Journal

- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T270.

- 18/10, Codex : exploration de la composition, du rôle, des outils, du cache et des métriques T255.
  État et périmètre consignés dans `.harness-state/tickets/T265/exploration.md` et `ecarts.md`.
  Aucun essai réel, aucun sous-agent ; les dossiers non suivis préexistants sont préservés.

- 18/10, Codex : sélection indépendante `inspectionBackend`, défaut Codex, configuration locale validée,
  refus des mélanges simulation/mesure locale. Tests rouges observés dans `selection-red.log`, puis
  `node --test --test-concurrency=1 tests/local-inspection.test.cjs tests/portable-config.test.cjs tests/session-providers.test.cjs`
  : 28 réussites (`selection-green.log`).
- 18/10, Codex : chaîne réelle planches → rôle inspect → faux Ollama → outils, provenance conservée,
  cache par identité et révocation. Rouge puis vert dans `inspection-*.log` ; erreurs HTTP/JSON et
  délai local de 45 s piloté dans `failures-*.log`. Réponses retenues après annulation/révocation :
  aucun cache ni preuve tardive, bail détenu jusqu'au retour effectif.
- 18/10, Codex : propagation vers métriques et traces des questions ; réutilisation d'une observation
  antérieure avec son identité d'origine. Rouge puis vert dans `questions-*.log` et
  `late-metrics-*.log` pour les métriques d'une inspection finissant après annulation.
  Les mesures numériques T255 restent disponibles même si le contenu JSON modèle est invalide
  (`invalid-content-*.log`) ; aucun champ textuel inattendu ne passe dans les métriques (`diagnostic-*.log`).
- 18/10, Codex : première exécution séquentielle des huit suites demandées : 98 tests réussis
  (`targeted.log`). `node scripts/check.mjs --changed` a signalé une méthode trop longue,
  corrigée par extraction, puis une suppression devenue inutile ; élagage par
  `node_modules/.bin/eslint --prune-suppressions` sur les modules modifiés : compteur de complexité
  de `core/deep-ask.cjs` réduit de 3 à 2. Contrôle `--changed` ensuite vert, 53 tests réussis.
  Une dernière passe ciblée et le contrôle complet suivent les derniers ajouts de diagnostics.
- 18/10, Codex : passe ciblée finale en séquentiel sur les huit fichiers : 101/101 réussites
  (`targeted-final.log`). Premier `node scripts/check.mjs` : règles, format, lint, gel et cliquet verts,
  2 727/2 728 tests JavaScript réussis ; seul échec : contrat exhaustif de configuration dans
  `media-asr-options`, qui n'attendait pas encore `inspectionBackend: 'codex'`. Les 47 tests Python passent.
  Échec reproduit sur assertion (`config-contract-red.log`), ajout du nouveau défaut à l'attendu sans
  retirer d'assertion, puis `node --test tests/media-asr-options.test.cjs` : 8/8 réussites
  (`config-contract-green.log`). Contrôles `--changed` et complet relancés après cette correction.
- 18/10, Codex : contrôles finaux verts : `node scripts/check.mjs --changed` (63/63 tests,
  5 fichiers modifiés), puis `node scripts/check.mjs` (2 728/2 728 tests JavaScript, 148 fichiers
  en séquentiel ; 47 tests Python). Règles, format, lint, gel et cliquet validés ; sorties conservées
  dans `check-changed.log` et `check-full.log` du dossier d'état. `git diff --check` : succès.
  Contrat disponible pour T259/T261 : `inspector.identity`, `metrics.inspection`,
  `metrics.tools[].inspection`, traces `job.finished` et `inspection.settled` ; un cache conserve
  les mesures originales avec `cacheHit: true` et `modelCalled: false`, l'absence d'appel reste
  `exercised: false`. Verdict `TERMINÉ`, sans réserve. Aucun essai réel, commit ni push ;
  relecture et intégration laissées à la boucle.
- 18/10, Codex : reprise après `relecture-1.md`, lecture du rapport, du journal, des écarts et du diff.
  Les trois mineurs sont acceptés : résumé diagnostique cumulatif, provenance réservée aux preuves
  conservées, absence d'émission à la libération. Corrections prévues consignées dans `ecarts.md` ;
  aucun nouveau périmètre ni ADR. Reproduction par les frontières publiques avant chaque correction.
- 18/10, Codex, correction de relecture :
  `node --test --test-name-pattern='question inspection summary retains' tests/local-inspection.test.cjs`
  : quatre assertions rouges puis quatre tests verts (`correction-summary-*.log`). Résumé de question
  avec indicateurs acquis, mesures antérieures conservées, refus limités au détail de leur appel.
  Un succès après échec remplace aussi l'ancienne issue sans effacer les indicateurs
  (`summary keeps the latest outcome`, rouge puis vert dans `correction-outcome-*.log`).
- 18/10, Codex, correction de relecture :
  `node --test --test-name-pattern='real tools send contact sheets' tests/local-inspection.test.cjs`
  : assertion rouge sur la provenance exposée, puis test vert et réutilisation interquestions verte
  (`correction-output-*.log`). Les preuves internes gardent l'identité d'origine ; les observations
  rendues à l'agent, y compris en cache, n'exposent plus `inspection` ni l'adresse du serveur.
- 18/10, Codex, correction de relecture :
  `node --test --test-name-pattern='settling after question cancellation' tests/local-inspection.test.cjs`
  : assertion rouge (6 publications au lieu de 5), puis test vert après retrait de l'émission
  (`correction-settlement-*.log`). Mesures tardives et trace conservées, résultat annulé et bail
  inchangés ; aucune publication supplémentaire à la libération (ADR 0004 §7).
- 18/10, Codex, correction de relecture : suites demandées par
  `node --test --test-concurrency=1 tests/local-inspection.test.cjs tests/session-providers.test.cjs tests/local-vlm-agent.test.cjs tests/revocable-inspector.test.cjs tests/reinspection-transcript-reuse.test.cjs tests/inspection-strategies.test.cjs tests/portable-config.test.cjs tests/review-regressions.test.cjs`
  : 106/106 réussites (`correction-targeted.log`). `node scripts/check.mjs --changed` : vert,
  68/68 tests, règles/format/lint/gel/cliquet validés (`correction-check-changed.log`).
  `node scripts/check.mjs` lancé en entier, résultat attendu avant le nouveau verdict.
- 18/10, Codex, correction de relecture : `node scripts/check.mjs` complet vert :
  2 733/2 733 tests JavaScript (148 fichiers en séquentiel), 47 tests Python réussis ; règles,
  format, lint, gel et cliquet validés (`correction-check-full.log`). `git diff --check` : succès.
  Les trois constats mineurs sont corrigés, sans contestation ni nouvelle réserve propre.
  Nouveau verdict `TERMINÉ` écrit dans le dossier d'état. Aucun essai réel, sous-agent, commit ou push ;
  relecture de correction et intégration laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T265/relecture-2.md : 1. `runtime/state-views.cjs:79-82` (`lightJob`) : hors périmètre (réserve maintenue)

  - **Problème :** c'est le constat 4 de la relecture 1. La correction ne touche pas ce fichier. Les vues légères (TV, chat, panneau) retirent `tools` et `evidence` des métriques, mais laissent encore passer `metrics.inspection`, qui contient l'identité avec `host`.
  - **Bonne nouvelle :** les observations de `result` sont réduites à `{ id, startMs, endMs }` (`:86-88`). La provenance que la correction place sur les preuves conservées ne part donc pas vers ces clients.
  - **Attendu :** réserve à reporter. Il faut décider si ce diagnostic doit quitter les vues légères, dans un ticket qui a ce fichier dans son périmètre.
- .harness-state/tickets/T265/relecture-2.md : **Écart accepté, paragraphe 1 de `ecarts.md`** (décorateur de diagnostic, rappel dans le rôle et `LocalVlmAgent`, exposition dans `DeepAsk`) : décision de la relecture 1 maintenue. L'émission à la libération, qui n'était pas couverte par cet écart, est retirée.
- .harness-state/tickets/T265/relecture-2.md : **Écart accepté, paragraphe 2** (`tests/media-asr-options.test.cjs`) : décision maintenue, puisque la comparaison exhaustive est complétée sans retrait.
