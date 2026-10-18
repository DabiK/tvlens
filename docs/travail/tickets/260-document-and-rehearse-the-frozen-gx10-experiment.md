---
id: T260
titre: Document the frozen GX10 experiment and check its offline commands
statut: a-faire
bloque_par: T258, T261
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: simple
---

## Ce que le ticket livre

L'orchestrateur dispose d'une procédure exécutable et vérifiée sans fournisseur pour préparer
une campagne GX10 depuis une copie identifiée, avec données isolées et preuves conservées.
La répétition réelle lui reste confiée hors boucle. Tranche F d'Astra : une session Codex,
un commit documentaire, environ 1 h après les outils de rejeu, notation et bilan.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Sections 2 et 3, F, « Document and rehearse the frozen GX10 experiment »,
  base `beb9589` ; analyses `synthese-croisee-gx10.md`, `astra-gx10.md` et `claude-gx10.md`.
- Décisions du propriétaire du 17/10 : préparer le GX10 avant la phase 2 retenue par T254 ;
  copie prise après T227, répétée sur Mac avant l'accès ; `hackathon-rc` gardé en repli.
  Il constitue une dizaine d'extraits français réels pour G2 ; l'orchestrateur prépare format et grille.
- Décisions du 17/10 au soir : source vidéo T262 et trois rôles locaux T263–T265 avant l'accès ;
  T267 transmet l'identité des questions aux métriques et traces. La détection locale de
  surveillance T266 attend la fin de l'expérience.
- Code relu à `4599eea` : `adapters/config.cjs:74-77` sélectionne perception et réglages locaux ;
  `server/main.cjs:23` isole les données via `TVLENS_SERVER_DATA`, `:27` lit `TVLENS_CONFIG`.
  `runtime/session-providers.cjs:63` choisit les poids Whisper ; les chemins explicites sont déjà
  honorés à l'import (`adapters/config.cjs:11-18`). T256 ne concerne que le chargement depuis le cache.
- `app/main.cjs:67` isole seulement le smoke ; `:72` utilise sinon le `userData` Electron.
  `:76-77` sélectionne `.env.local` hors paquet ; `adapters/config.cjs:9-11` lit un fichier absent
  comme vide, puis `:29-35` réécrit le cache existant si le chiffrement est disponible.
  `tests/review-regressions.test.cjs:408-425` caractérise un import vide, pas un fichier absent.
  Un worktree n'isole donc ni ces données ni les poids absents du checkout ; réserve T247 conservée.
- `scripts/bench-whisper.cjs:78` fournit une aide sans modèle ; `:92` lance le binaire en usage
  normal ; `:108` compare des transcriptions entre configurations, `:112` construit le rapport.
  `--no-text` retire le texte de la sortie, sans éviter le calcul ; aucun mode de validation seul n'existe.
- `docs/PRD-V2.md`, sections 4 et 5 ; `docs/action-evaluation-rubric.md` ; ADR 0016, 0019, 0028 et 0048.
  Les commandes exactes seront celles réellement livrées par T257/T258/T259/T261/T262
  et les réglages des rôles ceux de T263–T265.
- `tests/documentation-index.test.cjs:23-26` et `:45-46` exigent un lien depuis `docs/README.md`
  vers toute page Markdown à la racine de `docs/`. `scripts/check.mjs:168-172` ne lance en mode
  `--changed` que les tests modifiés (raccord en `:203-212`) : le test documentaire et le contrôle
  complet sont requis ici.

## Périmètre

- À créer : `docs/gx10-experiment.md`, guide en français reliant métriques T255, chemins Whisper
  explicites, honorés à l'import, rejeu G1 T257, grille/notation G2 T258, scénario G3 T259,
  bilan T261, conversion vidéo T262, rôles locaux T263–T265, identité des questions T267
  et banc Whisper existant.
- À modifier : `docs/README.md`, un lien vers `gx10-experiment.md`.
- À modifier aussi, d'après les réserves de relecture de T255 et T263 : `docs/backend-latency-optimization.md`, le
  protocole de l'essai A (`:357` à `9e84275`) qui doit citer `clientTimings.queueMs`, `clientTimings.requestMs`,
  `providerTimings.rawNs` et `modelState`, et le tableau des réglages (`:395-396`) sans `TVLENS_QUESTIONS_BACKEND` ni
  `TVLENS_LOCAL_QUESTIONS_*` ; `docs/architecture.md:148`, qui ne nomme que `CodexSessionAgent` dans la composition des
  questions.
  Aucun changement de code, de harnais ni de configuration personnelle.
- Donner les commandes depuis une copie explicite, les modes sans fournisseur et les préconditions
  des commandes réelles. Vérifier seulement les aides, validations et rejeux contrôlés déjà livrés ;
  le guide consigne les commandes et leurs résultats observés, avec les opérations réelles « non testées ».
- Le guide dit qu'un lancement Electron de la copie réécrit `provider.enc` du `userData` partagé
  si un cache existe et range ses sessions dans la bibliothèque habituelle. Les commandes G1 à G3
  passent par les runners de T257 et T259, ou par un serveur lancé avec `TVLENS_SERVER_DATA`
  et `TVLENS_CONFIG` absolus.
- Documenter un choix explicite par rôle : perception, questions, embeddings et inspection,
  avec les réglages de T263–T265, leurs valeurs admises et leurs refus. Le choix des questions
  ne sélectionne pas implicitement recherche et inspection. Codex fournit les références
  choisies de G1/G2/G3 et garde son identité ; un rôle distant rend la campagne hybride.
  Présenter la capacité web limitée des questions locales de T263 et le maintien du web distant
  de surveillance. T266 est réservé à l'après-expérience, sans en faire un prérequis du guide.
- Garder `gemma3:4b` comme candidat initial de perception selon le PRD, et consigner les valeurs
  de `num_ctx` et `keep_alive`. Comparer les backends sur les mêmes entrées et paramètres hors backend ;
  préciser quels rôles changent entre deux campagnes. Ne pas présumer que ce candidat convient
  aux outils des questions ou aux embeddings ; modèle/version/digest de chaque rôle sont renseignés
  ou inconnus. Décrire le refus de réutilisation d'un index d'une autre identité (T264).
  Le plafond de cinq images HTTP de G3 reste distinct des six images Mac au plus de G1.
  Toute sélection faite pour respecter ces bornes est déclarée.
- Donner la chaîne fichier vidéo → conversion T262 → validation du manifeste de perception → T257,
  et la chaîne de validation de l'index des blocs → T259. Les deux formats restent distincts.
  Préciser les blocs de 10 s au plus, une à cinq images base64 sans préfixe et la borne audio,
  les chemins, empreintes et paramètres consignés. La conversion précède le calendrier G3.
  Déclarer vidéo continue, extrait court ou boucle et la durée réelle ; ne pas promettre trente
  minutes inédites à partir d'un extrait. La capture LG est hors de T262 et une vraie session TV
  reste le témoin de fidélité. Sans elle, cette fidélité reste non testée.
- Séparer les responsabilités : Codex prépare le guide et vérifie les modes hors fournisseur ;
  l'orchestrateur prépare format/grille, organise annotations/revue et arrête la charge concurrente
  avant répétition ; le propriétaire fournit les extraits et l'accès matériel. La répétition Ollama
  sur Mac, tunnel privé, vérification GPU, appels réels et éventuel essai Whisper GPU restent hors boucle.
- Décrire le gel après T227 et intégration des préparatifs, avec vérification après contraction
  sur le même SHA que la répétition. T233 est antérieur à T224–T227 et ne suffit pas à les recetter.
  La recette opérateur relève réouverture d'archives, capture audio Mac et disponibilité de Whisper
  (réserves T208/T246/T247), ainsi que les anomalies de fermeture ou libération. Un échec Whisper
  intermittent n'est pas réputé corrigé par T256 ; aucun délai produit n'est augmenté pour le masquer.
  L'orchestrateur consigne répétition, tag et clôture de T254 selon ce ticket ; Codex ne les effectue pas.
- Conserver pour chaque campagne SHA/tag, empreintes du corpus et des annotations, identité de
  rapport/revue, versions, modèle/digest/poids et paramètres, machine, mémoire annoncée et backend
  GPU effectivement observé, sorties brutes et incidents. Une identité indisponible reste inconnue.
  La fiche donne chaque rôle avec choix configuré, backend effectif et état exercé/non exercé,
  désactivé ou simulé, ainsi que le mode lexical éventuel et la provenance des réexamens en cache.
  La collecte opérateur CPU/RAM/GPU est horodatée sur toute la campagne pour examiner une dérive,
  pas limitée à la capacité mémoire annoncée. Le runner ne prouve ni l'affichage d'une carte
  sur les clients ni la qualité d'une inspection non exercée ; ces vérifications restent hors boucle.
- Décrire un protocole froid/chaud contrôlé et ses preuves, sans seuil arbitraire sur `loadMs`.
  Séparer attente cliente, aller-retour, durées fournisseur et fin effective du calcul distant
  après annulation. Ne pas annoncer « GPU » sans vérification opérateur, ni « tout local » avec chat Codex.
  Le corpus commun couvre parole, geste bref, ordre inversé, répétition et preuve absente des images ;
  les annotations sont figées avant les deux inférences comparées. Prévoir la revue de chaque régression
  de causalité/provenance, couverture ou pertes ; les pourcentages exploratoires du PRD ne sont pas
  des seuils d'acceptation automatiques. La décision de conserver le backend reste à l'opérateur.
- À ne pas toucher : TV, VPS, identifiants, administration GX10, installation ou migration de pile,
  implémentation des rôles locaux T263–T265 ou de la source T262, détection locale T266,
  vidéo native, ASR résident ou intégration de Whisper GPU au produit.
  Aucun essai réel de modèle local ni fournisseur n'est autorisé dans cette session Codex.

## Critères d'acceptation

1. Le guide fournit une suite de commandes conforme aux CLI livrées : aide et validation d'entrées,
   G1 explicite, préparation/validation de grille et notation G2 hors ligne, validation/scénario G3,
   préparation vidéo T262, sélection des rôles locaux, collecte des sorties et banc Whisper.
   Les commandes sans fournisseur sont exécutées et leurs
   résultats consignés ; les autres sont clairement réservées à l'opérateur et restent non exécutées.
2. Les exemples emploient des chemins absolus explicites pour code, corpus, poids, binaire et
   sorties. Les commandes G1 à G3 passent par les runners de T257 et T259, ou par un serveur
   lancé avec `TVLENS_SERVER_DATA` et `TVLENS_CONFIG` absolus et une racine de données distincte.
   Le guide dit qu'un lancement Electron de la copie réécrit `provider.enc` du `userData` partagé
   si un cache existe et range ses sessions dans la bibliothèque habituelle. Ni `--root` du rejeu LG
   ni un worktree ne sont présentés comme une isolation des données.
3. Une fiche de campagne à remplir contient toutes les identités, empreintes, versions, paramètres
   et preuves ci-dessus. Le guide indique comment les relever, garder les sorties partielles et
   marquer une donnée inconnue ; les annotations attendues restent séparées des requêtes.
   Chaque rôle est renseigné séparément, y compris l'identité du modèle de l'index et les rôles
   non exercés. Les exemples distinguent vidéo convertie et session TV témoin ; aucune panne
   locale ne suggère de poursuivre silencieusement chez Codex ou OpenRouter.
4. Le protocole ordonne répétition Mac sur le SHA retenu puis G1 → revue G2 → G3 sur GX10,
   avec charge concurrente arrêtée et états froid/chaud documentés. Un échec ou manque d'accès
   conduit à un statut explicite, sans migration de pile ni faux succès par repli.
   Il nomme le candidat, les paramètres de contexte/résidence, la référence Codex, les entrées
   communes et les cas critiques du corpus. Il prévoit la collecte de ressources et la revue
   des régressions, sans transformer les seuils exploratoires en décision automatique.
5. Le compte rendu prévu distingue « validé sur GX10 », « fonctionnel mais qualité/débit
   insuffisants », « incompatible dans le budget », « non testé » et « incomplet ». Il conserve
   les limites : p95 exploratoire, trente minutes requises pour G3, attente agent non isolée avant
   T240 et comparaison Whisper entre configurations distincte d'une vérité humaine de précision ASR.
6. À l'implémentation future, vérifier les liens et le diff, exécuter les seuls modes hors fournisseur
   cités, `node --test tests/documentation-index.test.cjs`, puis `node scripts/check.mjs`.
   Le guide est lié depuis `docs/README.md`. Aucun nouveau test documentaire n'est requis.

## Test d'acceptation attendu

Pas de nouveau test : exécuter les aides et validations de T257/T258/T259/T262 sur leurs exemples
maîtrisés, puis
`node --test --test-concurrency=1 tests/local-perception-replay.test.cjs tests/perception-replay-scoring.test.cjs tests/local-stream-replay.test.cjs`
et `node scripts/bench-whisper.cjs --help`. Consigner les résultats sans lancer Whisper.
Ajouter en séquentiel les tests `video-file-source`, `ollama-question-agent`,
`ollama-embeddings` et `local-inspection` (`tests/*.test.cjs`) et leur conversion maîtrisée ;
aucun modèle local réel. Relire les exemples de configuration contre `loadConfig` et ses tests.
Relire les commandes réelles contre leurs parseurs, puis
laisser répétition matérielle, gel opérateur et preuves G1–G3 explicitement non exécutés.

Pour les critères documentaires 2 à 5, conserver aussi les sorties des commandes ci-dessous.
Elles doivent montrer les exemples et limites d'isolation, tous les champs de la fiche, l'ordre
opératoire et le repli, le corpus et la comparaison, puis les statuts et réserves exigés ; aucun champ absent
ne se déduit d'une mesure. Cette vérification de contenu ne constitue pas une recette matérielle.

```sh
rg -n 'TVLENS_SERVER_DATA|TVLENS_CONFIG|userData|provider.enc|--root' docs/gx10-experiment.md
rg -n 'SHA|empreinte|version|digest|poids|paramètre|machine|mémoire|GPU|revue|inconnu' docs/gx10-experiment.md
rg -n 'T227|T254|hackathon-rc|Mac|G1|G2|G3|froid|chaud' docs/gx10-experiment.md
rg -n 'gemma3:4b|num_ctx|keep_alive|Codex|CPU|RAM|causalité|provenance|geste|répétition|annotation' docs/gx10-experiment.md
rg -n 'T208|T246|T247|Whisper|fermeture|libération' docs/gx10-experiment.md
rg -n 'validé|fonctionnel|incompatible|non testé|incomplet|p95|T240|ASR' docs/gx10-experiment.md
rg -n 'QUESTIONS_BACKEND|EMBEDDINGS_BACKEND|INSPECTION_BACKEND|identité|non exercé|lexical' docs/gx10-experiment.md
rg -n 'vidéo convertie|témoin|T262|T266|après|sans préfixe|audio|durée' docs/gx10-experiment.md
```

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les dépendances directes minimales restent T258 et T261 : elles couvrent T255/T257/T259,
la source T262, les rôles locaux T263–T265 et l'identité des questions T267, prérequis de T259. Les ajouter ici
serait redondant. T259 impose aussi T227 et la fin de Mémoire ; T266 attend l'après-expérience
et ne bloque pas le guide. T247 est terminé. T256 corrige l'app empaquetée
et n'est pas sur le chemin de la copie. Pas de dépendance à la Bibliothèque ou à T254,
qui attend au contraire cette préparation.
La constitution du corpus français est attribuée au propriétaire ; format et grille à l'orchestrateur.
Leur absence actuelle ne bloque pas le guide ni ses vérifications sur exemples maîtrisés.

Le créneau, la pile et le GPU effectif du GX10, la qualité française et le débit restent à établir
par l'opérateur. Le guide ne promet ni résultat de concours ni validation matérielle. Le repli
de démonstration demeure `hackathon-rc` ; une réussite expérimentale ne vaut que pour son SHA figé.

## Journal

- 18/10, orchestrateur : périmètre complété par les réserves de relecture de T255 (protocole de l'essai A) et de T263
  (réglages et composition des questions locales), qui sortaient du périmètre de ces deux tickets.
- 18/10, orchestrateur : le guide dit de régler la langue de transcription de chaque extrait (`fr`, `en`, `auto`)
  et de l'indiquer avec ses résultats (contrôle T273).
