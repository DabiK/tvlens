---
id: T185
titre: Drive the paired TV page in the test bench
statut: a-faire
bloque_par: T163
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le banc `tests/helpers/tv-page.cjs` démarre la vraie page TV avec une configuration d'appairage
fictive, un réseau et des minuteries maîtrisés. Au moins un test observe une carte et un envoi par
les vrais scripts. T182, T170 et T171 réutilisent ce banc, qui conserve le produit et tous les tests existants.

## Sources

- `docs/audit-points-chauds.md`, section B, banc TV non appairé. Décision de l'orchestrateur, le
  15/10 : sortir le banc du retrait ambient, sans attendre la décision sur ce retrait.
- Repères vérifiés par lecture à `e92c6a6` :
  - `tests/helpers/tv-page.cjs:38` définit `FakeElement`, avec focus, écouteurs et enfants directs,
    mais sans création, ajout/remplacement/retrait de nœuds, attributs ni propriété `value` ;
    `:102` ne relève que les balises avec ID et ne relie que les boutons de dialogues ;
    `:158` expose un document sans `createElement`. Ce DOM ne suffit pas aux cartes réelles ;
  - `tests/helpers/tv-page.cjs:133` lit les balises de `index.html` dans leur ordre, en excluant
    `connection.js` ; `:151` démarre sans configuration, avec temps fixe et compteurs de timers ;
  - `tv/app/index.html:191-199` charge `connection.js`, puis `remote-client.js`,
    `surveillance-overlay.js`, `text.js`, `surveillance-view.js`, `sessions-view.js`,
    `capture-control.js`, `timeline-view.js` et `companion.js` ;
  - `.gitignore:26` exclut `tv/app/connection.js`, absent du worktree. Le format de la configuration
    est documenté dans `docs/lg-installation.md:39` : `window.TVLENS_REMOTE = { url, token }` ;
  - `tv/app/companion.js:556` quitte le démarrage sans `config.url` ou `config.token` ; `:560`
    construit le vrai client distant et `:582` le client local avec `controlUrl` ou le défaut local.
    `:592` demande `/panel`, `:832` exige une URL valide ; `capture-control.js:90` demande `/capture` ;
  - `tv/app/remote-client.js:19-85` utilise `fetch`, `AbortController`, un délai de 8 s, des réponses
    `status`/`ok`/`json()` et `headers.get()` pour les ETags. Le premier état demandé par
    `companion.js:268` est `/v1/state?view=panel`, puis les réponses pilotent le polling ;
  - `tv/app/companion.js:688-697` lit `localStorage` et `:787-795` y écrit `tvlens.overlay` ;
    `:595` lit `Date.now()`, `:1133` lit `performance.now()`. `:1172` réarme le polling,
    `:1233-1240` arme deux intervalles ; `capture-control.js:41` réarme sa propre lecture ;
  - `tv/app/companion.js:880-975` crée et remplit les articles, `:1045-1103` rend l'état et
    `:1187-1230` soumet via `onsubmit`, avec écho, focus, `isConnected`, `lastChild` et retrait ;
  - `tv/app/surveillance-overlay.js:424-476` utilise `ownerDocument`, `createElement`,
    `firstChild` et `removeChild`. `surveillance-view.js:637-669` conduit le rendu des cartes ;
    `:596` ne lit les dimensions calculées que si un rectangle vidéo valide est fourni ;
  - `tests/tv-remote-navigation.test.cjs:21-38` prouve le démarrage non appairé, sans requête ni
    timer. Ses autres cas conduisent les vrais événements de navigation ; les conserver tous.
- ADR 0011 dans `docs/adr/` : scripts classiques chargés dans l'ordre de la page. Le ticket étend
  le banc existant selon cette décision ; aucun choix d'architecture produit ni nouvel ADR.

## Périmètre

- Étendre `tests/helpers/tv-page.cjs` : garder `loadTvPage()` sans argument et ses retours existants,
  et permettre un mode appairé recevant configuration fictive, transport `fetch` ou clients de test,
  réponses différées, stockage isolé et fonctions de temps et de minuteries. Le scénario de preuve
  utilise le vrai `TVLensRemoteClient` avec un faux `fetch`, sans serveur réel.
- Charger les scripts découverts dans les balises réelles, dans leur ordre, sans CommonJS ni
  réécriture de leur source. Continuer d'exclure le fichier privé `connection.js` et injecter
  `TVLENS_REMOTE` avant le chargement ; aucune lecture ni création d'identifiants réels.
- Fournir dans le contexte les API requises par les parcours conduits, notamment `URL` et
  `AbortController` pour les vrais clients, ainsi que le faux stockage `localStorage`.
- Enrichir le même document depuis `index.html`, avec les relations entre nœuds nécessaires :
  création, ajout, remplacement et retrait, attributs, `dataset`, `classList`, contenu texte,
  `ownerDocument`, connexion des nœuds, enfants et sélecteurs réellement utilisés par les vues.
  Conserver focus et clavier ; permettre saisie et événement de formulaire avec `preventDefault`,
  et exposer document, nœuds et commandes de page pour les trois tickets consommateurs.
- Prévoir les opérations des cartes de chat et de surveillance, du formulaire et de navigation,
  sans recopier le rendu produit. Les mesures de défilement et de visibilité utiles sont contrôlées
  par le test ; aucune prétention à simuler la mise en page complète d'un navigateur.
- Injecter `performance.now()`, `Date.now()`, `setTimeout`, `setInterval`, `clearTimeout` et
  `clearInterval` dans le contexte isolé. Aucun timer natif ni remplacement des globals du processus
  de test. T058 n'est pas un prérequis : ne pas créer une nouvelle horloge dans ce ticket ; les
  tests peuvent enregistrer et déclencher explicitement les callbacks injectés. T170/T171
  brancheront ensuite l'horloge commune de T058 sur cette interface.
- Fournir un nettoyage explicite qui annule toutes les minuteries détenues par le contexte et
  interdit leur réarmement après libération, y compris après une réponse différée. Le banc porte
  cette isolation ; ne pas ajouter ici l'API d'arrêt produit qui appartient à T170.
- Ajouter `tests/tv-paired-page.test.cjs`. Décrire dans ses données l'état serveur fourni aux vraies
  vues : session, conversation et jobs, frise, surveillance, stockage, transcription et temps serveur,
  selon les champs effectivement consommés. Maîtriser aussi `/capture` et `/panel` au démarrage.
- Ne modifier ni produit, ni harnais, ni plancher, ni politique de polling ou de capture. Ne supprimer
  aucun fichier, cas de test ou assertion. Aucune dépendance npm, installation, TV/VPS ou fournisseur.

## Critères d'acceptation

1. Au moins un cas de `tests/tv-paired-page.test.cjs` démarre la vraie page appairée depuis ses balises,
   avec les vrais clients et des réponses réseau contrôlées. Il vérifie les demandes `/capture`,
   `/panel` et d'état distant, puis une carte de job réellement créée dans `conversation`.
   `window.tvlensPanel.stats`, `kick` et `state` sont disponibles ; aucun état n'est injecté en
   remplaçant le rendu ou la réception du companion.
2. Un scénario du même fichier saisit une question et déclenche le vrai formulaire. Avant la réponse
   réseau différée, l'écho est visible et le focus est revenu sur Dicter. Le test constate l'appel
   `/v1/questions` avec le texte et la session attendus, puis résout la réponse et observe l'effet
   sur l'écho. Les assertions portent sur nœuds, focus et appels, jamais sur le texte des scripts.
3. Les cas de navigation non appairée passent avec leurs assertions inchangées, notamment zéro
   requête et zéro timer au démarrage. `loadTvPage()` conserve son usage existant et les deux modes
   utilisent le même document et le même chargeur de scripts.
4. Les commandes et nœuds exposés permettent à un test d'ouvrir la surveillance, de manipuler ses
   réglages et de rendre une carte sourcée avec les vrais modules. Un cas conduit l'état initial,
   puis une carte `kind: "verification"` de séquence supérieure, avec texte et URL de source valide,
   et le callback de tick ; il constate les nœuds de carte.
   Les appels ambient éventuellement présents restent des réponses simulées, sans retrait ici.
5. Après nettoyage, le registre des timers injectés est vide. Un second nettoyage et la résolution
   tardive d'une réponse ne réarment rien. Le test n'attend aucun délai réel et le stockage d'une
   page ne fuit pas vers la suivante.
6. `git diff --name-status` ne montre aucune suppression ; sous le produit et le harnais,
   `git diff --exit-code -- app core adapters runtime server mcp tv scripts .claude .codex .agents`
   rend 0. Commandes et sorties consignées au journal ; aucun cas ni assertion existant n'est retiré.
7. Les suites `tv-paired-page`, `tv-remote-navigation`, `tv-panel`, `tv-overlay-queue` et
   `tv-app-compat` passent en séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/tv-paired-page.test.cjs`, frontière : page réelle chargée dans le contexte VM commun de
`tests/helpers/tv-page.cjs`, réseau et temps injectés. Les tests prouvent carte, soumission et focus,
ainsi que la réutilisation du DOM pour la surveillance, sans substituer les vues ou lancer un navigateur.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse technique nommée — suffisance du DOM : la lecture établit les opérations manquantes,
pas l'exécution complète du parcours appairé. Les nouveaux tests doivent confirmer que leur ajout
au helper suffit ; toute API de DOM supplémentaire nécessaire est nommée au journal. Si la preuve
exige de modifier le produit ou d'installer une bibliothèque, arrêter avec ce besoin de recadrage.

Hypothèse nommée — coexistence avec ambient : T185 peut partir avant ou après T165/T166/T181/T182.
Le scénario ne suppose aucune suppression et fournit des réponses explicites aux appels locaux
encore présents, dont `/ambient` si utilisé. Il n'exige ni leur présence ni leur absence ; T182
ajoutera la preuve d'absence. Le banc ne dépend donc pas de la décision de retrait.

Hypothèse nommée — configuration et géométrie simulées : les valeurs privées de `connection.js`
et le rendu du moteur webOS ne sont pas établis. URL/jeton sont fictifs ; `/panel` peut répondre sans
rectangle vidéo. Cette preuve ne couvre ni dimensions physiques, ni superposition sur la vidéo,
ni état installé d'une TV. Aucune de ces inconnues ne demande une décision avant le démarrage.

## Journal

- Découpage le 15/10 contre `e92c6a6`, par lecture du helper, des scripts et des tests appelants.
  Aucun test ni scénario appairé exécuté ; les limites de preuve sont nommées ci-dessus.
