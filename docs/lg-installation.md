# Installer le companion LG

Ce guide relie les composants du dépôt. Il concerne une TV **déjà rootée**, avec SSH, Python 3, `arecord` et les services webOS nécessaires. Le modèle validé est la LG 75QNED87T sous webOS 25. YouTube est la source testée ; Netflix/DRM, autres modèles et autres firmwares ne sont pas validés. Ce dépôt ne fournit ni root universel ni installation en un clic.

## 1. Installer le moteur sur Mac ou Linux

- **Mac** : suivre [l’installation Mac](installation.md), puis lancer `npm run start:server` dans le dépôt pour le compagnon TV. Ce processus sans interface Electron est distinct de l’app Mac autonome.
- **VPS Linux** : suivre [le guide serveur](server-installation.md) : Node, FFmpeg, Whisper base, Codex authentifié sous l’utilisateur du service, stockage privé et démarrage systemd.

Choisir `TVLENS_BIND` sur une adresse réellement accessible depuis la TV. `127.0.0.1` ne permet que les tests sur l’hôte. Pour un VPS, utiliser son interface Tailscale, sans ouvrir le service publiquement. [Tailscale LG](lg-tailscale.md) décrit le déploiement de référence ; les binaires et l’appairage Tailscale doivent être préparés séparément pour la machine concernée.

Démarrer l’hôte ; son jeton est créé dans `$TVLENS_SERVER_DATA/device-token`. Vérifier le refus HTTP 401 sans authentification avant d’appairer la TV. Le compte Codex est celui de l’hôte ; aucun identifiant Codex ne doit être installé dans le JavaScript TV.

## 2. Installer les composants TV

| Sources du dépôt | Destination de référence sur la LG |
| --- | --- |
| `tv/app/` | App enregistrée `org.tvlens.sidebarprobe` |
| `tv/controller.py`, `tv/capture.py`, `tv/transport.py` | `/media/developer/tvlens-companion/` |
| `prototypes/lg-remote/control.py`, `runtime/`, `vendor/`, `rakuten.json` | `/media/developer/tvlens-remote/` avec la même arborescence |
| `prototypes/lg-remote/30-tvlens-remote` | `/var/lib/webosbrew/init.d/30-tvlens-remote` |
| `tv/35-tvlens-capture-control` | `/var/lib/webosbrew/init.d/35-tvlens-capture-control` |

Construire le package sans fichiers privés :

```sh
python3 prototypes/lg-sidebar/package.py --app-dir tv/app --output-dir tv/dist
```

L’enregistrement/installation de ce package requiert la méthode d’installation compatible avec la TV rootée. Le dépôt n’automatise pas cette étape pour un autre appareil. L’app est de type overlay ; ne pas promettre que l’installation Developer Mode standard suffira sur tous les modèles.

Sur une installation existante, sauvegarder les fichiers remplacés, conserver les configurations privées et leurs propriétaires. Fermer le panneau avant de remplacer ses assets, puis le rouvrir. Une mise à jour du contrôleur nécessite d’arrêter la capture ; ne pas remplacer les hooks SSH, VPN ou Tailscale à cette occasion.

## 3. Appairer les deux composants

Créer **hors Git**, avec les valeurs propres à l’hôte :

- `/media/developer/tvlens-companion/connection.json` : `{"url":"http://HOTE_PRIVE:8787","token":"JETON_DU_SERVEUR"}`. Propriétaire du contrôleur (root sur la référence), permissions `0600`.
- `connection.js` dans le répertoire de l’app installée : `window.TVLENS_REMOTE = {url: "http://HOTE_PRIVE:8787", token: "JETON_DU_SERVEUR"};`. Permissions `0600`, lisible par le propriétaire du processus web de l’app (`wam` sur la TV testée). Reprendre l’UID/GID constaté ; ne pas supposer qu’un groupe `wam` existe.

Un `connection.js` illisible produit « Appairage requis ». Ne jamais ajouter ces fichiers au package public ni à un commit. Pour changer d’hôte, modifier les deux fichiers ; les sessions ne migrent pas entre Mac et VPS.

## 4. Panneau, télécommande et contrôleur

Le contrôleur local écoute sur `127.0.0.1:8788`, avec authentification. Son hook démarre le contrôleur, **pas l’enregistrement**. Le hook Rakuten démarre le mapper ; la capture ne démarre qu’avec le bouton de la sidebar.

[Le module télécommande](../prototypes/lg-remote/README.md) décrit sa provenance, l’activation, la désactivation et les limites. Sur un autre modèle, vérifier le périphérique d’entrée et le code Rakuten avant activation. Le panneau gère réduction et restauration de la vidéo : ne pas lancer l’app seule en contournant ce contrôleur pour une session normale.

L’autostart est configuré et les relances ciblées ont été testées sur la référence ; un reboot complet TV/VPS n’a pas été validé par ces essais. Après redémarrage du serveur, la session mémoire est perdue et il faut redémarrer manuellement la capture.

## 5. Vérifier le parcours

1. Lancer YouTube, ouvrir TVLens avec Rakuten : vidéo à gauche, chat à droite, son maintenu.
2. Choisir **Démarrer l’analyse** ; vérifier que « Capturé » puis « Analysé » avancent. Les lacunes et attentes restent visibles.
3. Sous la capture, **Audio** : OK fait défiler Français → Anglais → Auto. Français est le défaut serveur ; le choix est sauvegardé et concerne les prochaines transcriptions.
4. **Dicter**, puis micro du clavier LG, **Envoyer**. Le bouton micro physique direct reste celui de LG.
5. Demander une explication, puis une source : vérifier progression, réponse et passages cités. Plusieurs questions sont mises en file, annulation ciblée possible.
6. **Mémoire** ouvre la frise ; OK ouvre le détail. Retour revient au niveau précédent. Dans le chat, OK active le défilement, Retour en sort puis ferme le panneau.
7. Arrêter puis reprendre la capture : même contexte tant que le serveur reste vivant. Fermer le panneau seul laisse la capture active.

La capture est bornée à 30 minutes par lancement. Les publicités et changements de géométrie peuvent provoquer fermeture/restauration du panneau. Frise sans relecture vidéo ; Auto, marque-pages durables et recherche dédiée restent dans l’interface Mac. Voir [capture](lg-capture-control.md), [frise](lg-timeline.md), [validation](validation.md) et [dépannage serveur](vps-deployment.md).
