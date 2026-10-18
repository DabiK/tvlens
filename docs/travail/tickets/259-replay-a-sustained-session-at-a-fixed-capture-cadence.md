---
id: T259
titre: Drive a fixed-cadence capture and question schedule through the headless server
statut: termine
bloque_par: T262, T264, T265, T267, T274
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Une commande prépare G3 : captures et questions suivent un calendrier à origine fixe, sans
attendre le modèle. Chaque envoi et chaque question garde son issue, y compris en fin incomplète.
Cette première part de la tranche E d'Astra tient dans une session et un commit ; T261 livre le bilan.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, E, « Replay a sustained session at a fixed capture cadence »,
  base `beb9589` ; `docs/PRD-V2.md`, section 5, protocole G3 et surcharge séparée.
- Décisions du propriétaire du 17/10 au soir : les trente minutes peuvent venir d'une vidéo
  convertie (T262) ; T263–T265 et T267 livrent les backends locaux des questions, embeddings
  et inspections ainsi que leurs identités effectives.
  La détection locale de surveillance attend la fin de l'expérience (T266).
- Code relu à `4599eea` : `scripts/replay-lg-stream.cjs:109-112` compose vrai runtime et serveur ;
  `:165-182` alimente le flux. Sa vision est doublée (`:89-97`), son chat simulé (`:98-106`) et
  sa composition utilise `smoke: true` (`:110`) : ne pas reprendre cette configuration pour mesurer.
- `adapters/remote-media.cjs:20-42` valide les blocs HTTP ; `adapters/local-store.cjs:55` conserve
  les médias Mac avec leurs data URL, produits par `app/recording.js:71-76` ;
  `core/frame-policy.mjs:2` permet six images, contre cinq au maximum par bloc HTTP.
- `tv/transport.py:50-98` fixe la politique de livraison à reproduire. Le rejeu LG ne la couvre
  pas entièrement : `scripts/replay-lg-stream.cjs:180` abandonne sur 408 ou 5xx au lieu de réessayer.
- `server/ingest-routes.cjs:34` refuse une préparation concurrente ; `:41` attend assemblage et
  ingestion. `server/question-routes.cjs:4` expose la soumission, `:7-8` l'annulation des questions.
  `runtime/headless-runtime.cjs:237` publie les états ; `:415` soumet une question avec son ancrage.
- `server/ingest-routes.cjs:12-13` refuse un bloc trop futur ; `:22-33` déduplique par session,
  séquence et contenu. `core/session.cjs:153-156` refuse le retour à un intervalle antérieur :
  boucler un corpus demande de nouveaux temps et séquences, pas de renvoyer ses anciens blocs.
- `runtime/session-providers.cjs:148-161` choisit perception injectée, simulée ou réelle ;
  l'agent local est composé en `:158-159`. `adapters/local-vlm-agent.cjs:71` annonce le backend
  `ollama` ; `adapters/codex-session-run.cjs:130-138` ne fournit pas de champ backend équivalent.
- `runtime/conversation-runtime.cjs:37-45` compose encore les questions Codex ;
  `runtime/session-providers.cjs:86-95` choisit inspection Codex ou simulée, et `:172-184`
  garde l'identité OpenRouter même avec embeddings injectés. T263–T265 et T267 livrent les sélections
  et identités effectives à utiliser ici ; le runner ne les réimplémente pas.
- Coutures d'horloge existantes : `readClock` et `wallClock` (`runtime/session-runtime.cjs:68-69`,
  `runtime/headless-runtime.cjs:90`). T223 a retiré le balayage temporel (ADR 0055) ;
  La mesure précède la phase Mémoire (T224 à T227) : elle lit les contrats actuels, sans les anticiper.
- `runtime/session-runtime.cjs:251-254` expose les refus de libération de fournisseurs,
  distincts du refus d'archive : une sauvegarde confirmée ne prouve pas une libération complète.
- Tests de raccord : `tests/server-ingest-path.test.cjs`, `tests/server-state-views.test.cjs`,
  `tests/question-ceiling.test.cjs`, `tests/capture-intake.test.cjs`. ADR 0023, 0028, 0046, 0050, 0051 et 0054.

## Périmètre

- À créer : `scripts/replay-local-stream.cjs` et `tests/local-stream-replay.test.cjs` ; réutiliser
  les identités d'entrées, empreintes et sorties de T257. Lire les frontières publiques actuelles
  (HTTP du serveur headless, ingestion, questions), jamais les collections privées que T220/T226 migreront.
- Composer vrai runtime headless, ingestion et questions par leurs frontières publiques, perception
  de production ; les fournisseurs et le temps restent injectables pour les tests. Doubler aussi
  transcription, chat, inspection, surveillance et embeddings : aucun rôle auxiliaire réel en test.
  Garder l'identité réelle de chaque rôle, y compris injection, simulation et rôle non exercé.
- Backend de perception explicite, `local` ou `codex`, consigné. L'exécution `codex` fournit la référence G3,
  jamais présentée comme locale. Aide et validation ne construisent aucun agent ; les tests
  n'utilisent que de faux serveurs Ollama et des agents/fournisseurs distants doublés.
- Le scénario choisit aussi explicitement les backends des questions (`config.questionsBackend`),
  embeddings (`config.embeddingsBackend`) et inspection (`config.inspectionBackend`) livrés
  par T263–T265, avec l'identité des questions transmise par T267.
  Consigner choix et identité effective avant envoi, puis rôle réellement appelé
  dans chaque issue. Un choix local n'autorise aucun repli Codex/OpenRouter ; un rôle absent,
  désactivé, simulé ou non sollicité ne devient pas une mesure locale. Les limites web des questions
  locales de T263 sont déclarées. La surveillance reste distante si activée, sinon non exercée.
- Ne pas reprendre `smoke: true`. Une exécution déclarée `local` sans `metrics.backend`
  identifiant Ollama est refusée comme mesure locale ; la référence `codex` explicite reste admise
  sans ce champ. Ne pas déduire une mesure locale de la seule option de lancement.
  Vérifier aussi l'identité effective des questions locales ; celles des embeddings et de
  l'inspection sont relevées et jugées par T261.
- Le scénario nomme un index des blocs préparé par l'orchestrateur ou la source vidéo T262,
  compatible avec `/v1/segments` : 10 s au plus,
  une à cinq images en base64 sans préfixe, audio de 2 100 000 octets décodés au plus
  (`adapters/remote-media.cjs:20-42`). La validation refuse avant exécution tout bloc hors de
  ces bornes, dont un passage Mac à six images. La provenance des trente minutes (enregistrement
  fourni par le propriétaire, vidéo convertie par T262, ou corpus T257 rejoué en boucle et déclaré comme tel) est un
  paramètre consigné dans le rapport. Les autres bornes du validateur produit restent applicables.
  Les exemples montrent la préparation depuis les médias T257 : retrait du préfixe d'encodage
  et sélection déclarée d'au plus cinq prises originales, sans modifier les sources ni inventer
  d'image. Le runner ne réduit pas silencieusement un bloc de six images.
- Une vidéo T262 est convertie avant le calendrier d'envoi. Le rapport conserve son empreinte,
  ses paramètres, sa durée réellement utilisée et sa provenance « vidéo convertie » ; une vidéo
  plus courte ne devient pas trente minutes de contenu inédit. Une vraie session TV reste le
  témoin de fidélité, car cette source ne mesure pas la capture LG ni ses pertes avant livraison.
- Définir dans le scénario les temps relatifs des blocs et images. À chaque occurrence d'un corpus
  bouclé, les translater sur l'horloge de la session et attribuer une nouvelle séquence croissante ;
  conserver cas source, occurrence et empreintes. L'envoi commence à la clôture prévue du bloc.
  Seuls les réessais gardent exactement séquence, horodatages et corps sérialisé de cette occurrence.
- Programmer les arrivées selon les échéances du scénario depuis une origine fixe, indépendamment
  des promesses d'upload, d'analyse et de réponse. Consigner échéance prévue, soumission effective
  et accusé/refus ; ne pas réduire la charge en attendant les réponses.
- Chaque envoi suit `tv/transport.py:50-98` : `/v1/session` puis `/v1/segments`, 5 s au plus
  par requête, budget de 30 s par bloc, nouvel essai après 1 s sur 408, 429, 5xx ou coupure,
  même séquence. Ce budget part de la disponibilité du bloc, sans remise à zéro au réessai.
  Conserver le bornage au budget restant, dont le plancher de requête de 100 ms
  et le dernier repos raccourci ; aucun nouvel essai après expiration. Conserver les refus terminaux
  de stockage, lecture seule ou session changée de ce transport, arrêter les envois futurs et les
  marquer non envoyés. Chaque tentative et son code sont consignés ; l'issue finale est « accepté »,
  « refusé (code) » ou « expiré ». Un arrêt garde explicitement les envois non terminés.
- Fournir un scénario nominal de trente minutes, questions réparties et rafale de trois, et un
  scénario de surcharge distinct. Les douze questions du PRD sont un plan exploratoire ; conserver
  un actif, cinq attentes et les refus existants, sans nouveau parallélisme de chat.
- Livrer aide et validation de scénario sans fournisseur ; exécution réelle sur option explicite,
  répertoire de données propre et sorties conservées. Une attente finale bornée appartient au runner,
  pas aux délais produit ; son dépassement marque la campagne incomplète.
- Limiter ce ticket au runner, au calendrier et aux issues d'envoi/question. Le journal des
  révisions, les publications audio/vision, les pertes, les échantillons de retard et le calcul
  de couverture sur toute la campagne sont livrés par T261, qui étend ce même runner.
- À ne pas toucher : politiques de files/recherche, plafonds, délais produit, rétention ou définition
  des pertes. `scripts/simulate-stream.cjs` garde son rôle virtuel ; le rejeu LG existant reste distinct.
- Aucun essai réel dans la session Codex : modèle local, TV, VPS et fournisseurs restent à
  l'orchestrateur ou au propriétaire. La télémétrie GPU et les trente minutes réelles sont collectées hors boucle.

## Critères d'acceptation

1. Avec horloge et fournisseurs maîtrisés, retenir une analyse n'arrête ni captures ni questions.
   Le test avance le calendrier sans rendre la réponse ; chaque envoi prévu devient accepté,
   refusé avec son code, expiré, ou explicitement non terminé après arrêt, sans disparition ni
   rattrapage silencieux. Les réessais suivent le transport TV : session puis bloc, même séquence,
   budgets de 5 s/30 s et attente de 1 s, bornés comme ci-dessus ; 408, 429, 5xx et coupures sont exercés.
   Les refus terminaux arrêtent les nouveaux envois et les rendent visibles comme non envoyés.
2. Le scénario nominal contient questions réparties et rafale ; le surplus au-delà de la capacité
   est exercé séparément et reçoit le refus produit. Les ancrages sont ceux des soumissions,
   sans futur ajouté pour compenser un retard. Aide et validation ne lancent aucun fournisseur.
3. La validation refuse avant exécution un intervalle hors bornes, une data URL, six images,
   un audio trop volumineux ou toute autre violation du contrat HTTP. Les exemples documentent
   enregistrement de trente minutes, vidéo convertie et corpus bouclé déclaré.
   Les blocs produits par T262 (corps du fil `/v1/segments`, base64 sans préfixe) passent
   cette validation sans deuxième conversion. La référence `codex` et
   les gardes des backends de perception et de questions locales sont vérifiées avec des doubles.
   Une panne des questions locales ne lance ni Codex ni OpenRouter ; la combinaison de rôles
   réellement exercée reste lisible.
   Deux occurrences du même cas sont acceptées avec des intervalles et séquences distincts ;
   un réessai de la même occurrence est reconnu comme doublon, avec un corps identique.
4. Un test retient le transport, annule une question puis livre une réponse tardive : celle-ci
   ne devient pas une réussite. Une fin en délai dépassé conserve journal et sorties précédentes
   avec statut « incomplet » et attentes restantes. Une fermeture de fournisseur refusée conserve
   son diagnostic, séparé de la confirmation d'archive.
5. Le rapport conserve SHA, empreintes, paramètres, rôles et backends réellement utilisés,
   issue de chaque envoi et de chaque question avec backend des questions, intervalle total
   planifié, provenance des trente minutes et origine des horloges.
   Chaque tentative reste identifiable ; une campagne interrompue garde les sorties précédentes
   et ses attentes restantes. Les refus de fermeture/libération sont consignés séparément,
   même si une archive a été confirmée ; une libération non confirmée ne devient pas un succès.
6. À l'implémentation future, jouer en séquentiel `local-stream-replay`, `local-perception-replay`,
   `server-ingest-path` et `question-ceiling` sous `tests/` (`.test.cjs`), les contrats de
   projection/coordination affectés, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/local-stream-replay.test.cjs` avec scénario accéléré déterministe, vraie composition
headless/HTTP, fichiers temporaires et faux Ollama/chat/transcription. Conduire les échéances
avec horloge injectée et promesses retenues ; observer requêtes, réessais et fichiers produits.
Ajouter l'agent Codex doublé pour la référence. Le test prouve le calendrier et les issues,
jamais le débit matériel G3 ; T261 étendra ce fichier pour les mesures de campagne.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les dépendances directes minimales sont T262, T264, T265, T267 et le contrôle T274 (copie A taguée).
T262 apporte T257, qui apporte T255 ; T264 et T267 apportent T263.
T263–T265 et T267 apportent les trois sélections locales et leurs identités. T219 et la recette T233 sont terminés ;
la phase Mémoire (T224 à T227) vient après la copie B. T232/T252 aident à lire les pertes
de quota sans bloquer ce runner ; un refus inconnu ne devient pas un quota. T240 n'est pas requis.

Décision du propriétaire du 17/10 : préparation avant la phase 2 retenue par T254, copie après T261 (décision du 18/10, qui remplace « après T227 »),
répétition Mac avant accès et `hackathon-rc` en repli. Son corpus français réel est préparé au format
T257 avec grille T258 par l'orchestrateur. Seule une exécution réelle complète de trente minutes,
avec le bilan T261, hors session Codex, pourra établir G3. Un test accéléré laisse la stabilité
longue non testée ; un corpus bouclé mesure cette charge répétée, pas trente minutes de contenu inédit.
La vidéo convertie répond au besoin de source continue, sans remplacer le témoin réel de capture TV.

## Journal
- 18/10, orchestrateur : contrôle T273, un discours anglais transcrit avec la langue française par défaut est
  inutilisable. Chaque extrait d'un scénario déclare sa langue de transcription (`fr` ou `en`), réglée sur la session
  par `/v1/settings/transcription` avant son premier bloc et consignée dans le rapport ; `auto` seulement si déclaré.
- 18/10, propriétaire, sur l'avis d'Astra : G3 se mesure avant la phase Mémoire (T224 à T227), contre les
  frontières publiques actuelles, pour obtenir une référence de trente minutes avant toute contraction.
- 18/10, Codex : exploration des frontières publiques et du transport TV terminée ; état initial et
  découpage prévus consignés dans `.harness-state/tickets/T259/{exploration,ecarts}.md`.
  Aucun essai réel ni fournisseur lancé ; implémentation et preuves déterministes à suivre.
- 18/10, Codex : runner `scripts/replay-local-stream.cjs` livré avec validation sans fournisseur,
  calendrier à origine fixe, transport TV borné, issues conservées, gardes d'identités et langues,
  scénarios nominal de trente minutes/surcharge et documentation `scripts/local-stream-replay.md`.
  Les rouges/verts et incidents de doublures sont conservés dans le dossier d'état.
  `node scripts/check.mjs --changed` : vert, 29 tests du runner réussis ; aucun essai réel lancé.
- 18/10, Codex : suites demandées et contrats d'ingestion, projection et fermeture joués en
  séquentiel : `node --test --test-concurrency=1 tests/local-stream-replay.test.cjs tests/local-perception-replay.test.cjs
  tests/server-ingest-path.test.cjs tests/question-ceiling.test.cjs tests/server-state-views.test.cjs tests/memory-projection.test.cjs
  tests/headless-session-lifecycle.test.cjs tests/session-lifecycle.test.cjs tests/capture-intake.test.cjs` : 128 tests réussis.
  `node scripts/check.mjs` : vert, 2 869 tests JavaScript et 47 tests Python réussis.
  Verdict `TERMINÉ` consigné pour la relecture de la boucle ; aucun commit, push ou essai réel.
- 18/10, Codex, reprise après relecture 1 : les sept constats mineurs sont acceptés.
  Exploration et plan de correction consignés dans le dossier d'état ; aucun nouvel écart de
  périmètre prévu. Reprise du travail présent dans l'arbre, tests d'abord, sans commit ni push.
- 18/10, Codex : gardes corrigées sans perdre appels ni résultats produit ; rouges puis verts de
  `node --test --test-name-pattern='local measurement rejects|a transcription language mismatch' tests/local-stream-replay.test.cjs`
  (2 échecs d'assertion puis 2 réussites). Empreinte fabriquée retirée, octets PNG seuls conservés :
  rouge de `node --test --test-name-pattern='raw HTTP frames fingerprint' tests/local-stream-replay.test.cjs`,
  puis 2 réussites avec `--test-name-pattern='raw HTTP frames fingerprint|a declared selection from perception media'`.
  Sorties conservées dans `correction-{guards,frame}-{red,green}.log` du dossier d'état.
- 18/10, Codex : reprise des sauvegardes après écriture ou renommage refusé, diagnostic codé conservé,
  y compris quand la sauvegarde finale était déjà en file. Rouges puis verts de
  `node --test --test-name-pattern='report snapshots resume' tests/local-stream-replay.test.cjs` et
  `node --test --test-name-pattern='a queued final snapshot' tests/local-stream-replay.test.cjs` ;
  vert final des deux via `--test-name-pattern='report snapshots resume|a queued final snapshot'`.
  Sorties dans `correction-report-{red,green}.log` et `correction-report-queued-{red,green}.log`.
- 18/10, Codex : preuves ajoutées des états 200 bloqué/lecture seule et refus 507/409 réels,
  identité Git et origines d'horloge non nulles, réponse tardive avant fermeture, seuils produit nommés
  et testés aux bornes. Ces comportements existants étaient verts dès les nouvelles assertions :
  `node --test --test-name-pattern='real session states and segment' tests/local-stream-replay.test.cjs`,
  `node --test --test-name-pattern='run reports retain|the real headless HTTP composition' tests/local-stream-replay.test.cjs`,
  `node --test --test-name-pattern='cancellation while upload transport' tests/local-stream-replay.test.cjs` et
  `node --test --test-name-pattern='preflight retains the product' tests/local-stream-replay.test.cjs`.
  `node scripts/check.mjs --changed` : vert, règles/format/lint/cliquet et 36 tests réussis
  (`correction-check-changed.log`). Aucun fichier produit ou harnais modifié.
- 18/10, Codex : suites demandées et contrats associés rejoués en séquentiel après correction :
  `node --test --test-concurrency=1 tests/local-stream-replay.test.cjs tests/local-perception-replay.test.cjs
  tests/server-ingest-path.test.cjs tests/question-ceiling.test.cjs tests/server-state-views.test.cjs tests/memory-projection.test.cjs
  tests/headless-session-lifecycle.test.cjs tests/session-lifecycle.test.cjs tests/capture-intake.test.cjs` :
  135 tests réussis, aucun échec (`correction-required-suites.log`).
- 18/10, Codex : contrôle complet après les sept corrections : `node scripts/check.mjs` vert,
  règles/format/lint/gel/cliquet, 2 876 tests JavaScript (152 fichiers) et 47 tests Python réussis
  (`correction-check-full.log`). Bilan détaillé dans `corrections-1.md` du dossier d'état ; nouveau
  verdict `TERMINÉ` rendu à la boucle pour relecture. Aucun commit, push, fournisseur réel ou essai réel.

### Réserves à la clôture

- .harness-state/tickets/T259/relecture-2.md : 1. Le plafond de 13 000 000 octets est vérifié sur le gabarit, pas sur le corps envoyé (réserve)
  - **Où :** `scripts/local-stream-input.cjs:89`, test `tests/local-stream-replay.test.cjs:256-263`.
  - **Le problème :** la validation mesure le corps gabarit. Le corps réellement envoyé est `bindBody(...)` (`scripts/local-stream-actions.cjs:21`), qui change deux choses :
    - `sessionId` devient un UUID de 36 caractères (`runtime/session-runtime.cjs:80`), contre `template` (8 caractères) dans le test ;
    - les temps sont translatés.
  - **Conséquence :** un gabarit d'exactement 13 000 000 octets passe la validation, et le nouveau test l'affirme. Pourtant son envoi dépasse `SEGMENT_BODY_LIMIT`. Il reçoit alors `413 request-too-large` (`server/http.cjs:140`) pendant l'exécution, au lieu d'être refusé avant. En pratique, les médias valides plafonnent vers 12,8 Mo : seul un corps qui porte environ 200 Ko de champs supplémentaires atteint ce cas.
  - **Attendu :** mesurer le corps lié dans le pire cas (identifiant de session de longueur UUID, temps maximaux), ou garder une marge explicite.
  - **Classe :** hors périmètre. Le défaut existait déjà, et la correction n'a fait que renommer la constante.
- .harness-state/tickets/T259/relecture-2.md : 2. Les erreurs de fin du produit n'ont pas de code (réserve reconduite, constat 8 de la relecture 1)
  - **Où :** `runtime/headless-session-lifecycle.cjs:313-317`.
  - **Le problème :** `lastEnd.errors` reste une liste de chaînes. Le test `:529` reconnaît donc encore la libération refusée par le texte de son message.
  - **Classe :** hors périmètre (produit).
- .harness-state/tickets/T259/relecture-2.md : 3. Le runner instrumente des objets internes du runtime (réserve reconduite, constat 9 de la relecture 1)
  - **Où :** `scripts/local-stream-observe.cjs:40-171`.
  - **Le problème :** inchangé. Le runner remplace encore les méthodes `perception`, `inspector`, `search`, `agent.answer` et `tools.call`, et lit `runtime.listeners` et `runtime.options`. Aucun point d'observation public n'existe pour ces appels.
  - **Classe :** hors périmètre.
- .harness-state/tickets/T259/relecture-2.md : **Écart accepté, décomposition en modules `scripts/local-stream-*.cjs` :** inchangé depuis la relecture 1, et toujours sans fichier existant touché.
- .harness-state/tickets/T259/relecture-2.md : **Écart accepté, origine fixe prise à la création de la session :** inchangé, et désormais prouvé avec une origine non nulle (`:189-196`).
