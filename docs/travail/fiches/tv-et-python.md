# Fiche de chantier — un companion TV et des scripts Python maintenables

Chemin cible dans le dépôt : `docs/travail/fiches/tv-et-python.md`. Lot d'audit L15, vague 2 (structure).
Constats : TV-01, TV-02, TV-03, TV-04, TV-06, TV-09, PY-01, PY-02, PY-03, PY-04, PY-05. Code lu à `0d5a954`.
Les emplacements citent le chemin, puis le nom, puis la ligne : la mise en forme Prettier (lot L03) déplacera
les lignes de `tv/app/*.js` ; elle ne touche pas les fichiers Python.

## 1. Contexte et contraintes propres au lot

- `tv/app` tourne sur un moteur ancien (plancher constaté autour de Chrome 103), en scripts classiques, sans
  module ni outil de construction. Chaque script est une IIFE ; une moitié « modèle » placée avant la garde
  CommonJS (`if (typeof module === "object" && module && module.exports)`) est chargée par les tests Node,
  la moitié « navigateur » placée après ne l'est jamais. `timeline-view.js` et `capture-control.js` se
  terminent par `})(window)` et ne se chargent pas sous Node.
- L'ordre de chargement est celui de `tv/app/index.html` (connection.js, remote-client.js,
  surveillance-overlay.js, surveillance-view.js, sessions-view.js, capture-control.js, timeline-view.js,
  companion.js). `connection.js` est le fichier d'appairage écrit sur l'appareil : il contient le jeton, il
  n'est pas suivi par Git, et aucun test ni outil de la boucle ne le lit (les smokes le filtrent déjà).
- La page ambiante (`ambient.html`) est empaquetée à part (`scripts/package-tv-ambient.mjs`, `SHARED` =
  `ambient.css`, `surveillance-overlay.js`, `icon.png`) et `tests/tv-app-compat.test.cjs` fixe ses scripts à
  `surveillance-overlay.js` et `ambient.js`. Ni l'un ni l'autre ne peut donc dépendre d'un nouveau script
  partagé.
- Rien de ce lot ne se vérifie sur la TV depuis la boucle : ni la TV, ni les smokes (`scripts/smoke-tv-*.mjs`,
  navigateur réel), ni les scripts `*:live`. La preuve passe par des tests Node (vm, faux document écrit à la
  main) et par les tests Python lancés par `node scripts/check.mjs`.
- Les scripts Python tournent avec le Python de la TV. `check` lance
  `python3 -B -m unittest discover -s tests -p test_*.py` en mode complet seulement (pas avec `--changed`) ;
  les tests de `prototypes/lg-remote/` ne sont pas découverts. Le cliquet ne mesure pas Python.

## 2. Forme cible

### Panneau TV (`tv/app`), du bas vers le haut

| Script | Responsabilité | Dépend de |
| --- | --- | --- |
| `text.js` (nouveau) | `finite`, `clock`, `plural` : mise en forme partagée par les vues du panneau | rien |
| `remote-client.js` | Transport seul. `RemoteClient` nomme chaque route `/v1` lue ou écrite par le panneau, miniature comprise, et passe tout par `send` ; un client du contrôleur local (port 8788 : `/capture`, `/panel`, `/ambient`) créé une fois et remis aux vues | rien |
| `focus.js` (nouveau) | `KEYS` (Retour 461, flèches, OK), `moveInRows(rows, active, key)` pure, et une pile de vues qui remplace l'ordre d'appel implicite de `companion.js` (dialogue, sessions, frise, surveillance, conversation) | rien |
| `dom.js` (nouveau) | `el`, `set`, `flag`, un `WindowedRail` paramétré (taille avant/après la sélection, `replaceChildren` ou ajout, suivi du dernier élément, restauration de la sélection) et l'état unique « clavier LG visible » | rien |
| vues : `surveillance-view.js`, `sessions-view.js`, `timeline-view.js`, `capture-control.js` | présentation et touches de leur vue | `text.js`, `dom.js`, `focus.js`, `remote-client.js` (instance reçue) |
| `companion.js` | composition : clients, vues, boucle d'interrogation, disposition ; ses modèles (`describeJob`, `PollPlan`, `mergeState`…) restent exportés sous les mêmes noms | tout ce qui précède |
| `surveillance-overlay.js`, `ambient.js` | page ambiante autonome : gardent leurs propres copies, alignées par des cas partagés | rien |

Sens des dépendances : une vue ne dépend jamais de `companion.js` ; un script partagé ne dépend d'aucune vue ;
aucun modèle ne touche au DOM. Choix d'une forme par duplication (arbitrage A8, sur le modèle de
`runtime/session-closing.cjs`) : un script par comportement partagé (`text.js`, `dom.js`, `focus.js`), pas un
fichier « utils ».

Règle de partage d'un script classique (à écrire dans un ADR avec la première extraction) : le script expose
`root.TVLensX` et, sous CommonJS, `module.exports` ; un consommateur le résout par
`typeof module === "object" && module && module.exports ? require("./x.js") : root.TVLensX` ;
`index.html` le charge avant son premier consommateur ; la page ambiante ne le charge jamais.

### Scripts Python (`tv/`)

| Module | Responsabilité |
| --- | --- |
| `controller.py` | Serveur HTTP local à liste fermée de routes. Un seul lancement et un seul arrêt d'enfant (`spawn`, `stop_child`) pour la capture, le superviseur ambiant et la reprise ; `PanelLayout` (état et demande de disposition du panneau, racine injectable) ; attentes de `page_ack` et `page_wait` sur une horloge injectée. Survit à un module `ambient` absent ou cassé |
| un module de noms de fichiers d'exécution (nom à décider) | Une seule déclaration des fichiers échangés (`/tmp/tvlens-*`), lue par `ambient.py`, `controller.py`, `capture.py` et le relais du prototype ; n'importe rien d'autre, pour que le contrôleur survive sans `ambient` |
| `capture.py` | `run()` découpé en étapes nommées (arguments, ouverture, boucle de morceaux, politique d'abandon pure qui rend une cause, envoi) ; rapport muté sous un seul verrou ; un seul appel Luna, celui de `luna.py` |
| `ambient.py` | Reste le point d'entrée (vérifié par `owned_supervisor` sur la ligne de commande, lancé par chemin par `controller.py`). Le `Supervisor` (33 méthodes, 18 paramètres) est découpé plus tard en modules aux noms distincts, jamais en paquet `ambient/` qui masquerait `ambient.py` |

## 3. Séquence étendre → migrer → contracter

Chaque étape laisse le dépôt vert. « Ticket » : écrite dans ce lot. « Plus tard » : découpée en tickets quand
son déclencheur est atteint.

| # | Étape | Nature | Déclencheur du découpage | Constats |
| --- | --- | --- | --- | --- |
| 1 | Harnais de page sans navigateur et caractérisation du parcours à la télécommande de la colonne de conversation, panneau non appairé (`tests/helpers/tv-page.cjs`, `tests/tv-remote-navigation.test.cjs`) | ticket T130 | — | TV-01, TV-02 |
| 2 | Miniature passée par `send` ; routes `/v1` écrites à la main nommées dans `RemoteClient` | ticket T131 | — | TV-06 |
| 3 | `text.js` + ADR du partage de script classique ; migration de `companion.js`, `surveillance-view.js`, `sessions-view.js`, `timeline-view.js` ; suppression de leurs copies | ticket T132 | — | TV-04, TV-03 |
| 4 | `controller.py` : un seul lancement et arrêt d'enfant, `PanelLayout` à racine injectable | ticket T133 | — | PY-03 |
| 5 | Harnais étendu au panneau appairé : faux `fetch` répondant `/v1/state`, horloge et minuteries simulées de `tests/helpers/clock.cjs` (lot L05). Caractériser la priorité des vues, le parcours par rangées de la surveillance (`View.prototype.handleKey`, `rows()`), la liste des sessions, la frise, et le fenêtrage des trois listes | plus tard | T130 intégré et lot L05 intégré | TV-02, TV-03 |
| 6 | `focus.js` : étendre (`KEYS`, `moveInRows` testée seule), migrer la surveillance puis la colonne de conversation (table de rangées), puis sessions et frise ; contracter (parcours en ligne supprimés) ; la pile de vues remplace l'ordre d'appel de `companion.js` | plus tard | étape 5 | TV-02, TV-01 |
| 7 | `dom.js` : `el`/`set`/`flag`, puis `WindowedRail` paramétré par les écarts relevés (−2/+4 contre −3/+5, `replaceChildren` contre ajout, suivi et sélection de la frise), puis un seul suivi du clavier visible | plus tard | étape 5 (le fenêtrage doit être caractérisé avant) | TV-03 |
| 8 | Client du contrôleur local : nommer `/capture`, `/panel`, `/ambient` ; une instance créée par `companion.js` et remise à `capture-control.js` ; éventuel recul progressif de l'interrogation de capture (aujourd'hui 1 s fixe) | plus tard | T131 et étape 5 ; décision D5 pour le recul | TV-06 |
| 9 | Constantes : 8788, `DISPLAY_CHOICES` (8/14/20 s), durée de vie de page (`LIFE_MAX_MS` 21500 contre `PAGE_LIFE` 21.5), bornes de texte. Nommées une fois par côté ; accord entre JS et Python par un fichier de cas partagé (modèle : `tests/fixtures/tv-overlay-queue-cases.json`), jamais par une expression lue dans les sources | plus tard | T132 (forme de partage) et étape 10 pour le côté Python | TV-09 |
| 10 | Noms de fichiers d'exécution déclarés une fois (Python), avec des cas partagés qui incluent les anciennes formes de fichiers écrites par des composants plus anciens | plus tard | T133 et décision D3 | PY-05 |
| 11 | `capture.py` : caractériser `run()` avec les faux de `tests/tv_fakes`, extraire la politique d'abandon pure, un seul verrou sur le rapport, `luna()` remplacé par `luna.call` | plus tard | décision D4 ; vérification que `luna.parse_reply` accepte les réponses `getStatus` | PY-01 |
| 12 | Sorties des enfants et cause perdue d'une capture qui échoue avant son premier `save()` | plus tard | décision D2 (et D6 si le harnais change) | PY-04 |
| 13 | Découpage du `Supervisor` d'`ambient.py` | plus tard | étape 10 intégrée ; P3 | PY-02 |
| 14 | Découpage de la fermeture de `companion.js` (≈ 900 lignes) en vue de conversation, boucle d'interrogation, disposition, réglages | plus tard | étapes 6, 7 et 8 intégrées | TV-01 |
| 15 | Horloge d'attente injectée dans `page_ack` et `page_wait` (distincte de l'horloge simulée des tests) | plus tard | décision D7 | PY-03 |

## 4. Invariants à préserver

1. Aucun texte affiché ne change, sauf écart nommé dans un ticket (arbitrage A6 : les phrases restent où elles
   sont écrites).
2. Contrat `/v1` : rien de modifié côté serveur ; un client TV déjà installé continue de fonctionner (A7).
   Les codes d'erreur (`storage-full`, `read-only`, `stopped`, `capturing`) ne sont pas renommés (A5).
3. Liste des exports de `companion.js` fixée par `tests/chat-error-ui.test.cjs` (ligne 18 à `0d5a954`) :
   inchangée tant qu'aucun ticket ne la change explicitement. `tests/tv-panel.test.cjs`,
   `tests/mac-ui.test.cjs` et `scripts/bench-perceived.cjs` chargent `companion.js` pour ses modèles.
4. Les smokes lisent `window.tvlensPanel.stats` et `window.tvlensTimeline` : ces noms restent.
5. `tv/app` reste en scripts classiques sous le plancher de `tests/tv-app-compat.test.cjs` ; la page ambiante
   ne charge que `surveillance-overlay.js` et `ambient.js`.
6. Les formats d'horloge Mac (« 01:01 ») et TV (« 1:01 ») diffèrent volontairement ; la vérification croisée
   de `tests/mac-ui.test.cjs` (test qui compare le sens des libellés, ligne 69) reste telle quelle.
7. `controller.py` : liste fermée de routes ; survit à l'échec de `import ambient` (routes ambiantes en 404) ;
   ne contient ni `GateWriter` ni appel Luna (garde de `tests/test_tv_ambient.py`, test
   `test_controller_asks_for_a_recovery_when_its_child_is_gone_and_the_gate_is_not_clear`) ; les tests
   remplacent `controller.Path`, `controller.subprocess.Popen` et `controller.sys.executable` par leur nom.
8. `ambient.py` reste le point d'entrée lancé par chemin ; les tests remplacent des noms du module `ambient`
   (`patch.object(ambient, ...)`).
9. Aucun test n'écrit dans le vrai `/tmp` ni ne lit `tv/app/connection.js`.

## 5. Tests qui protègent chaque étape

| Étape | Existants | Manquants (à écrire d'abord) |
| --- | --- | --- |
| 1 | aucun test du gestionnaire de touches ; smokes hors boucle | tout : c'est l'étape |
| 2 | `tests/tv-panel.test.cjs`, test `the transport revalidates with If-None-Match, keeps the body on 304 and never sends a tag it was not given` (ligne 188) ; garde `tests/tv-app-compat.test.cjs` | miniature (en-têtes, délai, refus, échec réseau) et méthodes nommées, par un faux `fetch` |
| 3 | tests des modèles qui passent par `clock` et `plural` (`tv-panel`, `chat-error-ui`, `mac-ui`) ; `tv-app-compat` découvre tout nouveau script ; le harnais de l'étape 1 prouve l'ordre de chargement | cas de `text.js` (non fini, négatif, heures, pluriel sans forme plurielle) |
| 4 | `tests/test_tv_control.py` (9 tests) ; `tests/test_tv_ambient.py` (55 tests, dont la reprise et les routes ambiantes) | arrêt forcé d'un enfant qui ignore SIGTERM ; arguments de lancement ; `PanelLayout` à racine temporaire |
| 5–7 | étape 1 | priorité des vues, rangées, fenêtrage des trois listes, clavier visible |
| 8 | étape 2 | client du contrôleur, instance unique |
| 9 | `tests/tv-overlay-queue.test.cjs` (cas partagés) | cas partagés de constantes JS/Python |
| 10 | `test_tv_ambient.py` | lecture des anciennes formes de fichiers |
| 11 | `tests/test_tv_capture_gate.py` (20 tests) ; `tests/tv-panel.test.cjs` lit `capture.py` et `transport.py` par expression (lignes 540-543) | caractérisation de `run()` ; remplacement de la lecture de source par un fichier de causes partagé (décision D4) |
| 12–15 | tests Python existants | selon décision |

## 6. Risques

- Harnais de page : un faux document trop riche devient une seconde implémentation du DOM. Le limiter à ce que
  lit le code chargé (identifiants de `index.html`, focus, quatre sélecteurs) ; ne pas étendre
  `tests/helpers/fake-dom.cjs` du lot L05, qui exclut les sélecteurs par conception.
- Miniature par `send` : ajoute `Content-Type` à une lecture et remplace `AbortSignal.timeout` par
  `AbortController` + `setTimeout`. Le serveur autorise ce champ en prévol pour toutes les routes
  (`server/http.cjs`, branche `OPTIONS`) et `state()` l'envoie déjà sur ses lectures. Le commentaire de plancher
  de `tests/tv-app-compat.test.cjs` cite `AbortSignal.timeout` : il doit rester vrai.
- Script partagé : double résolution (navigateur ou `require`) et ordre de chargement ; une page ambiante qui le
  chargerait casserait l'empaquetage autonome.
- Horloge de la frise : aujourd'hui sans garde pour une valeur non finie ; l'unification change seulement ce cas.
- Contrôleur : résoudre les chemins de `PanelLayout` à la construction rendrait inopérant le remplacement de
  `controller.Path` dans `test_concurrent_layout_requests_publish_complete_authenticated_messages` et ferait
  écrire ce test dans le vrai `/tmp`.
- `page_ack` sur `self.clock` changerait la sémantique : les tests passent une horloge simulée
  (`tests/test_tv_ambient.py`, autour des lignes 233 et 954) tout en attendant en temps réel.
- Lecteur de fichiers plus strict (étape 10) : rejet de fichiers écrits par des composants plus anciens.
- Journal des enfants (étape 12) : croissance sans borne dans `/tmp` ou fuite du nonce de la page ambiante.
- Rien n'est vérifiable sur la TV réelle depuis la boucle.

## 7. Décisions du propriétaire

- D1 — Forme de partage des scripts classiques (`text.js`, puis `dom.js`, `focus.js`) : à consigner dans un ADR
  au premier ticket qui l'introduit (T132). Pas de décision bloquante : la forme suit la garde CommonJS déjà
  en place.
- D2 — Où va la cause d'une capture qui échoue avant son premier rapport (rapport du contrôleur, journal
  borné, ou rien), sachant qu'un message interne ne part pas vers un client ; borne et contenu d'un éventuel
  journal des enfants (pas de nonce).
- D3 — Nom et place du module des fichiers d'exécution, et déploiement du relais de
  `prototypes/lg-remote/runtime/` (copié avec `tv/` ou à part).
- D4 — Remplacer la lecture de `capture.py`/`transport.py` par expression (`tests/tv-panel.test.cjs`) par un
  fichier de causes partagé, joué en Python (toute cause produite y figure) et en JS (toute cause a ses mots).
- D5 — Recul progressif de l'interrogation de capture quand le contrôleur ne répond pas.
- D6 — Lancer les tests Python avec `check --changed` et découvrir ceux de `prototypes/lg-remote/` : modification
  du harnais (`harnais: oui`).
- D7 — Horloge d'attente injectée dans `page_ack`/`page_wait`, distincte de l'horloge des marques.
- D8 — Pas d'unification Mac/TV des libellés : les formats diffèrent par choix ; le confirmer ou non.
