# LG : contrôle de capture et reprise réseau

**État actuel :** le [companion avec frise](lg-timeline.md) et le [moteur sur VPS privé](vps-deployment.md) sont désormais livrés et confirmés sur la TV. Ce document conserve les détails de son étape d’implémentation.

Livré le 30 septembre 2026 sur la LG déjà rootée. Complète le [premier branchement TV → Mac](lg-remote-runtime.md) ; ce document remplace ses limites historiques concernant la capture uniquement en CLI et l’absence de retry.

## Utilisation

Rakuten ouvre le companion. **Démarrer l’analyse** lance image + son en arrière-plan ; le premier passage arrive après environ 8–10 secondes. Le bouton devient **Arrêter la capture**. Pendant l’arrêt, il garde le focus de la télécommande et ignore les doubles appuis. Les passages déjà reçus peuvent finir d’être analysés ; les questions et le contexte restent disponibles. Redémarrer la capture réutilise la même session si l’hôte n’a pas redémarré.

Le panneau indique séparément l’état de la capture, le nombre de passages envoyés, le contenu capturé et le contenu analysé. Une coupure est affichée avec les abandons éventuels. Fermer le panneau ne stoppe pas la capture : utiliser le bouton Arrêter. Une exécution est bornée à **30 minutes**, puis il faut la relancer manuellement. Aucun enregistrement ne démarre automatiquement au boot.

La fermeture historique du panneau après 170 secondes a été supprimée. Le panneau reste ouvert tant que son contrôleur fonctionne et que le contexte YouTube reste compatible. Une publicité ou un changement de contexte peut toujours provoquer sa fermeture de protection ; ce n’est pas un arrêt de capture. Ce comportement n’est pas encore une transition publicitaire transparente.

## Ports et responsabilités

- `tv/controller.py` : adaptateur de contrôle local, lié exclusivement à `127.0.0.1:8788` sur la TV. Trois routes authentifiées : `GET /capture`, `POST /capture/start`, `POST /capture/stop`. Aucun argument de commande, chemin, PID ni URL n’est accepté par ces routes.
- `tv/capture.py` : worker natif, images/audio et file bornée. Verrou système empêchant deux captures simultanées ; séquences et horodatages de session préservés.
- `tv/transport.py` : politique d’envoi indépendante de la capture LG. Utilise uniquement l’endpoint configuré, vérifie l’identité de session, réessaie et borne l’âge des médias.
- `tv/app/capture-control.js` : vue du port de contrôle local, indépendante du client du serveur d’inférence. Arrêter reste possible quand le Mac/VPS est inaccessible. L’URL du contrôleur est `http://127.0.0.1:8788` par défaut ; `controlUrl` sert aux tests hors TV.
- `GET /v1/session` : identité minimale de session distante, sans charger la transcription ou toute la conversation à chaque envoi.

Le domaine de l’app et les adaptateurs Codex/transcription n’ont pas changé. Les commandes ne passent pas par un shell distant depuis l’interface. Le transport TV → Mac reste HTTP sur LAN pour ce POC ; HTTPS sur le VPS reste à livrer.

## Coupures, doublons et changement de session

La file contient au maximum trois tranches en attente, plus l’envoi courant. Un passage n’est plus réessayé après 30 secondes d’âge ; la durée d’une requête est plafonnée à 5 secondes et réduite au temps restant. Les passages expirés ou évincés sont comptés. Les tentatives restent espacées, sans bloquer la capture.

Le serveur déduplique une séquence identique. Si la réponse d’un premier envoi est perdue, le renvoi ne crée pas un second passage. Un même numéro avec un autre contenu est refusé. Les trous apparaissent à la réception du passage suivant et l’absence de contenu récent reste visible entre-temps.

Si l’identité de session change, ou si le serveur suspend explicitement cette session, le worker s’arrête : les anciens médias ne sont jamais automatiquement associés à la nouvelle session. Le panneau explique qu’un démarrage manuel est requis ; son historique affiché et son ancrage sont réinitialisés lors du changement de session. Un redémarrage du serveur ne restaure pas encore le fil vivant depuis ses archives.

Un serveur inaccessible au démarrage produit un arrêt explicite ; il n’y a pas d’attente indéfinie avant la première session. La reconnexion automatique couvre les coupures **après** établissement de la session.

## Processus et protection de l’écran

Le contrôleur lance seulement le worker connu avec des arguments fixes. Arrêter lui envoie SIGTERM ; sa propre capture audio est fermée, les médias temporaires sont supprimés et les envois en attente abandonnés. Après 12 secondes sans arrêt, le contrôleur termine le groupe de processus qu’il a créé. Il ne touche pas aux processus de lecture de YouTube.

Le worker lancé par le contrôleur surveille également son parent et s’arrête si celui-ci disparaît. Le rapport est atomiquement sauvegardé dans `/tmp/tvlens-capture-report.json`, indépendamment d’une connexion SSH ouverte. Les erreurs de démarrage et une capture concurrente sont signalées, au lieu d’afficher un arrêt normal.

La sidebar utilise désormais un heartbeat privé renouvelé par son contrôleur de géométrie. Son watchdog restaure l’écran après environ 20 secondes sans renouvellement. Une génération distincte empêche un ancien watchdog de restaurer un panneau plus récent. Cela protège contre l’arrêt du contrôleur ; une interface graphique figée alors que son contrôleur continue de battre n’est pas encore détectée.

## Installation effectuée

Sources sous `/media/developer/tvlens-companion/` : `controller.py`, `capture.py`, `transport.py`. Configuration privée root `0600` : `connection.json`, avec `url` et `token`. L’interface utilise sa copie `connection.js`, propriétaire `wam`, permissions `0600`. Aucun secret n’est ajouté au dépôt.

Le hook isolé `/var/lib/webosbrew/init.d/35-tvlens-capture-control` démarre seulement le contrôleur au boot. Les hooks SSH, VPN et Rakuten existants sont conservés. Le service a été redémarré et vérifié capture inactive ; aucun reboot complet de la TV n’a été imposé.

Pour mettre à jour le code, arrêter d’abord la capture, copier les trois fichiers puis redémarrer uniquement le processus identifié comme `controller.py`. Ne pas utiliser un `pkill python` global. Pour désinstaller, retirer ce hook, arrêter le contrôleur identifié puis retirer son dossier après sauvegarde de la configuration. Le panneau mis à jour reste dans l’app existante ; son package système peut encore afficher la version du prototype.

## Validation et échecs conservés

- **TV réelle** : démarrage idempotent (deux commandes, une seule capture), trois passages reçus puis arrêt confirmé sous deux secondes lors du premier contrôle. Arrêt/reprise depuis la télécommande confirmé ensuite par l’utilisateur, même identifiant de session.
- **Coupure réelle du seul flux TVLens** via proxy dédié : perte volontaire d’un accusé de réception, puis 12 secondes de refus temporaires. Cinq passages/20 images finalement reçus ; 12 retries, zéro passage abandonné. Le proxy a compté six envois réussis, dont un doublon reconnu. YouTube, le VPN et le pare-feu n’ont pas été modifiés. Proxy arrêté et configuration temporaire supprimée.
- **Incident du premier clic utilisateur** : le test réseau occupait encore la capture ; le verrou a refusé la seconde exécution. L’UI affichait à tort un arrêt normal. Le conflit et les sorties anormales sont maintenant explicités ; la validation a été répétée hors concurrence.
- **Incident lors de la reprise** : le backend recevait de nouveaux passages, mais le panneau se fermait à cause de l’ancien minuteur de 170 secondes. Minuteur remplacé par heartbeat ; nouveau parcours confirmé par l’utilisateur. Une stabilité de plusieurs heures reste à mesurer.
- **Régressions** : 100 tests Node ; quatre tests Python pour authentification, double démarrage, conflit de capture, arrêt, retry, expiration et session remplacée ; six tests du contrôleur de sidebar, dont génération et heartbeat ; test navigateur des boutons avec serveur de calcul indisponible et conservation du focus.
- L’expiration du tampon et le changement de session sont couverts par tests avec serveur HTTP de test ; la coupure de 12 secondes et le doublon ont été éprouvés avec les médias réels de la TV. Ne pas assimiler ces preuves à une validation de toutes les pannes prolongées, d’un reboot TV ou du VPS.

Commandes :

```sh
npm test
python3 -m unittest discover -s tests -p 'test_tv_*.py' -v
python3 prototypes/lg-remote/test_panel.py
node scripts/smoke-lg-ui.mjs
```

`node scripts/probe-lg-network.cjs` ouvre un proxy de faute temporaire sur le port 8789, authentifié, puis se ferme après 90 secondes. Il doit recevoir une capture bornée utilisant une configuration privée séparée ; ne pas modifier la configuration habituelle pour ce test. Ses résultats et ceux de la capture sont conservés sous `~/Documents/TVLens-private/server/network-*-report.json`. Les médias et secrets restent hors dépôt.

## Correction du focus après une question

Le focus restait dans le champ après une soumission au clavier. Le gestionnaire de navigation ignorait alors les flèches et Retour tant que ce champ était actif, même lorsque le clavier LG avait disparu. L’interface continuait à recevoir ses données mais semblait bloquée.

La soumission libère désormais le champ et place immédiatement le focus sur **Dicter**, avant la réponse HTTP. Les mises à jour de la réponse ne déplacent pas ensuite ce focus. **Retour** depuis les boutons ferme le panneau ; depuis le champ, il quitte d’abord l’édition et sélectionne **Dicter**. Les flèches haut/bas permettent aussi de quitter le champ lorsque le clavier LG est masqué. L’événement de masquage seul ne provoque pas de blur, car LG masque également son clavier pendant la dictée.

Régression reproduite dans Chrome avant correction, puis validée avec requête maintenue en attente, Retour, masquage du clavier et navigation. Sur la TV réelle, une question envoyée par le formulaire a immédiatement rendu le focus à `dictate`, sans erreur HTTP ; le focus y restait après réception de l’accusé de traitement. Le test physique de Retour est demandé séparément à l’utilisateur. Les 100 tests Node restent verts.


## Navigation par zones du companion

Les boutons **Dicter / Envoyer** sont suivis de **Démarrer / Arrêter la capture**, dans une zone fixe sous la conversation. Haut/Bas permettent de rejoindre la capture et de revenir à la rangée des actions ; Gauche/Droite changent de bouton sur cette rangée. Le bouton Fermer a été retiré.

Depuis les actions, Haut sélectionne le chat. **OK** active alors son mode lecture ; Haut/Bas font défiler les messages. Le rafraîchissement des réponses ne fait pas sauter la position pendant cette lecture. **Retour** quitte la lecture et rend le focus à Dicter, sans fermer le panneau. Un autre Retour ferme le panneau. Depuis le champ de saisie, Retour quitte d’abord l’édition.

Régressions navigateur : position et visibilité du contrôle de capture, accès depuis les deux boutons de la rangée, absence de défilement avant OK, défilement après OK, stabilité au polling, Retour vers les actions puis fermeture. Déployé sur la TV pour la prochaine ouverture du panneau ; ce nouvel agencement n’a pas nécessité de changement de la lecture YouTube.

## Correctif du démarrage de capture — 2 octobre 2026

Le contrôleur répondait aux lectures d’état mais renvoyait HTTP 500 sur
`/capture/start`, tandis que le VPS était accessible. Le lancement du processus
utilise désormais `/usr/bin/python3` lorsque `sys.executable` est vide, comme le
contrôleur Rakuten ; le hook de démarrage utilise aussi le chemin absolu.

Validation : six tests de contrôle/transport passent, dont la régression avec
un interpréteur vide. Après déploiement et redémarrage du contrôleur seul, un
appel réel à la route de démarrage a produit un passage envoyé au VPS en environ
12 secondes, sans erreur ni abandon. La lecture YouTube n’a pas été commandée.
Le clic physique et un redémarrage complet de la TV restent à revalider.


## Publication progressive des paroles — 4 octobre 2026

Le port de perception Codex propose désormais `transcribe` et `observeVisual`.
Une seule transcription et une seule analyse visuelle de fond peuvent fonctionner
en parallèle, avec deux passages maximum en attente dans chaque file. La vision
reçoit les paroles du même passage ; l’audio suivant peut être traité pendant cette
vision. Les adaptateurs n’exposant que `observe` conservent le chemin séquentiel.

Les paroles deviennent immédiatement consultables dans le chat et le détail de
la frise. Le passage garde son identifiant et ses timestamps, passe en `partial`,
puis est enrichi par la vision. `ready` indique les deux étapes terminées. Un échec
ou un abandon de vision ne supprime pas une transcription déjà obtenue. Les champs
`audioStatus`, `visionStatus`, `audioMs`, `visionMs` et `transcriptPublishedMs`
permettent de distinguer les étapes ; `contextThroughMs` ne doit pas être confondu
avec `analyzedThroughMs`. Ces bornes ne garantissent pas une couverture sans trous.

Une question bloque les nouveaux départs de vision de fond, mais laisse la
transcription avancer. Son contexte reste figé à la question et conserve les
limites alors observées. La fermeture annule les traitements et empêche leurs
publications tardives. La rétention des médias reste de cinq minutes. Le résumé
vivant et Auto ne synthétisent encore que les passages `ready` ; le résumé vivant
signale désormais les analyses partielles écartées.

Validation : 124 tests locaux, revue Astra indépendante après trois corrections,
36 tests ciblés sur VPS, smokes navigateur panneau/frise, puis capture réelle
YouTube → TV → VPS et question sur un passage partiel. La réponse cite le passage
et annonce que la vision attend encore. Arrêt/reprise : même session, passages et
conversation conservés, nouvelle capture reçue. Aucun reboot ni nouvelle validation
physique de la télécommande. Voir le [rapport live](split-perception-live.json),
qui conserve les abandons et les limites de comparaison. Whisper reste inchangé :
sa moyenne observée de 11,315 s pour des blocs d’environ 8 s reste un goulot.

### Langue de transcription dans la sidebar

Sous le contrôle de capture, le bouton **Audio · Français** change la langue avec OK : Français → Anglais → Détection automatique. Haut revient au contrôle de capture ; Retour ferme le panneau comme auparavant. Le réglage est enregistré sur le serveur personnel (`transcription.json`) et conservé après redémarrage. Le serveur utilise le français par défaut ; le comportement du Mac reste inchangé.

Le réglage concerne les prochaines transcriptions, y compris les réexamens. Un appel Whisper déjà commencé termine dans sa langue initiale ; les textes déjà obtenus et les réexamens en cache ne sont pas automatiquement recalculés. Le cache de transcription distingue audio et langue. La détection automatique reste utile pour les programmes multilingues mais ajoute du travail. Un mauvais choix de langue peut dégrader les paroles reconnues.

La TV utilise la route authentifiée `POST /v1/settings/transcription` avec `{ "language": "fr" }` (`en` et `auto` également acceptés). La langue effective est exposée dans `GET /v1/state`, indépendamment de la présence d’une session. La composition serveur transmet ce réglage à l’adaptateur Whisper partagé par la perception et le réexamen ; le domaine de visionnage reste indépendant de Whisper.

La mesure `audioMs / (endMs - startMs)` est le facteur de traitement du passage, hors capture et attente dans la file. Un facteur inférieur à 1 signifie que la transcription finit plus vite que la durée audio ; il ne signifie pas que la réponse arrive avant la fin de capture du bloc. Aucun changement de modèle, nombre de threads ou décodage n’accompagne ce réglage.

Validation réelle du 4 octobre : 9 passages YouTube d’environ 8 secondes, tous transcrits et analysés, aucun passage perdu par la capture. Transcription moyenne 5,182 s (4,833–5,682 s), facteur moyen 0,644, maximum 0,708. Voir [mesures détaillées](transcription-language-live.json). Test court sans question simultanée ; pas de comparaison auto/fr sur les mêmes extraits ni de notation mot à mot. Les 127 tests Node et les deux smoke tests UI passent ; le changement via l’API authentifiée et le rendu sur la TV sont vérifiés. Navigation physique à la télécommande à confirmer par l’utilisateur. Capture de test arrêtée, contexte conservé.
