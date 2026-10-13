# Latence et architecture du backend de traitement — 12 et 13 octobre 2026

Branche `codex/tvlens-backend-latency-opus`, base `9758633`. Rien n'est commité, poussé ni déployé.

Ce document dit ce qui a changé dans le traitement, ce qui a été mesuré et où, et ce qui reste à mesurer. Les interfaces existantes sont conservées : mêmes routes HTTP, mêmes outils du chat, mêmes statuts de passage.

En bref :

- **Ce que montrent les tests et la simulation.** Sur le code de départ, une recherche dans une longue session rattrape l'index un appel par passage, dans la question ; pendant ce temps la vision est suspendue et des passages perdent leur description. La branche supprime ce rattrapage, garde le processus Codex vivant entre deux sujets, relit les preuves récentes d'une question, compte chaque perte avec sa cause, et corrige plusieurs défauts trouvés en chemin. Les gains chiffrés viennent d'une simulation à fournisseurs contrôlés, sur six graines et deux hypothèses de délai : ils sont nets sur une session de 2 h, faibles ou nuls sur 10 minutes, et aucun n'est observé avec de vrais fournisseurs.
- **Ce qui est observé en réel.** Un parcours complet sur la version de la branche d'avant les derniers correctifs, une fois, sur cinq blocs : capture sur la TV, serveur de la branche sur le VPS, Whisper réel, vision et chat Codex réels. Cinq passages sur cinq complets, aucune perte, une question traitée en 43,4 s (réponse classée `insufficient` par le modèle, premier appel d'outil refusé). Ce parcours ne compare pas la branche au code de départ.
- **Ce qui ne change pas.** Le temps d'un bloc isolé. Sur le VPS, trois passes de rejeu par code ne montrent aucune différence attribuable à la branche ; sur le Mac, une passe par configuration non plus. Un bloc coûte toujours Whisper puis la vision.
- **Ce que le parcours réel montre.** Whisper a mis 4,7 à 30,9 s par bloc de 8 s (médiane 6,7 s sur cinq blocs) ; les rejeux sur voix de synthèse ont une médiane d'environ 5 s et des maxima de 6,6 à 17,8 s. Le bloc à 30,9 s a tourné 23,3 s en même temps que le Whisper d'un réexamen : l'essai ne sépare pas l'effet du contenu de celui de la concurrence. Pendant la question, le mode par défaut a retenu la vision de fond 39,2 s.
- **Le levier Whisper.** Réduire la fenêtre d'encodeur divise le temps de Whisper par deux sur le VPS, sur voix de synthèse seulement. Sur parole réelle, le gain et l'effet sur le texte ne sont pas évalués. L'option reste désactivée.
- **Ce qui n'est pas mesuré.** OpenRouter et la recherche sémantique réelle, un modèle local ou le GX10, la qualité des réponses, et toute comparaison avant/après avec de vrais fournisseurs.

## Comment lire les chiffres

| Famille | Ce qu'elle prouve | Ce qu'elle ne prouve pas |
| --- | --- | --- |
| **Réel, Mac** : bancs et rejeu en temps réel | le coût du calcul local sur ce Mac | la vitesse du VPS, du GX10 ou de Codex |
| **Réel, VPS** : mêmes outils lancés depuis une copie temporaire, à côté du service déployé | le coût de l'ingestion, de l'assemblage et de Whisper sur l'hôte de production | la vision et le chat, simulés ; le service déployé, non touché |
| **Réel, parcours complet** : capture sur la TV, serveur de la branche sur le VPS, Whisper, vision et chat Codex réels ; un essai de cinq blocs et une question | que le chemin entier fonctionne sur la version de la branche d'avant les derniers correctifs, et ce qu'il coûte ce jour-là sur ce contenu | une tendance (cinq blocs), un avant/après (branche seule), la recherche sémantique (pas de clé OpenRouter) |
| **Simulation** : orchestration réelle sur horloge virtuelle, fournisseurs contrôlés | l'ordre, les bornes, les pertes, la fraîcheur des preuves, le nombre d'appels | la latence ou la qualité d'un fournisseur |
| **Non mesuré** | — | OpenRouter, modèle local, GX10, `audio-ctx` sur parole réelle, qualité des réponses |

Les résultats bruts sont sous `.local/opus-optimization/results/` (non versionnés ; aucun contenu capté sur la TV, aucune réponse, image, adresse ni jeton ; les rejeux et bancs du Mac gardent la transcription de la voix de synthèse). Les scripts qui les produisent sont dans `scripts/`. Viennent d'outils ponctuels non versionnés : `whisper-audio-ctx-mac.json`, `codex-connect-probe.json` et les fichiers `real-trial-*` du parcours réel (observateur `.local/opus-optimization/tv-real-trial-driver.cjs`). Les fichiers `vps-*` ont été réétiquetés à la récupération (champs `kind` et `root`) et allégés de leurs extraits de transcription ; leurs mesures sont celles des scripts.

## Chemin d'un bloc

```text
LG : fermeture du bloc (8 s) ─ envoi ─ assemblage ─ stockage ─ file audio ─ Whisper
     ─ transcription publiée (partial) ─ file vision ─ Codex vision ─ passage complet (ready)
Mac : fermeture du bloc (2 s puis 8 s) ─ IPC ─ stockage ─ … même suite
Question : ancrage et liste de passages figés ─ file FIFO ─ agent ─ outils
```

La vision d'un bloc attend la transcription du même bloc, parce que le résumé mêle paroles et image. Ce choix est conservé : un passage complet coûte Whisper plus la vision, pas le plus long des deux.

## Diagnostic du code de départ

1. **L'index sémantique est rattrapé dans la question.** Un appel HTTP par passage, en série, sans borne ; le fichier d'index est réécrit en entier après chaque vecteur.
2. **Le processus Codex de perception est tué à chaque frontière de sujet**, tous les 20 appels et avant chaque réexamen. L'isolation recherchée demande un nouveau fil, pas un nouveau processus. Le préchauffage fait par l'app Mac est jeté dès le premier passage.
3. **La vision est suspendue tant qu'une question est en file ou en cours.** Chat, observation et réexamen sont trois processus distincts et Whisper continue de tourner : la suspension ne libère aucune ressource locale. Son coût n'était ni tracé ni attribué.
4. **L'instantané d'une question est figé à l'envoi.** Une transcription publiée deux secondes plus tard reste invisible.
5. **Les durées ne sont pas séparables et les pertes sont mal comptées.** Pas d'heure de réception ni d'attente en file ; un échec Whisper passe pour un silence ; un passage parlé sans vision n'apparaît pas dans `gaps`.
6. **Une lecture de quota informative est attendue avant chaque tour Codex**, avec un délai de 15 s.
7. **En surcharge audio, le passage entier est abandonné** alors que la voie vision est libre.

Ce qui n'est pas un problème, mesure à l'appui : le chargement du modèle Whisper (3 % du temps sur le VPS), le coût CPU des instantanés, la persistance du chat (31 à 33 ms pour 150 événements).

## Changements

### 1. Index sémantique alimenté en arrière-plan, recherche bornée

- **Changement.** `MomentIndex` reçoit les passages publiés (`observe`) : un lot en vol, une entrée par passage, le texte le plus récent remplace le précédent, un résultat périmé n'est jamais écrit, trois essais au plus par texte (une recherche qui le redemande en rouvre trois). Les envois de fond sont groupés toutes les 30 s. Après un lot en échec, les envois de passages attendent une pause commune (2 s, puis le double, 60 s au plus) ; le vecteur de la question reste demandé à chaque recherche. Une recherche demande son préfixe en priorité (`request`), attend au plus 1,5 s (`settle`), puis 2,5 s pour le vecteur de la question ; ce qui manque est classé lexicalement, compté dans `semantic: { eligible, indexed, pending }` et annoncé. `OpenRouterEmbeddings.embedMany` envoie jusqu'à 32 textes par requête, avec une seule réservation de budget. `EmbeddingStore` écrit un journal en ajout seul au lieu de réécrire tous les vecteurs.
- **Validation.** `tests/moment-index.test.cjs`, `tests/review-regressions.test.cjs` ; le test existant « index is lazy… » passe inchangé ; simulation.
- **Limites.** Avec une clé OpenRouter, le texte de chaque passage publié part vers OpenRouter au fil de la session, et plus seulement à la première recherche. `TVLENS_BACKGROUND_INDEX=0` limite les envois aux recherches ; la première recherche tardive est alors en partie lexicale, et le dit. Pendant une pause, une recherche n'attend plus l'index, mais elle demande encore le vecteur de sa question et peut l'attendre jusqu'à 2,5 s avant de répondre sur le texte ; après le retour du fournisseur, l'index peut rester en pause jusqu'à 60 s. Aucun appel réel à OpenRouter n'a été fait. Une requête en échec laisse sa réservation de budget, comme avant.

### 2. Preuves relues dans un préfixe figé

- **Changement.** L'ancrage, le début de portée, la liste des passages et leurs bornes restent figés. Au démarrage effectif de la réponse, puis avant `search_moments`, `get_transcript` et le contrôle de disponibilité d'`inspect_clip`, `VideoTools.refresh()` relit la version courante de ces mêmes passages, pour la même session seulement. Aucun passage n'est ajouté. Un journal borné garde chaque révision remise à l'agent, avec son rang de lecture ; la preuve retenue est la dernière consultation. Ce rang ne dépend pas de l'horloge de session, qui s'arrête pendant une pause : une lecture ancienne revenue en retard reste ancienne. `job.metrics.evidence` donne l'âge des preuves au démarrage et le nombre de relectures.
- **Validation.** `tests/evidence-refresh.test.cjs` : partial→ready, futur exclu, expiration avant le bail, isolation de session, annulation, provenance. `tests/review-regressions.test.cjs` : lecture tardive à révision égale, puis à horloge arrêtée.
- **Limite.** Un bloc capturé avant la question mais reçu après elle reste exclu.

### 3. Nouveau fil Codex au lieu d'un nouveau processus

- **Changement.** `CodexSessionClient.rotateThread()` ouvre un fil sur le processus vivant, sérialisé avec les tours, et retombe sur l'ancienne fermeture au moindre échec. Un contexte qui n'a servi aucun tour est gardé : le préchauffage n'est plus jeté, et le serveur préchauffe aussi l'agent d'observation. Le processus est recyclé toutes les 20 rotations. La lecture de quota ne retarde plus le tour. Les métriques d'un passage portent `coldStart`, `connectMs`, `threadReset`, `threadTurn`.
- **Corrections liées.** Une fermeture pendant une connexion ou pendant le nettoyage d'une connexion morte ne laisse plus de processus orphelin (reproduit sur le code de départ) ; le recyclage, introduit par la branche, est protégé de la même façon. Un processus mort pendant la poignée de main reste nettoyé, comme sur le code de départ. Deux `prepare` simultanés ne connectent plus deux fois.
- **Validation.** `tests/codex-thread-rotation.test.cjs`, `tests/codex-connect-race.test.cjs`, `tests/review-regressions.test.cjs` ; les tests d'isolation de `tests/topic-summary.test.cjs` passent inchangés. Le protocole local (codex-cli 0.160.1) accepte plusieurs `thread/start` et `thread/unsubscribe`, vérifié sur un processus réel sans identifiants ni tour de modèle.
- **Observé en réel.** Sur le VPS (codex-cli 0.158.0, une autre version que celle du Mac), une rotation a eu lieu entre deux passages sans redémarrage du processus : `coldStart: false`, `connectMs: 0`. Le préchauffage a servi : le premier passage n'a pas payé de connexion. À la fermeture, aucun processus ni dossier de session Codex n'est resté.
- **Limite.** Gain mesuré : le lancement et l'initialisation du processus, 54 à 333 ms sur ce Mac (61 à 454 ms avec son premier fil), contre 3 à 5 ms pour un fil supplémentaire. Dans le parcours réel, les deux premiers tours d'un fil (le fil préchauffé, puis le fil ouvert par rotation) ont duré 3,4 et 3,6 s, contre 3,1 à 3,5 s pour les trois tours suivants : deux observations, qui ne confirment pas la pénalité de 2,6 s retenue dans la simulation.

### 4. Traces par passage et pertes par cause

- **Changement.** Chaque passage porte `receivedMs`, `audioStartedMs`, `transcriptPublishedMs`, `visionQueuedMs`, `visionStartedMs`, `visionPublishedMs`, `revision` et, sur le chemin LG, `ingest.assembleMs`. Ces horodatages survivent à l'archivage ; les métriques détaillées restent sur les passages vivants. L'état expose `latency` (40 derniers passages), `coverage` (pertes comptées là où elles surviennent, temps de vision retenu par une question), `visionGaps` et `audioGaps`. L'état du serveur expose aussi les compteurs de l'index.
- **Échec Whisper.** Un échec déclaré par le transcripteur est compté (`coverage.audioError`), marqué sur le passage (`audioFailed`) et listé dans `audioGaps`. Le marqueur suit le passage dans `get_transcript`, les preuves d'une question et le détail d'un moment : une transcription vide n'y passe plus pour un silence. Les statuts du passage ne changent pas : un hôte sans Whisper garde des passages `ready` sur l'image seule, et le récapitulatif, Auto et les compteurs « analysé » continuent de fonctionner.
- **Validation.** `tests/session-latency.test.cjs`, `tests/server-ingest-path.test.cjs`.
- **Limites.** `receivedMs - endMs` mêle la fin de capture, l'envoi et l'assemblage. Les compteurs de `coverage` décrivent les deux voies séparées ; l'ancienne voie unique reste décrite par `gaps`. L'état grossit de 7 % (2,29 → 2,44 Mo à 2 h sur le banc).

### 5. Surcharge audio : on perd la transcription, pas le passage

- **Changement.** Quand Whisper prend du retard, le passage garde sa place dans la voie audio, sans transcription, puis rejoint la vision dans l'ordre d'observation. Il ne prend qu'une place libre : il n'évince jamais un passage parlé qui attend ses images, et la vision prend d'abord le passage qui vient d'être transcrit. Il finit `partial` avec `audioStatus: skipped`. Un passage qui expire dans la voie audio est compté sur les deux voies.
- **Validation.** `tests/session-latency.test.cjs`, `tests/split-perception.test.cjs` (assertions mises à jour), simulation « rafale Whisper ».
- **Limite.** Une description sans paroles est plus pauvre ; elle est marquée comme telle. Au-delà de deux passages sans paroles par rafale, les suivants sont perdus en entier et comptés.

### 6. Vision pendant une question : option, désactivée par défaut

- **Changement.** `TVLENS_VISION_DURING_ASK=1` laisse partir un appel de vision pendant une question, toujours un seul à la fois. Par défaut la suspension reste, et son coût est mesuré : `coverage.visionBlockedMs`, et la cause `asking` seulement quand la question seule retient la voie.
- **Observé en réel, mode par défaut.** Pendant la question du parcours réel, la vision de fond a été retenue 39,2 s (`coverage.visionBlockedMs`) : un passage n'a été complet que 50,4 s après sa fermeture, contre 14,7 à 17,6 s pour les trois dont la vision était partie avant la question. C'est une limite réelle du mode par défaut, relevée une fois. Ce n'est pas une comparaison avec l'option.
- **Limite.** L'effet d'un appel de vision concurrent sur la latence du chat chez Codex n'est pas mesuré. Voir « Désaccords ».

### 7. Chemin LG

- **Changement.** Images et rééchantillonnage audio en parallèle ; charge utile vérifiée sans décodage puis décodée une fois ; durée d'assemblage renvoyée ; un ffmpeg tué par son délai fait échouer le bloc au lieu de laisser passer un fichier tronqué ; le préflight CORS est mis en cache dix minutes.
- **Réexamen LG.** `trimWav` supposait un en-tête de 44 octets, or ffmpeg écrit un bloc `LIST` avant les échantillons : tout réexamen d'un passage LG perdait son audio. Corrigé. Un passage réexaminé en entier garde ses octets et réutilise sa transcription.
- **Validation.** `tests/media-asr-options.test.cjs`, `tests/server-ingest-path.test.cjs`, `tests/clip-audio.test.cjs`.
- **Limite.** Aucun gain mesurable sur le temps de réception d'un bloc, ni sur le Mac ni sur le VPS. L'assemblage coûte 0,5 à 0,7 s par bloc sur le VPS en rejeu, et jusqu'à 1,7 s dans le parcours réel ; sa décomposition (dont l'encodage WebM, inchangé) n'a pas été mesurée. Le sortir du chemin de la requête changerait le contrat de disponibilité des médias.

### 8. Whisper

- **Contexte d'encodeur réduit, en option.** `TVLENS_WHISPER_AUDIO_CTX=auto` passe `-ac` selon la durée du WAV (512 pour 8 s). Désactivé par défaut. Le cache distingue les deux réglages. `scripts/bench-whisper.cjs` compare temps et transcriptions ; avec `--no-text`, son rapport ne garde que durées, nombres de mots, mots différents et paramètres.
- **Un seul processus pour le même audio.** La voie de fond et un réexamen qui demandent le même audio partagent un seul processus Whisper, tué seulement quand tous les demandeurs ont renoncé.
- **Validation.** `tests/media-asr-options.test.cjs`, `tests/transcriber-sharing.test.cjs` ; bancs réels sur le Mac et le VPS.
- **Limite.** Le contexte réduit n'est essayé que sur une voix de synthèse : aucun mot différent sur huit comparaisons sur le VPS, un mot sur 26 différent sur le Mac (fin de bloc coupée). Sur parole réelle il n'est pas évalué : les cinq audios du parcours réel ont été purgés à la fin de la session, comme le serveur le fait toujours, avant que la comparaison soit demandée. L'option reste désactivée par défaut. Le partage d'un processus Whisper ne joue que pour un audio identique : un réexamen qui découpe un passage relance une transcription (voir le parcours réel).

### 9. Backend de perception local

- **Changement.** `adapters/local-vlm-agent.cjs` parle l'API `/api/chat` d'Ollama derrière le contrat d'agent d'analyse existant : prompt, contexte et validation restent ceux de `CodexPerception`. `TVLENS_PERCEPTION_BACKEND=local` avec `TVLENS_LOCAL_VLM_URL` et `TVLENS_LOCAL_VLM_MODEL` ; une valeur inconnue, incomplète ou mal saisie fait échouer le démarrage de session au lieu de retomber sur Codex. Les métriques du passage portent l'identité du backend, sa taille de contexte et les durées qu'il rapporte.
- **Validation.** `tests/local-vlm-agent.test.cjs`, contre un faux serveur HTTP.
- **Limite.** Aucun modèle local n'a été appelé. Rien n'est mesuré sur GX10.

### 10. Autres corrections

- Sortie Codex décodée en flux UTF-8 : un caractère accentué coupé entre deux blocs n'est plus corrompu (reproduit sur le code de départ).
- La chaîne de purge se remet d'une suppression échouée et la retente ; les `ingest` simultanés gardent l'ordre d'observation ; l'analyse démarre avant la miniature et la purge.
- Le texte d'un passage parlé sans description ne change plus à l'archivage.
- Les réglages d'exécution sont résolus à chaque démarrage, y compris par l'app Mac empaquetée : ceux du fichier importé sont conservés, que ce fichier apporte ou non une clé OpenRouter ; l'environnement du démarrage prime et n'est pas conservé. Un `TVLENS_BACKGROUND_INDEX=0` ou un `TVLENS_PERCEPTION_BACKEND=local` importé tient donc aussi quand l'app est ouverte depuis le Finder. Sans chiffrement disponible sur l'hôte, rien n'est conservé, comme avant.
- Rapport de capture TV : chaque abandon porte une cause (`dropReasons`). Vérifié sur la TV pour la cause `foreignApp` (premier essai) et sur une capture sans abandon (second essai) ; non déployé.

## Résultats

### Simulation

**Tout ce qui suit est simulé.** Les fournisseurs sont contrôlés et leurs délais modélisés : ni la baisse de `search_moments`, ni la couverture, ni les durées de question de cette section n'ont été observées avec Codex ou OpenRouter. La section mesure ce que l'orchestration fait de délais donnés.

Deux arbres de sources, le code de départ et cette branche, sur **six graines** et **deux hypothèses de délai d'embedding** : 350 ms par requête (plus 4 ms par texte), puis 150 ms. Les autres délais (hôte CPU) : Whisper 4,4 à 6,6 s par bloc, avec 8 % de cas lents à 8,5–10,3 s ; vision 3,1 à 5,2 s, avec 5 % de cas lents à 5,2–6,9 s ; premier tour d'un fil neuf +2,6 s ; démarrage du processus Codex 0,4 s. Le scénario Mac utilise un Whisper à 0,4–0,7 s. Le simulateur ne facture aucun coût à deux appels de modèle simultanés.

Les plages ci-dessous couvrent les six graines. Brut : `sim-seeds/` et `sim-seeds-summary.json` ; les fichiers `sim-*.json` sont la graine de référence.

**Session de 2 h, 868 passages, 18 questions, une recherche toutes les 21 min**

| Mesure | Avant, 350 ms | Avant, 150 ms | Après, aux deux délais |
| --- | ---: | ---: | ---: |
| Questions ayant répondu | 13 sur 18 | 18 sur 18 | 18 sur 18 |
| `search_moments`, médiane | 53 s | 23 s | 0,2 à 0,4 s |
| Passages sans vision | 26 à 29 | 11 à 14 | 0 ou 1 |
| Retard d'analyse maximal | 75 à 83 s | 50 à 58 s | 25 à 33 s |
| Question la plus longue ayant abouti | 23 à 24 s | 38 à 39 s | 15 à 22 s |
| Passage complet après fermeture du bloc, 95e centile | 15,9 à 16,5 s | 15,8 à 16,1 s | 15,4 à 15,9 s |
| Démarrages du processus Codex de perception | 72 | 72 ou 73 | 4 |

C'est le résultat robuste : sur le code de départ le rattrapage d'index vit dans la question, et son coût croît avec la session. À 350 ms, cinq questions expirent à 60 s ; à 150 ms elles aboutissent, mais les cinq recherches espacées durent 21 à 23 s. La branche garde encore un passage sans vision dans deux graines sur six : la suspension de la vision pendant une question existe toujours.

**Session de 2 h, aucune recherche avant 110 min**

| Mesure | Avant | Après, index de fond | Après, index à la demande (graine de référence) |
| --- | ---: | ---: | ---: |
| Questions ayant répondu, six graines, deux délais | 15 sur 17 | 17 sur 17 | — |
| Première recherche (graine de référence, 350 ms) | pas de réponse (limite de 60 s) | 0,7 s, 794 passages sur 794 indexés | 1,9 s, 96 sur 794 indexés, le reste classé sur le texte et annoncé |
| Recherche suivante, 2 min plus tard | pas de réponse | 0,4 s | 0,4 s, tout indexé |
| Requêtes d'embeddings | 329 avant les deux expirations, toutes dans les questions ; 327 passages indexés sur 794 | 242, dont 3 dans les deux recherches | 27 |

**Session de 10 min sur LG, 73 passages, 9 questions dont une annulée et deux en file**

| Mesure | Avant, 350 ms | Après, 350 ms | Avant, 150 ms | Après, 150 ms | Après, vision pendant les questions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Passages sans vision | 1 à 3 | 0 ou 1 | 0 à 2 | 0 ou 1 | 0 |
| Passage complet, 95e centile | 20,5 à 22,0 s | 17,1 à 21,1 s | 17,8 à 21,9 s | 16,9 à 20,9 s | 15,0 à 16,2 s |
| Retard d'analyse maximal | 41,5 s | 24,9 à 41,5 s | 24,9 à 41,5 s | 24,9 à 41,5 s | 16,6 à 24,9 s |
| Question la plus longue | 24,8 à 27,2 s | 18,4 à 20,8 s | 18,5 à 23,4 s | 18,2 à 20,8 s | 17,6 à 20,1 s |
| Temps de vision retenu par des questions | non mesuré | 31 à 49 s | non mesuré | 31 à 49 s | 0 s |

**Sur 10 minutes, l'avantage de la branche dépend de l'hypothèse de délai.** À 350 ms il est modeste ; à 150 ms il disparaît, et sur la graine de référence la branche fait un peu moins bien que le code de départ (un passage sans vision contre aucun, question la plus longue 20,8 s contre 19,6 s). Un écart d'un passage sur 73 est dans le bruit de la simulation. Sur ces six graines la branche lit toutes les transcriptions récentes disponibles au moment de la lecture (4 ou 5) ; le code de départ en lit 3 ou 4 sur 4 ou 5.

**Autres scénarios**

| Scénario | Avant | Après |
| --- | --- | --- |
| Mac, 10 min | 95e centile du passage complet 13,6 à 15,3 s à 350 ms, 10,5 à 12,9 s à 150 ms ; question la plus longue 20,6 à 24,0 s, puis 16,4 à 19,6 s | 8,7 à 10,6 s ; 13,5 à 16,2 s |
| Rafale Whisper lente | 1 ou 2 passages perdus en entier | aucun perdu en entier ; 0 à 3 restent sans vision en mode par défaut, aucun avec la vision pendant les questions. Sur la graine de référence, 2 passages sont décrits sans paroles et listés dans `audioGaps` |
| Rétention de 60 s | réexamen d'un passage expiré refusé avec « Média expiré » | identique |

Aucune preuve postérieure à l'ancrage n'est vue par une question, dans aucune des 36 exécutions (six graines, deux délais, trois configurations).

La médiane du passage complet bouge peu : elle est faite de Whisper puis de la vision. Ce qui change sur une longue session, ce sont les queues, les pertes et le chemin des questions.

Écarts entre ces hypothèses et le parcours réel (cinq blocs, une question) : la vision réelle a tenu dans la plage modélisée (3,1 à 3,6 s), et le surcoût de 2,6 s modélisé pour le premier tour d'un fil neuf n'a pas été observé. Whisper n'est resté dans la plage nominale qu'une fois sur cinq (4,7 s) : deux blocs la dépassent de peu (6,7 s pour 6,6 s) et deux dépassent même les cas lents modélisés (13,0 et 30,9 s). La question réelle a duré 43,4 s avec un réexamen, plus que toute question aboutie de la simulation (27 s au plus avec la branche, 39 s avec le code de départ). Le démarrage du processus et le délai d'embedding n'ont pas pu être comparés. Les scénarios simulés sous-estiment donc le coût d'une question avec réexamen sur cet hôte.

### Rejeu en temps réel sur le VPS (vision et chat simulés)

Douze blocs de forme LG (quatre PNG 1280×720, 8 s de son 48 kHz stéréo, voix de synthèse française) envoyés en boucle locale à un serveur d'essai lancé depuis une copie temporaire. Port de test, dossier de données temporaire, service déployé non touché. Whisper CPU sur 2 threads, vision simulée. L'hôte a 2 vCPU et les partage avec d'autres services. Les passes « cette branche » sont des révisions successives de la branche, antérieures aux dernières corrections ; la troisième passe utilise un client qui applique les délais de la TV.

| Mesure (ms), trois passes | Code de départ | Cette branche | Cette branche, `audio-ctx auto` (une passe) |
| --- | ---: | ---: | ---: |
| Réponse de `POST /v1/segments`, médiane | 927, 815, 775 | 659, 742, 882 | 665 |
| Réponse de `POST /v1/segments`, maximum | 5 927, 3 867, 1 073 | 1 302, 1 593, 3 041 | 1 677 |
| Assemblage du bloc, médiane | non mesurable | 537, 594, 737 | 539 |
| Whisper, médiane | 5 426, 5 085, 4 848 | 4 953, 4 985, 5 864 | 2 534 |
| Whisper, chargement du modèle (moyenne) | 218, 182, 167 | 177, 169, 179 | 166 |
| Transcription publiée après fermeture du bloc, médiane | 7 912, 5 925, 5 634 | 5 986, 5 821, 7 283 | 3 322 |
| Passage complet (vision simulée), médiane | 12 037, 10 418, 10 161 | 9 739, 10 109, 11 303 | 7 811 |

Lecture :

- **Aucune différence par bloc n'est attribuable à la branche.** Les deux premières passes la donnaient plus rapide et plus régulière ; la troisième donne l'inverse. L'écart entre passes dépasse l'écart entre codes. La charge de l'hôte en est la cause probable ; elle n'est pas dans les fichiers bruts, seulement dans mes notes (1,5 à 3,9).
- Sur cette voix de synthèse, Whisper prend environ 5 s pour 8 s de son. La validation du 4 octobre donnait 5,18 s en moyenne sur neuf passages YouTube réels, sans question simultanée. Le chargement du modèle en pèse 3 % : un service ASR résident ne gagnerait pas plus. Dans le parcours réel le temps a été plus long et plus dispersé (plus bas) ; cet essai ne sépare pas l'effet du contenu de celui de la concurrence.
- L'assemblage coûte 0,5 à 0,7 s par bloc, trois fois plus que sur le Mac. Whisper ne peut pas démarrer avant.
- Une réception a dépassé 5 s, le délai auquel le client TV abandonne et renvoie. La dernière passe applique ce délai : aucun renvoi sur 24 blocs.
- **`audio-ctx auto` divise le temps Whisper par deux sur voix de synthèse.** Banc dédié sur quatre extraits, deux répétitions : 4,5 à 6,5 s en contexte complet, 1,7 à 2,6 s en contexte réduit, aucun mot différent sur huit comparaisons. Sur parole réelle : non évalué.

### Mesures sur le Mac

| Mesure | Résultat |
| --- | --- |
| Whisper base, 8 s de français synthétique, CPU seul, 2 threads, banc isolé | 3 372 ms, dont encodeur 2 498 ms et chargement 51 ms ; 1 149 ms avec `-ac 512` |
| Rejeu de douze blocs, une passe par configuration, transcription publiée après fermeture (moyennes) | 2 170 ms avant, 2 103 ms après, 1 196 ms avec `audio-ctx auto`. Whisper y mesure 1,8 s en moyenne, moins que le banc de la ligne du dessus : la machine était inégalement chargée |
| Assemblage d'un bloc LG, deux passes alternées | 189 et 204 ms avant, 240 et 185 ms après : aucune différence mesurable |
| Démarrage du processus Codex App Server (codex-cli 0.160.1), sans identifiants | 54 à 333 ms, 61 à 454 ms premier fil compris ; fil supplémentaire 3 à 5 ms |
| État de session à 2 h | 2,29 Mo avant, 2,44 Mo après, demandé chaque seconde par la TV |

### Parcours réel complet : TV → VPS → Whisper → Codex

Un seul essai, le 13 octobre vers 0 h 34. Tout y est réel sauf la recherche sémantique, absente.

**Version testée : la branche avant les derniers correctifs.** Le manifeste de l'essai (`real-trial-vps-source-manifest.json`) identifie les 64 fichiers exécutés. Trois d'entre eux ont changé ensuite : `core/video-tools.cjs` (ordre de lecture des preuves, sur le chemin de toute question), `adapters/config.cjs` (conservation des réglages importés, inactive sur le serveur) et `core/ports.cjs` (un commentaire). Hors du serveur, `scripts/bench-whisper.cjs` et `scripts/replay-lg-stream.cjs` ont aussi changé. Ce parcours n'a donc pas exercé la totalité du code final : l'ordre de lecture des preuves n'est validé que par les tests.

| Élément | Ce qui a tourné |
| --- | --- |
| Capture | la TV, YouTube au premier plan, `capture.py` et `transport.py` de la branche lancés depuis un dossier temporaire ; 40 s, soit cinq blocs de 8 s (quatre PNG 1280×720 et un WAV 48 kHz stéréo chacun) |
| Serveur | `server/main.cjs` de la branche : 64 fichiers, sommes identiques à la copie alors validée par 285 tests ; copie temporaire sur le VPS, port de test lié à la seule interface privée, dossiers de données et temporaire dédiés, utilisateur du service, environnement vide |
| Whisper | whisper.cpp v1.8.3 (commit `2eeeba5`), modèle `ggml-base.bin` multilingue (147 951 465 octets, SHA-256 `60ed5bc3…fba2efe`), binaire `whisper-cli` (SHA-256 `f830846e…e5ce09`), CPU, 2 threads, contexte complet, langue `fr` |
| Vision, réexamen, chat | codex-cli 0.158.0 avec l'authentification déjà présente sur le VPS, modèle `gpt-6-luna` pour les trois rôles, effort de raisonnement `max` pour le chat : les réglages du service déployé |
| Recherche sémantique | **non testée** : aucune clé OpenRouter, pas d'index ; l'agent n'a pas appelé `search_moments` |

La TV a envoyé cinq blocs sur cinq : 20 images, aucun abandon, aucun renvoi. YouTube était au premier plan avant et après, et aucun bloc n'a été écarté pour application étrangère.

| Passage | Reçu | Transcription publiée | Vision démarrée | Passage complet | Whisper | Vision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,3 s | 14,3 s | 14,3 s | 17,6 s | 13,0 s | 3,4 s |
| 2 | 2,6 s | 12,9 s | 12,9 s | 16,5 s | 6,7 s | 3,6 s |
| 3 | 2,8 s | 11,5 s | 11,5 s | 14,7 s | 6,7 s | 3,2 s |
| 4 | 2,8 s | 8,1 s | 47,3 s | 50,4 s | 4,7 s | 3,1 s |
| 5 | 1,6 s | 32,5 s | 42,3 s | 45,8 s | 30,9 s | 3,5 s |

Les quatre premières colonnes de durée sont comptées depuis la fermeture du bloc. Les deux dernières sont des durées de calcul.

- **Couverture.** Cinq passages sur cinq `ready`, transcrits et décrits. Aucune perte, aucun trou (compteurs de perte de `coverage` à zéro, `visionGaps` et `audioGaps` vides), ordre d'observation respecté.
- **Réception.** 1,3 à 2,8 s après la fermeture du bloc, dont 0,5 à 1,7 s d'assemblage : 1,5 à 1,7 s pour les trois blocs reçus pendant qu'un Whisper tournait, 0,5 s pour les deux autres.
- **Whisper.** Médiane 6,7 s, moyenne 12,4 s, maximum 30,9 s pour 8 s de son. Chargement du modèle 0,15 à 0,27 s ; encodeur 3,1 à 4,7 s ; décodeur 1,1 à 24,4 s. Le premier bloc a coûté 13,0 s avec cinq reprises du décodeur. Le cinquième a coûté 30,9 s : pendant 23,3 s il a tourné en même temps que le Whisper du réexamen, soit deux processus à 2 threads sur 2 vCPU.
- **Vision.** 3,1 à 3,6 s par passage, aucun démarrage à froid.
- **Vision retenue par la question.** 39,2 s. Le passage 4, transcrit 8,1 s après sa fermeture, n'a été décrit qu'à 50,4 s.

**La question.** Posée à 36,2 s de session, après trois transcriptions ; à cet instant un passage était partiel et un autre encore en transcription.

| Mesure | Valeur |
| --- | ---: |
| Durée totale | 43,4 s |
| Début du premier raisonnement du modèle | à 3,1 s |
| Premier appel `inspect_clip` | émis à 4,4 s, refusé en 1 ms (motif non enregistré) |
| Second appel `inspect_clip` | 31,7 s |
| — dont transcription locale de l'extrait (6,1 s de son) | 23,3 s |
| — dont comparaison des images par le modèle | 5,5 s |
| Relectures des preuves | 2 ; preuves plus récentes de 7,9 s que l'instantané figé |
| Citations | 1, dont la fin précède l'ancrage de 3,9 s ; aucune après l'ancrage |
| Réponse | 44 mots, classée `insufficient` par le modèle, 2 limites déclarées, aucune source web |

Ce que cet essai établit :

- Le chemin capture, ingestion, Whisper, vision, question et réexamen fonctionne avec de vrais fournisseurs, sans perte ni preuve postérieure à l'ancrage. Seul `inspect_clip` a été appelé : ni `search_moments` ni `get_transcript`.
- La relecture des preuves a lieu en conditions réelles : deux relectures, dans la liste de passages figée. La citation, elle, vient du réexamen de l'extrait ; cet essai ne dit pas ce que la relecture a apporté à la réponse.
- La rotation de fil et le préchauffage fonctionnent sur la version de Codex du VPS.
- Les agents Codex du chat, de l'observation et du réexamen ont servi ; à la fermeture il n'est resté ni processus, ni dossier de session, ni média.

Ce qu'il révèle :

- **Plus de la moitié de la question a servi à retranscrire un extrait déjà transcrit.** Le réexamen a relancé Whisper sur 6,1 s du passage 4, dont la transcription complète était publiée depuis 6,4 s. Réutiliser cette transcription changerait la provenance annoncée (elle couvre 8 s, pas 6,1) : c'est une décision de contrat, non prise ici.
- **La marge de Whisper sur le temps réel est mince dans cet essai.** Médiane 6,7 s pour des blocs de 8 s, et deux blocs sur cinq au-delà (13,0 et 30,9 s). Rien n'a été perdu, mais la voie audio a déjà pris du retard : trois blocs ont attendu avant Whisper, jusqu'à 3,6 s. Seule une session longue dira si ce retard s'accumule jusqu'à sauter des transcriptions.
- **Deux Whisper ensemble sur 2 vCPU.** La seule fois observée, celui du passage 5 et celui du réexamen ont tourné ensemble 23,3 s et ont été lents (30,9 s et 23,3 s). Il n'y a pas d'essai témoin : le premier bloc a aussi coûté 13,0 s sans second Whisper.

Ce qu'il n'établit pas : un avant/après (un seul essai, sur la branche seule), une tendance (cinq blocs), la qualité de la réponse (le texte n'a pas été conservé), la recherche sémantique.

Isolation et nettoyage : le service déployé (révision `7015a64`) n'a pas été touché, il est resté actif sans redémarrage ; l'appairage, le contrôleur et le rapport de capture de la TV sont intacts ; les dossiers temporaires du VPS et de la TV ont été supprimés.

### Premier essai depuis la TV, sans média

Le 12 octobre vers 23 h 44, même montage avec vision et chat simulés. La TV a joint le serveur d'essai et ouvert une session, mais une autre application que YouTube était au premier plan au lancement : cinq blocs sur cinq abandonnés, chacun avec sa cause (`foreignApp`), aucun média envoyé. Je n'ai pas changé d'application. Relevé : `coordinator-tv-attempt-1-evidence.json`, qui ne garde que les compteurs ; d'après mes notes de session, l'application était AirPlay et la sonde sans jeton a reçu son 401 en 253 ms.

Relevé en lecture seule : le dernier rapport de capture du service déployé indique 185 blocs envoyés et 40 abandonnés à la capture (18 %), sans cause.

## Revue indépendante

Six relecteurs, un par domaine (preuves, session, index, client Codex, médias, transversal), chacun suivi d'un vérificateur chargé de reproduire ou de réfuter. Les relecteurs ont rendu 35 constats ; les vérificateurs les ont tous confirmés, dont deux majeurs et un troisième ramené de majeur à mineur. Ils en ont ajouté quatre : un doublon, un majeur introduit par une première correction, deux mineurs. Aucun critique.

| Constat | Gravité retenue | Correction |
| --- | --- | --- |
| Un passage tout juste transcrit pouvait être évincé de la file vision par les passages sans paroles qui le suivaient | majeur | la vision prend d'abord la tête ; un passage sans paroles ne prend qu'une place libre |
| Un échec Whisper laissait tous les passages `partial` : sur un hôte sans Whisper, récapitulatif, Auto et compteurs « analysé » s'arrêtaient | majeur | l'échec est compté et marqué, les statuts restent ceux d'avant |
| L'app Mac empaquetée ignorait les nouveaux réglages, dont l'arrêt de l'index de fond | mineur (le code de départ ignorait déjà l'environnement sur ce chemin) | réglages résolus à chaque démarrage sur tous les chemins |
| La première correction du point précédent ne conservait aucun réglage : un arrêt de l'index de fond écrit dans le fichier importé ne tenait plus au lancement suivant depuis le Finder, et l'envoi reprenait sans rien dire | majeur | les réglages du fichier importé sont conservés, avec ou sans clé OpenRouter ; l'environnement prime et n'est pas conservé ; le jeton du modèle local n'est jamais conservé |

Les deux autres ajouts des vérificateurs sont corrigés : une recherche attendait 1,5 s pour rien pendant une pause de l'index, et un client Codex fermé pendant le nettoyage d'une connexion morte se reconnectait. S'y ajoute la fin d'une correction : l'échec Whisper n'atteignait ni `get_transcript` ni le détail d'un moment.

Les corrections de code sont fixées par des tests, la plupart dans `tests/review-regressions.test.cjs` (dix-neuf tests). Quatorze d'entre eux échouaient sur la copie relue, d'après le vérificateur transversal. La preuve rouge/vert est conservée pour les sept derniers correctifs : chaque test échoue quand on retire son correctif (`regression-red-green.json`). Les corrections de documents et de bancs ne sont fixées par aucun test.

La revue a aussi corrigé ce document : la simulation ne comptait pas le recyclage du processus Codex (4 démarrages en 2 h, pas 2), et le scénario « première recherche tardive » n'en était pas une.

### Vérification du rapport final

Six vérificateurs en lecture seule ont ensuite confronté ce rapport aux fichiers bruts, au code, au journal de la revue et aux règles de confidentialité (`final-report-verification.json`). Ils ont trouvé trois défauts de code, corrigés et testés :

- Les réglages d'un fichier importé sans clé OpenRouter n'étaient pas conservés par l'app Mac : un backend local importé retombait sur Codex au lancement suivant.
- À horloge de session arrêtée (pause), une lecture ancienne revenue en retard pouvait encore remplacer la preuve retenue. L'ordre de lecture ne dépend plus de l'horloge.
- Le banc Whisper écrivait les transcriptions dans son rapport. `--no-text` donne un rapport sans texte.

Ils ont aussi corrigé ce rapport : gains simulés donnés sans leurs conditions, écarts attribués à la charge de l'hôte ou au contenu sans mesure, parcours réel présenté comme plus général qu'un essai.

### Limites restantes, non corrigées

- **Surcharge audio.** Au-delà de deux passages sans paroles par rafale, les suivants sont toujours perdus en entier, et comptés.
- **Purge.** Une suppression de média qui échoue durablement n'a pas de compteur : seul `lastError` la signale. Chaque balayage retente tous les médias en attente, sans borne, et `ingest` attend ce balayage.
- **Vecteur de la question pendant une pause de l'index.** Il est demandé à chaque recherche, même quand le fournisseur vient d'échouer ; la recherche peut l'attendre 2,5 s. Une requête d'embedding en échec laisse sa réservation de budget, comme sur le code de départ.
- **Câblage sans test.** Aucun test ne fixe l'intervalle de regroupement (30 s) ni la taille de file (2 048) passés à l'index, le préchauffage de l'agent d'observation par le serveur, ni la fermeture de l'index par l'app Mac. La simulation construit son propre index au lieu de passer par le runtime.
- **Ancienne voie unique.** Les compteurs `coverage` ne la décrivent pas. Seuls l'adaptateur de démonstration et les tests l'empruntent ; deux relecteurs l'ont trouvée identique au code de départ sur des ordonnancements aléatoires, sans fichier brut conservé.
- **Index.** Un appelant qui remettrait à l'index une copie ancienne d'un passage remplacerait un texte plus récent en attente ; le câblage de production ne le fait pas. Les compteurs de l'index ne sont lisibles que dans l'état du serveur. À la fermeture, un lot en cours d'écriture est compté abandonné même si ses vecteurs ont été écrits.
- **Échec Whisper.** `transcriptPublishedMs` est encore horodaté pour une transcription en échec, comme sur le code de départ : les délais de `latency` l'incluent.

Aucun constat de la revue n'a été réfuté.

## Désaccords et arbitrages

- **Service ASR résident : non.** Le PRD V2 le garde en candidat. Le chargement du modèle pèse 150 à 270 ms dans le parcours réel et 170 à 220 ms en moyenne sur voix de synthèse (pointes de 0,3 à 0,8 s). Le temps part dans l'encodeur (3 à 5 s) et, dans le parcours réel, dans le décodeur (jusqu'à 24 s).
- **Vision pendant les questions : je l'activerais, sous réserve d'un essai.** Les trois agents sont des processus distincts, Whisper tourne déjà pendant les questions, et un réexamen lance déjà un second appel Codex pendant que le tour du chat est ouvert. Le parcours réel montre le coût du mode par défaut : 39,2 s de vision retenue par une seule question. En simulation, sur six graines, l'option supprime les passages restés sans vision et ramène le 95e centile du passage complet de 17,1–21,1 s à 15,0–16,2 s sur LG en 10 min ; le gain est faible sur 2 h (15,4–15,9 s contre 15,0–15,3 s). Mais le simulateur ne facture rien à deux appels simultanés : il ne dit rien d'un ralentissement du chat, et la question la plus longue y raccourcit dans certains scénarios et s'allonge dans d'autres. Je l'ai laissée désactivée parce que le PRD V2 l'a arbitré ainsi et que cet effet n'est pas mesuré : le parcours réel n'avait pas de témoin. La comparaison tient en dix minutes : même extrait, six questions, avec puis sans l'option, en comparant `job.metrics.totalMs` et `coverage`.
- **Recherche strictement « cache seulement » : non.** Le PRD V2 interdit tout appel d'embedding de passage dans la question. J'ai gardé une attente bornée à 1,5 s : sans elle, une recherche faite avant que l'index ait suivi serait toujours purement lexicale.
- **Une perte possible hors du backend.** Le dernier rapport de capture du service déployé compte 40 blocs abandonnés pour 185 envoyés (18 %), sans cause. On ne sait pas s'il s'agit de pertes ou de blocs écartés parce qu'une autre application était au premier plan, et les pertes du backend sur cette session n'ont pas été lues. Les compteurs par cause sont prêts côté TV.
- **Seuils de 20 % et p95 du PRD.** Trois passes de douze blocs sur le VPS se contredisent déjà sur le signe de l'écart. Ces seuils valent pour des séries répétées, pas pour une passe.

## Limites et risques

- Codex réel : un seul essai de cinq blocs et une question, sur la version d'avant les derniers correctifs. Aucun appel à OpenRouter ni à un modèle local : la recherche sémantique réelle et le backend local ne sont pas mesurés.
- Aucune comparaison avant/après avec de vrais fournisseurs. Les gains chiffrés de la branche sont simulés, et dépendent de la durée de session et du délai d'embedding supposé.
- Les rejeux et le parcours réel tournent sur un hôte partagé avec d'autres services ; sa charge n'est pas dans les fichiers bruts.
- Le service déployé n'est pas cette branche. Le parcours réel a tourné à côté de lui.
- La rotation de fil dépend du protocole App Server : vérifiée sur codex-cli 0.160.1 (Mac, sans tour de modèle) et observée une fois sur 0.158.0 (VPS). Une version qui la refuse retombe sur l'ancienne fermeture.
- Rien ne coordonne deux Whisper simultanés (voie de fond et réexamen). La seule fois observée, sur 2 vCPU, les deux ont été lents.
- L'état renvoyé par `/v1/state` grossit avec la session et la branche l'alourdit de 7 %. La TV le demande chaque seconde. Non traité : cela demande un changement du client TV.
- Le récapitulatif vivant (Mac) n'a pas été touché. La cartographie signale qu'il cesse de se mettre à jour au-delà de 240 000 caractères d'entrée ; à vérifier.
- Les limites laissées par la revue sont listées plus haut, sous « Limites restantes, non corrigées ».

## Validations à faire ensuite

Par ordre d'utilité, d'après le parcours réel.

1. **`audio-ctx` sur parole réelle.** Refaire une capture bornée en gardant les WAV le temps du banc : `node scripts/replay-lg-stream.cjs --model <modèle> --serve 200 --bind <interface privée> --port <port de test> --client-config <fichier> --keep-audio <dossier>`, puis `node scripts/bench-whisper.cjs --model <modèle> --threads 2 --audio-ctx 0,512,auto --repeats 3 --no-text --out <dossier>/banc.json <dossier>/*.wav`, puis supprimer les WAV. Avec `--no-text`, le rapport ne garde que durées, nombres de mots, mots différents et paramètres ; sans cette option il contient les transcriptions. Ce n'est pas une vérité terrain, seulement une comparaison au contexte complet : n'activer `TVLENS_WHISPER_AUDIO_CTX=auto` que si les écarts de mots sont négligeables.
2. **Vision pendant les questions.** Dix minutes avec puis sans `TVLENS_VISION_DURING_ASK=1`, six questions à chaque fois, même contenu.
3. **Session longue sur contenu réel.** Vingt minutes de capture : lire `coverage.audioSkipped`, `audioGaps` et `latency` pour savoir si Whisper tient le temps réel.
4. **Recherche sémantique réelle.** Avec une clé OpenRouter, une recherche après vingt minutes : lire `semantic`, `index` et la durée de `search_moments`.
5. **Décision de contrat sur le réexamen.** Réutiliser la transcription d'un passage quand l'extrait demandé en couvre l'essentiel, en annonçant l'intervalle réellement transcrit.
6. **Rejouer le parcours réel sur le code final.** L'ordre de lecture des preuves a changé après l'essai.

Le parcours réel se rejoue sans déploiement : `server/main.cjs` lancé depuis une copie temporaire avec `TVLENS_SERVER_DATA`, `TVLENS_BIND` et `TVLENS_PORT` dédiés, puis, depuis un dossier temporaire de la TV et YouTube au premier plan, `capture.py --config <appairage du serveur d'essai> --seconds 40 --report <fichier temporaire>`. Sans `--report`, le rapport de capture du contrôleur déployé est écrasé. Pendant l'essai, lire `GET /v1/state` et ne garder que les nombres : `session.latency`, `session.coverage`, `visionGaps`, `audioGaps`, `index`, `chat.jobs[].metrics`. Après, comparer blocs envoyés et passages reçus, puis lire `dropReasons`.

**Seul un parcours devant la TV confirme** l'ouverture du panneau, le redimensionnement de la vidéo, le focus télécommande, la dictée, l'absence de coupure du son, et le délai perçu entre une phrase et son apparition dans la frise.

**GX10, quand il sera accessible**

1. Ollama avec le modèle candidat, puis `TVLENS_PERCEPTION_BACKEND=local`, `TVLENS_LOCAL_VLM_URL`, `TVLENS_LOCAL_VLM_MODEL`, et `TVLENS_LOCAL_VLM_NUM_CTX` après vérification de la taille réelle du prompt et des images.
2. Dix blocs identiques à froid puis à chaud. Lire par passage `metrics.providerTimings` (chargement, lecture du prompt, génération), `visionMs` (transport compris) et `latency` (attentes). C'est la séparation demandée pour l'essai A : fermeture du bloc, attente, transport, calcul.
3. Vérifier à la main le JSON et le français avant toute mesure de débit.

Reste à écrire pour le GX10 : l'essai vidéo natif (variante A du PRD), que cet adaptateur image par image ne couvre pas.

## Tests et commandes

```bash
# Suite hors ligne (Node 24). Dans un worktree sans node_modules : NODE_PATH=<checkout>/node_modules
node --test tests/*.test.cjs          # 287 tests
python3 -m unittest tests/test_tv_control.py

# Simulation avant/après
node scripts/simulate-stream.cjs --scenario all --out apres.json
node scripts/simulate-stream.cjs --root <sources de départ> --scenario all --out avant.json
node scripts/simulate-stream.cjs --diff avant.json apres.json

# Rejeu en temps réel, port et dossier temporaires
node scripts/replay-lg-stream.cjs --model <ggml-base.bin> --blocks 12 --threads 2

# Bancs locaux
node scripts/bench-backend.cjs
node scripts/bench-whisper.cjs --model <ggml-base.bin> --audio-ctx 0,512,auto [--no-text] <a.wav>
```

Aucune de ces commandes n'appelle un fournisseur.

Résultat sur la source finale : 287 tests Node sur 287 et 6 tests Python sur 6, sur une copie figée dont `node_modules` est un lien vers les dépendances déjà installées ; aucune source n'a changé pendant les tests ni depuis (`coordinator-final-test-results.json`, `coordinator-final-source-manifest.json`). Dans le worktree sans `node_modules`, un test échoue : celui du pont MCP, dont le processus enfant ne trouve pas ses dépendances. C'est une limite d'environnement, pas un défaut du code. La copie essayée sur le VPS était une version antérieure : 285 tests, même échec d'environnement.

## Réglages ajoutés

Résolus à chaque démarrage, sur le serveur comme dans l'app Mac : d'abord le fichier de configuration (ou, pour l'app Mac ouverte sans fichier, les réglages du dernier fichier importé, qu'il ait apporté ou non une clé OpenRouter), puis l'environnement, qui prime. Importer un fichier sans réglage efface ceux d'avant ; importer un fichier sans clé laisse la clé déjà conservée. Une valeur mal saisie fait échouer le démarrage de session. Le jeton du modèle local n'est jamais conservé : il vient du fichier ou de l'environnement à chaque démarrage. Sur un hôte sans chiffrement disponible, rien n'est conservé.

| Variable | Défaut | Effet |
| --- | --- | --- |
| `TVLENS_BACKGROUND_INDEX` | `1` si une clé d'embeddings existe | `0` : seules les recherches envoient des textes à indexer |
| `TVLENS_VISION_DURING_ASK` | `0` | `1` : la vision continue pendant les questions |
| `TVLENS_WHISPER_AUDIO_CTX` | contexte complet | `auto` ou un entier de 64 à 1500 |
| `TVLENS_PERCEPTION_BACKEND` | `codex` | `local` : modèle local pour la description des passages |
| `TVLENS_LOCAL_VLM_URL`, `_MODEL`, `_NUM_CTX`, `_KEEP_ALIVE`, `_TOKEN` | — | accès au modèle local |
