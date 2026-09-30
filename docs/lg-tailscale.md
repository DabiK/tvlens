# Tailscale sur la LG — installation et coexistence réseau

> Les adresses 100.64.0.10 (serveur) et 100.64.0.20 (TV) sont des exemples anonymisés. Utiliser les adresses réelles de son propre tailnet.
## État du 30 septembre 2026

Binaire officiel Tailscale **1.102.4 ARM64** installé dans un répertoire isolé, sans modification des bibliothèques webOS. Après validation de la coexistence, un hook de démarrage indépendant a été ajouté. Archive récupérée sur `https://pkgs.tailscale.com/stable/tailscale_1.102.4_arm64.tgz`, SHA-256 comparé au fichier publié par le même serveur HTTPS : `9dd1e6a592a014bbaea0103167ffe299adeda4ba14e078ce9c2895364f6c4c3f`. Les empreintes des deux exécutables transférés correspondent aux copies locales. Ce contrôle vérifie l’intégrité, pas une signature indépendante.

TV : ARM64, noyau Linux 5.4.268, périphérique TUN présent. TV authentifiée et connectée : **100.64.0.20**, nom **lg-tvlens**. VPS joignable : **100.64.0.10**. Coexistence réseau validée avec CyberGhost Japon. CyberGhost était déconnecté au début de l’installation et a été remis dans cet état après les essais.

## Séparation des routes

- Accès aux adresses des pairs Tailscale : interface `tailscale0`, table dédiée 52.
- Internet public : routes existantes de la box ou de CyberGhost.
- Réseau local : route Ethernet existante.
- Aucun exit node ; aucune route de sous-réseau acceptée ou annoncée.
- DNS Tailscale désactivé : conservation du résolveur webOS, ou du DNS temporaire géré par le hook CyberGhost.
- `netfilter-mode=off` : Tailscale ne gère pas iptables sur ce noyau webOS. Ne pas interpréter cela comme une isolation de tous les services de la TV : limiter les accès dans la politique du tailnet avant un usage partagé.
- Pas de routage de sous-réseau, de partage de sortie Internet, de Tailscale SSH ni de serveur proxy activé.

Les paquets chiffrés transportant Tailscale peuvent eux-mêmes emprunter CyberGhost lorsque celui-ci fournit la route Internet. Ce n’est pas une promesse de contournement du VPN sous-jacent.

## Emplacements privés

TV : `/media/developer/tvlens-tailscale/bin/` et `state/`. État, socket, journal et PID dans `state/`, permissions privées. Aucun secret ni lien de connexion ne doit être commité.

Mac : `~/Documents/TVLens-private/tailscale/`, archive officielle, manifest et relevé réseau initial. Aucun fichier VPN existant n’a été modifié.

Le daemon utilise `GOMEMLIMIT=64MiB` (cible souple du ramasse-miettes Go, pas une limite mémoire stricte), un état persistant privé et `--no-logs-no-support` pour désactiver l’envoi des journaux de diagnostic.

## Commandes

État :

```sh
ssh tv-lg '/media/developer/tvlens-tailscale/bin/tailscale --socket=/media/developer/tvlens-tailscale/state/tailscaled.sock status'
```

Désactivation réseau Tailscale sans effacer l’appairage :

```sh
ssh tv-lg '/media/developer/tvlens-tailscale/bin/tailscale --socket=/media/developer/tvlens-tailscale/state/tailscaled.sock down'
```

Activation manuelle lorsque le daemon est lancé :

```sh
ssh tv-lg '/media/developer/tvlens-tailscale/bin/tailscale --socket=/media/developer/tvlens-tailscale/state/tailscaled.sock up --accept-dns=false --accept-routes=false --netfilter-mode=off --hostname=lg-tvlens --timeout=15s'
```

Le premier rattachement nécessite d’ouvrir le lien retourné dans le navigateur du propriétaire. Le hook privé `/var/lib/webosbrew/init.d/25-tvlens-tailscale` appelle `/media/developer/tvlens-tailscale/service start`. Il ne démarre pas CyberGhost. Le service est issu de `tv/tailscale-service.sh` et vérifie le PID/exécutable avant arrêt. L’appel répété de démarrage a été testé. Un redémarrage complet de TV reste à tester.

## Validation et essais conservés

- Exécutables ARM64 : version affichée, empreintes identiques après transfert.
- Daemon : socket disponible, préférences relues (DNS/routes acceptées désactivés, aucun exit node).
- Après démarrage non authentifié : SSH local accessible, routes vers le Mac et Internet inchangées, résolveur inchangé, sortie HTTP Cloudflare localisée en France.
- Une commande de version lancée pendant le transfert a retourné `Text file busy`. Après fin du transfert et vérification des empreintes, les exécutables fonctionnent.
- La commande `up` a expiré après 15 secondes en attendant la connexion au compte ; cela ne valide pas une connexion Tailscale active.
- Authentification confirmée : état Running, aucun avertissement de santé.
- Sans CyberGhost : ping Tailscale direct vers le VPS (10 ms dans cet échantillon), ICMP (67 ms), connexion TCP au port SSH du VPS. La sonde curl telnet lit la bannière SSH puis expire comme prévu faute de dialogue SSH : preuve de joignabilité TCP, pas d’authentification.
- Avec CyberGhost Japon, après accord utilisateur et minuterie de secours de 120 s : état CONNECTED, Internet via tvlens0, sortie Cloudflare JP, DNS 10.0.0.243 via tvlens0, Mac via eth0, VPS via tailscale0/table 52. ICMP VPS reçu (265 ms), ping Tailscale direct IPv4 (499 ms). Ces valeurs sont des échantillons, pas un benchmark.
- Après arrêt CyberGhost : sortie FR, DNS webOS restauré, ICMP VPS reçu (8 ms), SSH local toujours accessible. Minuterie désarmée.
- Arrêt propre du daemon : règles Tailscale retirées, routage Internet inchangé. Relance via service : ICMP VPS reçu (23 ms), même adresse/appairage. Hook de démarrage appelé avec daemon actif sans créer de second lancement.
- Aucun redémarrage complet de TV effectué. Lecture Netflix/YouTube et autres profils VPN non évalués par ces tests réseau. Le service TVLens n’est pas encore déployé sur le VPS.

Sources : [installation Linux officielle](https://tailscale.com/docs/install/linux), [coexistence avec les autres VPN](https://tailscale.com/docs/reference/faq/other-vpns), [précédent communautaire webOS](https://gist.github.com/mariotaku/f7228c5459fc7ad2172a2b69dd51a4eb). Le script communautaire n’a pas été exécuté : il modifie le résolveur et le démarrage, ce qui ne convient pas à cet essai.

## Arrêt et retrait de la persistance

Arrêter seulement le daemon, en conservant les préférences pour une relance :

```sh
ssh tv-lg '/media/developer/tvlens-tailscale/service stop'
```

Pour empêcher le lancement au prochain démarrage, retirer uniquement `/var/lib/webosbrew/init.d/25-tvlens-tailscale`. Ne pas toucher aux hooks SSH, CyberGhost et TVLens. La commande `tailscale down` désactive quant à elle la connexion dans les préférences ; une relance du daemon seule ne réactive pas une connexion ainsi désactivée.
