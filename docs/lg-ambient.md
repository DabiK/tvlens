# LG : retrait des alertes panneau fermé

**État du dépôt au 16 octobre 2026 : le retrait de l’affichage ambient panneau fermé est achevé.**
La décision écrite du propriétaire abandonne l’affichage panneau fermé. Les cartes sourcées,
la file, l’activité et les vues du panneau ouvert restent disponibles, ainsi que la surveillance serveur.
La décision complète figure dans l’[ADR 0017](adr/0017-retrait-de-l-affichage-ambient-panneau-ferme.md).
Ce retrait du dépôt ne décrit aucune installation, désinstallation ni opération sur une TV ou un VPS ;
l’état d’une TV installée n’a pas été vérifié dans cette session.

Les fichiers `tv/app/ambient.html`, `ambient.js`, `ambient.css` et `appinfo.ambient.json`, ainsi que
`scripts/package-tv-ambient.mjs`, `scripts/smoke-tv-ambient.mjs`, `scripts/simulate-tv-ambient.mjs`
et `scripts/probe-tv-ambient-capture.mjs`, ne sont plus disponibles. Les anciennes commandes qui les
mentionnent ci-dessous sont des traces datées, plus des instructions applicables à cet arbre.
L’empaqueteur générique `prototypes/lg-sidebar/package.py` et `scripts/smoke-tv-overlay.mjs` restent.

Les quatre étapes prévues par l’ADR sont réalisées dans cet arbre :

| Étape | État et périmètre |
| --- | --- |
| T165, page et outils | Retirés dans cet arbre, avec les huit cas JavaScript exclusivement dédiés |
| T166, superviseur et relais | Retirés : superviseur, routes locales `/ambient/*`, relais des touches et coordination native ambient |
| T181, gate de capture | Retirés : lecture du gate, recadrage d’occultation, métadonnées et primitives résiduelles |
| T182, intégrations de page et documents | Retirés : appels locaux, déclarations `seen` au contrôleur, réglages d’état fermé, `parseAmbientParams` et compteurs de gate |

Le panneau ouvert garde ses réglages locaux `alerts` et `displayMs` (8, 14 ou 20 secondes),
son compteur de cartes vues, son activité et le démarrage/arrêt de la surveillance serveur.
Le banc `tests/tv-paired-page.test.cjs` charge ses vrais scripts et observe ces actions et les cartes
sourcées sans appel `/ambient`, avec réseau, document et temps contrôlés.

`tv/app/surveillance-overlay.js` reste utilisé par le panneau ouvert. Ses modèles, sa file et ses
rendus ne disparaissent pas. `/v1/surveillance/overlay`, sa projection runtime, ses champs et ses ETags
restent aussi : leur retrait attend un cadrage distinct, sans présumer l’absence d’autres consommateurs.

Le reste de cette page conserve l’historique du 13 octobre et le protocole natif alors proposé.
**Ce protocole est abandonné avec la capacité ; il n’a pas été exécuté.** Les simulations et tests datés
ne deviennent pas des validations matérielles. Les mentions d’installation ci-dessous sont des faits
rapportés à cette date, sans nouvelle vérification ni déploiement annoncé par ce retrait.

---

# Historique au 13 octobre 2026 : alertes panneau fermé

**État au 13 octobre 2026 : code, simulation et tests livrés ; validation native non exécutée ; profil livré `off`.**
Avec ce profil, rien ne s’affiche panneau fermé sur la TV et rien ne change à la télécommande. Le besoin « résultats sourcés en bas à gauche sans ouvrir le panneau » n’est donc **pas rendu sur la TV** aujourd’hui : le ticket 07 reste incomplet tant que le protocole de ce document n’a pas été exécuté. Rien ici n’a été « validé sur la TV ».

Trois niveaux de preuve, à ne jamais mélanger :

| Niveau | État | Détail |
| --- | --- | --- |
| Simulation et tests | exécutés | faux Luna, fausse boucle d’entrée, horloge et dossier d’exécution injectés : voir « Tests » |
| Navigateur, copie temporaire | exécuté (Chrome de bureau) | la page `tv/app/ambient.html`, la sonde, le panneau et le bout en bout simulé (vrai contrôleur, vrai superviseur, faux Luna) : voir « Tests ». Un Chrome de bureau n’a ni le compositeur ni la télécommande de la TV |
| Natif sur la TV | **protocole de validation non exécuté** | le code a été installé sur la TV le 13 octobre 2026 au matin par la supervision et l’application ambiante y est enregistrée, profil `off` ; aucune phase du protocole ci-dessous n’a été passée, rien ne s’affiche panneau fermé |

## Ce que fait le mode ambiant

La surveillance tourne sur le serveur. Sur la TV, un processus root enfant du contrôleur local (`tv/ambient.py`) lit `GET /v1/surveillance/overlay`, décide quand afficher, et lance une application minuscule (`org.tvlens.ambient`, lot application) qui dessine une carte reçue en paramètres puis se ferme. Seules les **cartes de vérification sourcées** (`overlay.cards`) sont candidates. Les signalements (`signals`) ne sont jamais affichés : ils ne sont que comptés (`signalsInPanel`) pour que le panneau les annonce. Il n’existe ni réglage ni route « signalements à l’écran ».

Le mode ambiant ne modifie jamais la géométrie vidéo, ne lance jamais l’application du panneau, et ne démarre jamais de capture. Rakuten ouvre toujours le panneau.

| Fichier | Rôle |
| --- | --- |
| `tv/ambient.py` | superviseur : file des cartes, porte d’affichage (écrivain unique sous verrou noyau), accord de peinture, lancement et fermeture, chien de garde, reprise |
| `tv/luna.py` | appels Luna (bloquant et non bloquant), exécutable injectable |
| `tv/controller.py` | enfant `ambient.py`, réglages, routes `/ambient/*` ; ne parle jamais à Luna, n’écrit jamais la porte |
| `tv/capture.py`, `tv/transport.py` | lecture de la porte avant et après chaque image, recadrage déclaré, bornes de durée, causes de fin |
| `prototypes/lg-remote/runtime/ambient_relay.py` | relais des touches, appelé par la boucle du mapper |
| `prototypes/lg-remote/runtime/managed_mapper.py`, `tvlens_mapper.py` | crochet de la boucle ; installé seulement en profil expérimental |
| `prototypes/lg-remote/runtime/panel.py` | exclusion d’écran avec la carte (`ambient_yield`), rectangle vidéo publié |

## Les trois profils (`ambient.json`)

`ambient.json` est facultatif, root `0600`, à côté de `connection.json`. Absent, illisible ou inconnu, tout retombe sur le défaut livré :

```json
{"focus":"off","fallback":"off","app":"org.tvlens.ambient","settleMs":700,"closeVia":"surface",
 "relay":{"exempt":[]},"trial":false,"mapperStatus":"/tmp/tvlens-remote-state/status.json"}
```

| Profil | Statut | Superviseur | Mapper | Écran |
| --- | --- | --- | --- | --- |
| `off` | **livré** | lit le serveur toutes les 10 s, tient les curseurs, compte les résultats non montrés (`notShown`), publie l’état `profile-off`. Aucun appel Luna, aucune porte fermée, aucun verrou d’écran, aucun chien de garde. Seule écriture possible : au démarrage, la reprise d’une porte restée fermée | crochet **non installé** : la boucle d’entrée est celle d’avant, octet pour octet | rien |
| `relay` | expérimental | cycle complet | crochet installé : la première touche annonce, ferme la carte, vérifie, puis part | cartes transitoires, pastille brève (4 s, une toutes les 90 s au plus) |
| `passthrough` | expérimental | cycle complet ; retombe pour de bon en `relay` si la page reçoit une touche | crochet installé : seul Retour ferme | cartes, pastille tant qu’une vérification court |

`focus:"relay"`, `focus:"passthrough"` et `fallback:"toast"` ne s’écrivent qu’après le protocole natif, par décision explicite, et demandent un redémarrage du mapper pour installer le crochet. `trial:true` : aucune lecture du serveur distant, aucune sortie spontanée, seule la carte d’essai existe. `probe` n’est transmis à la page qu’en mode d’essai.

`fallback:"toast"` (inactif par défaut) : quand la carte n’est pas disponible, un toast système « TV Lens · résultat sourcé disponible · Rakuten », un par minute au plus, sans le texte du résultat. Sa position n’est pas maîtrisée : il ne satisfait pas « en bas à gauche ».

## Réglages du spectateur

Fichier `ambient-settings.json` à côté de `connection.json`, écrit par le contrôleur, relu par le superviseur à chaque tour.

| Réglage | Valeurs | Défaut |
| --- | --- | --- |
| `alerts` | alertes à l’écran ; coupées, la surveillance continue et les résultats sont comptés | `true` |
| `displayMs` | 8000, 14000, 20000 ; plafond dur de 20 s même si le fichier est corrompu | 14000 |
| `activity` | pastille d’activité | `true` |
| `position` | `raised` (carte en `x 48, y 628, 760×272`) ou `low` (`y 768`) | `raised` |

File de quatre cartes, fraîcheur de 180 s (horloge du serveur), 1,5 s entre deux cartes, première lecture d’une session jamais rejouée : mêmes règles que le panneau ouvert, partagées par `tests/fixtures/tv-overlay-queue-cases.json`.

**Registre restauré.** Quand la surveillance est activée sur une session dont le dossier porte déjà un registre, le serveur le relit : pendant cette lecture (`activity.state: "restoring"`, `registry.ready: false` dans l’état du panneau) ses séquences ne sont pas définitives, puis `overlay.seq` passe d’un coup de 0 à N. Les deux files (panneau ouvert, superviseur) ne prennent rien pendant la lecture et replacent leur curseur sur la première réponse qui suit : l’historique restauré n’est ni affiché ni compté comme nouveauté (cas partagé `restored-history-is-not-news`). Côté superviseur, une carte qui attendait encore dans la même session est comptée `notShown` avant d’être retirée. Le compteur de l’en-tête du panneau suit la même règle.

## Routes du contrôleur local (`127.0.0.1:8788`)

Liste fermée ; tout autre chemin répond 404 `{}`. Sauf mention, jeton `Authorization: Bearer`.

| Route | Réponse |
| --- | --- |
| `GET /ambient` | `{supported, active, stopping, exitCode, settings:{alerts, displayMs, activity, position}, state}` |
| `POST /ambient/start`, `/ambient/stop` | même forme, idempotent. `start` ne démarre jamais une capture et n’appelle jamais le serveur |
| `POST /ambient/alerts/on\|off`, `/ambient/activity/on\|off`, `/ambient/display/8\|14\|20`, `/ambient/position/raised\|low` | même forme |
| `POST /ambient/seen/<sessionId>/overlay/<n>`, `/ambient/seen/<sessionId>/signals/<n>` | `{}` : le panneau a montré lui-même les cartes de **cette session** jusqu’à `n` (1 à 9 chiffres) ; elles ne seront ni rejouées ni comptées. Le second ne sert qu’au compteur `signalsInPanel`. `sessionId` est l’identifiant du serveur (`randomUUID()`, 36 caractères hexadécimaux minuscules et tirets) : toute autre forme répond 404 |
| `POST /ambient/seen/overlay/<n>`, `/ambient/seen/signals/<n>` | `{}`, **sans effet** : forme d’un panneau antérieur, encore acceptée. Sans session, rien n’est écrit et aucun curseur ne bouge |
| `POST /ambient/test` | `{queued:true}` ; en profil livré `{queued:false, reason:"profile-off"}` |
| `POST /ambient/ack/<nonce>` | **sans jeton**. Demande d’accord de peinture : 200 seulement quand le superviseur a écrit `shown` pour ce `nonce` (1,2 s au plus), sinon 404 |
| `GET /ambient/wait/<nonce>` | **sans jeton**. Tenu 20 s : `{close:true}` dès que la porte n’est plus `shown` ou qu’un avis existe, sinon `{close:false}` |
| `POST /ambient/key/<nonce>` | **sans jeton**. La page a reçu une touche |
| `GET /panel` (existant) | ajoute `video:{x,y,width,height}` quand le panneau est actif : le rectangle logique que l’application doit laisser libre |

Le `nonce` (32 hexadécimaux minuscules) est comparé à temps constant à celui que le superviseur a produit ; il ne devient jamais un chemin ni un argument. `/ambient/signals/*` n’existe pas.

**Déclarations du panneau et sessions.** La numérotation des cartes repart de zéro à chaque session : un numéro seul ne dit rien. La déclaration porte donc la session dont le panneau a montré la carte, et le contrôleur la range sous cette session (`tvlens-ambient-seen.json` : `{v:2, sessions:{"<sessionId>":{overlay, signals, atMono:{overlay, signals}}}}`, les quatre dernières sessions, pour chacune la **dernière** déclaration et son heure, jamais un maximum). Le superviseur n’écoute que la session qu’il lit :

- une déclaration d’une **autre session** (réponse tardive d’un panneau resté sur la précédente), **sans session**, ou d’un fichier de l’ancienne forme, est ignorée : aucun curseur ne bouge, aucune carte n’est écartée ; elle n’efface pas non plus ce que la session en cours a déclaré ;
- dans la session lue, une déclaration en avance sur lui attend que le serveur ait publié jusque-là ; le curseur ne dépasse jamais la numérotation du serveur, et un numéro plus bas ne le fait pas reculer ;
- une déclaration **ancienne** de la même session (antérieure au moment où le superviseur a placé son curseur, ou restée en deçà d’une lecture du serveur demandée après elle : registre reparti de zéro sous le même identifiant) est écartée.

Dans le doute une carte est comptée (`notShown`) plutôt qu’omise en silence : en profil `off`, aucun résultat non montré ne manque au compteur. L’inverse reste possible (une carte comptée alors que le panneau l’a montrée) : voir I20, et I21 pour le cas d’une numérotation repartie de zéro.

L’état (`state`, fichier `tvlens-ambient-state.json`) porte `status` (`idle`, `arming`, `showing`, `paused`, `disabled`, `stopped`), `reason`, `message` (phrase en français prête à afficher), `focus`, `configured`, `mode` (`card`, `toast`, `off`), `counts`, `cursor`, `queue`, `probation`, `sticky`, `focusViolation`, `signalsInPanel` et `capture:{active, gated, stopReason, stopMessage, overlay:{cropped, withheld}, gateStale, limits}`.

Pauses (levées seules) : `panel`, `not-fullscreen`, `foreign-app`, `media-transition`, `recent-key`, `key-held`, `capture-not-gated`, `server-unreachable`. Serveur antérieur à la route (404) : `server-unsupported`, tant qu’il ne la publie pas ; la carte d’essai et les avis locaux n’en dépendent pas. Désactivations **transitoires**, en probation bornée (nouvel essai après 30 s, 120 s, 600 s, puis collant) : `app-missing`, `launch-unconfirmed`, `no-relay`, `panel-outdated`. Anomalies **collantes** jusqu’à un arrêt puis un démarrage explicites : `relay-failed`, `key-lost-at-launch`, `relay-lossy`, `stuck-window`, `clock-unshared`.

## Sûreté des touches (profils expérimentaux)

- Une seule transmission : le crochet n’écrit jamais sur le périphérique de sortie. Il rend la main (la boucle transmet l’évènement tel quel, une fois) ou avale. Aucune touche n’est doublée, aucun évènement transmis n’est relu.
- L’avis d’intention est écrit **avant** toute fermeture ; l’état des touches est publié avant la lecture de la porte, et le superviseur écrit la porte avant de relire les touches. L’accord de peinture est refusé dès qu’une touche a été vue depuis l’armement, qu’un avis existe ou que le panneau s’annonce.
- Blocage borné : 2,5 s avec le délai de garde par défaut (700 ms). Pour les seuls délais de garde plus longs du balayage natif, le budget suit `settleMs + 1,8 s`, plafonné à 4,8 s.
- Un échec de fermeture ne retient jamais la touche ; il est déclaré (`failed`) et désactive l’affichage. Toute exception du crochet est avalée et rend la touche.
- Retour ferme toujours. Sur une **carte** en profil `relay`, il est consommé (seule touche non transmise, par décision). Il n’est **jamais avalé** en `passthrough` ni pour une **pastille**.
- Volume, muet, accueil, Rakuten, signal 1198 : comme toute touche (annonce, fermeture, vérification, une transmission). Alimentation : annoncée, fermeture lancée sans attente, transmise aussitôt.
- Le code 1198 est traité comme une hypothèse : ce qu’il signifie sur cette TV, et par quel périphérique passent le mouvement et le clic du pointeur, n’est pas établi. **Aucune garantie n’est écrite pour le pointeur** (limite I10).
- La file du noyau est bornée : une perte pendant un blocage est comptée (`synDropped`) et désactive l’affichage (`relay-lossy`). Le relais ne promet pas « aucune touche perdue par le noyau », il promet que toute perte est déclarée. Après une telle perte plus aucune touche n’est tenue pour « avalée » ni « tout juste appuyée » : un Retour pressé ensuite, sans carte à l’écran, part vers la vidéo ; et un nouvel appui n’est jamais retenu au titre d’un appui précédent dont le relâchement ne serait pas arrivé.
- La page, de son côté (`tv/app/ambient.js`) : si `window.close()` est lent ou sans effet, elle reste vide et **aucune protection n’est désarmée**. Chaque touche (signalée une seule fois au contrôleur), chaque relance (`webOSLaunch`, `webOSRelaunch`) et l’échéance de la carte redemandent une fermeture **bornée** : un appel immédiat, trois autres à 0,5 s d’intervalle, puis plus rien jusqu’à l’évènement suivant. Une page en fermeture ne repeint jamais ; relancée pour la carte suivante, elle ne demande aucun accord, et le superviseur ferme la fenêtre par son identifiant (lancement « non confirmé »).
- Rakuten ouvre toujours le panneau, et le garde ouvert : un verrou d’écran qui ne s’ouvre pas (dossier d’exécution absent) n’empêche ni l’ouverture ni les tours suivants de la boucle du lanceur.

## Capture : le texte d’une carte n’entre jamais dans une image analysée

La **porte d’affichage** (`tvlens-ambient-gate.json`) n’a qu’un écrivain : le détenteur du verrou `tvlens-ambient.lock`. Elle est fermée (`armed`) avant tout lancement, passe à `shown` quand le superviseur accorde la peinture, à `closing` dès qu’il décide de fermer, et n’est rouverte (`clear`) qu’après `closeByAppId`, deux lectures d’absence consécutives, 0,5 s de garde, et l’échéance de sûreté d’un lancement dont personne n’a vu la fenêtre. Le chien de garde n’écrit la porte que s’il obtient ce verrou, donc seulement si le superviseur est mort ; superviseur vivant mais muet, il ferme la fenêtre et laisse la porte fermée. Il n’est lancé qu’une fois la génération et un premier battement écrits : il sortirait aussitôt s’il lisait une autre génération que la sienne.

`capture.py` lit la porte juste avant et juste après chaque prise :

| Lecture | Image |
| --- | --- |
| fichier absent, ou `clear` deux fois avec le même `epoch` | entière, comme avant |
| fermée à l’une des deux lectures, rectangle connu | recadrée au-dessus de la carte ; **toutes les images du bloc prennent la même taille** |
| zone gardée inférieure à 320×180, porte sans rectangle (toast), fichier illisible, `clear` avec deux `epoch` différents | retenue : jamais lue, jamais envoyée |

Déclaration au serveur, additive, absente quand rien n’est coupé : `frames[i].overlay:"cropped"` sur chaque image réduite, et sur le bloc `overlay:{cropped, withheld}`. Une image retenue n’invalide pas son bloc : les autres images et le son partent. Un bloc sans aucune image est abandonné avec la cause `overlayVisible`. Le rapport porte `gate`, `gatePath`, `gateStale`, `framesCropped`, `framesWithheld`, `withheldReasons`. Une porte restée fermée plus de 30 s continue de recadrer (`gateStale`) : la capture ne décide jamais seule qu’une carte a disparu. Sans fichier de porte, la capture envoie exactement ce qu’elle envoyait avant.

Un superviseur refuse d’afficher tant qu’une capture en cours n’annonce pas `gate:1`, son `pid` et la même porte que la sienne (`capture-not-gated`). Le repli `toast` est soumis au même contrôle : aucun toast TV Lens pendant une capture qui ne lit pas cette porte.

Ce que la règle ne couvre pas : les interfaces système (volume, clavier LG, notifications d’autres applications) entrent dans les images comme avant. `"captureMethod":"VIDEO"` dans `connection.json` est un levier à valider, pas le défaut.

## Durée et fin de capture

| Règle | Détail |
| --- | --- |
| Plafond | 6 h (`--seconds 21600`), garde `8..21600` |
| Inactivité | arrêt après 10 minutes sans une seule image YouTube (`--idle-seconds 600`, `0` pour couper) |
| Cause de fin | `stopReason` : `duration`, `idle`, `stopped`, `parent`, `session-changed`, `storage-full`, `read-only`, `error` ; `stopMessage` en français ; `limits:{seconds, idleSeconds}`. Toute fin a sa cause, y compris un arrêt demandé pendant la requête de démarrage de session (jusqu’à 5 s) : `stopped`, `connection:"stopped"`, sortie propre |
| Blocs abandonnés | comptés par cause dans `dropReasons` (`foreignApp`, `captureFailed`, `geometryChanged`, `noFrames`, `audioFailed`, `tooLong`, `queueOverflow`, `sessionChanged`, `deliveryExpired`, `deliveryRejected`, `deliveryError`, `storageFull`, `readOnly`, `lunaFailed`, `overlayVisible`, `stopped`, `leftAtStop`) ; le panneau les dit en français à côté du total |
| 507 du serveur | arrêt propre, cause « stockage plein », jamais « réseau coupé » : aucune nouvelle tentative, `connection:"storage-full"` |
| 409 au démarrage | archive ouverte en lecture seule : refus explicite, `connection:"read-only"`, aucun bloc envoyé |
| Luna muet | le bloc est perdu et compté (`lunaFailed`) ; cinq blocs de suite arrêtent la capture sur une erreur |
| Reprise | toujours manuelle. Rien ne relance une capture ni ne réactive une archive |

La fin de capture est publiée dans `GET /capture` et dans `GET /ambient` (`capture.stopReason`). En profils `relay` et `passthrough`, un avis s’affiche une fois : « Capture arrêtée : la surveillance ne reçoit plus rien. Rakuten pour la relancer. » En profil `off` cette annonce n’existe pas.

## Tests (simulation et navigateur, exécutés)

```
python3 -m unittest tests/test_tv_control.py tests/test_tv_ambient.py tests/test_tv_capture_gate.py
python3 prototypes/lg-remote/test_panel.py
python3 prototypes/lg-remote/test_ambient_relay.py
python3 prototypes/lg-remote/test_control.py
TVLENS_SLOW=1 python3 -m unittest tests/test_tv_capture_gate.py   # même scénario au rythme réel, environ 35 s
node --test tests/tv-ambient-params.test.cjs tests/tv-app-compat.test.cjs tests/tv-overlay-queue.test.cjs tests/tv-panel.test.cjs tests/chat-error-ui.test.cjs
node scripts/smoke-tv-ambient.mjs        # page ambiante et sonde, Chrome de bureau, copie temporaire sans connection.js
node scripts/smoke-tv-overlay.mjs        # panneau : carte bas-gauche, surveillance, sessions, sondage
node scripts/smoke-lg-ui.mjs
node scripts/smoke-tv-timeline.mjs
node scripts/simulate-tv-ambient.mjs --only off,relay   # vrai contrôleur et vrai superviseur locaux, faux Luna, port éphémère
```

Résultat du 13 octobre 2026, sur un Mac, chaque commande lancée une fois sur l’arbre final :

| Niveau | Commande | Résultat |
| --- | --- | --- |
| Simulation et tests | trois fichiers Python de `tests/` (Python 3.14) | 83 tests, aucun échec, un sauté (le scénario au rythme réel, non relancé) : contrôle 9, ambiant 55, capture 19 |
| Simulation et tests | `prototypes/lg-remote` | lanceur du panneau 15, relais et boucle d’entrée 17, démarrage du mapper 1 ; aucun échec |
| Simulation et tests | cinq fichiers Node | 60 tests, aucun échec (paramètres 6, compatibilité 5, file 23, panneau 19, cartes de chat 7) |
| Navigateur, copie temporaire | `smoke-tv-ambient.mjs` | 17 vérifications sur 17 |
| Navigateur, copie temporaire | `smoke-tv-overlay.mjs` | 10 scénarios sur 10, dont le serveur réel de l’arbre sur un port éphémère |
| Navigateur, copie temporaire | `smoke-lg-ui.mjs`, `smoke-tv-timeline.mjs` | réussis |
| Navigateur et vrais processus locaux | `simulate-tv-ambient.mjs --only off,relay` | 2 passes sur 2 ; la passe `off` joue les déclarations du panneau par la vraie route (session lue, autre session, sans session) |
| Natif sur la TV | — | **non exécuté** |

Les fichiers d’exécution (`tv/*.py`, `prototypes/lg-remote/runtime/*.py`) s’analysent aussi sous Python 3.9 et 3.11, qui encadrent le 3.10 de la TV ; les tests n’y ont pas été relancés cette fois. Ces preuves portent sur le code ; elles ne disent rien du compositeur, du focus ni de la télécommande réels.

`tests/tv_fakes/luna-send` et `tests/tv_fakes/arecord` sont de faux exécutables placés en tête de `PATH` ; ils ne parlent à aucune TV. Le premier consigne ses appels dans `calls.jsonl`, répond au format réel (stderr, `timingServiceResponse` sur plusieurs lignes) et peut remplacer la porte pendant une prise (`oneshot.json`).

## Protocole de validation native — **non exécuté**

À dérouler plus tard par Dabi, ou avec son accord explicite. Règles du protocole :

- **Aucune phase n’arrête la capture en cours.** Si une capture tourne, la phase qui exige son absence n’est pas lancée ; on attend que le spectateur l’ait arrêtée lui-même.
- **Aucune phase n’arrête ni ne remplace le mapper installé**, et aucune ne modifie l’installation pendant que YouTube joue, même « pour un essai isolé ». Une phase qui ne peut pas s’en passer est marquée **« non exécutée, décision de Dabi requise »** : elle décrit ce qu’elle interromprait, pour que la décision soit prise en connaissance de cause.
- Chaque phase écrit ses préconditions ; si l’une manque, la phase n’est pas lancée.
- Arrêt immédiat d’un essai en cours : coupure de son ; carte visible plus de 22 s ; télécommande sans effet plus de 5 s ; Rakuten qui n’ouvre plus le panneau ; pixel marqueur dans une image envoyée.
- Une touche perdue ou doublée n’est pas un critère d’arrêt, c’est une mesure (voir « Trois verdicts »). Exception écrite : Retour pressé pendant une carte est consommé par décision.

Commandes Luna : `luna-send -t 1 -w 3000 luna://… '<json>' 2>&1` (la réponse arrive sur stderr).

### Phase A — lecture seule

Préconditions : aucune installation, aucun fichier copié, aucun processus arrêté. A5 et A6 exigent en plus qu’**aucune capture ne tourne** (`GET /capture` répond `active:false` ; sinon ces deux lignes ne sont pas lancées) : elles prennent des images ou affichent un toast.

| # | Commande | Tranche |
| --- | --- | --- |
| A1 | `python3 /media/developer/tvlens-remote/control.py status` ; `cat /tmp/tvlens-remote-state/status.json` | mapper actif |
| A2 | `time luna-send … surfacemanager/getForegroundWindowInfo '{}'` dix fois ; même mesure pour `videooutput/getStatus` | durée d’un appel Luna, donc budget du relais (V11) |
| A3 | `luna-send … applicationManager/getForegroundAppInfo '{}'`, panneau fermé puis ouvert par Rakuten | témoin possible du retour du focus (V15) |
| A4 | lecture du QML du compositeur (`grep -rIl -e needFocus -e SYSTEM_UI -e consumeKeyEvents /usr/lib/qml`) | focus par type de fenêtre, nombre de surfaces overlay (I1, V20) |
| A5 | `executeOneShot` avec `method` `VIDEO`, `GRAPHIC`, `DISPLAY` vers `/tmp/tvlens-probe-*.png`, sous-titres actifs ; examen ; suppression | levier `VIDEO` (I5), zone des sous-titres (V9) |
| A6 | `createToast '{"sourceId":"tvlens","message":"TV Lens · essai"}'` et une capture pendant le toast | position, durée, focus du toast (V17, I6) |
| A7 | `cat /proc/bus/input/devices` | périphériques de la télécommande, pointeur, répétitions (I10, V22) |
| A8 | `python3 -c "import time;print(time.get_clock_info('monotonic'))"` ; `mount \| grep ' /tmp '` | horloge commune aux processus (V23). Attendu : `clock_gettime(CLOCK_MONOTONIC)` ; sinon le superviseur se désactive (`clock-unshared`) |

### Phase B — paquet de sonde — **non exécutée, décision de Dabi requise**

Ce qu’elle demande : **installer** des applications de sonde (`org.tvlens.ambientprobe*`, lot application), par une méthode que le dépôt ne nomme pas. L’installation existante n’est pas remplacée, mais le registre d’applications de la TV change : c’est une décision.
Préconditions : décision prise et méthode d’installation nommée ; aucune capture en cours (l’ancienne capture photographierait les cartes d’essai et les enverrait au serveur) ; panneau fermé ; vidéo sans enjeu en plein écran. Le mapper et le contrôleur installés restent en service et ne sont pas sollicités.
La sonde lit ses paramètres **comme la page de production** : `launchParams` au chargement (fenêtre ou `PalmSystem`), sinon `webOSLaunch` ou `webOSRelaunch`, attendus 1,5 s sans rien peindre, une seule prise en compte par `nonce`. Une sonde restée vide signifie donc qu’aucune de ces trois voies n’a livré les paramètres en 1,5 s, pas seulement qu’ils manquaient au chargement.

| # | Étape | Observation |
| --- | --- | --- |
| B2 | `launch` de la sonde avec une carte de 20 s | carte en bas à gauche sans réduction de la vidéo, son continu, réception des paramètres (V1, V2, V16) ; YouTube réagit-il aux touches, le pointeur l’atteint-il (I10) |
| B3 | variantes `overlay`, `floating`, `system_ui`, avec et sans `noFocus` | une fenêtre affiche-t-elle sans prendre les touches (I1) |
| B4 | deux `launch` à 3 s | `webOSRelaunch` |
| B5 | `closeByAppId` pendant une carte, dix fois, puis Droite | retour du focus à YouTube et son délai (V3) |
| B6 | panneau ouvert puis sonde ; sonde puis Rakuten pendant le lancement | deux overlays (V20) |
| B7 | sonde gelée puis `closeByAppId` | fermeture d’un overlay gelé (V21, I11) |

Retour arrière : `closeByAppId` de l’identifiant d’essai ; désinstallation par la méthode qui a servi à installer. Si aucune ne répond, les applications d’essai restent installées, invisibles et jamais lancées : à consigner comme résidu.

### Phase C — relais par le mapper — **non exécutée, décision de Dabi requise**

Ce qu’elle interromprait : **le mapper installé**. Le périphérique de la télécommande est saisi en exclusivité : un mapper d’essai ne peut pas tourner à côté. Pendant chaque passe (cinq minutes au plus), Rakuten et la navigation passent par le code d’essai ; le mapper installé est relancé à la fin (`control.py start`, jamais `disable`).
Préconditions : décision prise ; aucune capture en cours ; panneau fermé ; paquet de production `org.tvlens.ambient` installé (décision de la phase B) ; code copié dans un dossier **neuf** `/media/developer/tvlens-ambient-trial/`, aucun fichier installé remplacé, aucun secret de production copié.

- Mapper d’essai : `TVLENS_AMBIENT_RUN=/tmp/tvlens-ambient-trial TVLENS_AMBIENT_CONFIG=<ambient.json d’essai> timeout -s TERM 300 python3 -u …/runtime/tvlens_mapper.py --config …/rakuten.json --state-dir /tmp/tvlens-ambient-trial-state --app-dir … --no-start-delay`, avec `{"focus":"relay","trial":true,"mapperStatus":"/tmp/tvlens-ambient-trial-state/status.json"}`.
- Contrôleur d’essai, à côté de l’installé (8788, intouché) : `TVLENS_AMBIENT_RUN=/tmp/tvlens-ambient-trial timeout -s TERM 300 python3 …/controller.py --config <configuration d’essai> --port 8798 --capture-report /tmp/tvlens-ambient-trial/capture-report.json --capture-lock /tmp/tvlens-ambient-trial/capture.lock`.

| # | Étape | Observation |
| --- | --- | --- |
| C0 | cent écritures atomiques dans `/tmp/tvlens-ambient-trial` ; `status.json` d’essai avec `ambientRelay:2`, `panelYield:1` | coût d’une écriture de l’état des touches par appui (V23) ; navigation YouTube normale avec le crochet installé et aucune carte |
| C3 | `POST /ambient/test` sur 8798, puis Droite, Haut, Bas, OK, Lecture, volume, muet pendant la carte | la carte disparaît, YouTube exécute l’action une fois et une seule (V4, V12) ; durées lues dans l’avis (`steps`) |
| C3b | **mesure décisive** : `settleMs` ∈ 0, 300, 700, 1500, 3000 × `closeVia` ∈ `surface`, `page`, vingt cartes par réglage, une touche par carte, filmées | histogramme du délai fermeture → première touche reçue par YouTube ; taux et nature des pertes |
| C4 | Retour pendant une carte ; Rakuten pendant une carte | carte fermée sans recul de YouTube ; panneau ouvert |
| C4b | touche au moment du lancement, vingt fois ; Rakuten, dix fois | page jamais peinte quand la touche précède l’accord ; `key-lost-at-launch` compté (V19) |
| C5 | trente cartes à 20 s d’intervalle | son continu (V5) |
| C6 | superviseur tué, puis gelé 20 s ; mapper d’essai tué ; contrôleur d’essai tué | porte rouverte par le chien de garde seulement si le superviseur est mort ; gelé : fenêtre fermée, `epoch` inchangé (V24) |
| C7 | fin de passe : `control.py start`, `control.py status` | mapper installé de retour, Rakuten ouvre le panneau |

### Phase D — non-contamination de la capture — **non exécutée, décision de Dabi requise**

Dépend du montage de la phase C (le superviseur exige un relais vivant) et d’une capture d’essai lancée à la main avec le nouveau code, son propre verrou et son propre rapport (`--lock`, `--report`), vers un récepteur temporaire (lot application). Préconditions : celles de la phase C, plus aucune capture installée en cours.
Critère : 0 pixel marqueur sur toutes les images reçues, `framesCropped > 0`, déclarations présentes sur les blocs concernés, son présent dans tous les blocs (V6, V7).

### Phase E — durée — **non exécutée, décision de Dabi requise**

Deux heures de film avec la nouvelle capture, donc après le déploiement du nouveau code : relevé du rapport, de `free -m` et de `top` toutes les dix minutes ; arrêt `idle` constaté après dix minutes sur une autre source (V8).

### Phase F — décision

Déployer le nouveau code, puis écrire `focus:"relay"` ou `"passthrough"` dans `ambient.json`, sont deux décisions distinctes de Dabi. Tant qu’elles ne sont pas prises, le profil reste `off`.

## Limites — premier tableau : validation native non exécutée

Le code est livré ; la TV ne l’a pas exécuté.

| # | Point non établi sur la TV | Étape qui le tranche |
| --- | --- | --- |
| V1 | réception des paramètres de lancement et de `webOSRelaunch` | B2, B4 |
| V2 | carte `overlay` sur la vidéo plein écran, lancée par un processus root | B2 |
| V3 | **retour du focus clavier à YouTube après un `closeByAppId` externe**, et son délai | B5, C3, C3b |
| V4 | relais : zéro touche perdue ou doublée, première touche, appui long | C3, C3b, C4 |
| V5 | continuité du son sur des cycles répétés de lancement et de fermeture | C5 |
| V6 | la fenêtre ne cesse d’être listée qu’après la disparition de ses pixels ; l’image est prise entre l’appel et la réponse | D |
| V7 | correspondance 2/3 entre boîte logique et capture en plein écran | D |
| V8 | capture au-delà de 30 minutes ; coût d’un processus Python de plus | E |
| V9 | sous-titres et commandes de YouTube sous la carte (la marge de 180 px est un choix non mesuré) | A5, B2 |
| V10 | publicité : touche d’« Ignorer » relayée, carte fermée au changement de contexte | C3 pendant une publicité |
| V11 | durée d’un appel `luna-send` | A2 |
| V12 | volume, muet, alimentation : traités par le système sans égard au focus ? codes présents sur ce périphérique ? | A7, C3 |
| V13 | moteur web réel ; sort d’une requête envoyée quand l’application se ferme | B2, C6 |
| V14 | installation et désinstallation d’un second identifiant | B (décision) |
| V15 | sens de `getForegroundAppInfo` avec un overlay au premier plan | A3 |
| V16 | latence d’un lancement à froid par carte | B2, C3 |
| V17 | toast : position, durée, focus, présence dans la capture | A6 |
| V18 | crochets de démarrage après un redémarrage complet de la TV | hors protocole |
| V19 | fenêtre vide transitoire : une touche tombant entre sa naissance et sa fermeture est perdue, et déclarée | C4b |
| V20 | deux applications `overlay` (panneau et carte) | A4, B6 |
| V21 | un `closeByAppId` ferme-t-il un overlay gelé ? | B7 |
| V22 | débit du périphérique, débordement de la file du noyau en 2,5 s | A7, C3 |
| V23 | horloge monotone commune aux processus ; coût d’une écriture atomique par appui | A8, C0 |
| V24 | verrou `flock` relâché à la mort d’un processus sur ce système de fichiers | C6 |
| V25 | effet réel de `window.close()` dans une fenêtre `overlay`, et sort de l’instance de page entre deux cartes : si le système la garde vivante et la **relance** pour la carte suivante, cette page (qui a déjà demandé sa fermeture) ne repeint pas et chaque carte suivante est « non confirmée », jusqu’à la probation `launch-unconfirmed` | B4, B5 |

## Limites — second tableau : limites d’implémentation, avec leur test décisif

Aucune impossibilité n’est prouvée. Une ligne ne devient un fait que par un résultat produit sur la TV.

| # | Limite | Ce qui est établi | Test décisif | Conséquence |
| --- | --- | --- | --- | --- |
| I1 | aucune fenêtre d’application ne s’afficherait durablement sans prendre les touches | `overlay` les prend sur cette TV ; `system_ui` ne les prend pas dans le compositeur de référence | A4 puis B3 | sans fenêtre sans focus : cartes transitoires seulement, pas de pastille persistante |
| I3 | le relais perdrait ou doublerait des touches quel que soit le réglage, ou les cycles couperaient le son | rien : jamais essayé | C3b complet, C5 | voir « Trois verdicts » ; un échec avec les réglages par défaut n’établit qu’un défaut de réglage |
| I4 | une carte dessinée sur la vidéo figure dans une capture `DISPLAY` | établi | traité par la porte et le recadrage ; phase D | le bas de l’image manque pendant l’affichage, et c’est déclaré |
| I5 | aucune capture du seul plan vidéo sur ce firmware | `VIDEO` annoncé en amont, jamais essayé ici | A5 | le levier disparaît ; la règle de la porte suffit |
| I6 | un toast ne se place pas en bas à gauche | position non paramétrable dans la référence | A6 | le toast reste un repli déclaré, hors position |
| I8 | sans mapper, pas de relais | par construction | C6 | affichage désactivé (`no-relay`), état explicite |
| I9 | les sous-titres ne se détectent pas depuis Luna | aucun point d’entrée connu | A5 | position réglée après mesure, pas de détection |
| I10 | **en profil `relay`, le pointeur ne pilote pas YouTube pendant une carte** ; le sens du code 1198 est une hypothèse | le relais ne voit pas le pointeur ; la vue overlay de référence consomme la souris | B2, B3, A7 | aucune parade dans ce profil : écart à « aucun vol de focus » pour le pointeur |
| I11 | un overlay gelé ne se ferme peut-être pas | non prouvé dans un sens ni dans l’autre | B7 | reste la touche Accueil |
| I12 | une carte qui touche un bloc fait recadrer **toutes** les images de ce bloc (taille uniforme), soit jusqu’à 8 s de bas d’image perdu pour une carte brève | par construction | `test_one_cut_frame_cuts_its_neighbours…`, phase D | perte déclarée image par image |
| I13 | les déclarations `overlay` partent, mais leur exploitation (incertitude de l’observation) dépend du lot serveur | additif côté TV | test du serveur (autre lot) | sans lui la déclaration est ignorée, pas fausse |
| I14 | la pastille « persistante » du profil `passthrough` est relancée toutes les 20 s au plus : la page se ferme d’elle-même à cette échéance | par construction | simulation de l’application, B2 | la pastille clignote une fois par cycle |
| I15 | la poursuite d’une fenêtre née en vol ne relit Luna que sur un appui ou un cran de molette, jamais sur un relâchement | choix : un relâchement retenu ferait d’un appui court de Rakuten un appui long | `test_pursuit_looks_again…`, C4b | une fenêtre tardive n’est fermée par le relais qu’à l’appui suivant ; le superviseur la poursuit de son côté pendant 5 s |
| I16 | une capture ancienne (sans porte) lancée pendant qu’une carte est à l’écran peut prendre une image avant que la carte soit fermée (2 s au plus) | le superviseur relit `/proc` avant chaque carte, puis toutes les 2 s | `test_capture_that_does_not_read_this_gate…` | ne se produit qu’avec un `capture.py` non mis à jour |
| I17 | une touche tombée exactement entre la naissance d’une fenêtre vide et sa fermeture est perdue pour YouTube | réduite, non éliminée (V19) | C4b | déclarée (`key-lost-at-launch`), affichage désactivé |
| I18 | les horodatages traversent les processus : il faut l’horloge monotone du système | vrai sous Linux ; faux sur certains Python de macOS, constaté pendant les tests | A8 ; garde `clock-unshared` | horloge non commune : aucune carte n’est armée, et les déclarations du panneau sont ignorées (ses cartes sont alors comptées `notShown`, jamais omises) |
| I19 | après un redémarrage de la TV, la numérotation des blocs repart plus bas (elle part de l’horloge monotone) | comportement antérieur, inchangé | hors de ce lot (serveur : renouvellement de l’époque de capture au `start`) | à traiter côté serveur |
| I20 | la déclaration `seen` porte la session ; ce que le superviseur ne peut toujours pas savoir, c’est qu’une carte qu’il a lue **avant** que le panneau la déclare a bien été montrée | par construction : le compteur n’est jamais décrémenté ; simulé | `test_seen_a9_then_session_b…`, `test_declaration_of_an_earlier_session_or_of_none…`, `test_declaration_of_the_session_being_read…`, cas partagé `seen-then-new-session`, passe `off` de la simulation | en profil `off`, **surcompte** possible de `notShown` (jamais d’omission) ; le compteur reste cumulé sur la vie d’un superviseur, pas par session |
| I21 | numérotation repartie de zéro sous le **même** identifiant de session (registre illisible côté serveur, suivi en mémoire seulement) | superviseur : le curseur redescend avec la numérotation du serveur et une déclaration déjà entendue n’est pas rejouée (simulé, `numbering_started_over`). Panneau ouvert : la file se recale si elle a vu l’état `restoring` ; si la relecture a tenu entre deux sondages, son curseur reste au-dessus | superviseur : `test_declaration_of_an_earlier_session_or_of_none…`. Panneau : aucun test, constat du relecteur par sonde | panneau ouvert, double panne : les nouvelles cartes de numéro inférieur à l’ancien curseur ne seraient ni affichées ni comptées jusqu’au rechargement du panneau ; non corrigé dans cette livraison |

## Trois verdicts, à ne pas confondre

| Verdict | Quand | Pièces exigées | Ce qu’on écrit |
| --- | --- | --- | --- |
| **R1 — réglage rejeté** | une perte, un doublon ou une anomalie avec les réglages par défaut (`settleMs` 700, `closeVia` `surface`) | l’essai, son journal | « profil `relay` non validé avec les réglages par défaut ; balayage à faire ». Aucune conclusion sur le matériel |
| **R2 — mécanisme rejeté après balayage** | C3b complet : pertes ou doublons à tous les délais de garde et par les deux voies de fermeture, ou coupure de son sur C5 | histogramme du délai fermeture → première touche ; taux de perte par réglage ; nature de chaque perte ; journaux du mapper ; avis `steps` ; vidéo | « mécanisme `relay` rejeté sur cette TV, mesures jointes » |
| **R3 — impossibilité matérielle** | R2 **et** I1 confirmé pour toutes les variantes de B3 **et** A4 cohérent avec les deux | les pièces de R2, les relevés B3 par variante, l’extrait du QML du compositeur | « affichage bas-gauche panneau fermé non réalisable par une fenêtre d’application sur cette TV » |

Aujourd’hui aucun de ces verdicts n’existe. Si la phase D échoue, on écrit « porte de capture non validée sur la TV pour telle mesure » et les profils `relay` et `passthrough` restent interdits.
