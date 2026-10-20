# Préparation de la GX10 — 20 octobre 2026

## Résultat actuel

L’accès SSH privé et le serveur TVLens sont opérationnels. La transcription, la perception, les questions
et les embeddings locaux ont été exercés avec succès. Le premier parcours a répondu par une abstention
après 33,206 s ; le passage suivant a produit une réponse sur l’extrait après 13,785 s.
Ces deux sondes ne constituent pas le comparatif de qualité ni une mesure du transport TV réel.

La GX10 et la télé sont sur le même réseau Tailscale : ping et connexion TCP au port SSH de la télé
réussis depuis la GX10. Aucune configuration TV n’a été modifiée, aucune capture n’a été lancée.
Les six vidéos sont disponibles, empreintes SHA-256 conformes et pistes vérifiées par ffprobe.
Un rejeu français supplémentaire de trois minutes est complet : 23 blocs, deux réponses avec citations
et une abstention. Les réponses ont pris 20,604 et 23,672 s ; l’objectif inférieur à 20 s reste à atteindre.

## Question et périmètre

Préparer l’environnement pour comparer les configurations entièrement locales sur un corpus français,
anglais et un témoin visuel. La priorité est la pertinence ; moins de 20 secondes est satisfaisant et
moins de 15 secondes est la cible souhaitée. Le compte Tailscale, l’accès SSH et l’installation ont été
autorisés par le propriétaire. Les identifiants, clés, jetons et adresses privées restent hors du rapport.

## Configuration observée

| Élément | Valeur |
| --- | --- |
| Système | Ubuntu 24.04.3 LTS, ARM64, noyau 6.11.0-1016-nvidia |
| Matériel | NVIDIA GB10, environ 121,6 Gio de mémoire unifiée ; swap initial inutilisé |
| Pilote et CUDA | 580.95.05 ; toolkit 13.0.88 |
| Node et npm | Node v24.22.0 ; dépendances installées avec `npm ci --omit=dev` |
| ffmpeg | 6.1.1-3ubuntu5 |
| Ollama | 0.40.6, loopback uniquement, `OLLAMA_NO_CLOUD=1` confirmé dans le journal |
| whisper.cpp | commit 231638a, compilation CUDA pour GB10 |
| Code public et copie C | 2035a2faad499659bcdf940c6104e50e311a9cd6 |
| Copie B | 70501e3de338580cf0bd4673074f8e6d4b07633e |
| Vision et réexamen | `gemma3:4b`, Q4_K_M, contexte 8192 |
| Questions | `qwen3.8:27b`, Q4_K_M, contexte 16384, raisonnement désactivé |
| Embeddings | `qwen3-embedding:0.6b`, Q8_0 |
| Transcription du contrôle | Whisper `base`, huit threads, CUDA |
| Poids Whisper disponibles | `base`, `small`, `medium`, `large-v3-turbo`, tous vérifiés par SHA-256 |

Les réglages détaillés sont dans [config-initiale.env](config-initiale.env). Ollama possède trois emplacements
pour les modèles, une requête parallèle par modèle, Flash Attention et un cache KV q8_0. Les modèles utilisés
par vision et questions restent chargés dix minutes. Ce réglage initial n’est pas déclaré optimal.
La surveillance reste inactive ; son fournisseur Codex n’a pas été exercé. Le service utilise aussi
`/usr/bin/false` comme binaire Codex pour empêcher un lancement accidentel de ce fournisseur.

## Étapes réalisées

1. Inspection du bureau Ubuntu via le client officiel Manage4all. OpenSSH était déjà installé et activé
   par socket sur le port 22. Les deux adresses privées initiales n’étaient pas joignables depuis le Mac.
2. Installation et connexion Tailscale effectuées par le propriétaire avec son compte Google contenant
   la télé. La GX10 a ensuite été observée en ligne sur le réseau du Mac.
3. Connexion SSH par mot de passe réussie, puis installation d’une clé dédiée. Connexion non interactive
   par clé vérifiée. Alias local : `ssh gx10-tvlens` ; paramètres et clé dans le dossier SSH privé du Mac.
4. Inventaire système enregistré dans [systeme-initial.txt](systeme-initial.txt). Le PATH SSH ne contenait
   pas CUDA : `/usr/local/cuda/bin` a été fourni explicitement aux commandes de compilation.
5. Bundle Git des deux tags figés créé hors du dépôt, vérifié avec `git bundle verify`, puis transféré
   avec le kit et les vidéos locales Kennedy/Spring. Taille du bundle : 20 993 540 octets.
6. Paquets système, Node ARM64 officiel avec vérification SHA-256, Ollama et whisper.cpp installés.
   Whisper a compilé avec CUDA. L’installateur d’origine a été interrompu volontairement pendant le
   téléchargement lent de `medium` ; son fichier incomplet a été conservé avec le suffixe `.part`.
7. Les copies B et C ont été clonées depuis le bundle, positionnées sur leurs tags et installées séparément.
   Un clone public sur `main` a également été installé pour le service. Les trois SHA ont été vérifiés.
8. Les téléchargements Whisper complémentaires ont repris avec aria2, huit connexions et vérification
   du SHA-256 LFS officiel avant renommage final. Les quatre empreintes sont conformes.
9. Ollama a démarré sous le compte utilisateur dans `tmux`, sur loopback. Les trois modèles de référence
   ont été téléchargés ; les digests et quantifications sont conservés dans [modeles-installes.txt](modeles-installes.txt).
10. TVLens a démarré dans une seconde session `tmux`, sur son adresse Tailscale avec authentification
    par jeton. Contrôle depuis le Mac : 401 sans jeton, 200 avec jeton, surveillance inactive.
11. Sonde Whisper réelle sur huit secondes de Kennedy : transcription obtenue et backend CUDA0 explicite.
    Sonde vision réelle sur une image : réponse obtenue, modèle déclaré en mémoire GPU par Ollama.
12. Préparation de deux blocs Kennedy de huit secondes, cinq images par bloc et audio PCM mono 16 kHz.
    Validation du scénario puis deux exécutions réelles avec le runtime et les transports HTTP du produit.
13. Téléchargement du noyau de six vidéos. CNRS, cuisine et Tears of Steel ont rejoint Kennedy et Spring.
    Artemis est terminé (extrait de 35 minutes) ; la finalisation des six vidéos et les contrôles
    SHA-256 et ffprobe ont réussi.
14. La télé est apparue en ligne lors d’un contrôle ultérieur. Depuis la GX10 : ping Tailscale et TCP/22
    réussis. Le premier ping a utilisé un relais DERP ; le débit du flux TV n’a pas été mesuré.

## Résultats des contrôles

| Contrôle | Résultat et limite |
| --- | --- |
| SSH depuis le Mac | Authentification par clé réussie ; alias local disponible |
| API TVLens depuis le Mac | 401 sans jeton, 200 avec jeton |
| Ollama | Écoute loopback confirmée ; absence d’écoute toutes interfaces sur son port |
| Whisper sur audio réel | CUDA0 explicitement utilisé ; texte transcrit ; extrait brut conservé |
| Première image Gemma seule | 41,94 s, dont 13,48 s de chargement ; sortie limitée à 96 jetons |
| Premier parcours TVLens | Deux blocs traités ; question terminée en 33,206 s par une abstention |
| Parcours à chaud | Deux blocs traités ; réponse avec deux citations en 13,785 s |
| Embeddings | Deux indexations et aucun échec au premier parcours |
| Réexamen | Configuré local, mais non exercé dans ces sondes |
| Surveillance | Inactive ; aucun appel observé |
| GX10 vers télé | Ping et ouverture TCP/22 réussis ; capture réelle non testée |

La première réponse indique que seule une transcription partielle était accessible et que la vision
était encore en cours à l’envoi de la question. Le passage à chaud répond :

> L’orateur, John F. Kennedy, évoque l’histoire de l’humanité : il invite à mesurer le chemin parcouru
> en condensant cinquante mille ans d’histoire en à peine un demi-siècle.

Les délais de 33,206 et 13,785 s sont les métriques internes TVLens, file comprise ; ils ne comprennent
pas le transport réel depuis la télé. Les téléchargements et l’encodage Artemis continuaient pendant
les sondes ; l’encodage a été placé à une priorité CPU réduite avant celles-ci. Le premier passage
n’est pas un démarrage froid normalisé et une seule question ne donne ni médiane fiable ni p95.

Les deux exécutions sont complètes, sans garde en échec ni compteur de perte audio/vision. Le calendrier
fait vingt secondes pour un extrait de seize secondes : les quatre dernières secondes sans capture sont
intentionnelles et expliquent la couverture de 80 % du calendrier. Le contrôle à chaud s’est fermé avec
deux indexations encore en attente, sans échec : les embeddings n’y ont pas été exercés. L’indexation
réussie est établie par le premier parcours uniquement. La question à chaud n’a pas appelé d’outil de
recherche ni de réexamen ; elle n’éprouve donc pas encore une session longue ou la recherche sémantique.

## Preuve supplémentaire en français — trois minutes

Le scénario convertit les 180 premières secondes de la vidéo CNRS en 23 blocs contigus de huit secondes
(dernier bloc de quatre secondes), avec cinq images et la piste audio. Les trois questions arrivent à
65, 125 et 185 s. Le calendrier dure 190 s, puis le runtime attend le traitement restant. Aucune fiche,
aucun sous-titre source et aucun attendu n’ont été fournis aux modèles. Même configuration que les sondes
Kennedy : Whisper base, Gemma3 4B, Qwen3.8 27B et Qwen3 Embedding 0.6B.

| Question | Résultat | Délai interne, file comprise |
| --- | --- | --- |
| Sujet de la vidéo et explications jusqu’ici | Réponse, cinq citations | 20,604 s |
| Résumé de la dernière minute | Abstention, aucune citation | 16,749 s |
| Points clés des trois minutes | Réponse, quatre citations | 23,672 s |

Le rejeu `6748c7ad-973b-4e37-9ba3-5a7db795d4ef` est complet : 23 transcriptions et 23 perceptions,
aucun garde en échec, aucun compteur de perte audio ou vision, fermeture et archivage confirmés.
À la consultation finale, les 180 s sont analysées, retard nul ; le temps observé est 211,331 s.
La couverture vaut 180/190 s : les dix dernières secondes sans capture sont prévues pour la dernière
question. L’index a effectué 25 écritures sans échec ; trois travaux d’indexation restent en attente
à la fermeture. Ces écritures ne correspondent pas nécessairement à des passages uniques.
Le réexamen et la surveillance n’ont pas été exercés.

La dernière réponse restitue le corpus d’images étiquetées, les chats et lapins et la séparation
apprentissage/évaluation. Ce contrôle prouve le parcours local, pas une qualité suffisante : la première
réponse parle d’« apprentissage à partir de données biologiques », alors que les sous-titres source
présentent surtout une analogie entre petits/grands systèmes et animaux. Cette formulation doit être
revue. L’abstention de la seconde question survient avec deux blocs en attente ; elle ne prouve pas
que toute la minute était inutilisable. Le temps et la prudence de la réponse ne remplacent pas une
notation de pertinence. La vérification documentaire a eu lieu après le rejeu, hors entrées du modèle.

L’encodage Artemis à priorité réduite et les téléchargements étaient encore actifs. Ce n’est donc ni
un protocole de mesure isolé ni un comparatif de configurations. L’objectif inférieur à 20 s n’est pas
validé pour les deux réponses françaises ; aucune conclusion « meilleure configuration » n’est tirée.
Le prochain comparatif devra isoler la charge, examiner le retard de perception et tester le compromis
entre taille du modèle de questions, longueur de sortie et qualité, sur les mêmes questions préparées.

Preuves : [résultat brut](preuve-cnrs.json), [synthèse contrôlée](synthese-cnrs.json),
[scénario](scenario-cnrs.json), `preparer-preuve-cnrs.cjs` et `synthetiser-preuve-cnrs.py`.
La validation seule a créé son dossier de sortie ; la première commande d’exécution utilisant ce dossier
a été refusée avec `EEXIST`, avant inférence. L’exécution complète utilise un nouveau dossier
`/home/nvidia/tvlens-setup/preuve-cnrs/run-execute` ; rien n’a été écrasé.
Archive brute hors Git :
`/Users/Dabi/Documents/ISN/tvlens-gx10-journal/2026-10-20-connexion/preuve-cnrs-180s.tar.gz`.

## Corpus et services laissés disponibles

- Disponibles dans `/srv/tvlens-gx10/videos/` : Kennedy, Spring, CNRS, bœuf bourguignon, Tears of Steel,
  Artemis. Voir [manifeste](corpus-6-videos.json) et [contrôles SHA-256 et pistes](verification-corpus.json).
- `finaliser-corpus.py` a terminé et écrit `/srv/tvlens-gx10/videos/corpus-6-videos.json` ; journal
  `/srv/tvlens-gx10/logs/corpus-final.log`. Les téléchargements et l’encodage sont terminés.
- Le serveur et Ollama restent dans les sessions `tmux` `tvlens-server` et `tvlens-ollama`.
  Ils survivent à la déconnexion SSH ; le démarrage après reboot n’a pas été configuré.
  Dernier contrôle depuis le Mac après le rejeu : 401 sans jeton, 200 avec jeton.
- Le service conserve ses données dans `/srv/tvlens-gx10/service-data/`. Son jeton reste privé.

Aucune grille de 120 campagnes ni comparaison de qualité sur les six vidéos n’a été lancée. Les fiches
et réponses attendues restent sur le Mac, hors des entrées des modèles. Leur relecture reste à faire
avant de noter les résultats, conformément au [protocole FR/EN](../../gx10/evaluation/README.md).

## Incidents et décisions

- Le client distant déformait les lettres puis les touches de modification. Une disposition `fr/mac`
  a été appliquée, mais la saisie automatisée des symboles restait peu fiable. Le propriétaire a exécuté
  la courte installation Tailscale ; l’administration a ensuite continué en SSH.
- La source Deno expirait en TLS. Une tentative depuis la publication GitHub officielle a aussi été
  interrompue. Le téléchargement vidéo utilise finalement Node 24 avec `--js-runtimes node`.
- Une première extraction du tableau des quatre vidéos avait omis `|| true` sur le `read` Bash.
  Le script dérivé s’arrêtait avant téléchargement ; le garde a été rétabli puis la procédure relancée.
- L’installateur d’origine considère un poids non vide comme présent : un fichier partiel pourrait être
  réutilisé. La reprise opérée ici maintient `.part` jusqu’à vérification SHA-256.
- Le bundle sans branche HEAD produit un avertissement au clone. Le checkout explicite du tag et le
  contrôle de SHA ont bien réussi pour les deux copies.
- Le contrôle de synthèse a d’abord supposé une indexation dans chaque parcours. L’inspection des preuves
  a montré les deux tâches en attente à chaud : cette limite est conservée, aucune exécution n’est masquée.

## Preuves et reproduction

- [Synthèse des deux parcours](synthese-smoke.json), [premier passage](smoke-premier-passage.json),
  [passage à chaud](smoke-chaud.json), [validation du scénario](validation-smoke.json).
- [Contrôle HTTP](controle-http.json), [liaison TV](reseau-tv.json), [sonde vision](vision.json),
  [extrait Whisper](whisper-smoke-extrait.log), [inventaire](systeme-initial.txt), [modèles et empreintes](modeles-installes.txt).
- Scripts : `demarrer-serveur.sh`, `preparer-scenario.cjs`, `sonde-vision.py`, `installer-modeles.py`,
  `telecharger-noyau.sh`, `completer-poids.sh`, `finaliser-corpus.py` ; tentative Deno conservée séparément.
- Archive brute des médias, préparations et sorties des deux sondes, hors Git :
  `/Users/Dabi/Documents/ISN/tvlens-gx10-journal/2026-10-20-connexion/smoke-kennedy-16s.tar.gz`.

Le scénario est généré avec `preparer-scenario.cjs`. Les commandes produit utilisées sont :

```sh
node scripts/prepare-video-replay.cjs --file /srv/tvlens-gx10/videos/kennedy-rice-7min.mp4 \
  --out DOSSIER_NEUF/preparation --start-ms 0 --duration-ms 16000 --block-ms 8000 --frames 5 --jpeg-quality 3 \
  --config /home/nvidia/tvlens-setup/config-initiale.env
node /home/nvidia/tvlens-setup/preparer-scenario.cjs DOSSIER_NEUF/preparation
node scripts/replay-local-stream.cjs --scenario DOSSIER_NEUF/preparation/scenario.json \
  --out DOSSIER_NEUF/run --config /home/nvidia/tvlens-setup/config-initiale.env --execute
```

La syntaxe des scripts ajoutés a été contrôlée avec Bash, Node et Python. Aucun contrôle global du produit
n’a été lancé pour cette installation ; le code applicatif n’a pas été modifié. Aucun commit ni push.
Le journal a été déposé après vérification que les boucles actives concernaient un autre checkout.

## Sources de configuration vérifiées

- [Désactiver le cloud Ollama](https://github.com/ollama/ollama/blob/main/docs/faq.mdx).
- [Runtime JavaScript de yt-dlp, dont Node](https://github.com/yt-dlp/yt-dlp/wiki/EJS).
- [Poids officiels whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp).
- [Qwen3.8 27B](https://ollama.com/library/qwen3.8:27b), [Gemma3 4B](https://ollama.com/library/gemma3:4b),
  [Qwen3 Embedding 0.6B](https://ollama.com/library/qwen3-embedding:0.6b).
