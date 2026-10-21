# GX10 — confirmation de l'ablation cinq contre trois images

Préparation du 21 octobre 2026 du point 4 du [plan de consolidation](../2026-10-21-consolidation-gx10/README.md). **Aucun appel modèle n'a encore été lancé pour ce point.** L'hypothèse est que trois images d'un bloc de 8 s réduisent le temps de perception sans perdre des faits visuels utiles. Le résultat de la nuit sur CNRS est descriptif ; cette confirmation étend l'observation à Kennedy (anglais) et Spring (sans dialogue), avec comparaison appariée par bloc.

## Entrées figées et variation

[`inputs.json`](inputs.json) fixe 12 blocs par vidéo, choisis avant les réponses du nouvel essai parmi les préparations de référence du 20 octobre. Les indices Kennedy sont `0, 3, 4, 15, 16, 26, 27, 33, 34, 44, 45, 51` ; Spring : `0, 1, 8, 9, 23, 24, 27, 28, 33, 34, 46, 56`. Ils couvrent début, milieu et fin, ainsi que les fenêtres des questions de référence, notamment le rappel ancien de Spring. Cette sélection ciblée n'est pas un échantillon aléatoire représentatif des vidéos entières. Chaque ligne porte l'intervalle de 8 s, le SHA du `media.json` et les cinq SHA JPEG source. Le SHA de `inputs.json` est fixé dans le script : `a84258d284981d1293606fcd5d300f738972e68b24a587093381e2439c0d89ca`.

| Bras | Images de la préparation source | Invariant |
| --- | --- | --- |
| A | `[0,1,2,3,4]` | Même bloc, même texte ASR source, même contexte, même audio, même modèle et même prompt |
| B | `[0,2,4]` | Première, médiane et dernière des cinq images ; aucun réencodage |

L'ordre de quatre parcours complets est **A/B/B/A**. Il y a 24 cas par parcours, donc au plus 96 cas. Le premier et le second passage de chaque bras restent distincts dans l'analyse. Le `replay-local-perception` existant traite chaque cas avec un nouvel agent : cet essai mesure le composant perception, pas la cadence réelle des deux files pendant un flux TV. L'ASR des manifestes de préparation est `unknown` avec texte vide ; le script le conserve strictement. Il ne reconstitue ni transcription ni contexte historique. Cela contrôle l'ASR entre bras, mais ne teste pas les bénéfices d'une transcription utile. Le modèle est `gemma3:4b`, digest Ollama `68ceab7e468a31c988b44d5a4984a0e21f58c4f7158c6ce29c1804babac38df7`, `numCtx=8192`, `keepAlive=10m`. Le dépôt distant observé le 21 octobre est au commit `2035a2faad499659bcdf940c6104e50e311a9cd6`. Le runner distant `scripts/replay-local-perception.cjs` a le SHA-256 `c6ce9fda37336d5abf73af2347e91624daf7f3958dfe9e63469e8cad02e617eb` ; le script vérifie **les deux** avant le départ, car HEAD seul ne protège pas un fichier modifié. Toute autre version demande une nouvelle préinscription, car prompt ou instrumentation pourraient changer.

## Contrat de lancement

Sur GX10 Linux ARM64, rendre accessibles ce dossier et le dépôt TVLens au commit figé. Les préparations source attendues sont sous `/home/nvidia/tvlens-setup/reference-2026-10-20/preparation-kennedy` et `preparation-spring`. Le Mac ne possède que leurs manifestes/index rapatriés, pas les 24 médias. Le pré-vol distant **en lecture seule** compare le commit et le SHA du runner, les SHA des trois JSON par vidéo, ceux de chaque `media.json` et les cinq JPEG décodés par bloc. Il refuse le moindre écart avant inférence ; il ne recrée pas un bloc depuis la vidéo.

```sh
python3 experiments/essais/2026-10-21-confirmation-images-gx10/scripts/confirm_images.py preflight
```

Sans copier le dossier sur GX10, le même contrôle peut être transmis depuis le Mac par
`PYTHONDONTWRITEBYTECODE=1 python3 experiments/essais/2026-10-21-confirmation-images-gx10/scripts/preflight_ssh.py`.
Le script passe seulement le plan figé sur stdin à Python via SSH ; aucun fichier distant n'est créé.
Le pré-vol réel du 21 octobre a validé le commit, le SHA du runner, les trois fichiers de préparation
par vidéo, les 24 `media.json` et leurs 120 JPEG encodés. Son résultat est conservé dans
[`preuves/preflight-ssh-20261021/`](preuves/preflight-ssh-20261021/). Le premier essai de capture de
preuve a échoué **localement** avant l'écriture, car le parent du dossier de preuve n'existait pas ;
le script a été corrigé et le pré-vol a ensuite terminé avec code 0. Aucun écart d'entrée n'a été
observé. Ce contrôle de fichiers n'atteste pas que le GPU et les verrous seront libres au moment du
créneau ; les gardes du lancement les reliront alors.

Le créneau GPU ne peut commencer qu'après le point 3. Fournir à `--predecessor` le dossier clos de cet essai pause : `results/status.json` doit annoncer `finished` et `cleanupConfirmed=true`, et `results/integrite.json` doit sceller exactement tous les fichiers de `results/`. Le script vérifie les empreintes avant et après la prise des verrous ; un statut inconnu, `blocked`, `cleanup-failed` ou un fichier ajouté/modifié bloque le lancement. Il prend simultanément `night.lock`, `reference-2026-10-20/execution.lock` et `followup-gpu.lock`, vérifie l'absence d'autre rejeu, le digest Ollama, la disponibilité de `nvidia-smi` et l'inventaire des processus GPU. Un processus GPU de calcul autre qu'Ollama, ou un inventaire indisponible, bloque le départ. Une réservation opérateur exclusive du service et l'absence de TVLens/autre client Ollama durant le créneau restent nécessaires : ces verrous sont coopératifs et ne peuvent bloquer des clients qui les ignorent.

```sh
python3 experiments/essais/2026-10-21-confirmation-images-gx10/scripts/confirm_images.py run \
  --predecessor /chemin/du/dossier-pause-clos \
  --repo /home/nvidia/tvlens \
  --out /chemin/neuf/confirmation-images-20261021
```

Le dossier de sortie doit être neuf. Le budget est de **2 h**, incluant pré-vol, dérivation et quatre parcours. Le script surveille toutes les cinq secondes mémoire disponible (minimum 8 Gio), espace libre (minimum 40 Gio) et service Ollama ; il arrête après trois cas consécutifs en échec, au premier code non nul de runner, à SIGINT/SIGTERM ou au plafond. Seul son groupe enfant est signalé, avec 35 s de grâce puis SIGKILL. Un arrêt brutal du superviseur ou du système peut laisser un enfant ou un dossier non scellé : vérifier les PID et conserver les bruts avant toute autre charge. Aucun rattrapage automatique ni relance pour choisir le meilleur passage.

## Mesures et annotation

Le runner produit `run-XX-A|B/run/campaign.json` et les journaux bruts de chaque parcours. `mesures.json` exporte par cas le statut, les cinq ou trois images effectivement envoyées, le SHA du prompt, le nombre d'appels fournisseur, la durée totale fournisseur, chargement, préremplissage, génération, tokens et délai client **quand Ollama les fournit**. Il donne aussi la cadence par parcours (cas terminés/durée du processus), qui ne représente pas la cadence d'un flux TV. `a-annoter.json` préserve les sorties avec champs d'annotation vides. La consigne inclut les horodatages des images : son SHA brut diffère donc nécessairement entre A et B. Le script vérifie chaque SHA brut, puis compare le même gabarit de prompt après remplacement de cette seule liste d'horodatages ; un autre changement refuse la clôture réussie. Les données restent `readyForScoring=false` ; aucun score n'est déduit d'un statut `succeeded`.

Après fermeture, annoter à l'aveugle contre les médias source les textes lisibles (OCR), actions brèves, descriptions utiles, faits manquants ou inventés et erreurs, puis comparer chaque bloc entre A et B. Publier les 96 délais individuels, séparés par vidéo et passage froid/chaud observé, les p50/p95 avec leurs effectifs, pertes et appels fournisseur. Le p95 de seulement 12 blocs par vidéo est fragile. Un gain de délai accompagné d'une perte de fait utile n'est pas une amélioration du produit. Le premier token n'est pas mesuré : ne pas l'inférer du temps total Ollama. Un jugement de pertinence attend toujours la validation humaine des fiches de référence.

Le superviseur écrit `status.json`, `identity.json`, entrées dérivées, sorties du runner, `mesures.json`, `a-annoter.json`, puis `integrite.json` avec SHA de chaque fichier. Il conserve les sorties partielles en cas d'échec. Son statut `finished` signifie que le protocole technique a été mené à terme, sans prétendre que la qualité est validée. Aucun fichier de ce dossier ne contient de résultat GPU nouveau à ce jour.

Le paquet a été copié sous `/home/nvidia/tvlens-setup/confirmation-images-20261021T082000Z/` sur GX10 ; les SHA de `inputs.json` et du script sont identiques à la copie locale. Le pré-vol distant a contrôlé les 24 `media.json` et 120 JPEG en lecture seule (`status=validated`, `gpuUsed=false`). Il attend toujours la fermeture scellée du point 3. Cette mise en place est consignée dans [deployment.json](deployment.json).

## Vérifications hors GPU

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s experiments/essais/2026-10-21-confirmation-images-gx10/tests -v` vérifie la dérivation `[0..4]`/`[0,2,4]`, l'identité ASR, le refus d'un média modifié et le garde de fermeture/scellement du prédécesseur sur des fixtures temporaires. Cela ne valide ni l'accessibilité distante des 24 médias, ni la durée réelle, ni la qualité des observations ; le pré-vol lecture seule sur GX10 demeure une étape distincte avant le créneau GPU.
