# Fiche de chantier — Un cœur aux responsabilités séparées (lot L12)

Vague 2. Constats : CORE-03, CORE-06, CORE-07, CORE-08, CORE-09, CORE-12, CORE-13, CORE-14, CORE-15, CORE-16,
CORE-18, CORE-20, CORE-21, plus le signalement OUBLI-08. Code lu à la version `0d5a954`. Les numéros de ligne
bougeront au formatage (jalon `jalon:format`) : chaque emplacement est donné par son nom d'abord.

Les tickets de ce lot citent cette fiche sous le chemin `docs/travail/fiches/coeur.md`.

## 1. Ce qui ne va pas, en une phrase par zone

- `runtime/session-runtime.cjs`, `createSessionRuntime` (lignes 48-568) : composition, doublures de test,
  révocation par monkey-patch de `inspector.inspect` (214-232), chiffres de stockage (283-309), manifeste
  (`recordManifest`, 337-382) et fin de session dans une seule fonction (CORE-03).
- `core/session.cjs`, `WatchSession` : une dizaine de drapeaux sans transitions nommées, écrits depuis
  l'extérieur (`runtime/session-closing.cjs`, `closeSession`, ligne 73 ; `runtime/session-runtime.cjs`,
  `close`, lignes 489, 492, 495 ; `app/main.cjs`, `onChange`, ligne 167 ; `runtime/headless-runtime.cjs`,
  `onChange`, lignes 290-300) (CORE-06).
- `core/surveillance.cjs` (921 lignes) : déduplication, validation des détections, verdicts, rédaction,
  ordonnancement, registre, projections et restauration dans un fichier (CORE-07).
- `snapshot()` sert à la fois d'état publié, de format disque et de contrat réseau (CORE-08).
- `core/ports.cjs` ne décrit pas les ports réellement utilisés (CORE-09).
- `runtime/surveillance-runtime.cjs`, `createSurveillanceRuntime` : quinze variables de fermeture (CORE-12).
- `core/deep-ask.cjs`, `DeepAsk.run` (77-158) : la règle « réponse valide ou non » tient dans une ligne
  de 697 caractères (133) et les minuteries sont globales (81, 87) (CORE-13).
- `core/video-tools.cjs`, `VideoTools.invoke` : dispatch par `if`, limites répétées en prose (CORE-14).
- Rédaction française stockée dans les données de surveillance (CORE-15).
- Vocabulaire et utilitaires recopiés (CORE-16), constantes dispersées (CORE-18), publication par
  snapshot complet (CORE-20), nommage ambigu (CORE-21), fonctions au-delà des seuils (OUBLI-08).

## 2. Forme cible

### Règle de placement

`core/` reste **à plat**. Une responsabilité extraite d'un agrégat devient un fichier
`core/<agrégat>-<responsabilité>.cjs` (par exemple `core/surveillance-text.cjs`), jamais un sous-dossier.
Raison : `tests/architecture.test.cjs`, test « portable core has no Electron, provider, platform or adapter
imports », fait `readdirSync` puis `readFileSync` sur chaque entrée de `core/` (EISDIR sur un dossier) et
refuse tout `require` contenant `..`. Un sous-dossier imposerait de changer la garde et d'autoriser `..`.
Si le lot L02 rend cette garde récursive, la règle à plat reste valable : elle ne dépend pas de lui.

Le point d'entrée d'un agrégat garde son nom et ses exports : `core/surveillance.cjs` reste importé par
`runtime/headless-runtime.cjs` (ligne 5), `runtime/surveillance-runtime.cjs` (ligne 1),
`scripts/probe-surveillance.cjs` (ligne 13) et deux fichiers de tests ; il réexporte ce qui a été extrait.

### Modules visés

| Module | Responsabilité | Dépend de | Étape |
|---|---|---|---|
| `core/revocable-inspector.cjs` | Décorateur d'inspecteur : `revoke()`, refus avant l'appel, après un rejet et après le résultat ; vide le cache du décoré à chaque refus. Le message est fourni par la composition. | rien | 2 |
| `core/answer-validation.cjs` | Fonctions pures : citations retenues contre les preuves (tolérance de 1 ms, rognage), verdict accepté / refusé et motif du refus (sources ou passages). Aucune rédaction. | rien | 3 |
| `core/session.cjs` (`WatchSession`) | Seul écrivain de ses drapeaux. Méthodes nommées : `beginEnding()`, `closeIntake()`, puis la tenue de la vision par les questions. Plus tard, deux axes lisibles : capture (`capturing`, `paused`, `read-only`) et cycle (`open`, `ending`, `closed`). | `./` | 4, 5, 6 |
| `core/surveillance-text.cjs` | `sentences`, `acceptableText`, `composeLotText`, `composeSignalText` et les motifs URL, Markdown, verdict. | `./passage-text.cjs` au besoin | 7 |
| `core/surveillance-detection.cjs` | `validateDetection`, `locate`, `remark`, `droppedIn`. | `./surveillance-text.cjs` | 7 |
| `core/surveillance-verdicts.cjs` | `sourceKey`, `applyVerdicts`. | rien | 7 |
| `core/surveillance-projection.cjs` | Calcul de `snapshot({ full, brief })` : couverture, retard, libellés, trois formes. | les trois précédents | 7 |
| `core/surveillance.cjs` | Classe `Surveillance` (ordonnancement, registre, restauration) et réexports. | les quatre précédents | 7 |
| `runtime/session-manifest.cjs` | Écriture du manifeste (`recordManifest`), sur le modèle de `runtime/session-closing.cjs`. | `core/` | 8 |
| `runtime/registry-persistence.cjs`, `runtime/registry-adoption.cjs` | Liaison, époque et écriture cadencée ; adoption `idle | reading | overdue | unreadable`, sous la façade `createSurveillanceRuntime`. | `core/` | 10 |
| `core/limits.cjs` | Limites de capture et de question, importées par ceux qui les appliquent. | rien | 13 |

### Sens des dépendances

`app/`, `server/`, `mcp/` → `runtime/` → `core/` ; `adapters/` → `core/` (ports seulement). Dans `core/`, les
fichiers extraits d'un agrégat n'importent jamais leur point d'entrée : `surveillance.cjs` →
`surveillance-*.cjs` → fichiers partagés de `core/`. Aucun cycle. Les hôtes ne touchent plus aux drapeaux
d'une `WatchSession` : ils appellent ses méthodes.

## 3. Séquence étendre / migrer / contracter

Prérequis commun : `jalon:format` pour tout ce qui change du code de production. `core/session.cjs`,
`core/surveillance.cjs`, `core/deep-ask.cjs` et `core/cached-inspector.cjs` sont encore denses.

### Étape 1 — Caractériser les règles pures de la surveillance (ticket T120)

Étendre : un fichier de test plat fixe `validateDetection`, `sourceKey`, `acceptableText` et
`composeSignalText`, exportées et absentes de `tests/` aujourd'hui. Aucun code de production ne change.
Protège l'étape 7.

### Étape 2 — Révocation de l'inspecteur dans `core/` (ticket T121)

Étendre : `core/revocable-inspector.cjs` et son test unitaire. Migrer : `createSessionRuntime` remplace son
monkey-patch (214-232) et l'appel de `close()` (486-487) par le décorateur. Contracter : le monkey-patch
disparaît dans le même ticket (il n'a qu'un appelant).

### Étape 3 — Validation des réponses en fonction pure (ticket T122)

Étendre : `core/answer-validation.cjs` et une table de cas. Migrer : `DeepAsk.run` l'appelle ; la rédaction
des deux refus reste dans `core/deep-ask.cjs` (arbitrage A6). La suppression de `needsInspection` est déjà
prise par le lot L09 : ce lot n'y touche pas.

### Étape 4 — Fin de session nommée sur `WatchSession` (ticket T123)

Étendre : `beginEnding()` (lève `ending` seul) et `closeIntake()` (`asking` puis `accepting`, dans l'ordre
d'aujourd'hui). Migrer : `closeSession` et `close()` du runtime. Contracter : une garde de
`tests/architecture.test.cjs` refuse toute écriture de `ending`, `accepting`, `readOnly` ou `closed` d'une
session par un hôte.

### Étape 5 — Porte des questions (non découpée)

Le lot L11 met en commun la porte `asking` des deux hôtes (`markAsking`, module `runtime/asking-gate.cjs`
dans sa fiche). Une fois cette porte en place, elle appelle une méthode de `WatchSession` au lieu du
setter, et la garde de l'étape 4 couvre aussi `asking`.
Déclencheur : la porte `asking` du lot L11 intégrée, et l'étape 4 intégrée.

### Étape 6 — Les tests et scripts passent par les méthodes (non découpée)

24 affectations dans 6 fichiers de tests (session-latency 12, split-perception 5, architecture-f08 4,
question-ceiling 1, session-timeline 1, timeline-server 1) et `scripts/simulate-stream.cjs` (ligne 312)
écrivent les drapeaux. Migrer chacune vers la méthode qui décrit l'état voulu ; un test qui pose un état
impossible autrement le dit en commentaire. Puis exposer les deux axes (capture, cycle) en lecture.
Déclencheur : étapes 4 et 5 intégrées, renommage des fichiers `architecture-f0x` de la vague 1 fait. Les
deux axes ne sont publiés dans l'état qu'après l'étape 9 (sinon ils partent sur disque).

### Étape 7 — Découpage de `core/surveillance.cjs` (non découpée)

Un ticket par fichier de la table, dans l'ordre texte, détection, verdicts, projection. Le premier ticket
étend la garde de `tests/surveillance.test.cjs` (test qui lit la source de `core/surveillance.cjs` et refuse
`asking|manualBusy|prioritizeManual|deep-ask`, vers la ligne 624) à tous les fichiers
`core/surveillance*.cjs` : sans cela, le découpage affaiblit la garde. Renommer en passant (CORE-21).
Déclencheur : T120 intégré et `jalon:format` posé ; la projection attend aussi l'étape 9 si elle touche la
forme sauvegardée (`snapshot({ full: true })`, lignes 905-907).

### Étape 8 — Reste de `createSessionRuntime` (non découpée)

`recordManifest` vers `runtime/session-manifest.cjs` ; chiffres de `storage()` en fonction pure ; doublures
de test (161-208, 237-270) hors de la fonction. `validateSegment` est déplacée par le lot L11
(`runtime/segment-intake.cjs` dans sa fiche) : ne pas la déplacer ici.
Déclencheur : T121 intégré, et `jalon:archive-reference` posé (le manifeste est une forme sur disque).

### Étape 9 — Forme d'archive distincte de l'état publié (non découpée)

`toArchive()` et `fromArchive()` versionnés par agrégat ; la forme actuelle sans version est lue comme
version 0 (`core/session.cjs`, `restore`, `formerFormat`, ligne 431). Demande une ADR (`adr: oui`).
Déclencheur : `jalon:archive-reference` posé, décision D8 prise, et le ticket du lot L17 sur la version du
registre de surveillance intégré (même mécanisme).

### Étape 10 — `createSurveillanceRuntime` en deux objets (non découpée)

Déclencheur : étape 7 intégrée et aides de test du lot L05 disponibles (`lot:L05`), les tests du registre
dépendant des minuteries.

### Étape 11 — Minuteries injectées dans le cœur (non découpée)

`{ now, setTimer, clearTimer }` dans `DeepAsk` et `LivingRecap` ; `jobMetrics(job)` hors de `run` ; la garde
d'architecture refuse `setTimeout` dans `core/`. Les valeurs par défaut de `core/moment-index.cjs` (ligne 22)
et `core/moment-search.cjs` (ligne 26) doivent d'abord être fournies par la composition.
Déclencheur : aide d'horloge du lot L05 (`lot:L05`) et étape 3 intégrée.

### Étape 12 — Vocabulaire commun (non découpée)

Listes de statuts en constantes, repli d'accents unique, `gapsOf(passages, toleranceMs)`, paires
`sourceKey`/`pageKey`, `ordinal`/`number`, `said`/`closing`. Déclencheur : décisions D1 et D2.

### Étape 13 — `core/limits.cjs` (non découpée)

Déclencheur : décision D3 et les tickets de bornes du lot L08 intégrés (ils fixent les valeurs par des
tests avant le déplacement) ; la validation des blocs attend le module d'ingestion du lot L11.

### Étapes 14 à 17

- Ports en source unique (14) puis `// @ts-check` fichier par fichier : déclencheur, décision D6.
- Registre d'outils vidéo (15) : déclencheur, décision D4.
- Rédaction de la surveillance à la projection (16) : reportée, arbitrage A6.
- Publication par révision (17) : déclencheur, mesure sur le Mac (D5).
- Fonctions au-delà des seuils (OUBLI-08) : déclencheur, `jalon:lint` posé (complexité mesurée par l'outil).

## 4. Invariants à garder

1. **Révocation.** Après `close()` d'un runtime : un appel tardif est refusé avant le cache et avant
   l'inspecteur ; un appel en vol est refusé qu'il réussisse ou échoue ; rien n'est mis en cache après la
   révocation ; le cache est vidé à chaque refus ; le message reste « Session terminée : ses passages ne
   peuvent plus être réexaminés. » ; une archive rouverte inspecte de nouveau.
2. **Champs du runtime.** `runtime.inspector` expose toujours `inner`, `cache`, `hits`, `misses` et
   `inspect` sur les mêmes objets ; les autres champs de l'objet rendu restent (des hôtes et des tests les
   remplacent ou les mutent, par exemple `app/main.cjs` ligne 403).
3. **Fin de session.** `ending` coexiste avec `accepting` : un passage qui arrive pendant la fin est stocké
   et sauvegardé, sans analyse lancée (`tests/session-durable.test.cjs`, test « a passage that lands while
   its session is being ended is kept and saved, but starts no analysis only to have it abandoned »).
   `readOnly` coexiste avec `ending`. `asking`, `storageError`, `saveError` sont orthogonaux. Pas de phase
   exclusive à cinq valeurs.
4. **Publication.** Les nouvelles méthodes ne publient rien de plus que les écritures qu'elles remplacent :
   même nombre d'appels à `onChange`, mêmes champs publiés.
5. **Validation des réponses.** Même tolérance de 1 ms, même rognage, même priorité : sources manquantes
   avant conversationnel ; mêmes deux textes de refus, au mot près.
6. **Surveillance.** Les exports de `core/surveillance.cjs` restent ; le module ne lit jamais le chat (garde
   étendue à chaque fichier extrait).
7. **Formes sur disque.** Aucune étape avant la 9 ne change `session.json`, le registre de surveillance ni
   le manifeste. Les archives existantes restent lisibles.

## 5. Tests qui protègent chaque étape

| Étape | Tests existants (titre ou fichier) | Tests manquants, à écrire dans l'étape |
|---|---|---|
| 1 | `tests/surveillance.test.cjs` (à travers la classe) | Unitaires de `validateDetection`, `sourceKey`, `acceptableText`, `composeSignalText` |
| 2 | Test « a closed session runtime re-examines nothing more… » et « the Mac host revokes the external MCP contexts… » (aujourd'hui dans `tests/architecture-f05.test.cjs`) ; `session-durable`, `session-delete`, `disk-guard`, `mac-ipc-contract` | Unitaire du décorateur, sans session |
| 3 | `chat-sources` (dont « mislabeling a sourced claim as explanation does not bypass rejected-source validation »), `question-ceiling`, `evidence-refresh`, les tests de questions de `architecture-f04` | Table de cas de la validation pure |
| 4 | `session-durable` (test de l'invariant 3), `split-perception`, `session-latency`, `architecture-f08` (« nothing is described again once the session is ending, read-only or closed »), `mac-ipc-contract` | Méthodes de fin seules ; garde d'architecture sur les écritures |
| 5 | Le test Mac de la porte `asking` du lot L11, `server-surveillance` (la surveillance ne lève jamais `asking`) | Aucun en plus |
| 6 | Les six fichiers migrés eux-mêmes | Lecture des deux axes |
| 7 | `surveillance.test`, étape 1, `surveillance-runtime.test`, `server-surveillance` | Garde « ne lit pas le chat » sur chaque fichier |
| 8 | `session-durable`, `session-delete`, `disk-guard`, archive de référence | Unitaire du manifeste |
| 9 | `session-durable` (lit `session.json`), `deep-ask-restore`, `mac-ipc-contract`, `server-state-views` | Lecture d'une archive version 0 |
| 10 | `surveillance-runtime.test`, `server-surveillance` | Transitions de l'adoption |
| 11 | `question-ceiling` (horloge virtuelle de `scripts/simulate-stream.cjs`) | Plafond testé sans l'abaisser |

## 6. Risques

- **Les champs de `runtime.inspector`.** Le test de révocation remplace `live.inspector.inner.inspect` et
  lit `hits` et `cache.size`. Un décorateur qui ne relaie pas ces champs casse ce test ; le modifier pour
  qu'il passe serait l'affaiblir.
- **Ordre de la révocation.** Déplacer un `refuseRevoked` ou le vidage du cache laisse passer un résultat
  tardif dans le cache.
- **Ligne 133 de `core/deep-ask.cjs`.** Extraire peut déplacer la tolérance de 1 ms ou l'ordre des cas
  `external`, `missingSources`, `conversational`.
- **Phase exclusive.** Refuserait un bloc stocké pendant la fin, ou fausserait `visionSkippedAsking` et
  `visionBlockedMs` (le setter `asking` arrête la mesure du temps bloqué).
- **Porte `asking` : deux lots.** Le lot L11 la met en commun dans `runtime/` ; ce lot ne doit pas créer une
  seconde forme. La garde de l'étape 4 exclut donc `asking` jusqu'à l'étape 5. Le Mac draine la session
  chargée au moment du microtask, le serveur la session capturée : différence à garder.
- **Garde d'architecture : deux lots.** Le lot L02 réécrit `tests/architecture.test.cjs` en table de
  couches. La garde de l'étape 4 est un test à part, nommé d'après le comportement, pour survivre à cette
  réécriture.
- **Découpage de la surveillance.** Sans extension de la garde « ne lit pas le chat », un fichier extrait y
  échappe ; un `require('../…')` serait refusé par la garde du cœur.
- **Catch vides.** Le cliquet juge un fichier nouveau contre rien : un `catch {}` déplacé tel quel compte
  comme ajouté.
- **Noms de fichiers de test.** Les fichiers `architecture-f0x`, `review-regressions`, `refactor-boundaries`
  seront renommés en vague 1 : les tickets citent les tests par leur titre.

## 7. Décisions attendues du propriétaire

- **D1.** L'écart entre le trou de capture à 250 ms (`core/video-tools.cjs`, `context` ; `core/living-recap.cjs`
  ligne 67) et le seuil de 1000 ms (`runtime/headless-runtime.cjs`, `captureGapsOf` ;
  `core/session-timeline.cjs` ligne 24 ; `core/perception-context.cjs`) est-il voulu ? Le relecteur note que
  1000 ms est un test d'adjacence de sujets, pas un calcul de trous.
- **D2.** Le repli d'accents de `core/surveillance.cjs` (ligne 80) replie aussi « œ » et « æ ». L'étendre à
  tous change la recherche et le regroupement ; le garder à part laisse deux replis. Lequel ?
- **D3.** `core/limits.cjs` est-il la source des limites aussi pour `app/main.cjs` (`QUESTION_QUEUE_LIMIT`,
  ligne 30), `adapters/remote-media.cjs` (ligne 36) et `mcp/tool-definitions.cjs` (ligne 6) ?
- **D4.** Les descriptions d'outils envoyées au modèle (`core/video-tool-contracts.cjs`) sont-elles générées
  depuis les constantes, au risque d'en changer la formulation, ou gardées à la main avec un test qui
  vérifie qu'elles citent les bonnes valeurs ?
- **D5.** Mesurer la taille publiée et le coût de `persist()` sur le Mac avant toute publication par
  révision (CORE-20).
- **D6.** Installer TypeScript (contrôle de types seulement) pour `// @ts-check` : `installe: oui` et une ADR.
- **D7.** La rédaction française stockée dans la surveillance (CORE-15) reste où elle est (arbitrage A6).
- **D8.** Forme du numéro de version des archives (champ, valeur de la forme actuelle) : ADR à écrire.
