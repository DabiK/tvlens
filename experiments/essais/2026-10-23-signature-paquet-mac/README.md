# Signature du paquet Mac — 23 octobre 2026

## Question et configuration

Pourquoi le ZIP Mac déclenche-t-il « TVLens est endommagé » après téléchargement ?
Essai sur le Mac Apple Silicon de développement, Electron 44.4.5, Sharp 0.35.5,
base Git `4a423f1f4bcf54259c88f8910f1bf5eee3a6df70`, correctif non commité pendant les sondes.

## Résultats observés

- Le paquet précédent échoue à `codesign --verify --deep --strict` :
  `code has no resources but signature indicates they must be present`.
  La signature héritée du binaire Electron ne scelle pas les ressources de TVLens.
- Un test de régression construit une petite app réellement signée, puis altère une ressource :
  le vérificateur refuse le paquet altéré. Rouge avant implémentation, puis 10 tests ciblés verts.
- La construction signe désormais le paquet final. Par défaut, signature ad hoc sans certificat ;
  une identité Developer ID explicite active le hardened runtime et l’horodatage.
  Toute erreur de signature arrête la construction.
- Le paquet ad hoc corrigé passe le contrôle strict et charge Sharp, mais Gatekeeper le rejette.
  Une signature intègre ne constitue donc pas une autorisation de distribution.
- Avec l’accord explicite du propriétaire, construction signée avec son Developer ID :
  chaîne Apple, Team ID attendu, hardened runtime et horodatage présents.
  Vérification des 4 770 fichiers, intégrité et sonde native Sharp réussies.

Le contrôle complet local `node scripts/check.mjs --json` est vert : règles, format, lint,
gel, cliquet, 3 253 tests JavaScript et 71 tests Python. Aucun modèle Ollama chargé pendant ce contrôle.

## Distribution GitHub et vérification du téléchargement

Le propriétaire a choisi un ZIP GitHub sans notarisation et une autorisation manuelle d’ouverture sur chaque Mac. Aucun paquet n’a été envoyé au service Apple ; aucun profil de connexion n’a été créé.

Après intégration des changements déjà commités sur `main` (sans importer de travaux locaux), 132 tests ciblés de packaging et des modules intégrés passent. Le correctif est poussé sous `d190c322e238c714444023d9aa829109e0237982`. La construction finale indique `dirty: false`, 4 772 fichiers et 174 sources ; signature stricte et Sharp réussissent.

La [préversion 2](https://github.com/DabiK/tvlens/releases/tag/v0.1.0-mac-preview.2) conserve cette construction. Son ZIP a été retéléchargé sans authentification avec `curl`, puis décompressé avec `ditto`. SHA-256 identique :

```text
3c96c6aa94f62e89dc689f8d161a815eb313a6157cc1666ad6eb98a2963d2162
```

La signature de l’application décompressée est valide. Le téléchargement piloté dans Chrome a échoué avec `ERR_BLOCKED_BY_CLIENT` ; aucune extension ou protection du navigateur n’a été désactivée. Le transfert public par HTTP a réussi, mais ce n’est pas une preuve de téléchargement interactif réussi dans ce navigateur.

La copie téléchargée remplace `/Applications/TVLens.app` ; l’ancienne est conservée dans `dist/installed-before-preview2/TVLens.app` du worktree. Comme `curl` ne pose pas la quarantaine du navigateur, l’attribut `com.apple.quarantine` a été ajouté explicitement pour éprouver le premier lancement. Aucun attribut de quarantaine ni protection macOS n’a été retiré. Une première tentative de poser l’attribut avec `os.setxattr` a échoué (API absente de ce Python macOS), puis `/usr/bin/xattr -w` a réussi.

Gatekeeper indique `source=Unnotarized Developer ID`, attendu pour ce choix. L’ouverture via l’outil UI a expiré ; le parcours Finder a été interrompu par une intervention utilisateur. Le clic **Ouvrir quand même** et l’affichage final de TVLens restent à confirmer par l’utilisateur. La recette antérieure de capture réelle ne prouvait pas ce parcours de téléchargement.

## CI

La CI de la base `dd945a5` est entièrement verte. Celle du correctif `d190c32` est en cours au moment de ce rapport : [run GitHub](https://github.com/DabiK/tvlens/actions/runs/39890579722). Le contrôle complet local et les 132 tests d’intégration ci-dessus sont observés, sans les confondre avec un succès CI à venir.

## Preuves

Les sorties brutes sont dans `preuves/` : signature initiale, test rouge puis vert,
construction, vérification et métadonnées Developer ID. Aucun identifiant d’authentification Apple n’y figure.
