# VPN Internet sur la TV — composant indépendant

Le téléviseur de test dispose d’un client OpenVPN distinct de TVLens. Il n’est pas nécessaire pour capturer YouTube ou utiliser le companion. Les profils, certificats, clés, identifiants et configurations du fournisseur ne sont pas distribués dans ce dépôt.

La coexistence réseau a été testée : trafic Internet via le VPN lorsqu’il est activé, accès au serveur TVLens via Tailscale et maintien du réseau local. À la déconnexion du VPN, le résolveur et le routage Internet précédents ont été restaurés. Voir [le rapport Tailscale anonymisé](lg-tailscale.md).

Cette vérification réseau ne garantit ni une compatibilité avec toutes les TV ni l’accès aux catalogues des services de streaming. Le VPN reste à activation manuelle sur l’appareil testé. Il n’est pas configuré comme coupe-circuit global.

Les procédures opérationnelles, noms de profils, endpoints et sauvegardes personnelles sont conservés hors du dépôt. Aucune configuration VPN n’est nécessaire pour suivre [l’installation du serveur TVLens](server-installation.md).
