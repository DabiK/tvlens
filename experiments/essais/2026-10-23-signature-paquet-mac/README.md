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

## Limites et suite

Le propriétaire a finalement choisi un ZIP GitHub sans notarisation et une autorisation manuelle
d’ouverture sur chaque Mac. Aucun paquet n’est envoyé au service Apple. Aucun paquet corrigé
n’est publié à ce stade. L’ouverture d’un téléchargement soumis à Gatekeeper n’est pas encore validée.
La recette antérieure de capture réelle ne prouvait pas ce parcours de téléchargement.
Les sondes ci-dessus portent sur une construction modifiée ; la publication devra repartir d’un commit propre,
être signée Developer ID et revérifiée. Gatekeeper indique encore
`source=Unnotarized Developer ID`, ce qui est attendu pour ce choix de distribution. Aucun attribut de quarantaine ni protection macOS n’a été retiré.

## Preuves

Les sorties brutes sont dans `preuves/` : signature initiale, test rouge puis vert,
construction, vérification et métadonnées Developer ID. Aucun identifiant d’authentification Apple n’y figure.
