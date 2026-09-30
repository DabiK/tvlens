# TVLens sur le VPS privé Tailscale

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

Unité de référence : [deploy/tvlens.service](../deploy/tvlens.service), installée sous `/etc/systemd/system/tvlens.service`.

Écoute **exclusivement sur 100.64.0.10:8787**, jamais 0.0.0.0. Aucun proxy public ou Tailscale Funnel ajouté. HTTP circule à l’intérieur du tunnel chiffré Tailscale ; ce déploiement n’ajoute pas de terminaison TLS distincte. Les routes applicatives exigent le jeton d’appairage. Les règles du tailnet restent celles du compte du propriétaire.

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
