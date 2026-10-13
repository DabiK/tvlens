# Réexamen : réutiliser la transcription du passage — 13 octobre 2026

Branche `codex/tvlens-backend-latency-opus`, base `9758633`. Rien n'est commité, poussé ni déployé.

Un réexamen (`inspect_clip`) relançait Whisper sur chaque extrait découpé dans un passage, alors que ce passage était déjà transcrit. Il reprend maintenant la transcription du passage et annonce l'intervalle qu'elle couvre vraiment. Ce document donne la cause vérifiée, la correction, ce qu'elle change dans le contrat de l'outil, et ce qui a été mesuré.

En bref :

- **Cause.** Le réexamen découpait le son du passage à l'intervalle demandé. Le cache de transcription est indexé par les octets du son : une tranche n'y est jamais, donc Whisper repartait. La transcription du passage arrivait pourtant jusqu'au port de réexamen, qui ne la lisait pas.
- **Correction.** Les paroles d'un réexamen viennent du passage : sa transcription publiée si elle existe, sinon une transcription de son audio stocké, partagée avec la voie de fond. L'intervalle des paroles et celui des images sont deux champs distincts, pour le modèle de réexamen comme pour le chat. Une parole n'est jamais située plus finement que son intervalle, ni présentée comme une citation exacte.
- **Gain mesuré.** Sur le VPS à 2 vCPU, mêmes médias, même question, mêmes réglages, trois paires alternées avec modèles simulés : le réexamen ne lance plus Whisper (1 lancement avant, 0 après), `inspect_clip` passe de 19,6 s à 8,3 s en médiane et la question de 28,1 s à 16,9 s. Sur le Mac, sans concurrence, le gain est de 1,4 s.
- **Ce qui n'est pas prouvé.** L'essai réel du 13 octobre (23,3 s de transcription pour 6,1 s de son) n'est pas rejouable : son audio est purgé. Les rejeux retrouvent 8 à 13 s d'attente, pas 23 s. Avec de vrais modèles, trois passes seulement ont été comparées.

## Le constat de départ

Sur le parcours réel du 13 octobre (TV, VPS à 2 vCPU, Whisper et Codex réels), une question a duré 43,4 s. Son réexamen a pris 31,7 s, dont 23,3 s de « transcription locale » pour un extrait de 6,1 s du passage 4. La transcription complète de ce passage était publiée depuis 6,4 s. Pendant ces 23,3 s, la voie de fond transcrivait le passage 5. C'est une seule observation, sans témoin.

## Cause vérifiée

Le chemin d'un réexamen, avant correction :

1. `VideoTools` (`core/video-tools.cjs`) relit la version courante des passages figés de la question, puis remet au port de réexamen ceux qui recoupent l'intervalle demandé, **avec leur transcription**.
2. `ClipInspector` (`adapters/clip-inspector.cjs`) borne l'intervalle à chaque passage, extrait les images, et découpe le WAV stocké avec `trimWav`. Seul un passage entièrement couvert garde ses octets. La transcription reçue est abandonnée ici.
3. `CodexPerception.inspect` (`adapters/codex-perception.cjs`) transcrit toujours le son reçu, passage après passage, avant l'appel au modèle.
4. `LocalTranscriber` (`adapters/local-transcriber.cjs`) indexe son cache par `sha256(langue + octets)`. Une tranche a d'autres octets que le passage : le cache manque, un `whisper-cli` démarre.

Ce n'est pas un cas rare. Un intervalle relatif à l'ancrage (« les dix dernières secondes ») ne tombe presque jamais sur les bornes d'un passage ; il faut les recopier exactement pour éviter Whisper. La voie de fond et le réexamen partagent bien un seul transcripteur : le défaut n'est pas un cache en double.

Cinq vérifications indépendantes, chacune chargée de réfuter ce diagnostic, puis une relecture critique, l'ont confirmé. La reproduction ne fait appel à aucun modèle : objets réels, faux `whisper-cli` qui journalise chaque lancement, bornes de l'essai réel.

| Étape de la reproduction | Whisper lancés, avant | Whisper lancés, après |
|---|---|---|
| Voie de fond, cinq passages | 5 | 5 |
| Réexamen du passage entier (bornes exactes) | 0 | 0 |
| Réexamen 26 246,5–36 246,5 ms, l'appel de l'essai réel | **1** (extrait de 6,10 s) | **0** |
| Même extrait, début décalé de 0,1 ms | 1 | 0 |
| Intervalle coupant deux passages | 2 | 0 |
| Bornes arrondies à la milliseconde vers l'intérieur | 1 | 0 |
| Un passage couvert, deux coupés | 2 | 0 |
| Total de la séquence | 12 | 5 |

### Pourquoi 23,3 s

Expliqué en partie seulement.

- **Plancher fixe.** L'encodeur de Whisper traite 30 s quelle que soit la durée du son : 3,0 à 4,3 s sur le VPS. Découper de 8 s à 6,1 s ne fait rien gagner et coûte le cache.
- **Concurrence.** Le Whisper du réexamen a tourné entièrement pendant celui du passage 5. Ce dernier a passé 84 % de ses 30,9 s dans le décodeur, sans aucune reprise, 7 à 15 fois plus lent par mot que ses voisins.
- **Mesure contrôlée.** Sur le VPS, hors service, voix de synthèse, trois répétitions : un extrait de 6,04 s coûte 4,0 à 5,0 s seul et 9,2 à 12,1 s quand un second Whisper à 2 threads démarre en même temps. Deux Whisper ensemble finissent plus tard que l'un après l'autre.

| Cas (VPS, 2 vCPU, 2 threads par processus) | Extrait 6,04 s | Bloc 8 s |
|---|---|---|
| Seul | 5,0 / 4,7 / 4,0 s | 5,9 / 4,6 / 5,2 s |
| Deux processus en même temps | 12,1 / 11,5 / 9,2 s | 12,7 / 11,9 / 10,6 s |

La mesure reproduit le mécanisme, pas l'ampleur : environ 11 s des 23,3 s restent sans explication établie. Une tranche coupée en pleine parole peut déclencher une seconde passe d'encodeur et des reprises du décodeur (1,7 fois le coût du bloc entier sur voix de synthèse) ; rien ne dit si c'est arrivé, le réexamen ne conservait aucune métrique Whisper.

### Ce que le diagnostic précédent disait de travers

- « Passage exactement entier » : il suffit que l'intervalle couvre le passage. Des bornes arrondies vers l'extérieur gardent le cache, 1 ms vers l'intérieur le perd.
- « Deux encodeurs en concurrence » : dans l'essai, c'est le décodeur qui s'effondre.
- « La transcription de l'extrait est plus précise » : elle est plus étroite dans le temps, pas plus juste. Sur voix de synthèse, une coupe en plein mot abîme les mots du bord là où la transcription du passage est correcte.

## Correction

D'où viennent les paroles d'un passage réexaminé :

| État du passage au moment du réexamen | Source des paroles | Whisper |
|---|---|---|
| Transcription publiée (`audioStatus: 'ready'`, sans `audioFailed`) | La transcription publiée, telle quelle | Aucun appel |
| Pas encore transcrit, en cours, délesté, en erreur ou échoué | Transcription de l'audio **stocké du passage**, par le transcripteur partagé | Aucun de plus si la voie de fond l'a fait ou le fait (même processus) ; sinon un seul, que la voie de fond réutilise |
| `exactSpeech: true` et extrait d'au moins 1 s | Transcription de l'extrait lui-même | Un par extrait, comme avant |
| Pas de piste audio | Aucune | Aucun |

Trois points de conception :

- **La transcription publiée d'abord.** Elle ne dépend ni du cache du transcripteur ni de l'identité des octets. Une transcription échouée ou délestée n'est pas une transcription : `audioFailed` et `audioStatus` décident, jamais la chaîne vide.
- **Sinon, le passage entier plutôt que la tranche.** Ses octets sont ceux que la voie de fond transcrit : le cache répond, ou le Whisper déjà en cours sert les deux demandeurs. Un réexamen ne lance plus un second Whisper à côté de celui du même passage.
- **La précision se demande.** `exactSpeech` est le seul cas où l'extrait est retranscrit. Sous une seconde, Whisper invente des mots : un tel éclat garde les paroles du passage.

### Deux intervalles, jamais confondus

- **Images** : l'intervalle demandé, borné au passage. C'est le seul où une observation visuelle peut être située.
- **Paroles** : ce que la transcription couvre. Le passage entier en réutilisation, l'extrait avec `exactSpeech`.

Le modèle de réexamen reçoit les deux pour chaque passage, avec la consigne de ne jamais situer une parole plus finement que son intervalle ni de la présenter comme une citation exacte. Chaque observation porte `basis` : `images` ou `speech`. Une observation fondée sur les paroles reçoit d'office l'intervalle entier des paroles, quelle que soit la précision proposée par le modèle : une transcription de passage n'est pas horodatée mot à mot.

`inspect_clip` renvoie en plus, sans rien retirer :

```json
"intervals": [{ "id": "moment-4",
  "images": { "startMs": 26246.5, "endMs": 32348.3 },
  "speech": { "startMs": 24289.6, "endMs": 32348.3, "precision": "segment" } }]
```

`precision` vaut `segment` pour un passage entier (le vocabulaire de `get_transcript`), `excerpt` pour un extrait retranscrit. Quand les paroles débordent des images, une limite le dit en clair dans la réponse de l'outil. Une observation fondée sur les paroles vaut preuve sur l'intervalle du passage ; aucune autre preuve n'est ajoutée et la validation des citations ne change pas.

Si la transcription a échoué ou si le passage n'a pas de son, aucun intervalle de paroles n'est annoncé, ni au modèle ni au chat, et une observation qui prétendrait reposer sur des paroles est refusée. Un échec est signalé par une limite ; la demande suivante retente la transcription.

### Rien après l'ancrage

Les garde-fous existants ne changent pas : `VideoTools` ne détient que des passages finis à l'ancrage au plus tard, et sa relecture ne remplace un passage que par le même identifiant, les mêmes bornes, la même session. La correction ne lit que ces copies et l'audio stocké de ces mêmes passages. `VideoTools` refuse en plus tout intervalle de paroles qui sortirait du passage réexaminé.

### Contrat de l'outil

`inspect_clip` accepte une option facultative `exactSpeech` (booléen), déclarée aux deux transports (Codex et MCP). Les appels existants ne changent pas. Vérifié sur Codex réel (CLI 0.160.1, `gpt-6-luna`) : l'outil est accepté, appelé sans l'option puis avec elle. La version du VPS (0.158.0) n'est pas essayée.

Les métriques d'une question portent maintenant, pour chaque `inspect_clip`, des compteurs sans texte : `speech: { passages, reused, cached, failed }`. `reused` compte les transcriptions publiées reprises, `cached` les succès du cache du transcripteur.

### Deux choix à connaître

- **Précision sur demande, pas sur seuil.** L'autre règle possible était un seuil : retranscrire l'extrait quand il couvre trop peu du passage. Je ne la retiens pas. Pour un intervalle relatif à l'ancrage, la part du passage de bord couverte est à peu près uniforme entre 0 et 100 % : un seuil relancerait Whisper dans une fraction fixe des réexamens sans rien dire du besoin réel, et c'est sur les tranches courtes que Whisper est le moins fiable. La demande de l'essai réel (76 % du passage) réutilise dans les deux règles.
- **Pas d'arbitrage Whisper.** La mesure contrôlée montre que deux Whisper ensemble sur 2 vCPU valent moins que l'un après l'autre. Je n'ajoute pourtant pas de file : avec la réutilisation, le cas observé ne lance plus de second Whisper ; une file ferait attendre un réexamen derrière un Whisper de fond lent (30,9 s dans l'essai) dans une question bornée à 60 s, et compterait dans le délai de 45 s de la voie de fond ; la preuve tient à trois répétitions sur voix de synthèse. Le repli garde donc le comportement d'avant : s'il doit transcrire pendant que la voie de fond transcrit un autre passage, les deux tournent ensemble.

## Mesures

`scripts/replay-reinspection.cjs` rejoue en temps mural une question avec réexamen : six blocs de 8 s de forme LG (quatre images 1280×720, son 48 kHz stéréo), envoyés à la vraie ingestion HTTP ; assemblage, stockage, extraction des images, planches et Whisper réels ; un seul transcripteur pour la voie de fond et le réexamen, comme le serveur. La chronologie est celle de l'essai réel : question 3,9 s après la fermeture du bloc 4, `inspect_clip` sur les dix secondes avant l'ancrage, appelé 7,9 s plus tard.

« Avant » est la copie de référence du code, « après » le code corrigé ; les deux reçoivent les mêmes médias, la même question et les mêmes réglages (Whisper `ggml-base`, 2 threads, contexte complet), en passes alternées. Le média est un extrait public à parole réelle (discours de Kennedy à Rice, anglais, domaine public).

### Modèles simulés, VPS à 2 vCPU

Vision (3,3 s), modèle de réexamen (5,5 s) et chat sont des faux à latence fixe : ils prouvent l'orchestration, pas la qualité d'une réponse. Trois paires. L'hôte est partagé avec d'autres services (charge moyenne sur une minute de 1,7 à 3,9 au début des passes).

| Par passe | Avant | Après |
|---|---|---|
| Whisper lancés par le réexamen | 1 / 1 / 1 | 0 / 0 / 0 |
| Son donné à ce Whisper | 6,1 s (extrait) | — |
| Attente des paroles dans le réexamen | 11,2 / 13,3 / 8,3 s | 0 / 0 / 0 s |
| Durée d'`inspect_clip` | 19,6 / 21,4 / 15,9 s | 9,2 / 8,3 / 7,5 s |
| Durée de la question | 28,1 / 29,9 / 24,4 s | 17,7 / 16,9 / 16,0 s |
| Whisper de fond des blocs 5 et 6 | 7,4 et 12,2 / 8,7 et 13,4 / 6,8 et 6,7 s | 6,2 et 8,6 / 5,4 et 8,7 / 4,8 et 7,4 s |
| Whisper lancés au total, six blocs | 7 | 6 |
| Vision retenue par la question | 25,3 / 27,9 / 23,1 s | 15,7 / 16,0 / 14,8 s |
| Passages restés sans description visuelle | 1 / 1 / 1 | 0 / 0 / 0 |
| Citations acceptées sur proposées | 1/1 | 1/1 |
| Citations après l'ancrage | 0 | 0 |

Médianes : `inspect_clip` 19,6 s → 8,3 s (−11,2 s, −57 %) ; question 28,1 s → 16,9 s (−11,2 s, −40 %). Le bloc 6 est plus long à transcrire que les autres dans les deux cas, sur le Mac aussi : cela tient à son contenu, pas au réexamen.

Un effet de bord, non recherché : la question étant plus courte, la vision de fond est retenue dix secondes de moins, et le passage 4 n'a plus perdu sa description visuelle (perdue dans les trois passes « avant », par débordement de la file pendant la question).

### Modèles simulés, Mac à 10 cœurs

Whisper forcé sur le processeur. Trois paires. Cet hôte ne reproduit pas la concurrence du VPS.

| Par passe | Avant | Après |
|---|---|---|
| Whisper lancés par le réexamen | 1 / 1 / 1 | 0 / 0 / 0 |
| Attente des paroles dans le réexamen | 1,4 / 1,4 / 1,4 s | 0 / 0 / 0 s |
| Durée d'`inspect_clip` | 7,3 / 7,4 / 7,3 s | 5,9 / 5,9 / 5,9 s |
| Durée de la question | 15,9 / 15,9 / 15,8 s | 14,4 / 14,4 / 14,4 s |
| Citations acceptées sur proposées | 1/1 | 1/1 |

### Repli : le passage est encore en cours de transcription

Même rejeu sur le VPS, mais la question arrive 2,5 s après la fermeture du bloc 4 et le réexamen 0,3 s plus tard : la voie de fond transcrit encore ce passage. Deux paires.

| Par passe | Avant | Après |
|---|---|---|
| Whisper lancés par le réexamen | 1 / 1 (tranche de 7,5 s du même passage) | 0 / 0 (se joint au Whisper en cours) |
| Attente des paroles dans le réexamen | 8,2 / 9,8 s | 0,8 / 1,1 s |
| Whisper de fond de ce passage | 6,8 / 10,0 s | 5,3 / 5,2 s |
| Durée d'`inspect_clip` | 16,1 / 17,6 s | 8,8 / 8,7 s |
| Durée de la question | 17,0 / 18,5 s | 9,7 / 9,7 s |

### Vrais modèles, Mac

Vision, réexamen et chat par Codex réel (`gpt-6-luna`, effort de raisonnement `low`), Whisper réel sur le processeur. La question demande de réexaminer 26 à 32 s et de dire ce que fait et dit l'orateur, en séparant images et paroles. Une passe « avant », deux « après ».

| | Avant | Après, première passe | Après, code final |
|---|---|---|---|
| Whisper lancés par le réexamen | 1 (1,4 s) | 0 | 0 |
| Appel du modèle de réexamen | 5,2 s | 4,3 s | 6,1 s |
| Durée d'`inspect_clip` | 7,0 s | 4,7 s | 6,5 s |
| Durée de la question | 10,5 s | 8,4 s | 13,1 s |
| Type de réponse | `observation` | `observation` | `observation` |
| Citations acceptées sur proposées, après l'ancrage | 1/1, 0 | 1/1, 0 | 1/1, 0 |
| Observations sur les images | 2, dans l'intervalle des images | 2, dans l'intervalle des images | 2, dans l'intervalle des images |
| Observation sur les paroles | 1, portée par l'intervalle des images, écrite comme une citation | 1, portée par l'intervalle du passage (24,0–32,0 s) | 1, portée par l'intervalle du passage |
| Paroles données au modèle | 11 mots (extrait) | 14 mots (passage) | 14 mots (passage) |

Ces passes ne mesurent pas un gain de temps : sur le Mac le Whisper retiré vaut 1,4 s, moins que l'écart d'un appel de modèle à l'autre. Elles montrent le comportement.

Lecture des réponses, sans les reproduire ici : la description des gestes est la même dans les trois. Avant, la parole est rapportée comme dite dans l'intervalle réexaminé. Après, les deux réponses séparent images et paroles, disent que la transcription couvre un passage plus large (24,0–32,0 s), qu'elle ne situe pas les mots et qu'elle peut être fausse. L'une d'elles met encore quelques mots entre guillemets, avec cette réserve : la consigne n'empêche pas un modèle de citer. Le modèle de réexamen a respecté la séparation `images` / `speech` dans les deux passes, et le chat n'a pas demandé `exactSpeech`.

Deux autres passes à vrais modèles, avec une question relative à l'ancrage (« les dix dernières secondes »), n'ont pas atteint le réexamen : le premier `inspect_clip` a été refusé et l'agent a répondu `insufficient` sans réessayer. Ces refus viennent d'avant le réexamen et ne dépendent pas de la correction (voir plus bas).

### Source mesurée et source finale

Les rejeux chronométrés ont tourné sur le code corrigé tel qu'il était avant un contrôle ciblé du diff. Ce contrôle a conduit à cinq retouches, sans effet sur les lancements de Whisper des passes mesurées :

- un passage sans piste audio n'annonce aucune parole ;
- une transcription échouée n'annonce plus d'intervalle de paroles au modèle ;
- une observation déclarée `speech` est refusée si elle ne porte pas exactement l'intervalle des paroles (elle pouvait passer avec l'intervalle des images) ;
- aucune preuve de passage n'est ajoutée en dehors des observations (la première version en ajoutait une, ce qui pouvait valider une citation sans contenu) ;
- le champ de résultat s'appelle `intervals` et non plus `passages`, nom déjà pris par `get_transcript`.

Contrôle sur le code final : une paire à modèles simulés sur le Mac (avant 7,3 s et 15,8 s, après 5,9 s et 14,4 s, aucun Whisper lancé par le réexamen) et la passe « code final » du tableau ci-dessus. Le VPS n'a pas été rejoué après ces retouches.

### Tests

- `tests/reinspection-transcript-reuse.test.cjs`, huit tests : réutilisation sans Whisper et intervalles distincts ; passage entier ; passage sans piste audio ; observation fondée sur les paroles ; paroles bornées au passage et à l'ancrage, jamais rétrécies ; repli sans transcription (partage du Whisper en cours, résultat repris par la voie de fond) ; transcription échouée ou délestée ; `exactSpeech`. Sur la copie de référence, les huit échouent, le premier sur « only the background lane ever started Whisper ».
- Suite Node : 295 tests, 294 réussis. L'échec restant existait avant (test MCP par stdio, faute de `node_modules` dans ce worktree). Avant la correction : 287 tests, 286 réussis. Suite Python : 6 sur 6.

## Limites

- **L'essai réel n'est pas rejoué.** Son audio est purgé et aucun nouvel essai avec la TV n'a été fait (pas de changement d'appairage). Les 23,3 s ne sont pas le gain attendu par question : la réutilisation retire un Whisper mesuré à 4 à 5 s seul sur le VPS, 8 à 13 s dans les rejeux en concurrence, 23,3 s une fois en réel.
- **Modèles simulés pour les durées.** Les rejeux chronométrés prouvent l'orchestration et le nombre de lancements Whisper. La qualité des réponses repose sur trois passes à vrais modèles, sur le Mac, avec une question qui donnait ses bornes.
- **Paroles moins sélectives.** Le modèle de réexamen lit maintenant les paroles de tout le passage, pas seulement celles de l'extrait. L'intervalle annoncé le dit. Le garde-fou structurel ne porte que sur les observations que le modèle déclare fondées sur les paroles ; une parole glissée dans une observation déclarée `images` garderait l'intervalle des images.
- **Changement de langue.** Une transcription publiée est reprise telle quelle, même si la langue de transcription a changé depuis, comme les observations déjà publiées.
- **Repli en concurrence.** Sans transcription publiée, et hors du cas où la voie de fond transcrit ce même passage, le réexamen peut encore lancer un Whisper pendant qu'un autre tourne.
- **Hôte partagé.** Les durées du VPS varient d'une passe à l'autre avec la charge des autres services ; les paires sont alternées pour cela, mais trois paires ne font pas une distribution.

## Constats voisins, non corrigés

- **Premier `inspect_clip` refusé.** Dans l'essai réel, le premier appel a été refusé en 1 ms et a coûté 3,5 s. Dans deux passes à vrais modèles ici, un refus a suffi pour que l'agent abandonne. Un motif est enregistré : « Aucun passage observé dans cet intervalle », le passage fermé 3,9 s plus tôt n'étant pas encore reçu quand la question a figé ses preuves. L'autre motif probable, non enregistré : une borne de fin arrondie au-dessus de l'ancrage, donné au modèle avec six décimales.
- **Extrait sans image.** Un intervalle qui commence dans la dernière demi-seconde d'un passage n'a aucune image décodable : tout le réexamen échoue et consomme une des deux inspections.
- **`inspected`** répète l'intervalle demandé, pas l'intervalle couvert. `intervals[].images` donne maintenant l'intervalle réel par passage.

## Reproduire

```sh
# Tests
node --test tests/reinspection-transcript-reuse.test.cjs tests/clip-audio.test.cjs

# Blocs de forme LG tirés d'une vidéo, puis un rejeu sur ce code et un sur une copie de référence
node scripts/replay-reinspection.cjs --prepare <video.mp4> --blocks-dir <dossier> --offset-s 60 --blocks 6
node scripts/replay-reinspection.cjs --model <ggml-base.bin> --blocks-dir <dossier> --language en --threads 2 --cpu-only
node scripts/replay-reinspection.cjs --root <copie de référence> --model <ggml-base.bin> --blocks-dir <dossier> --language en --threads 2 --cpu-only

# Repli (passage encore en transcription) et vrais modèles Codex
node scripts/replay-reinspection.cjs … --ask-offset-ms 2500 --turn-ms 300
node scripts/replay-reinspection.cjs … --live --question "<question>"
```

Le rejeu écoute sur un port local éphémère avec un dossier temporaire ; il ne touche ni la TV ni un service installé. Il ne rapporte que des nombres, des identifiants et des intervalles ; `--print-text` ajoute les textes, à réserver aux médias publics. Résultats bruts de cette mission : `.local/opus-reinspection/results/`.
