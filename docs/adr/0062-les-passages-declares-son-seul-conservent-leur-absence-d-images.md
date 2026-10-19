# 0062 — Les passages déclarés son seul conservent leur absence d’images

- Date : 2026-10-19
- Ticket : `docs/travail/tickets/298-let-a-declared-sound-only-passage-skip-vision-and-count-its-missing-image.md`
- Statut : acceptée

## Contexte

La vision recevait tous les passages après leur transcription, même quand `frames` était vide.
Ces entrées existent dans les tests et ne prouvent pas une absence déclarée. L’ADR 0046 gardait
les modalités dans une Map privée : les images redevenaient inconnues à la réouverture.
Le son seul doit pouvoir terminer son analyse tout en signalant durablement l’image manquante.

## Décision

Le contrat `CapturedSegment` accepte la déclaration facultative `media: { video: false, audio: true }`.
`media.video === false` déclare l’absence d’images et de vidéo. Le cœur exige alors un audio non vide ;
une déclaration `media.audio === false` est également refusée. Le refus porte le code stable
`TVLENS_CAPTURE_AUDIO_REQUIRED`, avant stockage, attribution d’identifiant ou fait de passage.
Une entrée sans déclaration conserve son traitement, y compris avec `frames: []`.

La session conserve `hasImages: false` sur ce passage et sa raison média `images-absent`.
Il n’est pas annoncé comme rejouable en vidéo, mais ses fichiers conservés restent accessibles à
l’audio. Aucune miniature n’est tentée. Les voies reçoivent la lecture générique `hasImages` :
la vision reste `absent`, sans file, appel, nouvel essai ou `PassageLost` de vision, même si l’audio
est écarté par la surcharge. Une transcription réussie termine le passage `ready`, le compte comme
analysé et permet son inclusion dans le résumé vivant. Un échec audio garde le passage `error` ;
un audio écarté le laisse `skipped`. Les comportements historiques des autres passages sont conservés.

`losses.imagesAbsent` compte une perte de capture après chaque stockage accepté et n’existe
qu’à partir du premier cas. Comme `videoUnreadable`, elle produit une version consultable,
sans ajouter de cause à l’ensemble fermé de l’ADR 0050. `visionGaps` expose l’intervalle absent,
y compris lorsque sa transcription rend le passage prêt. La perte de capture reste distincte
d’une erreur de voie ou d’une vidéo reçue mais illisible.

Le convertisseur d’archive v1 de l’ADR 0047 conserve cet ajout compatible sans changement de version.
La restauration reprend le compteur sauvegardé sans le recalculer et garde les images et la vidéo
`absent`, au lieu de `unknown`. Elle vérifie toujours la présence des fichiers : s’ils manquent,
le son devient indisponible et la raison devient `missing`, sans inventer d’images.
Les passages historiques sans `hasImages` gardent leurs modalités inconnues.

## Alternatives écartées

- Déduire le son seul de `frames: []` : changerait le comportement des entrées historiques.
- Réutiliser `unreadable` : confondrait une absence déclarée avec une vidéo reçue mais illisible.
- Ajouter une cause de perte de voie : contredirait l’ensemble fermé de l’ADR 0050.
- Garder uniquement la Map privée : ferait perdre l’absence déclarée à chaque réouverture.

## Conséquences

L’analyse audio termine sans attendre une preuve visuelle déclarée absente. Les lecteurs voient
à la fois un passage analysé et sa limite d’image. Les fichiers et le compteur restent soumis aux
barrières de sauvegarde existantes ; restaurer reste silencieux et en lecture seule.
Le transport, la capture et les questions ne produisent ni ne traitent encore cette déclaration.

## Protégée par

`tests/split-perception.test.cjs` couvre transcription, statut prêt, modalités, compteur, refus sans
son, absence d’appel et de miniature, surcharge, erreurs audio, faits publiés et inclusion au résumé.
`tests/session-durable.test.cjs` écrit une vraie archive v1 puis la rouvre sans écriture ni fournisseur,
en vérifiant le compteur et la disponibilité des images et du son.
`tests/session-events.test.cjs` vérifie les versions terminales des audios écartés, sans perte vision inventée.
Les suites existantes protègent les captures sans déclaration ; `node scripts/check.mjs` contrôle le dépôt.
