---
id: T169
titre: Expose TV chat models through a dedicated classic script
statut: termine
bloque_par: T182
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les modèles de conversation TV et sa politique de lecture d'état vivent dans `tv/app/chat-model.js`,
un script classique testable sans page. `companion.js` les consomme et conserve sa façade CommonJS
actuelle. Chaque modèle a une seule définition, partagée par la page et les tests Node.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », modèles TV.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, companion, page, transport, banc de page et tests TV lus en entier :
  - `tv/app/companion.js:29` résout `text.js` ; `tv/app/companion.js:33` commence les aides de jobs,
    `tv/app/companion.js:129` projette leurs états et `tv/app/companion.js:206` calcule le polling ;
  - `tv/app/companion.js:239` définit `TvlensPollPlan`, `tv/app/companion.js:295` les badges
    du registre et `tv/app/companion.js:317` la fusion des vues ;
  - `tv/app/companion.js:351` expose exactement `describeJob`, `describeJobProgress`,
    `describeJobFreshness`, `describeJobFreshnessShort`, `pollPolicy`, `PollPlan`, `badgeReference`,
    `registryMarks`, `mergeState`, `cancelTarget`, `clock` et `POLL`, puis sort sans démarrer la page ;
  - `tv/app/index.html:191` commence le chargement ordonné des scripts classiques ;
    `tests/helpers/tv-page.cjs:133` lit ces balises et les exécute dans leur ordre sans CommonJS ;
  - `tests/chat-error-ui.test.cjs:3` charge le companion sans navigateur et
    `tests/chat-error-ui.test.cjs:18` fixe sa liste d'exports ; `tests/tv-panel.test.cjs:5`
    importe ses modèles ; `tests/tv-text.test.cjs:35` attend `clock` par cette façade ;
  - `tests/mac-ui.test.cjs:6` importe aussi le modèle TV pour le comparer au modèle Mac ;
    `tests/tv-app-compat.test.cjs:48` contrôle tous les `.js` de la page comme scripts classiques.
- ADR applicable, déjà accepté :
  `docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md`.
  Il fixe l'IIFE, l'exposition `TVLens…`, CommonJS et l'ordre de chargement.

## Périmètre

- Créer `tv/app/chat-model.js` suivant l'ADR 0011 : IIFE, exposition `TVLensChatModel` sur la page
  et par `module.exports`, sans accès au DOM, au réseau, à une horloge ou à une minuterie propre.
  Résoudre les aides de texte par `text.js`, sans en recopier les définitions.
- Déplacer les constantes et modèles du début du companion : jobs, annulation, progression,
  fraîcheur, politique de polling, `PollPlan`, badges, marques et fusion de vues. Les heures que
  ces fonctions utilisent restent des arguments ; la boucle réelle de polling reste en place.
- Remplacer leurs définitions dans `companion.js` par leur résolution depuis le script partagé.
  Garder la même liste d'exports CommonJS, y compris `clock`, et le chargement sous Node sans page.
- Charger `chat-model.js` après `text.js` et avant `companion.js` dans `index.html`. Le banc qui
  relève les balises doit le charger effectivement ; ne pas lui donner une copie des modèles.
- Ajouter `tests/tv-chat-model.test.cjs`, pour le chargement global et CommonJS. Conserver les
  assertions existantes de `tv-panel`, `chat-error-ui`, `tv-text`, navigation et comparaison Mac/TV.
  Compléter la liste explicite de scripts de la garde de compatibilité. Ajouter aussi `chat-model.js`
  à la liste de la garde des littéraux de durée de `tests/tv-panel.test.cjs:80-85`, sans modifier
  ses assertions : le déplacement de `describeJob` ne doit pas soustraire ce code à la garde.
- Ne pas déplacer navigation, rendu de cartes, envoi, minuteries ou transport ; ne pas modifier
  les cadences, le repli des vues, les résultats des modèles ni l'API `window.tvlensPanel`.

## Critères d'acceptation

1. Le nouveau module se charge sous Node sans `window` ni `document`, et comme script classique
   dans le banc sans `module`. Les deux modes exposent les mêmes fonctions et donnent les mêmes
   résultats sur un job terminé, une erreur technique, une abstention et un état partiel.
2. `require('./tv/app/companion.js')` expose exactement les douze noms listés dans les sources.
   Les fonctions déplacées sont celles du module partagé, sans seconde implémentation dans le
   companion ; les tests existants de modèles passent sans changement de leurs assertions.
3. La page et le banc de navigation chargent réellement le nouveau script dans l'ordre prévu.
   Une mutation qui retire sa balise fait échouer le chargement du banc avec une dépendance absente ;
   la sortie rouge est consignée puis la balise rétablie. Aucun repli silencieux ne définit les
   modèles dans le companion lorsque le script manque.
4. La fusion d'une vue `chat` conserve la timeline déjà reçue pour la même session et la perd lors
   d'un changement de session, comme le test actuel de fusion. Les choix de polling et leurs délais
   restent ceux de `POLL` et de `PollPlan`, avec le même repli après refus de vue.
5. Les gardes des scripts classiques et des littéraux de durée couvrent `chat-model.js`, sans
   changement de leurs assertions. Les tests nouveaux, `tv-panel`,
   `chat-error-ui`, `tv-text`, `mac-ui`, `tv-remote-navigation` et `tv-app-compat` passent en
   séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/tv-chat-model.test.cjs`, frontière : exports CommonJS et objet global du vrai script exécuté
sans DOM. `tests/chat-error-ui.test.cjs` protège la façade et `tests/tv-remote-navigation.test.cjs`
prouve le chargement de la page dans l'ordre des balises. Les modèles ne sont pas extraits du texte
du companion par le banc.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse nommée — retrait ambient accepté : T182 implique T181, T166, T165 et T150 et aura retiré
les appels ambient ; ses lignes devront être relues avant le déplacement. Si le propriétaire refuse
la suppression ambient, retirer T182 de `bloque_par`, y inscrire T150 pour conserver ce prérequis,
et réaliser T169 avec les appels ambient encore présents, sans les retirer dans cette extraction.
T130 et T132 ont déjà fourni le banc de navigation et `text.js`. L’ADR 0011 couvre
le mode de partage choisi : aucun nouvel ADR n'est nécessaire. Les tests de navigation actuels
démarrent non appairés ; ils prouvent ici le chargement. T185 livre indépendamment le banc appairé
réutilisé par T170 et T171, sans attendre la décision ambient ; cette livraison ne s’ajoute pas à T169.

## Journal

- Exploration : skill ticket-codex, méthode tests, standards et ADR 0011/0017 lus ; modèles, consommateurs et preuves existantes examinés. État initial et adaptations de lint consignés dans `.harness-state/tickets/T169/`.
- Rouge avant extraction : `node --test tests/tv-remote-navigation.test.cjs` — 20 réussis, 1 échec sur l’assertion `TVLensChatModel` absent (`page-red.log`). `node --test tests/tv-chat-model.test.cjs` — 6 échecs sur les assertions de chargement du module absent (`models-red.log`).
- Extraction : `chat-model.js` possède les modèles, la politique et `PollPlan` ; `companion.js` résout ses fonctions au chargement et garde ses douze exports. `text.js` reste l’unique définition de l’horloge. Les gardes incluent le nouveau fichier ; ESLint a élagué trois compteurs devenus inutiles ou réduits du companion, sans nouveau gel.
- Vert ciblé : `node --test --test-concurrency=1 tests/tv-chat-model.test.cjs tests/tv-panel.test.cjs tests/chat-error-ui.test.cjs tests/tv-text.test.cjs tests/mac-ui.test.cjs tests/tv-remote-navigation.test.cjs tests/tv-app-compat.test.cjs` — 106 réussis, 0 échec (`models-green.log`). Les assertions existantes sont conservées.
- Mutation exigée : suppression temporaire de la seule balise `chat-model.js`, puis `node --test tests/tv-remote-navigation.test.cjs` — code 1, 21 échecs au chargement sur `tvlensChatModel.describeJob` absent (`missing-script-red.log`). Balise rétablie dans un bloc `finally`, puis vert ciblé observé.
- Contrôles intermédiaires : ESLint initial refusait la complexité 16 de la progression ; extraction de la priorité des plafonds, puis `node_modules/.bin/eslint --prune-suppressions tv/app/companion.js tv/app/chat-model.js` vert. Premier `node scripts/check.mjs --changed` rouge pour une liste ajoutée de plus de 160 caractères ; liste remise en forme sans changer les assertions. Nouveau `node scripts/check.mjs --changed` — vert, 48 tests réussis, lint et cliquet verts (`check-changed.log`).
- Contrôle final : `node scripts/check.mjs` — vert ; règles, format, lint, gel et cliquet verts ; 1 467 tests JavaScript sur 117 fichiers et 22 tests Python réussis (`check-full.log`). `git diff --check` — code 0, aucune erreur. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T169/verdict.json` ; remise à la boucle pour relecture, sans commit ni push.
- Reprise après `relecture-1.md` : rapport, journal, écarts, état Git et diff relus. Seul mineur à corriger : rétablir le rappel original sur les globales du companion. Avant correction, `node --test --test-concurrency=1 tests/tv-chat-model.test.cjs tests/chat-error-ui.test.cjs tests/tv-remote-navigation.test.cjs` — 34 réussis (`correction-before.log`). Correction de commentaire sans nouveau comportement : aucun test comparant le texte source n’est ajouté, conformément aux standards. Constat sur l’ADR 0011 accepté comme réserve hors périmètre.
- Correction du constat mineur 1 : commentaire original sur la portée globale et le préfixe `tvlens` rétabli en tête de `companion.js`, à côté du commentaire de résolution ; aucun comportement ni test modifié. `node scripts/check.mjs --changed` — vert, 48 tests réussis (`correction-check-changed.log`).
- Contrôle complet après correction : `node scripts/check.mjs` — vert ; règles, format, lint, gel et cliquet verts ; 1 467 tests JavaScript sur 117 fichiers et 22 tests Python réussis (`correction-check-full.log`). `git diff --check` — code 0, aucune erreur. Aucun constat bloquant ou mineur non corrigé. Réserve hors périmètre : actualiser séparément l’ADR 0011 sur `module.require` et les 21 tests de navigation. Nouveau verdict `TERMINÉ` écrit pour la boucle, sans commit ni push.

### Réserves à la clôture

- Réserve hors périmètre, constat 2 de relecture-1.md : actualiser séparément docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md pour documenter module.require dans les scripts touchés et le passage de vingt à vingt et un tests de navigation. Ticket adr: non ; ADR inchangé.
- .harness-state/tickets/T169/relecture-2.md : `docs/adr/0011-un-script-partage-du-panneau-tv-est-une-iife-exposee-sur-la-page-et-par-commonjs.md:24` (hors périmètre)
  - **Ce qui ne va pas :** l'ADR prescrit encore `require("./text.js")`, alors que `companion.js:3-4` et `chat-model.js` utilisent maintenant `module.require`. La section « Protégée par » parle aussi de vingt tests de navigation ; il y en a 21.
  - **Ce qui est attendu :** mettre à jour l'ADR dans un ticket séparé, à reporter en réserve. Le ticket porte `adr: non`.
