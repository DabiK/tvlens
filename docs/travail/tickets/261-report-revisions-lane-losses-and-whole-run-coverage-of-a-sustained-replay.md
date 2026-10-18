---
id: T261
titre: Report revisions, lane losses and whole-run coverage of a sustained replay
statut: termine
bloque_par: T259
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le rejeu soutenu produit un bilan de toute la campagne : révisions observées, publications audio
et vision, pertes par voie, couverture, retard et backend effectif de chaque rôle.
Un dernier passage prêt ne masque jamais une lacune antérieure. Cette seconde part de la tranche E
d'Astra tient dans une session et un commit.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, E, à `beb9589`, puis coupe de la relecture du 17/10 : le calendrier d'envoi et les
  issues appartiennent à T259 ; ce ticket ajoute les mesures de G3 sur toute l'exécution.
- Décisions du propriétaire du 17/10 au soir : source vidéo T262 et rôles locaux T263–T265
  avant le GX10 ; détection locale de surveillance après l'expérience (T266).
- Code relu à `4599eea` : `core/memory/memory-view.cjs:58` expose des métadonnées détachées,
  dont horodatages et métriques ; `:74` calcule la couverture et `:101` expose les trous.
  `:10` fixe le seuil de trou de capture à 250 ms. T219 est terminé et fournit les données
  temporelles qui manquaient au rapport Astra.
- `core/memory/memory-view.cjs:16-23` ne cherche les trous que jusqu'au dernier passage reçu,
  et `:71-87` calcule le retard depuis le dernier passage prêt, sans garantir la continuité.
  `core/memory/coverage.cjs:7-16` fournit intervalles en défaut et compteurs, pas un pourcentage
  de trente minutes. Le scénario doit fournir la fenêtre planifiée pour mesurer aussi la fin manquante.
  Depuis T223 (ADR 0055), aucun balayage ni transfert temporel en `history` n'existe ; les pertes
  de voie restent mesurables par erreur, retenue ou surcharge, sans recréer d'expiration.
- `runtime/headless-runtime.cjs:424` lit `session.memory.view()` en processus pour la session
  chargée. `runtime/memory/memory-projection.cjs:22-36` ne publie pas ses trous à 250 ms.
  `runtime/state-views.cjs:97-105` calcule le `captureGaps` HTTP à 1 000 ms, valeur de
  `core/memory/topic-continuity.cjs:1`, publiée par `runtime/headless-runtime.cjs:294`.
- `scripts/replay-lg-stream.cjs:121` suit les publications par identifiant : les versions sont
  écrasées. `core/latency-trace.cjs:12` ne résume que quarante passages ;
  `runtime/state-views.cjs:8-15` borne aussi les vues légères. Aucune n'est un bilan complet.
- `runtime/headless-runtime.cjs:237` publie les révisions d'état ; le canal à retenir est celui
  d'avant T225 (sondage), la contraction venant après. ADR 0046, 0050, 0051 et 0054 : consultation, révisions, pertes et projection.
  `runtime/session-runtime.cjs:165-173` fournit les lectures publiques et `:227-233` expose
  les événements et la consultation de la même session. Une révision d'hôte n'est pas une révision de passage.
  Tests existants : `tests/memory-view.test.cjs`, `tests/session-events.test.cjs`,
  `tests/memory-projection.test.cjs`, `tests/server-state-views.test.cjs`.
- T259 livre `scripts/replay-local-stream.cjs` et `tests/local-stream-replay.test.cjs` : scénario,
  validation sans agent, calendrier à origine fixe, réessais TV, questions et fin bornée.
  La mesure précède la phase Mémoire : elle lit les interfaces publiques actuelles.
- `runtime/conversation-runtime.cjs:37-45`, `runtime/session-providers.cjs:86-95` et
  `:172-184` composent aujourd'hui les rôles questions, inspection et embeddings ;
  `runtime/surveillance-runtime.cjs:251-254` donne le même agent aux deux rôles de surveillance.
  T263–T265 et T267 rendent les identités locales observables ; T267 les transmet dans les
  métriques et traces des questions. Le bilan doit lire ces identités effectives.

## Périmètre

- À modifier : `scripts/replay-local-stream.cjs`, ses aides de rapport sous `scripts/` si besoin,
  et `tests/local-stream-replay.test.cjs`. Réutiliser SHA, empreintes, paramètres, rôles/backends
  et issues d'envoi/question déjà acquis par T259 ; ne pas créer un second calendrier.
- Produire une table par rôle : perception, questions, embeddings de recherche, inspection,
  transcription et, si composée, surveillance avec détection et recherche web séparées.
  Pour chacun, conserver backend choisi, backend/modèle réellement composé, paramètres connus
  et preuve des appels effectués, ou état désactivé/simulé/non exercé/inconnu. Une inspection
  issue du cache garde son identité d'origine ; un repli lexical reste une recherche lexicale.
  La configuration seule ne prouve aucun appel. Inclure toute autre inférence effectivement utilisée.
- La provenance des trente minutes garde ses empreintes : capture, vidéo convertie T262 ou
  corpus bouclé déclaré. Le bilan ne présente pas une vidéo convertie comme une capture LG.
  Aucun repli Codex/OpenRouter ne compte comme traitement local ; la détection locale T266
  n'est pas requise avant GX10 et le web de la surveillance reste distant.
- Tenir un journal progressif par session/passage/révision, avec publications audio et vision,
  pertes par voie, issues de questions et échantillons de retard sur toute l'exécution.
  Conserver les versions observées au lieu d'écraser un passage par sa dernière valeur.
- Lire intervalles, trous et pertes en processus, dans la vue de la session chargée (aujourd'hui
  `session.memory.view()`, `runtime/headless-runtime.cjs:424`), avant la fin de session.
  Consigner à part le `captureGaps` de `/v1/state`, calculé à 1 000 ms. Nommer le canal des
  révisions : sondage de `/v1/state` marqué échantillonné (l'abonné en processus n'existe qu'après T225).
  Un canal échantillonné ne prétend pas avoir observé toutes les publications intermédiaires.
  L'abonné de passage utilise la lecture bornée par identifiant pour conserver sa version ;
  ne pas reconstruire un état complet à chaque événement.
- Calculer le bilan sur tous les intervalles et pertes de la campagne, y compris les publications
  antérieures aux quarante derniers passages. Distinguer capture, preuves audio et preuves vision ;
  un refus d'ingestion ne devient pas une perte de voie d'un passage qui n'existe pas.
  Rapporter l'union des intervalles reçus à la fenêtre planifiée du scénario, même si ses premiers
  ou derniers envois manquent. Dédupliquer les réessais par passage et les pertes par voie/révision ;
  ne pas additionner les compteurs cumulatifs à chaque échantillon. Conserver à part les trous
  publiés par le produit. Un audio `failed` n'est pas un silence réussi et une voie prête ne
  prouve pas la vérité de son texte.
- Échantillonner selon un pas consigné, même sans nouvelle publication : horloge de session,
  bornes de capture/analyse, retard publié, dernières preuves audio/vision disponibles et leur âge.
  L'absence de preuve reste inconnue. Distinguer ce retard de l'absence de couverture continue ;
  nommer les domaines d'horloge avant toute soustraction, selon l'ADR 0028.
- Séparer temps soumission → réponse observable par le client HTTP et décomposition interne
  disponible. Garder les métriques T255 et les temps bruts acquis ; toute étape non observable,
  dont attente effective de l'agent ou premier token, reste inconnue. Un délai n'est pas remplacé
  par zéro et le résidu client moins fournisseur ne devient pas une mesure pure du réseau.
- Une réponse livrée après annulation ou fermeture ne devient ni réussite ni preuve acquise.
  Conserver journaux et bilan partiel si l'attente finale de T259 expire ; afficher « incomplet »,
  attentes restantes, limites d'observation et mesures indisponibles.
- À ne pas toucher : cadence, réessais et validation livrés par T259, politiques de files/recherche,
  plafonds, délais produit, rétention, définition des pertes, format d'archive ou divergence
  d'affichage des clients. Aucun nouvel ADR : les contrats de consultation existants restent ceux du produit.
- Aucun essai réel dans la session Codex, modèle local compris. Faux Ollama, agent Codex doublé,
  chat/transcription et temps maîtrisés pour les tests ; trente minutes réelles et télémétrie GPU
  restent à l'orchestrateur ou au propriétaire, hors boucle.

## Critères d'acceptation

1. Un passage publié avec audio seul puis avec vision garde ses révisions observées et les
   métriques T255. Le journal nomme son canal et distingue observation exhaustive et échantillonnée ;
   aucune publication intermédiaire non observée n'est inventée.
2. Avec plus de quarante passages, un trou antérieur et une perte de voie restent dans le bilan
   après un dernier passage prêt. Totaux et dénominateurs couvrent toute la campagne, calculés
   sur les intervalles et pertes ; capture, audio et vision restent distingués sans double comptage.
   Un dernier envoi absent réduit la couverture de la fenêtre planifiée ; une livraison reconnue
   comme doublon et un compteur relu deux fois ne l'augmentent pas. Un audio `failed` reste un échec.
3. Un écart de 400 ms apparaît dans les trous de consultation à 250 ms et reste distinct du
   `captureGaps` HTTP à 1 000 ms. Le bilan lit la vue en processus avant fermeture et garde les
   deux sources identifiées ; il ne prétend pas obtenir cette consultation par HTTP.
4. Un test retient le transport, annule une question, livre une réponse tardive et provoque une
   perte de voie : aucune réponse tardive ne compte comme preuve acquise ou réussite. La perte
   est conservée par voie ; une fin en délai dépassé garde le bilan partiel et le statut « incomplet ».
5. Le rapport contient des échantillons de retard sur toute l'exécution, couverture/pertes et
   limites observables. Il sépare soumission → réponse HTTP et décomposition interne disponible ;
   attente effective d'agent, premier token ou autre étape non observée sont « inconnus ».
   Pendant un fournisseur retenu sans publication, le calendrier produit encore des échantillons
   et l'âge de la dernière preuve disponible augmente ; une preuve absente ne prend pas l'âge zéro.
   La référence Codex reste identifiée et aucun fallback ne devient une mesure locale.
6. Un scénario contrôlé combine questions locales, embeddings locaux et inspection locale ;
   le rapport conserve l'identité de chacun indépendamment de la perception. Un second laisse
   l'inspection non exercée et provoque un classement lexical après panne d'embeddings :
   ni l'une ni l'autre ne devient une mesure locale réussie. La recherche web de surveillance
   demeure distante ou non exercée. Une sortie modèle ne peut usurper ces identités.
   Source vidéo, empreinte et paramètres de conversion restent visibles après une fin incomplète.
7. À l'implémentation future, jouer en séquentiel `local-stream-replay`, `memory-view`,
   `session-events`, `memory-projection` et `server-state-views` sous `tests/` (`.test.cjs`),
   les contrats de projection/coordination affectés, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Étendre `tests/local-stream-replay.test.cjs` par la frontière publique du runner de T259, avec
vraie composition headless/HTTP, fichiers temporaires, fournisseurs doublés et horloge injectée.
Publier séparément audio et vision, accumuler plus de quarante passages, introduire trou et perte
par erreur ou surcharge, jamais par balayage temporel,
puis terminer par un passage prêt. Observer journal exporté et bilan, retenir une réponse jusqu'après
annulation et conduire une fin incomplète. Le test prouve les calculs et la conservation des faits,
jamais la qualité, le GPU ou le débit matériel G3.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T259 est le seul prérequis direct ; il apporte T262/T257/T255, les rôles locaux T263–T265 et T267 ;
la phase Mémoire vient après. T266 attend la fin de l'expérience et ne bloque pas ce bilan.
L'implémentation lit les interfaces publiques actuelles, sans utiliser les collections privées.
T232/T252 aident à identifier et afficher les quotas sans bloquer ce bilan ; un refus inconnu
ne devient pas un quota. T240 n'est pas requis : avant lui, l'attente réelle de l'agent peut rester
incluse dans le traitement annoncé. Cette limite doit figurer dans le rapport.

Décision du 17/10, révisée le 18/10 : copie après T261 et intégration des préparatifs, répétition Mac avant accès,
`hackathon-rc` en repli, phase 2 retenue par T254. Le propriétaire fournit les extraits français ;
l'orchestrateur prépare manifeste et grille. La source des trente minutes est consignée par T259 :
enregistrement fourni, vidéo convertie ou corpus bouclé déclaré. Un test accéléré ne constitue pas G3 ; une campagne
réelle complète n'établit la stabilité que pour son SHA, ses entrées et ses paramètres.

## Journal
- 18/10, Codex, validation des corrections de relecture 1 : dix suites exigées et de coordination
  exécutées en séquentiel par `node --test` : 156 tests verts (`correction-required-suites.log`).
  `node scripts/check.mjs --changed` : vert, 43 tests JS ; `node scripts/check.mjs` : vert,
  152 fichiers JS / 2 883 tests et 47 tests Python, règles/format/lint/gel/cliquet verts.
  `git diff --check` vert. Nouveau verdict `TERMINÉ`, constats 1 à 6 corrigés, sans contestation.
  Aucun essai réel, commit ou push ; rapport de relecture conservé intact.
- 18/10, Codex, corrections de relecture 1 :
  `node --test --test-name-pattern='a question completed during session closure' tests/local-stream-replay.test.cjs`
  rouge sur l'acquisition tardive, puis filtre étendu fermeture/question/perception/HTTP : 4 tests verts.
  Le statut produit est conservé ; le journal marque `afterClose` et les réussites exigent `acquired`.
- 18/10, Codex : assertions exactes des révisions/canaux et du sondage HTTP (2 000 ms, délai 500 ms,
  accusé fini et décomposition égale aux métriques). Six mutations temporaires vérifiées par
  `node .harness-state/tickets/T261/verify-observation-assertions.cjs` : six rouges sur assertion,
  sources restaurées après chaque cas. Filtre `'passage journals|whole campaign coverage'` vert.
- 18/10, Codex : filtre `'surveillance role tables'` rouge sur paramètres absents, puis filtre
  `'surveillance role tables|exercised surveillance retains'` : 2 tests verts. Paramètres configurés
  `reasoningEffort`/`workers`, ou null sans copie du défaut. Seuil HTTP importé de l'export public.
  Aides renommées `local-stream-summary.cjs` et `local-stream-provider-observation.cjs` ; filtre
  `'passage journals|whole campaign coverage|question completed during session closure|surveillance role tables'` : 4 verts.
- 18/10, Codex, reprise après relecture 1 : rapport, journal, écarts et arbre relus. Traitement
  des six constats numérotés 1 à 6, tests d'abord, sans écart prévu ni modification du produit.
- 18/10, Codex : contrôles finaux observés verts. En séquentiel, `node --test` sur
  `local-stream-replay`, `memory-view`, `session-events`, `memory-projection`, `server-state-views`,
  `session-runtime`, `session-lifecycle`, `evidence-refresh`, `headless-session-lifecycle` et
  `conversation-runtime` : 154 tests verts. `node scripts/check.mjs --changed` : 41 tests verts,
  règles/format/lint/gel/cliquet verts. `node scripts/check.mjs` : 152 fichiers JS, 2 881 tests verts,
  puis 47 tests Python verts. `git diff --check` vert. Aucun essai réel, commit ou push.
  Verdict `TERMINÉ` déposé dans le dossier d'état pour la relecture de la boucle.
- 18/10, Codex : cycles rouge → vert observés par `node --test --test-name-pattern='passage journals'
  tests/local-stream-replay.test.cjs`, puis filtre `'whole campaign coverage|passage journals'` :
  versions audio/vision, métriques brutes, échantillons et couverture de 45 passages reçus sur 46
  envois planifiés ; doublon, audio failed, trous de début, de 400 ms et de fin conservés.
- 18/10, Codex : cycles rouge → vert observés avec les filtres
  `'local questions retain independent|failed embeddings keep lexical'`,
  `'a perception answer delivered during'`, `'a separate overload|production perception and questions'`
  et `'local questions retain independent|exercised surveillance retains'` : identités séparées,
  inspection en cache, classement lexical après panne, refus de question et acquisition révoquée
  dès la fermeture. Sorties exactes dans `.harness-state/tickets/T261/`.
- 18/10, Codex : filtre `'a perception answer delivered during|cancellation while upload|video preparation bodies'` :
  3 tests verts ; réponse tardive annulée sans réussite, perte vision, provenance vidéo et bilan
  incomplet conservés. Le premier contrôle `--changed` a révélé une ancienne doublure HTTP de
  question sans enveloppe Ollama valide ; enveloppe corrigée et réussite désormais explicitement vérifiée.
- 18/10, Codex : exploration du runner, de ses aides et des contrats publics ; conservation prévue
  des versions via événements de passage et lecture bornée, sondage HTTP distinct pour les révisions
  d'hôte, consultation en processus pour la couverture. Aucun écart prévu ; aucun essai réel.
- 18/10, propriétaire, sur l'avis d'Astra : G3 se mesure avant la phase Mémoire (T224 à T227), contre les
  frontières publiques actuelles, pour obtenir une référence de trente minutes avant toute contraction.

### Réserves à la clôture

- .harness-state/tickets/T261/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 1 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
