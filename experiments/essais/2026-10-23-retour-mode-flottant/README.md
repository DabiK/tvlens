# Retour visible depuis le mode flottant

## Question et configuration

Rendre le retour à la fenêtre complète directement accessible dans la barre flottante.
Mac local, paquet Electron 44.4.5 signé Developer ID, installé dans `/Applications/TVLens.app` après accord explicite de l’utilisateur pour interrompre la capture et redémarrer.
Branche `codex/home-chapter-cards`, base `fc34dc2cb3c4b4b341031544edcc727d42ed7caa`, modifications locales incluses.

## Résultats

- Bouton existant `float-full` déplacé du menu vers le début de la barre, flèche gauche et bordure lime ; gestionnaire de retour conservé.
- `node scripts/check.mjs --changed` : vert, 84 tests réussis, zéro échec (check.log).
- Paquet vérifié ; empreinte ASAR : `d194ac3acb6a80be73fcd59518e0151373789f08bce14e106c548d9a23e0cf14` (package-report.json).
- Application installée et relancée ; arbre d’accessibilité observé sur `file:///Applications/TVLens.app/Contents/Resources/app.asar/app/index.html`, accueil et capture active visibles.
- Sauvegarde précédente : `~/Library/Application Support/TVLens-update-backups/before-visible-back/TVLens.app`.

## Limites et incidents

Le passage en mode flottant via l’automatisation a été refusé plusieurs fois car la fenêtre avait changé entre observation et action. Aucun clic réussi sur la nouvelle flèche ni validation visuelle de sa disposition ne sont revendiqués. L’utilisateur a repris ses propres essais ; aucune nouvelle requête fournisseur n’a été déclenchée par cette vérification. La capture active observée est celle de l’utilisateur.
