# Companion LG → Mac : premier branchement réel

> Historique du premier branchement. Pour une installation actuelle, suivre [le guide LG](lg-installation.md) et [le guide serveur](server-installation.md). Les hypothèses VPS non validées et versions de package ci-dessous correspondent à cette étape ancienne.

**État actuel :** le [companion avec frise](lg-timeline.md) et le [moteur sur VPS privé](vps-deployment.md) sont désormais livrés et confirmés sur la TV. Ce document conserve les détails de son étape d’implémentation.

**Mise à jour suivante :** [contrôle depuis le panneau et reprise réseau](lg-capture-control.md). Les restrictions CLI/retry ci-dessous décrivent le premier essai et sont désormais dépassées par cet incrément.

État au 30 septembre 2026 : transport image/son et chat testés avec le YouTube réellement regardé sur la LG. La nouvelle sidebar est validée dans un navigateur indépendant. Après disponibilité confirmée par l’utilisateur, ses fichiers ont été déployés dans l’app existante (avec sauvegarde du prototype) sans lancement automatique. L’utilisateur a ensuite confirmé que les boutons, la dictée et la réponse fonctionnent sur la TV. Les essais automatiques n’ont pas lancé de panneau, redimensionné la vidéo ni envoyé de touche à la TV.

## Architecture et périmètre

- `runtime/session-runtime.cjs` compose la session, mémoire, transcription, perception, recherche et réexamen. Electron et l’hôte autonome réutilisent cette composition et les mêmes classes du domaine.
- `runtime/headless-runtime.cjs` raccorde les questions à `DeepAsk`, `VideoTools` et au fil Codex de session. FIFO, annulation ciblée, références temporelles, limites de 60 secondes hors attente et validation des preuves sont réutilisées.
- `server/http.cjs` est l’adaptateur HTTP authentifié ; `adapters/remote-media.cjs` convertit les médias entrants vers le contrat existant. Le domaine ne dépend ni de webOS, ni d’HTTP, ni d’Electron.
- `tv/capture.py` capture sur la TV et pousse les données au serveur. SSH sert seulement à lancer le processus borné, pas à transporter les médias. Le script ne lance ni ne contrôle YouTube.
- `tv/app/` contient le client de la sidebar, séparé du prototype de dictée. Aucun modèle ne tourne dans cette interface : le texte reconnu par LG est envoyé au serveur, qui répond via Codex.

Cette première API expose ingestion, état, questions, annulation, pause/reprise et lecture de média. Auto, marque-pages, récapitulatif progressif et recherche dédiée ne sont pas encore exposés dans le companion. Ils restent disponibles dans l’app Mac. L’extraction de la composition est progressive, pas un déplacement complet de toute l’application Electron.

## Démarrer l’hôte sur le Mac

Depuis la racine du dépôt, avec les dépendances et la transcription locale déjà installées :

```sh
npm ci
TVLENS_BIND=0.0.0.0 npm run start:server
```

Le serveur écoute par défaut sur `127.0.0.1:8787`. `TVLENS_BIND=0.0.0.0` permet le test depuis le LAN. Il ne faut pas ouvrir ce port directement sur Internet : ce transport de développement est HTTP en clair. HTTPS, contrôle du proxy, stockage Linux et authentification Codex du VPS restent à valider dans LG-11/LG-12.

Configuration :

| Réglage | Valeur / fonction |
| --- | --- |
| `TVLENS_PORT` | `8787` par défaut |
| `TVLENS_SERVER_DATA` | `~/Documents/TVLens-private/server` |
| `TVLENS_CONFIG` | `.env.local` du dépôt |
| `TVLENS_CODEX_BINARY` | `~/.local/bin/codex` par défaut ; configurable pour un autre hôte |
| `models.json` dans le dossier serveur | Modèles de chat, perception et réexamen ; perception/réexamen Luna par défaut |
| Configuration existante | Chemins FFmpeg, Whisper et modèle local ; OpenRouter réservé aux embeddings texte |

Un secret aléatoire est généré dans `device-token`, permissions `0600`. Le serveur ne le journalise pas. Copier ce secret seulement dans la configuration privée de l’appareil. Pour le révoquer : arrêter l’hôte, supprimer ce fichier, redémarrer puis réappairer la TV. Ne jamais mettre ces fichiers dans Git ou dans un package public.

Les médias restent cinq minutes détaillées dans la mémoire active ; les résumés et réponses sont sauvegardés. Au redémarrage, les médias bruts des anciennes sessions sont supprimés. Pause/reprise conserve le contexte tant que le processus reste vivant ; la réhydratation d’une conversation après redémarrage du serveur n’est pas implémentée. Les tests utilisent un dossier distinct de celui de l’app Mac.

## Capture manuelle de la TV

Prérequis spécifiques : accès SSH existant, YouTube, Python 3, `luna-send`, `arecord` et les services déjà vérifiés sur cette LG. Ne pas généraliser les coordonnées ni le périphérique audio à un autre modèle.

Fichier privé `/media/developer/tvlens-companion/connection.json`, permissions `0600` : champs `url` (adresse LAN du Mac) et `token` (secret de l’hôte). Ne pas coller le secret dans les logs ou arguments de commande.

```sh
scp tv/capture.py tv-lg:/media/developer/tvlens-companion/capture.py
ssh tv-lg 'python3 /media/developer/tvlens-companion/capture.py --config /media/developer/tvlens-companion/connection.json --seconds 48'
```

La durée est bornée à 8–1800 secondes, par tranches complètes de 8 secondes. Le processus démarre/reprend la session serveur et s’arrête seul ; il ne redémarre pas au boot. Une session serveur sans nouvel envoi conserve la mémoire et affiche l’absence de capture récente. Fermer le panneau n’arrête pas un processus de capture lancé séparément.

Capture : quatre PNG 1280×720 par tranche, environ une image toutes les deux secondes, WAV stéréo 48 kHz. Le serveur normalise en JPEG et WAV mono 16 kHz, puis construit une relecture WebM à partir des images fixes. **Les frames répétées dans le WebM ne constituent pas une vidéo native ; les actions entre deux captures restent inconnues.**

Le recadrage vient du rectangle réellement renvoyé par `videooutput/getStatus`, converti du plan physique 3840×2160 vers le PNG 1280×720. Le contexte et la géométrie sont relus après chaque capture ; une transition invalide le segment. Cela limite l’inclusion du panneau sans prouver une absence de course lors d’une transition. Pendant le test du nouveau panneau, 64 images conservées mesuraient 960×540, contre 36 en plein écran 1280×720. Une image recadrée a été examinée : elle contient le programme sans la sidebar. Cela ne valide pas tous les overlays système, notamment le clavier LG.

Les horodatages utilisent une horloge monotone et l’offset de la session fourni au démarrage. La latence de la commande de capture et celle du lancement audio ne sont pas calibrées : un test avec événement audiovisuel repérable reste requis. Un flux instable ou une publicité peut faire rejeter une tranche entière.

File d’envoi : trois tranches au maximum, abandon après 30 secondes d’âge avant envoi. Durée réseau maximale par requête : 25 secondes ; une requête déjà partie peut dépasser cet âge. Les erreurs et abandons sont comptés. Il n’y a pas encore de reprise automatique de requête après une panne réseau. L’hôte déduplique néanmoins les renvois identiques, refuse une séquence réutilisée avec un autre contenu, les sessions périmées et les horodatages futurs. Limites : cinq images, dix secondes, 13 Mo par requête, une préparation média à la fois.

## Sidebar prête pour le prochain test interactif

Construire `tv/app/` avec le packager existant :

```sh
python3 prototypes/lg-sidebar/package.py --app-dir tv/app --output-dir tv/dist
```

Le package conserve l’identifiant `org.tvlens.sidebarprobe` pour le contrôleur Rakuten existant, version `0.0.3`. Il ne contient aucun secret. Sur l’installation cible, fournir un fichier local privé `connection.js` définissant `window.TVLENS_REMOTE` avec `url` et `token`. Ce fichier est ignoré par Git. Sur la LG testée, son propriétaire doit être `wam` (processus WebAppMgr), avec permissions `0600` : un fichier root `0600` est inaccessible à l’interface et affiche « Appairage requis ». La configuration du processus de capture reste root `0600`. Ne pas installer/remplacer l’app pendant un visionnage sans coordonner le test : le package remplace le prototype existant.

Le parcours confirmé par l’utilisateur : Rakuten → Dicter → micro du clavier LG → Envoyer → réponse dans le panneau. Le bouton micro physique direct reste géré par LG. Le contrôleur de géométrie et son watchdog existants ne sont pas changés ; leur limite d’affichage et leurs restrictions lors des publicités restent applicables.

L’ancrage est gelé au focus du champ/début de composition, jamais au début du traitement en file. Plusieurs questions sont possibles, avec annulation par question, étapes réelles et réponse provisoire distincte. Les compteurs de capture et d’analyse sont séparés ; médias expirés et absence de capture récente sont signalés. Flèche gauche pour lire la conversation, haut/bas pour défiler, droite pour revenir à Dicter. Les URL des sources sont affichées comme texte ; ouverture d’article et relecture depuis la TV relèvent encore de LG-07.

## Résultats observés et limites conservées

| Essai réel | Résultat |
| --- | --- |
| Premier envoi TV → Mac, 48 s demandées | 6 tranches reçues, 24 images, audio ; 0 abandon/erreur |
| Analyse des six tranches | 3,843 à 6,385 s par tranche, Whisper local + Codex Luna |
| Première question sur ce contenu | Premier retour utile 3,415 s ; réponse complète 13,605 s ; 5 citations acceptées |
| Deuxième envoi, 32 s demandées | 4 tranches reçues, 16 images, audio ; 0 abandon/erreur |
| Question dans la sidebar en navigateur | Premier retour utile 2,872 s ; traitement total 6,314 s |
| Deuxième question mise en file | Attente 5,319 s ; traitement 26,690 s, dont réexamen 12,622 s ; total 32,009 s |
| Priorité du chat pendant la capture | Capture indépendante ; une analyse de fond sautée, média conservé pour réexamen dans la rétention |
| Question dictée sur la TV, confirmation utilisateur | Premier retour utile 3,043 s ; réponse complète 9,568 s ; 4 citations acceptées |
| Premier test TV du nouveau panneau | « Appairage requis » + navigation bloquée : propriétaire du secret corrigé en `wam`, navigation initialisée même sans appairage ; nouvel essai confirmé réussi |
| Canal SSH de capture silencieux | Timeout SSH observé ; le processus TV et les envois ont continué. Le rapport stdout de cette tentative est incomplet ; ne pas l’interpréter comme zéro erreur |
| Premier lancement du test navigateur | Refus car les médias avaient déjà expiré ; relancé après nouvelle capture, sans masquer cet échec |

Les durées ci-dessus sont des observations ponctuelles, pas un benchmark garanti. Une transcription a notamment déformé des noms et des mots politiques : les réponses ont signalé leur incertitude. Aucune accusation rapportée n’a été utilisée comme preuve externe. Les images sont envoyées à Codex pour l’inférence ; seul le traitement audio Whisper est local au Mac dans ce POC. Codex ne retourne pas de coût monétaire par appel dans ce parcours (`providerUsd: null`) ; le compteur hérité à zéro ne signifie pas « coût réellement nul ». Aucune comparaison de coût n’est déduite de cet essai.

Validation automatisée : 100 tests Node réussis ; régression navigateur `node scripts/smoke-lg-ui.mjs` réussie pour la navigation même sans appairage ; smoke Electron réussi (14 segments, audio, relecture, questions et vérification simulée). Le test réel `node scripts/probe-lg-companion.mjs` utilise un serveur et des captures TV existants, sans réponses modèle simulées, puis vérifie deux réponses, FIFO, citations et géométrie dans Chrome headless. Il effectue des appels Codex. `TVLENS_CHROME` et `TVLENS_SERVER_URL` sont configurables.

Preuves privées : `~/Documents/TVLens-private/server/companion-live-report.json` et `companion-live.png`. Les captures de programmes et secrets restent hors dépôt. Les médias source expirent normalement.

**Encore incomplet :** bouton de contrôle de la capture dans l’interface, mesure précise de synchronisation/débit/charge TV, déconnexion/reconnexion prolongée, déploiement Linux/HTTPS et stabilité longue. LG-03/04/05 ne sont donc pas déclarés entièrement terminés.

Déploiement interactif : les fichiers HTML/CSS/JS ont été remplacés dans l’app déjà enregistrée, sans réinstaller son package ni changer sa fiche système (qui peut encore indiquer 0.0.2). Sauvegarde sur la TV : `/media/developer/tvlens-companion/backup-voice-002/`. Le package 0.0.3 est construit pour une future installation reproductible.

Après validation, la capture de test a été arrêtée par signal sur son seul processus identifié, sans fermer YouTube ni le panneau. Le serveur conserve les réponses et applique la rétention normale ; la capture n’est pas un daemon de visionnage permanent. Le prochain incrément est le contrôle manuel de capture depuis le companion, puis la robustesse réseau.
