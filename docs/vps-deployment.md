# TVLens sur le VPS privé Tailscale

> Les adresses 100.64.0.10 (serveur) et 100.64.0.20 (TV) sont des exemples anonymisés. Utiliser les adresses réelles de son propre tailnet.
> Relevé de déploiement, pas une garantie que le VPS suit automatiquement GitHub. Les sources sont partagées avec le Mac ; configuration privée, binaires Whisper/Codex et modèles sont installés séparément.

## Installation

Hôte Ubuntu 24.04 x86_64, Node 24.13.0, 8 Go de RAM. Application clonée par HTTPS avec le compte GitHub déjà configuré : `/opt/tvlens/app`, base `7015a64`. L’ancien clone `/root/tvlens` et les autres services ne sont pas modifiés.

- Dépendances serveur : `npm ci --omit=dev` (pas d’Electron).
- Codex 0.158.0 dans `/opt/tvlens/codex`, indépendant du CLI global ancien.
- Utilisateur système `tvlens`, home `/var/lib/tvlens`.
- Authentification Codex existante du VPS copiée vers le home privé de ce service ; aucun secret imprimé ni commité. Si elle expire ou si le compte change, reconnecter ce home explicitement.
- Whisper.cpp v1.8.3 compilé CPU dans `/opt/tvlens/whisper`, modèle multilingue base dans `/opt/tvlens/models/ggml-base.bin`, SHA-256 vérifié : `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`.
- FFmpeg existant : `/usr/bin/ffmpeg`.
- Configuration privée : `/etc/tvlens/server.env` (root:tvlens, 0640).
- Données privées : `/var/lib/tvlens/data`, dont `device-token`.
- Clé OpenRouter reprise de la configuration locale uniquement pour les embeddings ; images/chat/réexamen utilisent Codex, audio transcrit sur le VPS.

Le script de sonde accepte désormais `TVLENS_CONFIG`, `TVLENS_CODEX_BINARY` et `TVLENS_PROBE_VIDEO`, afin de tester le même runtime sur Linux et macOS.

## Service et réseau

Pour une nouvelle installation portable, suivre [le guide serveur](server-installation.md). Les chemins et mesures ci-dessous décrivent le déploiement de référence.

Le modèle [deploy/tvlens.service](../deploy/tvlens.service) lit désormais une adresse locale dans /etc/tvlens/runtime.env et utilise loopback par défaut. Lors du premier essai, l’unité était installée sous `/etc/systemd/system/tvlens.service`.

Le déploiement testé écoute **exclusivement sur son adresse Tailscale:8787**, jamais 0.0.0.0. Aucun proxy public ou Tailscale Funnel ajouté. HTTP circule à l’intérieur du tunnel chiffré Tailscale ; ce déploiement n’ajoute pas de terminaison TLS distincte. Les routes applicatives exigent le jeton d’appairage. Les règles du tailnet restent celles du compte du propriétaire.

Démarrage automatique, relance sur erreur, arrêt du groupe de processus. Utilisateur non privilégié, filesystem système en lecture seule, home des autres utilisateurs masqué et fichiers temporaires privés. Écriture permise dans `/var/lib/tvlens`. Limites : deux CPU équivalents, mémoire haute 1500 Mio, maximum 2 Gio, 128 tâches. Le service réessaie si l’IP Tailscale n’est pas encore disponible au démarrage.

```sh
systemctl status tvlens
journalctl -u tvlens --since '10 minutes ago'
systemctl restart tvlens
ss -ltn 'sport = :8787'
```

Un redémarrage termine la session active ; il n’en restaure pas la mémoire en cours. Les archives textuelles restent privées. La rétention média et la durée des miniatures suivent les mêmes règles que sur le Mac.

## Validation

- 112 tests Node réussis sur le VPS sous l’utilisateur du service.
- Unité validée par `systemd-analyze verify`.
- Socket observé uniquement sur l’IP Tailscale ; HTTP sans jeton : 401.
- Depuis le Mac, connexion au port 8787 de l’IP publique impossible (timeout). L’observation du socket complète ce test extérieur.
- Essai fournisseur réel sur Kennedy : cinq contrôles passent (Whisper, Luna, miniature authentifiée, FIFO et même fil, pause/reprise, réexamen). [Rapport](vps-live-report.json). Le fichier utilise un extrait de la vidéo publique, pas le programme privé regardé sur la TV.
- Capture réelle TV → VPS : 24 secondes, 12 images, 3 segments reçus, aucun abandon/erreur/retry. Les trois segments ont été analysés sous le service systemd ; question sur le dernier passage terminée avec succès.
- Temps d’analyse observés sur les trois blocs de 8 s : 19,559 s, 21,778 s, 15,447 s. L’analyse continue peut accumuler du retard ; le test réseau n’est pas une validation de débit IA soutenu. Une optimisation CPU/Whisper et un essai long restent à prévoir.
- Embeddings OpenRouter : vecteur réel de 1536 dimensions ; coût retourné 0,00000016 USD pour la requête de test. Aucun plafond local ajouté. Le journal de coût de ce VPS est distinct des dépenses historiques du Mac.
- Configuration du compteur d’usage : `/etc/tvlens/.local` pointe vers `/var/lib/tvlens/usage`, afin de garder les écritures dans les données autorisées par systemd.
- Vérification physique du panneau après réouverture : utilisateur confirmé (« tout est good »). Aucun redémarrage complet du VPS ou de la TV réalisé.

## Bascule de la TV et retour au Mac

La configuration de capture root et le fichier `connection.js` du panneau utilisent `http://100.64.0.10:8787` avec le nouveau jeton privé du VPS. Le contrôleur local a été relancé sans capture active. Le panneau doit être fermé puis rouvert pour charger l’appairage ; YouTube n’a pas été fermé.

Sauvegardes de l’ancien appairage Mac sur la TV : `/media/developer/tvlens-backups/vps-migration/connection.json` et `connection.js`. Leur restauration doit se faire capture arrêtée, en conservant les propriétaires (root pour le contrôleur, UID wam pour l’interface), puis en relançant le contrôleur et en rouvrant le panneau. Ne pas afficher ces fichiers : ils contiennent les jetons.

Incident de déploiement conservé : `chown wam:wam` a échoué car ce groupe n’existe pas sur cette TV. Les UID/GID originaux ont été repris depuis la sauvegarde ; le fichier conserve les droits 0600. Une session Mac en mémoire n’est pas transférée au VPS ; les archives Mac restent sur le Mac.

Les autres applications du VPS n’ont pas été redéployées. La limite mémoire protège la machine mais ne constitue pas une garantie de latence : Whisper partage le CPU avec les services existants.

## Persistance vérifiée

TVLens et tailscaled sont tous deux activés au démarrage et actifs. Le lien systemd vers multi-user.target est présent. TVLens démarre après tailscaled et réessaie toutes les cinq secondes sur erreur, sans plafond de tentatives, notamment si l’adresse Tailscale tarde à apparaître. Cette vérification n’a pas interrompu la session ; aucun reboot réel du VPS n’a été effectué. La reprise automatique du service ne restaure pas la session de visionnage en mémoire : redémarrer manuellement la capture depuis la TV après un reboot.

## Modèles du serveur — 4 octobre 2026

Le réglage privé `models.json` dans le dossier des données fixe désormais
`codexModel`, `observationModel` et `inspectionModel` à `gpt-6-luna`.
Le chat utilise l’effort `max`, confirmé comme disponible dans le catalogue du
compte serveur. Le drop-in systemd `chat-reasoning.conf` définit
`TVLENS_CHAT_REASONING_EFFORT=max`. Cette variable est lue par le point d’entrée
serveur et transmise uniquement au client conversationnel ; vision et réexamen
conservent `low`. Sans variable, le comportement reste `low`, notamment sur Mac.
La limite de 60 secondes par question reste inchangée.

Treize tests ciblés passent localement et sur le VPS, dont la vérification du
champ `effort` transmis à `turn/start` et du défaut indépendant de perception.

Un appel fournisseur réel sous l’utilisateur du service a confirmé l’acceptation
de `model=gpt-6-luna`, `effort=max` et une sortie structurée valide. Deux essais de
salutation sans aucun passage vidéo ont toutefois été remplacés par le garde-fou
de citations (« Je n’ai pas pu relier cette réponse… »). Ils ne constituent pas
une validation du chat conversationnel sans contexte ; ce comportement distinct
n’a pas été modifié dans ce réglage de modèles.


## Pipeline déployé — 4 octobre 2026

L’audio et la vision ont des files distinctes ; les transcriptions deviennent interrogeables avant la fin de la description d’images. Le serveur utilise Luna pour chat, vision et réexamen ; seul le chat est configuré avec effort `max`. Whisper reste le moteur local CPU, en blocs, sans streaming.

Le français est maintenant le défaut serveur, configurable depuis la sidebar TV (Français, Anglais, Auto). Les réglages modèles/langue sont privés, hors Git. Le Mac autonome partage l’implémentation mais conserve son hôte de transcription et ses réglages.

- [Séparation audio/vision](split-perception-live.json) : essai réel, réponses partielles et pause/reprise ; pertes par surcharge encore possibles.
- [Français sur neuf blocs](transcription-language-live.json) : moyenne 5,182 s de transcription pour environ 8 s de son ; neuf analyses complètes, aucune perte de capture. Hors délai de vision ; test court sans question simultanée.
- [Streaming expérimental](audio-stream-probe-20261004.json) : 24 s audio, backend temporaire supprimé, aucun changement de production. Premier texte plus tôt mais stabilisation lente et CPU accru ; stratégie non retenue.

Lors de l’audit avant publication, 52 des 54 fichiers `core/runtime/adapters/server` correspondent au dossier de travail. Le VPS part de `7015a64` avec correctifs déployés hors commit ; `adapters/config.cjs` et `adapters/clip-inspector.cjs` conservent une ancienne résolution de chemins. Les chemins explicites du déploiement restent fonctionnels. La publication Git ne redéploie pas le VPS : une mise à jour ultérieure vers une révision unique reste nécessaire, capture arrêtée et configuration privée préservée.

## Réglage Whisper et diagnostics — 4 octobre, seconde passe

Le VPS utilise maintenant deux threads Whisper (détection des deux CPU disponibles), modèle base et décodage inchangés. Le [benchmark apparié](whisper-threads-benchmark.json) mesure 4,83 s contre 5,55 s avec quatre threads sur deux clips réels, deux répétitions, textes identiques. Les premières pointes de 18 et 43 s n’ont pas été reproduites.

Après redémarrage annoncé du service, [98 secondes de capture réelle](whisper-threads-live.json) : 11 passages reçus, 10 transcriptions terminées, 9 observations complètes, aucune perte de capture ni passage sauté au dernier relevé. Transcription moyenne 6,539 s ; maximum 10,318 s. Le test est court, le travail continue : absence de pertes sur cet intervalle ne garantit pas une session entière.

`metrics.whisper` permet désormais de distinguer chargement, encodage, décodage et compteurs de fallback, sans archiver stderr brut. Le pic de 10,318 s comporte 7,580 s d’encodage et aucun fallback. D’autres appels ont déclenché des fallbacks ; ces événements sont conservés dans le rapport. Le goulot n’a donc pas une cause unique démontrée. Le délai maximum existant et la politique de file restent inchangés ; aucun rattrapage automatique n’est revendiqué.

131 tests Node passent, dont 15 ciblés également exécutés sur le VPS ; intégration Electron réussie. Ces changements sont versionnés dans la passe suivante après `a120625`. La configuration portable de `adapters/config.cjs` est désormais déployée ; `clip-inspector.cjs` conserve encore son ancien défaut de chemin, neutralisé par la configuration explicite de FFmpeg.

### Contexte des analyses et cartes par sujet — 4 octobre 2026

Déploiement chirurgical du cœur partagé : contexte historique borné avant chaque
analyse visuelle, continuité explicite du sujet, regroupement sans durée maximale.
Whisper, capture, réseau et interface TV inchangés. Sauvegarde distante des fichiers
remplacés sous `/opt/tvlens/backups/context-topic-1791141208/before.tar`.
Le redémarrage du service a remplacé la session active ; capture relancée sans
interrompre YouTube. Revue indépendante favorable, 21 tests ciblés passent sur le
VPS. Résultats et échecs du test réel : [rapport](topic-context-live.json) et
[contrat de la frise](lg-timeline.md). Code, tests et rapports sont versionnés avec cette passe.

### Résumé cumulatif des cartes — 4 octobre 2026

Déployé sur le VPS et dans `tv/app/timeline-view.js` sur la TV. L'agrégat appartient
au domaine et reste séparé des observations de passage. Le premier essai réel a
révélé une fuite de contexte avant lacune ; l'adaptateur est maintenant isolé par
sujet contigu et renouvelle son thread aux frontières. Sauvegarde serveur de la
seconde passe : `/opt/tvlens/backups/cumulative-summary-1791142494/before.tar`.

150 tests locaux, 32 ciblés sur le VPS ; deux essais réels et leurs limites dans
[le rapport](cumulative-summary-live.json). Le dernier essai comprend pause/reprise
de capture sans arrêter YouTube. La capture est laissée active. Code, tests et rapports sont versionnés avec cette passe ; configuration privée
d'appairage inchangée.
