# Fiche de chantier — Une interface Mac découpée et testable (lot L14)

Vague 2. Constats : UI-02, UI-03, UI-05, UI-06, OUBLI-23. Code lu à la version `0d5a954`. Les numéros de
ligne bougeront au formatage (`jalon:format`) et avec les lots L02 et L08 : chaque emplacement est donné par
son nom d'abord.

Les tickets de ce lot citent cette fiche sous le chemin `docs/travail/fiches/interface-mac.md`.

Contrainte du lot : `app/renderer.js` n'a aucun test de comportement. Il lit `document` au chargement, ne
s'importe donc pas dans Node, et son seul filet est le smoke Electron (`scripts/smoke-electron.mjs`), lancé
hors de la boucle. **Aucun morceau n'est déplacé avant que la logique visée soit testée** : chaque étape
commence par écrire, contre un module pur, les tests du comportement d'aujourd'hui, puis branche la fenêtre
sur ce module.

## 1. Ce qui ne va pas, en une phrase par zone

- `app/renderer.js` (837 lignes, 58 lignes de plus de 160 caractères) fait tout : état global en `let`
  (l.20-29), capture, fil de questions, vérification, bibliothèque, surveillance, moments, récapitulatif,
  mode fenêtre flottante, table d'actions (`actions`, l.331-351) et affectations `onclick` directes
  (UI-02).
- Réponses tardives : les lectures initiales `bridge.deepState()` (l.305) et `bridge.verificationState()`
  (l.306), puis `pullSession` (`deepState = deep`, l.501) écrasent sans condition un état poussé entre le
  départ et l'arrivée de la lecture ; `refreshSessions` (l.470-476) et `renderSaved` (l.563) n'ont pas non
  plus de numéro de demande. Seuls `commandSurveillance` (compteur `watchPushes`, l.696-699),
  `refreshRegistry` (l.657), le récapitulatif (`recapRevision`, l.833-836) et la recherche
  (`searchRevision`, l.572, repris par le lot L02) sont gardés (UI-03).
- Le DOM sert de canal : `watchWithSelectedSource` (l.405, l.407) et `float-source-form` (l.454, l.456)
  relancent en erreur le texte de `$('state')` ou `$('notice')` faute d'un retour `{ ok, error }` de
  `startPreview` (l.86-113) ; `floatingCaptureBusy = true` est posé à quatre endroits (l.403, 427, 443, 452)
  et `quickBusy = true` à cinq (l.730, 750, 761, 779, 792), chacun suivi d'`updateButtons()` à la main ;
  `updateButtons` (l.65-85) calcule une vingtaine d’états de commandes en lisant le DOM (`$('source').value`), et
  `float-launch` est écrit hors d'elle (l.413, 420, 437, 452, 459) (UI-05).
- Branchements fragiles : `shell.js` pose `float-menu-toggle.onclick` (l.16) que `renderer.js` écrase
  (l.391) ; `saved-all` et `nav-saved` copient la valeur de `open-library.onclick` (l.567-568) ;
  `momentCard` (l.557-562) rejoue un moment conservé par un second chemin de relecture, à côté de `replay`
  (l.164-176) ; des `onclick` en fermeture dans `renderSaved`, `renderSavedRail` (l.563-564) et
  `recap-view.js` (l.44, l.63) (UI-06).
- Règles de requête dans la vue : le préfixe de vérification (`verifyPrefix`, l.30), la liste des renvois
  (« ça », « cela »…, l.288), la coupe à 2 000 caractères (l.289) et la demande « Approfondis cette
  réponse : » avec 1 200 caractères de réponse (`actions['job-more']`, l.335) ne sont ni nommées ni testées
  (OUBLI-23).

## 2. Forme cible

### Règle de placement

Tout nouveau module de la fenêtre vit **à plat dans `app/ui/`**, jamais dans un nouveau dossier
(`app/controllers/`, `app/state.js`). Raison : `tests/mac-ui.test.cjs` construit `rendererFiles` (l.661) à
partir de `renderer.js`, `recording.js` et de tout `app/ui/*.js|*.mjs`, et ses gardes statiques (imports
résolus, méthodes du pont exposées, pluriels, plafonds, l.664 et l.685) ne voient que ces fichiers. Un
module placé ailleurs échapperait à ces gardes.

Deux trous de ces gardes restent à connaître :
- la garde des identifiants (l.678) ne lit que `$('…')` dans `renderer.js` et `this.get('…')` dans
  `ui/shell.js` : un module qui reçoit des identifiants en données doit prouver lui-même qu'ils existent
  dans `app/index.html` ;
- la garde du pont (l.688) ne reconnaît que `bridge.x` et `window.tvlens.x` : les appels
  `window.capture.*` (l.46, 89, 363, 415) ne sont pas vérifiés.

Conventions déjà en place, gardées : `*-view.mjs` = modèle pur sans DOM, testé en import direct ;
`*-dom.js` = construction de nœuds ; `*-controller.mjs` = ordonnancement asynchrone sans DOM ni phrase,
dépendances injectées (modèle posé par le lot L02 avec `search-controller.mjs`). Les phrases affichées
restent dans la couche vue ; aucune ne passe dans `core/` ou `runtime/` sans décision (arbitrage A6).

### Modules visés

| Module | Responsabilité | Dépend de | Étape |
|---|---|---|---|
| `app/ui/chat-requests.mjs` | Fonctions pures : affirmation à vérifier tirée d'un texte (préfixe, renvois, coupe), question débarrassée du préfixe, demande d'approfondissement d'une réponse. Textes identiques à aujourd'hui. | rien | 1 |
| `app/ui/controls-view.mjs` | `describeControls(input)` : états désactivés, modes de libellé des commandes de capture, du fil et des moments, à partir d'un objet d'entrée explicite (plus de lecture du DOM). Les phrases restent dans `renderer.js`, indexées par mode. | rien | 2 |
| `app/ui/freshness.mjs` | Fraîcheur d'une lecture : une lecture est écartée si une lecture plus récente est partie, ou si un état a été poussé depuis son départ. | rien | 3, 4 |
| `app/ui/capture-controller.mjs` | Prévisualisation, observation, arrêt, mode flottant : `startPreview` rend `{ ok, error }`, une seule enveloppe « occupé » pour `floatingCaptureBusy` et `quickBusy`. | `controls-view.mjs`, pont injecté | 5 |
| `app/ui/replay-view.mjs` | Une seule description de relecture `{ title, src, note, offset, keepsOffset }` pour un passage et pour un moment conservé, sans perdre leurs écarts d'aujourd'hui. | `search-view.mjs` (`replayTarget`) | 6 |
| `app/ui/*-controller.mjs` par zone | Fil et vérification, bibliothèque, moments, surveillance, récapitulatif : chacun reçoit le pont et des fonctions de dessin. | les `*-view.mjs` de sa zone | 7 |
| `app/renderer.js` | Composition seule : crée les contrôleurs, branche les événements, garde les phrases tant que le propriétaire n'en décide pas autrement. | tous les précédents | 8 |

### Sens des dépendances

`renderer.js` → `*-controller.mjs` → `*-view.mjs` → `text.mjs`. Les `*-dom.js` et `shell.js` sont appelés
par `renderer.js` seul. Aucun module de `app/ui/` n'importe `renderer.js` ; un `*-view.mjs` ou un
`*-controller.mjs` ne touche ni `document`, ni `window`, ni le pont autrement que par injection. Ces règles,
quand elles deviendront des gardes, vivent dans `tests/architecture.test.cjs` (arbitrage A3).

## 3. Séquence étendre / migrer / contracter

Prérequis communs : `jalon:format` ; le lot L02 intégré (il touche la recherche, `nextSeen`, le
récapitulatif et rend les gardes statiques non vides : sans lui, les gardes que ce lot ajoute peuvent
passer à vide). Les étapes 1 à 3 ne dépendent pas les unes des autres ; la boucle les intègre l'une après
l'autre parce qu'elles modifient le même fichier.

### Étape 1 — Règles de requête du fil, nommées et testées (ticket T127)

Étendre : `app/ui/chat-requests.mjs` et ses tests de caractérisation (cas du préfixe, renvois, coupe,
demande d'approfondissement). Migrer : `openVerification`, `verify-form` et `actions['job-more']`
l'appellent. Contracter : `verifyPrefix` et la liste des renvois disparaissent de `renderer.js` dans le
même ticket. Aucun texte ne change.

### Étape 2 — Modèle des commandes de la fenêtre (ticket T128)

Étendre : `app/ui/controls-view.mjs` (`describeControls`) et une table de cas qui fixe les états
d'aujourd'hui. Migrer : `updateButtons` construit l'entrée, appelle le modèle, applique le résultat et
choisit les phrases par mode. Contracter : plus aucun calcul d'état désactivé dans `updateButtons`.
`float-launch` reste hors de cette étape (étape 5).

### Étape 3 — Fraîcheur des lectures qui concurrencent un état poussé (ticket T129)

Étendre : `app/ui/freshness.mjs` et ses tests avec promesses différées (`deferred` de
`tests/helpers/wait.cjs`, créé par le lot L05 : l'étape dépend aussi de `lot:L05`). Migrer : lectures initiales de
l'état d'approfondissement et de vérification (l.305-306) et lecture de `pullSession` (l.501). Le patron
retenu est celui de `commandSurveillance` (compteur de poussées), sans numéro de révision côté hôte
(`deep.snapshot()` et `verification.snapshot()` n'en ont pas, `core/deep-ask.cjs` l.25,
`core/verification.cjs` l.15).

### Étape 4 — Fraîcheur des autres lectures (non découpée)

Brancher `refreshSessions`, `renderSaved`, `bridge.surveillanceState()` (l.726) et les lectures du
récapitulatif et de la surveillance de `pullSession` (l.500, `receiveRecap` et `receiveSurveillance` sans
garde contre `onRecap` et `onSurveillance`) sur le même module ; faire
passer `commandSurveillance` (`watchPushes`) et `refreshRegistry` par lui, pour qu'il n'en reste qu'une
forme. Le contenu dépend de l'interface que l'étape 3 aura fixée, et de `refreshRegistry` tel que le lot
L04 l'aura réécrit (nouvelle lecture du registre après un échec, avec délai borné).
Déclencheur : T129 intégré, lot L04 intégré.

### Étape 5 — Capture sans canal DOM et occupation en une enveloppe (non découpée)

`startPreview` rend `{ ok, error }` ; `watchWithSelectedSource` et `float-source-form` ne relisent plus
`$('state')` ni `$('notice')` ; une enveloppe `withBusy` remplace les neuf poses manuelles de
`floatingCaptureBusy` et `quickBusy` ; `float-launch` passe dans `describeControls`. Ces chemins appellent
`navigator.mediaDevices`, `window.capture.select` et le DOM : les tester demande le faux document du lot L05
(`tests/helpers/fake-dom.cjs`) et les constructeurs testés du lot L08.
Déclencheur : T128 intégré, lots L05 et L08 intégrés, et décision du propriétaire sur le smoke Electron
(décision 1).

### Étape 6 — Une seule relecture et des branchements non écrasés (non découpée)

`replay-view.mjs` décrit les deux relectures (passage : `replayTarget`, décalage appliqué au chargement, note
selon `currentState.accepting` ; moment conservé : titre « Moment conservé », adresse
`tvlens-saved://`, pas de décalage, sa propre note). `float-menu-toggle` n'a plus qu'un propriétaire
(`shell.js` ou `renderer.js`) ; `saved-all` et `nav-saved` appellent `openLibrary` au lieu de copier une
valeur ; les `onclick` en fermeture passent par `data-action` là où la table `actions` existe déjà.
Déclencheur : lot L08 intégré (constructeurs DOM testés), étape 5 intégrée.

### Étape 7 — Contrôleurs par zone (non découpée)

Une zone à la fois, dans cet ordre : fil et vérification, bibliothèque et sessions, moments, surveillance,
récapitulatif, mode flottant. Chaque extraction commence par les tests de comportement de la zone contre
son contrôleur, puis déplace l'état global correspondant (l.20-29, l.463, l.592-593) dans le contrôleur.
Une zone = un ticket.
Déclencheur : étapes 4 à 6 intégrées ; le smoke Electron lancé par le propriétaire après chaque zone.

### Étape 8 — `renderer.js` réduit à la composition (non découpée)

Contracter : plus de `let` d'état métier au niveau du module ; plus de ligne de plus de 160 caractères ;
gardes d'architecture (étape suivante de A3) : aucun `app/ui/*-view.mjs` ou `*-controller.mjs` n'utilise
`document`, `window` ou `$`.
Déclencheur : étape 7 terminée pour toutes les zones.

## 4. Invariants à préserver

- Aucun texte affiché ni aucune demande envoyée au modèle ne change, au caractère près (« Approfondis cette
  réponse : », coupe à 1 200 et à 2 000 caractères, liste des renvois, préfixes reconnus). Seule exception,
  dans l'étape 1 : `que` et `si` du préfixe de vérification prennent une limite de mot, car l'expression
  d'aujourd'hui transforme « vérifie quelque chose » en « lque chose » (constaté avec `node -e` sur
  l'expression de `verifyPrefix`, l.30).
- La première lecture sans poussée applique toujours son résultat : la fenêtre ouverte sans événement doit
  montrer l'état d'approfondissement et de vérification. La réouverture d'une archive par `pullSession`
  applique l'état lu si rien n'a été poussé depuis.
- Un état poussé n'est jamais remplacé par une lecture partie avant lui.
- Les commandes gardent leurs états actuels pour chaque combinaison (session, archive, enregistrement,
  arrêt en cours, occupations, configuration, vérification, question en attente, source choisie).
- Les fautes de relecture gardent leur motif (`replayTarget`) ; aucune adresse média n'est construite hors
  de `replayTarget` (garde de `tests/mac-ui.test.cjs`, l.657).
- Les gardes statiques de `tests/mac-ui.test.cjs` (l.664, l.685) couvrent tout nouveau module ; le nombre
  de tests de ce fichier ne baisse pas.
- Contrat `/v1` et canaux IPC inchangés (arbitrage A7) : ce lot ne touche ni `app/preload.cjs` ni
  `app/main.cjs`.

## 5. Tests qui protègent chaque étape

| Étape | Protection existante | À écrire dans l'étape |
|---|---|---|
| 1 | Aucune : `verifyPrefix` et la demande d'approfondissement ne sont lus par aucun test. | Table de cas de `chat-requests.mjs` ; garde de branchement (la fenêtre importe et appelle le module). |
| 2 | Aucune sur `updateButtons` ; seul le smoke Electron clique. | Table de cas de `describeControls` ; preuve que chaque identifiant rendu existe dans `app/index.html` ; garde de branchement. |
| 3 | Aucune : les lectures l.305-306 et l.501 ne sont lues par aucun test. Le patron `watchPushes` n'est prouvé que par le texte. | Tests à promesses différées de `freshness.mjs` ; garde de branchement des trois lectures. |
| 4 | Aucune : `watchPushes` n'apparaît dans aucun test à `0d5a954`. | Tests de `refreshSessions`, `renderSaved` et de la commande de surveillance via `freshness.mjs`. |
| 5, 6 | Smoke Electron hors boucle seulement. Manquent : faux DOM (lot L05) et constructeurs testés (lot L08). | Tests de contrôleur de capture ; tests de `replay-view.mjs`. |
| 7, 8 | Smoke Electron hors boucle seulement. Manque : un test d'intégration de la fenêtre dans la boucle (TSTC-10, reporté par le lot L08). | Tests de chaque contrôleur ; gardes d'architecture. |

## 6. Risques

- **Garde vide.** Un test de branchement qui lit `renderer.js` peut passer sans rien prouver. Chaque ticket
  prouve sa garde par une faute injectée puis défaite, sortie au journal.
- **Lecture écartée à tort.** Si la fraîcheur écarte la seule réponse porteuse d'état (premier chargement,
  `pullSession` sans poussée), la fenêtre reste vide. Les tests de l'étape 3 couvrent ces deux cas.
- **Caractérisation fausse.** Une table de cas écrite d'après une lecture erronée de `updateButtons`
  changerait un état en silence. Le ticket demande une table tirée ligne à ligne de l'expression
  d'aujourd'hui, et toute différence constatée est un verdict BLOQUÉ, pas une correction.
- **Conflits avec L02 et L08.** Ils modifient `renderer.js` et `tests/mac-ui.test.cjs` avant ce lot ; les
  numéros de ligne de cette fiche seront faux. Les tickets nomment les fonctions d'abord.
- **Smoke hors boucle.** Rien dans la boucle n'exécute la fenêtre : une erreur de branchement qui ne casse
  ni import ni garde passe la boucle. D'où la décision 1.
- **Mémoire.** Aucun ticket ne lance Electron ni navigateur.

## 7. Décisions qui reviennent au propriétaire

1. Lancer le smoke Electron (`scripts/smoke-electron.mjs`) après chaque étape structurelle (5 à 8), hors de
   la boucle, et le consigner au ticket — ou accepter que ces étapes reposent sur les seuls tests de
   modules.
2. Fraîcheur : compteur de poussées côté fenêtre (retenu pour l'étape 3, sans changement d'IPC) ou numéro de
   révision dans `deep.snapshot()` et `verification.snapshot()` côté hôte, qui changerait les instantanés
   (arbitrage A7 pour ce qui passe par `/v1`).
3. Place des règles de requête (préfixes, renvois, « Approfondis cette réponse : ») : rester dans
   `app/ui/`, ou passer dans `core/` pour être partagées avec la TV et le serveur MCP (arbitrage A6).
4. Une bibliothèque DOM pour les tests des étapes 5 à 8 (arbitrage A2 : `installe: oui`) ou le faux
   document écrit à la main du lot L05.
5. Forme finale : contrôleurs à plat dans `app/ui/` (retenu par cette fiche, pour rester sous les gardes
   existantes) ou nouveau dossier, ce qui oblige à élargir `rendererFiles` et la garde des identifiants.
