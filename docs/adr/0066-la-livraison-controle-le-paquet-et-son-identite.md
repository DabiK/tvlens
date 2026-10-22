# 0066 — La livraison contrôle le paquet et son identité

- Date : 2026-10-23
- Statut : acceptée

## Contexte

Le contrôle local existe, mais un checkout CI propre ne possède pas de fichiers modifiés au sens de `git status`. Le gel comparé à `HEAD` ne détecte pas non plus une hausse déjà commitée. Le paquet Mac était construit depuis toute la racine avec quelques exclusions ; les données de recherche et les outils n’ont pas leur place dans une application distribuée. Enfin, un ancien paquet ne permettait pas d’identifier sa révision depuis l’interface.

## Décision

GitHub Actions exécute le contrôle complet sur Linux et macOS, avec FFmpeg et les dépendances verrouillées. Un wrapper externe au harnais exige toutes ses étapes et compare les règles par fichier, les suppressions ESLint et le cliquet avec la base de la PR ou du push. Les tests Python du prototype de télécommande ont leur étape dédiée.

La construction Mac garde les racines de production nécessaires à Electron, des ressources statiques explicites et les dépendances de production. Les sources symboliques sont refusées. L’archive produite est inspectée : exclusions, fichiers source identiques, modules autorisés par le lockfile, identité et inventaire natif décompressé. Le binaire livré charge effectivement son lecteur d’identité et `sharp` en mode Node.

L’identité est générée au build dans la copie du packager : nom, version, SHA complet, date du commit, indicateur de modifications. Elle est lue par un adaptateur sans Git au runtime, transmise à l’interface Mac et à une route HTTP authentifiée. Absente, elle reste explicitement inconnue ; invalide, elle refuse le démarrage. La CI construit uniquement depuis un checkout propre.

## Conséquences

Le dépôt garde ses frontières actuelles : cette étape ne déplace pas les modules métier. Les futurs assets doivent entrer explicitement dans la politique de paquet. Le ZIP CI inclut une empreinte et un rapport d’inventaire ; il n’est pas publié comme une release.

La validation native ne prouve pas les permissions macOS ni la capture réelle. Le smoke Electron utilise les sources et des fournisseurs simulés. Signature Developer ID, notarisation, DMG, assistant de configuration, provisionnement des outils externes et mise à jour automatique restent des incréments séparés. L’identité stable n’est pas une garantie de reproductibilité binaire.

## Vérification

`tests/build-info.test.cjs`, `tests/server-version.test.cjs`, `tests/ci-policy.test.cjs`, `tests/package-content.test.cjs` et `tests/package-verification.test.cjs` couvrent les frontières publiques et les refus. La route rejoint le contrôle de propriété de `tests/server-routes.test.cjs`. Commandes et limites dans [CI et construction Mac](../ci-delivery.md).
