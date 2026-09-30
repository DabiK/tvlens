# Confidentialité et signalement

Ne pas ouvrir une issue publique contenant une clé, un jeton, des médias privés ou une configuration de TV/VPS. Utiliser le signalement privé GitHub si disponible ; sinon contacter le propriétaire sans joindre le secret dans un premier message.

Les fichiers `.env.local`, les identifiants Codex, les jetons d’appairage et les profils VPN restent hors Git. Le serveur est conçu pour un réseau privé : écoute loopback ou adresse Tailscale explicite, jeton requis, aucun App Server Codex exposé. Les permissions du tailnet restent à configurer par son propriétaire.

Le POC transmet images et transcriptions aux fournisseurs décrits dans le README. Un réseau privé ne signifie pas que l’inférence est locale. Le root TV et les adaptateurs système ciblent un appareil de test précis ; aucune compatibilité universelle n’est garantie.

L’audit préalable à la publication comprend un scan Gitleaks et une comparaison avec les secrets connus sur toutes les versions de fichiers accessibles par les branches et tags. Il réduit les risques sans garantir l’absence de toute information sensible. Les rapports détaillés et sauvegardes non anonymisées restent privés.
