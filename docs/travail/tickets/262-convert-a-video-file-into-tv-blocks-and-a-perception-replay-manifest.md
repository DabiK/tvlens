---
id: T262
titre: Convert a video file into TV blocks and a perception replay manifest
statut: termine
bloque_par: T257, T272
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une commande transforme un fichier vidéo en blocs acceptables par `/v1/segments` et en manifeste
lisible par le rejeu de perception T257. L'expérimentateur peut préparer G1 depuis un fichier et
fournir trente minutes de contenu à T259, sans capturer la TV. Une session Codex, un commit.

## Sources

- Décision du propriétaire du 17/10 au soir : ajouter cette source avant le GX10. Elle amende
  l'exclusion du générateur vidéo dans le rapport Astra du 17/10, section 3, C, et sa section 5.
  Il s'agit d'une conversion vers le contrat existant, pas d'inférence sur vidéo native.
- Code relu à `4599eea` : `adapters/config.cjs:19` fournit `config.ffmpeg`.
  `adapters/remote-media.cjs:20-42` valide session, séquence, intervalle, images et tailles ;
  `:48-50` normalise les images et `:106-113` exige un WAV avant rééchantillonnage.
  `adapters/ffmpeg.cjs:4-15` fournit `run`, avec abandon et codes `FFMPEG_MISSING`,
  `FFMPEG_DECODE`, `FFMPEG_KILLED`. Aucun ffprobe n'est configuré.
- `tv/transport.py:50-98` possède la politique de livraison. `scripts/replay-lg-stream.cjs:43-65`
  fabrique seulement des images et de la parole synthétiques ou lit des WAV ; `:165-182`
  les envoie. Ce script n'est pas un convertisseur vidéo et ses réessais sont incomplets.
- `tests/remote-media.test.cjs:6` utilise ffmpeg sans garde ; `tests/video-research.test.cjs:65`
  génère une petite vidéo avec le binaire réel. `tests/media-asr-options.test.cjs:36-59`
  saute son cas réel si ffmpeg manque. Le contrôle complet dépend déjà de ffmpeg ;
  le double reste la preuve principale des échecs et des trente minutes.
  Les doubles exécutables temporaires de `tests/clip-audio.test.cjs:52-79` et
  `tests/remote-media.test.cjs:112-140` fournissent un précédent sans dépendance système.
- T257 livre le format et le lecteur de manifeste ; T259 possède cadence, transport et questions,
  T261 le bilan. T235 possède la fiche durable de source et les captures du `SessionRecord`.
  T224/T225, T220/T226 et T227 migrent la Mémoire ; T234–T245 et T253 migrent les sessions et
  le contrôle TV. Aucun de ces tickets ne livre cette conversion.
- `docs/domaine.md:266-289`, ADR 0029 et 0030 : le nouveau média vit dans `adapters/media/`,
  sans déplacer les fichiers actuels ni ajouter un second coordinateur.

## Périmètre

- À créer : `adapters/media/video-file-source.cjs`, `scripts/prepare-video-replay.cjs`,
  `tests/video-file-source.test.cjs` et un exemple documenté près du script.
  Utiliser le format et les aides livrés par T257 ; ajuster son lecteur seulement si nécessaire
  pour lire la provenance prévue. Pas de second format de rejeu de perception.
- La CLI reçoit fichier, dossier de sortie et réglages explicites de conversion ; elle utilise
  `config.ffmpeg`. L'appel du processus reste dans l'adaptateur média, avec arguments séparés,
  signal et nettoyage des temporaires. Aide et validation d'un dossier déjà produit n'infèrent rien.
  Réutiliser `run` et ses codes (`adapters/ffmpeg.cjs:4-15`) ; la durée est lue avec le seul
  `config.ffmpeg`, sans ffprobe ni nouveau réglage.
- Produire des intervalles contigus de 10 s au plus, dont le dernier peut être plus court,
  une à cinq images ordonnées par bloc, base64 sans préfixe, 1 500 000 octets décodés au plus
  par image. L'audio présent est un WAV de 2 100 000 octets décodés au plus ; une piste absente
  est déclarée absente, jamais remplacée par une transcription ni un silence réussi.
  Réutiliser `validateRemote` pour le contrat, sans en copier les bornes dans un second validateur.
  Les images sont mises à l'échelle dans 1280×720 sans agrandissement
  (`adapters/remote-media.cjs:38`, `:50`) ; `validateRemote` ne vérifie pas la borne de
  1920×1080 pixels de l'assemblage (`:48`) : le convertisseur la garantit.
- Consigner durée réellement convertie, intervalle source, origine des temps, paramètres
  d'échantillonnage/encodage, empreinte du fichier et de chaque sortie. Séquences croissantes et
  temps relatifs servent de gabarit ; T259 les rattache à la session courante à chaque occurrence.
  Un identifiant de session de validation ne devient pas celui d'une session réelle.
- L'index des blocs référence les corps du fil `/v1/segments`, avec leur base64 sans préfixe,
  pour T259. Ce fichier est distinct du manifeste de perception T257 ; leurs usages sont nommés
  séparément dans l'aide et dans l'exemple.
- Le manifeste T257 référence les images produites avec leurs temps et une provenance
  « vidéo convertie ». Transcript et contexte sont vides avec leur limite explicite, sauf apport
  documenté par l'opérateur selon T257 ; aucun modèle ni Whisper n'est lancé par le convertisseur.
  `lightweight` vaut `false` explicitement. Les annotations attendues restent séparées.
- La conversion est terminée avant le rejeu soutenu : elle ne ralentit pas les arrivées de T259.
  Un fichier d'au moins trente minutes peut fournir cette fenêtre sans répétition ; une source
  plus courte garde sa durée réelle. Seul T259 peut la boucler, en le déclarant.
  Traiter et écrire les blocs progressivement, sans charger trente minutes de médias en mémoire.
- Conserver les sorties complètes acquises et marquer la préparation incomplète en cas d'échec
  ou d'annulation ; un manifeste incomplet n'est pas validé comme campagne complète.
- À ne pas toucher : capture LG/Mac, `tv/`, protocole HTTP, transport de T259, fiche durable
  de T235, formats d'archive, rétention, files, juge G2 ou migration des familles d'adaptateurs.
  La provenance appartient ici au manifeste d'expérience, pas au `SessionRecord`.
- Aucun essai réel dans la session Codex : modèle local, TV, VPS et fournisseurs restent à
  l'orchestrateur ou au propriétaire, hors boucle. Aucun téléchargement ni installation.

## Critères d'acceptation

1. Depuis une entrée temporaire, la CLI produit plusieurs blocs, dont un dernier partiel,
   tous acceptés par le vrai `validateRemote`. Les temps d'images restent dans leur intervalle,
   les séquences croissent, les bornes de taille et le WAV sont vérifiés.
   Les arguments reçus par le faux ffmpeg contiennent cette mise à l'échelle.
   Un bloc produit, rattaché à la session de test (son identifiant, ses temps translatés sur
   l'horloge injectée après la clôture du bloc, une séquence neuve), franchit le vrai `/v1/segments`
   jusqu'à `RemoteMedia` ; le gabarit non rattaché est refusé (`server/ingest-routes.cjs:11-13`).
   Ce rattachement reste dans le test ; calendrier et bouclage appartiennent à T259.
   Les fournisseurs sont doublés et ffmpeg est faux.
   Le fichier source reste intact.
2. Le manifeste produit passe la validation T257 ; son exécution dans le test traverse la vraie
   perception et un faux Ollama. Les images et leur ordre correspondent aux blocs, la provenance
   reste « vidéo convertie », aucun transcript, contexte historique ou annotation n'est inventé.
3. Audio absent, fichier absent/illisible, durée non déterminable, binaire indisponible, échec
   de décodage et sortie trop volumineuse donnent des issues identifiées. Une extraction audio
   échouée n'est pas confondue avec une piste absente. Aucun échec n'ouvre un fournisseur de repli.
4. Un double de ffmpeg retenu puis annulé prouve l'arrêt du processus et le nettoyage après
   sa fin ; aucune sortie tronquée n'est déclarée complète. Un échec après un bloc conserve
   les sorties acquises et un état incomplet que la validation refuse pour un rejeu complet.
5. Un scénario piloté par le double couvre une durée de trente minutes sans attente murale :
   la somme des intervalles vaut la durée choisie, sans répétition ni troncature cachée.
   Les empreintes et paramètres permettent de relier blocs, manifeste et vidéo d'origine.
6. L'exemple donne conversion → validation du manifeste de perception → rejeu T257,
   et l'index des blocs attendu par T259.
   Il dit qu'une vraie session TV reste le témoin de fidélité : les blocs convertis ne mesurent
   ni capture LG, ni pertes avant livraison, ni fidélité du rythme de ses prises d'images.
7. À l'implémentation future, jouer en séquentiel `video-file-source`, `local-perception-replay`
   et les tests média affectés sous `tests/` (`.test.cjs`), puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/video-file-source.test.cjs` par la CLI et l'API publique : fichiers temporaires,
faux ffmpeg exécutable produisant JPEG/WAV maîtrisés, vrai validateur de blocs et ingestion HTTP,
puis runner T257 avec faux Ollama. Le double permet les erreurs et les trente minutes accélérées
sans binaire installé.
Une petite vidéo générée par ffmpeg peut compléter cette preuve si le binaire est disponible ;
son absence est déclarée et ne retire aucune assertion de la preuve principale.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T257 est le seul prérequis : son format est livré avant le convertisseur. T257 accepte une
provenance vidéo sur fixture sans attendre T262 ; T259 attend ensuite T262, sans cycle.
Hypothèse technique : un profil d'échantillonnage fixe et déclaré suffit à cette première source ;
il ne prétend pas reproduire la sélection LG. Les codecs réellement disponibles et la durée du
fichier choisi restent à vérifier par l'opérateur. Aucun contenu de trente minutes n'est fourni ici.
La vraie session TV témoin et les conversions du corpus réel restent hors boucle.

## Journal

- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T272.
- 18/10, Codex : exploration du contrat média, du runner et des ADR 0029/0030 terminée ; détails et
  adaptations prévues dans `.harness-state/tickets/T262/`. Preuve principale prévue sur faux ffmpeg,
  ingestion HTTP et perception réelles avec fournisseurs doublés ; aucun essai réel.
- 18/10, Codex : cycles rouge/vert observés pour publication des blocs, aide/CLI et refus du manifeste
  incomplet (sorties `red-*` et `green-*` dans l'état du ticket). Intégrations perception/Ollama doublé
  et HTTP/RemoteMedia observées. Correction de l'attente HTTP : le contrat existant refuse une session
  obsolète avec `400 stale-session`. Trente minutes simulées couvertes et empreintées progressivement.
- 18/10, Codex : le test d'annulation par surveillance de fichier a rencontré `EMFILE` ; remplacé par
  une notification HTTP locale explicite du double. `node --test --test-name-pattern='cancellation kills'
  tests/video-file-source.test.cjs` : 1 test vert, processus mort et nettoyage vérifiés après son arrêt.
- 18/10, Codex : ajout du refus d'un WAV sans échantillons après rouge observé sur son assertion,
  puis vert. Exemple livré dans `scripts/prepare-video-replay.md` ; conversion, validation sans
  fournisseur, manifeste de perception et index des corps HTTP documentés séparément.
- 18/10, Codex : `node --test --test-concurrency=1 tests/video-file-source.test.cjs
  tests/local-perception-replay.test.cjs tests/remote-media.test.cjs tests/clip-audio.test.cjs
  tests/media-asr-options.test.cjs tests/video-research.test.cjs tests/clip-unreadable.test.cjs
  tests/reinspection-transcript-reuse.test.cjs tests/inspection-strategies.test.cjs` :
  104 tests réussis, aucun échec ni saut (`tests-sequential.log` dans l'état du ticket).
- 18/10, Codex : `node scripts/check.mjs --changed` après nettoyage final : vert, 16 tests réussis
  (`check-changed-final.log`). `node scripts/check.mjs` : vert, 150 fichiers JS, 2 769 tests JS
  et 47 tests Python réussis (`check-full.log`). `git diff --check` : sans anomalie.
  Verdict `TERMINÉ` écrit dans l'état du ticket ; relecture et intégration laissées à la boucle.
  Aucun essai réel, installation, commit ou push ; changements initiaux conservés.
- 18/10, Codex : reprise de la relecture 1 ; six constats acceptés. Travail présent, journal et écarts
  relus. Preuves à renforcer sur les octets d'images, positions source et progression ; sorties absentes
  ou illisibles à coder explicitement. Complément prévu sur fixture synthétique ffmpeg, sans corpus réel.
- 18/10, Codex : `node --test --test-name-pattern='generated media traverses'
  tests/video-file-source.test.cjs` : rouge sur images identiques, puis vert avec JPEG distinct par position
  et égalité ordonnée corps/média/Ollama. Positions `-ss` de chaque image et couples `-ss`/`-t` audio
  vérifiés avec origine source non nulle ; fenêtre de trente minutes également reliée aux arguments.
- 18/10, Codex : `node --test --test-name-pattern='thirty minutes' tests/video-file-source.test.cjs` :
  rouge sur la mesure de progression absente, puis vert après observation dans le double ffmpeg,
  sans mock de fs.writeFile. Les appels voient successivement 0 à 179 blocs publiés.
- 18/10, Codex : `node --test --test-name-pattern='conversion identifies (missing|unreadable|undecodable)'
  tests/video-file-source.test.cjs` : cinq rouges sur codes attendus, puis verts après identification
  des lectures/décodages de sortie. Dimensions excédentaires et PNG refusés en IMAGE_INVALID,
  après rouge lorsque ces scénarios ne produisaient encore qu'un JPEG admissible.
- 18/10, Codex : `node --test --test-name-pattern='synthetic video|CLI reports'
  tests/video-file-source.test.cjs` : deux tests réussis, aucun sauté. Fixture vidéo synthétique
  temporaire avec ffmpeg installé : sondage, recherche avant entrée, mise à l'échelle, WAV PCM
  et validation du corpus observés. Erreur CLI sans chemin interne vérifiée. Aucun corpus réel ni modèle.
  Documentation du marqueur facultatif de préparation complétée dans `scripts/perception-replay.md`.
- 18/10, Codex : correction des six constats achevée. `node scripts/check.mjs --changed` : vert,
  25 tests réussis. Séquence ciblée du journal rejouée avec `--test-concurrency=1` : 113 tests réussis,
  aucun échec ni saut (`correction-tests-sequential.log`). `node scripts/check.mjs` : vert,
  2 778 tests JS dans 150 fichiers et 47 tests Python réussis (`correction-check-full.log`).
  `git diff --check` : sans anomalie. Nouveau verdict `TERMINÉ` et relevé `correction-preuves.md`
  enregistrés dans l'état du ticket ; relecture laissée à la boucle, aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T262/relecture-2.md : 1. `adapters/media/video-file-source.cjs:10-11` : constantes en double (hors périmètre, reconduit)
  - **Problème.** 1280×720, 1920×1080 et 16 000 Hz reprennent toujours les littéraux non nommés de `adapters/remote-media.cjs:48,50,112`. La règle « une constante vit à un seul endroit » n'est pas tenue.
  - **Attendu.** Nommer et exporter ces bornes dans `remote-media.cjs`, qui est hors de la liste du ticket.
  - **Classe.** Réserve.
- .harness-state/tickets/T262/relecture-2.md : **Écart accepté, `adapters/ffmpeg.cjs`.** Inchangé depuis la relecture 1. Même raison : c'est la capture minimale de stderr, nécessaire pour lire la durée avec le seul `config.ffmpeg`. Les appelants et les codes sont compatibles.
- .harness-state/tickets/T262/relecture-2.md : **Écart accepté, `scripts/replay-local-perception.cjs`.** Inchangé depuis la relecture 1. La garde est unique et testée, et ne crée pas de second format. Le manque de documentation est résolu par le constat 6.
- .harness-state/tickets/T262/relecture-2.md : **Écart accepté, `scripts/perception-replay.md`.** C'est le complément documentaire de l'écart précédent, demandé par le constat 6 de la relecture 1. Il ne change aucun format.
