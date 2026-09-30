# Préparation du dépôt public — 30 septembre 2026

## Périmètre

Audit des branches et tags Git accessibles, pas uniquement du dernier commit. Gitleaks 8.30.1 a examiné l’historique original sans détecter de secret. Un contrôle complémentaire de 350 blobs historiques a comparé leur contenu aux trois secrets connus du projet : aucune correspondance. Aucun fichier de profil VPN, certificat, clé privée, authentification ou appairage n’a été versionné. Aucun artefact GitHub Actions ni release n’était présent lors de la vérification.

Les rapports détaillés, données sensibles utilisées pour comparaison et sauvegarde Git originale restent hors du dépôt. Un scan ne constitue pas une garantie universelle d’absence de fuite.

## Nettoyage

- Adresses privées du serveur et de la TV remplacées par des exemples dans les documents, y compris leurs anciennes versions.
- Adresse e-mail personnelle des métadonnées Git remplacée par l’adresse GitHub noreply du propriétaire.
- Documentation opérationnelle VPN personnelle remplacée par une note générique dans l’historique ; profils réels jamais inclus.
- Draft de candidature local exclu par .gitignore et absent de l’historique.
- Configurations privées du service ignorées ; exemples sans identifiants fournis séparément.

L’historique anonymisé change les identifiants de commits. Les rapports anciens restent des relevés datés ; les anciens clones et services ne sont pas réécrits à distance. Pour reprendre le développement depuis un ancien clone, privilégier un nouveau clone et conserver séparément sa configuration privée. Ne pas réinjecter les anciennes branches dans l’historique public.

## Portabilité

Le serveur utilise une adresse configurée hors Git, loopback par défaut. Les exécutables sont résolus via PATH et overrides explicites. Le fichier .env.local est facultatif et les compteurs peuvent être placés dans un dossier inscriptible. Le guide Linux décrit les prérequis et l’appairage sans dépendre d’une machine personnelle.

## Vérification

- 114 tests Node réussis sur Mac et sur Linux dans un checkout isolé, dont deux régressions de configuration portable. Un démarrage neuf Linux sans fichier env a également validé loopback, création du jeton et réponses 401/200.
- Test UI de frise réussi après résolution portable de FFmpeg.
- Test Electron : premier essai en échec sur la relecture WebM (timeout, média non chargé) ; second essai réussi avec 14 segments, audio, relecture, chat et vérification simulés. Cette intermittence préexistante n’est pas présentée comme corrigée.
- Contrôle de syntaxe des scripts et liens locaux de documentation.

La publication GitHub ne publie ni le service VPS ni l’accès à la TV ; leur configuration réseau n’a pas été modifiée par cette opération.

## Particularité GitHub

Une première réécriture a laissé un ancien commit accessible par URL directe après le changement de visibilité. Le dépôt a été remis en privé, puis conservé en archive privée. Un dépôt neuf au même nom contient uniquement l’historique anonymisé ; son clonage a été scanné à nouveau sans résultat de secret. L’API GitHub refuse les anciens identifiants de commits. Les anciennes URL brutes ont fait l’objet d’un contrôle séparé, car le cache CDN peut servir temporairement une réponse antérieure à une modification de visibilité. Aucun identifiant ni profil VPN n’était présent dans le fichier ainsi observé.

Le contrôle final du 30 septembre a confirmé une réponse HTTP 404 pour l’ancienne URL brute qui restait en cache.

La détection de secrets, la protection des pushes et le signalement privé de vulnérabilités sont activés sur le nouveau dépôt. L’historique original et les rapports détaillés restent privés.
