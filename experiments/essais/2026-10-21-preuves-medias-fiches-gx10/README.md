# Preuves médias des questions prioritaires — 21 octobre 2026

Sonde CPU lancée par la session Claude de reprise, entre 10:02 et 10:08 UTC.

## Question

Les attendus figés des questions signalées par la relecture (`kennedy-06`, `spring-04`, `spring-06`,
`cuisine-07`, `tears-07`, `artemis-07`) et par l'audit indépendant (`kennedy-03`, `kennedy-08`)
sont-ils soutenus par les médias eux-mêmes, aux temps inscrits, et visibles avant la pose ?
Cette sonde produit des preuves pour la relecture humaine. Elle ne modifie ni l'oracle gelé ni
les fiches, et ne note aucune réponse.

## Configuration

| Élément | Valeur |
| --- | --- |
| Machine | GX10 `gx10-e9a5`, accès SSH par clé, lecture seule sur le corpus |
| Médias | `/srv/tvlens-gx10/videos/`, SHA-256 recalculés avant extraction et conformes au manifeste du corpus (Bœuf `ec9d70f6…`, Tears `efa9062d…`, Artemis `6ac25c12…`, Spring `c2c678f2…`, Kennedy `f542af18…`) |
| Transcription | whisper.cpp `whisper-cli`, `ggml-large-v3-turbo` (`1fc70f77…`), **CPU seul** (`-ng`, 16 fils, `nice`), segments ≤ 60 caractères coupés au mot |
| Images | ffmpeg 6.1.1, une image par instant, 640 px de large ; plus les JPEG réellement envoyés par la préparation Spring (blocs 31 et 32) |
| Charge | aucun GPU, aucun appel TVLens ni Ollama ; verrous non pris (sonde CPU), GX10 au repos avant le départ |
| Durée | 151 s pour la sonde principale (10:02:40–10:05:12 UTC), complément Kennedy à 10:07 UTC |

Les temps ASR sont ceux des segments Whisper (précision de l'ordre de la seconde).

Scripts : [`preuves_fiches.py`](preuves_fiches.py) (sonde principale, SHA-256 `e8b0f7b1…` identique
avant et après copie) et [`complement.sh`](complement.sh) (Kennedy 01:30–02:15 et 05:15–06:15, plus
copie des JPEG réellement envoyés par la préparation Spring, blocs 31 et 32). Les bruts textuels sont
dans [`bruts/`](bruts/) : manifeste de la sonde avec segments ASR horodatés et empreintes des images
(`manifest-sonde.json`), transcriptions du complément, empreintes des 104 + 16 fichiers. Les images,
qui sont des extraits des médias, restent hors Git dans
`/Users/Dabi/Documents/TVLens-GX10/essais/preuves-fiches-20261021T100239Z/` et
`preuves-fiches-complement-20261021T100722Z/`, avec les originaux sur la GX10
(`/home/nvidia/tvlens-setup/preuves-fiches-*`). Toutes les copies concordent avec les empreintes
distantes.

## Résultats par question

| Question | Attendu figé | Ce que montre le média | Lecture proposée (à confirmer par le relecteur) |
| --- | --- | --- | --- |
| `kennedy-03` (pose 02:08) | « problèmes, dangers et ignorance nouveaux ; coûts et risques élevés, bénéfices importants » | 01:42 « New ignorance, new problems, new dangers » ; 01:46–01:54 « high costs and hardships, as well as high reward » | Sens et temps conservés ; remplacer « risques » par « épreuves/difficultés » (*hardships*). |
| `kennedy-06` (pose 04:32) | Liberté, paix, connaissance, compréhension ; refus de la conquête et des armes | 04:11 « hostile flag of conquest », 04:15 « freedom and peace », 04:23 « weapons of mass destruction », **04:26–04:30 « knowledge and understanding »** | Attendu juste ; preuve réelle 04:07–04:30, pas 04:00–04:24. La fin de la preuve tombe dans le bloc 04:24–04:32, clos à l'instant de la pose : avancer la pose à 04:40 ou plus, comme l'audit le propose. |
| `kennedy-08` (pose 06:00) | Les humains ; la technologie n'a pas de conscience | 05:26–05:43 « has no conscience of its own. Whether it will become a force for good or ill depends on man » ; « theater of war » à 05:55–06:01 | Attendu et pose justes ; la preuve est 05:26–05:43. La question dit « good or war » alors que le discours dit « good or ill » : reformuler plutôt que déplacer la pose. |
| `cuisine-07` (pose 10:56) | Retrait du bouquet, champignons puis oignons, mélange délicat | 09:13 bouquet garni retiré ; 09:28–09:35 champignons (image 09:35–09:40) ; 10:09–10:16 oignons ajoutés « délicatement » (image 10:15–10:20) ; 10:22–10:38 mélange « extrêmement doux » | Attendu et fenêtre 09:00–10:45 justes. Les trois `insufficient` sont un défaut du système, pas de l'oracle. |
| `tears-07` (pose 09:12) | Complète ; auparavant 90 % | 08:24 console, « 90% » (SRT 08:24–08:25) ; 08:58 écran « MEMORY OVERWRITE 098.56% » ; 08:56–09:00 « Memory override complete! » | Attendu et temps justes. L'ASR entend « overrated/override », l'écran écrit « OVERWRITE ». |
| `artemis-07` (pose 34:56, T+7:50) | Coupure moteurs principaux de l'étage central, réduction de poussée, pas encore effectuée | 34:23–34:30 « As we prepare for main engine cutoff… throttle down » ; 34:30–34:44 « 30 seconds now until core stage main engine cutoff » ; 34:44–34:53 « continue to throttle down » ; frise NASA : MECO pas encore atteint à 34:56 | Attendu juste ; le doute « coupure déjà survenue » est levé. Étendre la preuve à 03:24:23–03:24:44 (source) = 34:23–34:44 (local). Décalage local/source de 2:50:00 cohérent avec l'ASR de référence. |
| `spring-04` (pose 04:28) | « Il émet une lumière orange » | Images envoyées : bâton orange à 04:09,6, 04:11,2, 04:12,8, 04:14,4 ; **à 04:19,2 le bâton est au sol, éteint** ; 04:20–04:28 autres plans, bâton absent | **Attendu probablement faux pour « maintenant » à 04:28.** Avancer la pose à 04:16 (fin du bloc 31) ou reformuler en rappel (« De quelle couleur s'est allumé le haut du bâton dans la forêt ? »). « Contrairement aux lumières bleutées précédentes » n'est pas établi. |
| `spring-06` (pose 06:12) | Plus lumineux, végétation verte, contre froid et brume du début | 00:15 stalactites de glace, 00:30–01:15 mer de nuages, givre, bleu froid ; 05:45 lumière chaude ; 06:00 pentes vertes et lumineuses | Attendu juste. Les trois `insufficient` relèvent de la mémoire des faits anciens (piste « mémoire horodatée »), pas de l'oracle. Images 06:00–06:12 non échantillonnées. |

## Lecture

Sur huit questions, cinq attendus sont confirmés tels quels (`cuisine-07`, `tears-07`,
`artemis-07`, `spring-06`, `kennedy-08` pour le sens). Trois demandent une correction avant toute
note : `spring-04` (attendu contredit par l'image envoyée la plus récente), `kennedy-06` (preuve
partiellement dans le bloc clos à la pose) et `kennedy-03` (« risques » au lieu de *hardships*).
`kennedy-08` gagnerait une reformulation (« good or ill »).

## Limites et incidents

- Le relecteur humain reste nécessaire : ces preuves ne valent pas validation, et l'oracle gelé
  n'est pas modifié. Une nouvelle version des fiches devra porter nom, date et SHA.
- Whisper `large-v3-turbo` peut se tromper : les citations ci-dessus sont des transcriptions
  automatiques, recoupées par le SRT officiel (Tears), la frise NASA (Artemis) et les images.
- Échantillonnage d'images toutes les 2 à 15 s : un événement bref entre deux images peut manquer.
- Lien Tailscale passé par le relais DERP « fra » ; une coupure de connexion SSH d'environ une
  minute avant la sonde, sans effet sur elle.
