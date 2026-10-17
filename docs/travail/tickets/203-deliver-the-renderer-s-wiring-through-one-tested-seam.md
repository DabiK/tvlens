---
id: T203
titre: Deliver the renderer's wiring through one tested seam instead of its source shape
statut: termine
bloque_par: T195
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le renderer Mac livre ses raccords par une couture importable utilisée aussi par le banc.
Ses six groupes se prouvent par commandes, publications et DOM maîtrisés ; déplacer ou reformater
le code ne casse plus ces preuves, et débrancher un raccord attendu les rend rouges.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et D13 ; rapport B, B7. Décision du propriétaire,
  le 16/10 : couture renderer après le banc hôte T195 ; T062/T061/T060/T199/T178 sont transitifs.
  Les aides sont déjà dans `tests/helpers/wait.cjs:11` à `:82`.
- Code vérifié à `8340014`, banc renderer, aides et raccords concernés :
  - `tests/mac-ui.test.cjs:15` importe `source-shape` ; `:143` vérifie par fragments la fraîcheur
    d'une carte, `:353` la bannière et la prise de référence de lecture en surveillance ;
  - `tests/mac-ui.test.cjs:702` vérifie textuellement le reset de recherche et le replay ; `:797`
    les groupes et abonnements des états, la libération et la garde de `pullSession` ;
  - `tests/mac-ui.test.cjs:991` vérifie les appels aux règles de requête chat ; `:1297` l'alimentation
    des cartes de surveillance, `:1302` le passage du résumé dans son réducteur, `:1305` la mémoire
    issue de la session. Les tests directs des projections n'établissent pas ce raccord ;
  - `app/renderer.js:82` compose la capture, `:200` la livraison, `:285` les abonnements et `:288`
    leur libération ; `:394` garde la lecture d'archive après toutes ses attentes. Ces raccords
    sont privés aujourd'hui : il n'existe pas de fabrique publique de la fenêtre complète ;
  - `app/ui/state-delivery.mjs:6` et `:62` sont importables ;
    `app/ui/search-controller.mjs:12`, `app/ui/job-card.js:176` et `app/ui/chat-requests.mjs:13`
    fournissent déjà des frontières testables ; `tests/helpers/mac-document.cjs:69` fournit un
    document minimal de cartes, pas un navigateur ni un chargeur de la fenêtre ;
  - `tests/mac-ui.test.cjs:1252` garde imports, exports, IDs et CSP ; `:1275` garde le contrat bridge.
    Ce sont des contrôles de frontière distincts des assertions de placement du câblage.
- ADR 0018 : contrôleur de capture injecté ; ADR 0025 : livraison des états, garde de fraîcheur après
  le `Promise.all`, libération des abonnements et composition réelle partagée avec les tests.


## Périmètre

- Modifier `app/renderer.js`, exposer la couture nécessaire sous `app/ui/`, puis modifier
  `tests/mac-ui.test.cjs` et ses aides Mac sous tests/. Le module reçoit bridge, accès DOM,
  callbacks de vues et dépendances temporelles ; le renderer utilise réellement ce même module.
- Couvrir ces six groupes, avec une correspondance exhaustive au journal des anciennes assertions :

  | Groupe | Garanties de raccordement |
  | --- | --- |
  | Cartes de question | Fraîcheur avant réponse, titre, détail replié et mise à jour des citations. |
  | Livraison d'état | Groupes d'état, derniers états adoptés, abonnements/libération et garde tardive après tout le Promise.all d'une lecture initiale ou d'archive. |
  | Recherche et replay | Reset/changement de session efface la recherche ; résultat tardif ignoré ; replay attaché à la session de la carte. |
  | Requêtes chat | Revendication remplie, préfixe de vérification nettoyé, approfondissement transmis au bridge. |
  | Surveillance | Bannière, référence du badge, cartes sourcées ; signal seul hors pile. |
  | Résumé et mémoire | Résumé passé dans son réducteur ; mémoire issue de la rétention de la session ouverte. |

- Réutiliser contrôleurs et projections existants. Un test isolé de describeSurveillance,
  replayTarget ou deepenRequest ne prouve pas que la fenêtre les raccorde. Le banc charge la vraie
  composition sous doublures, sans réécrire ses imports ni recopier ses callbacks.
- Limiter l'extraction aux branchements testés ; ne pas redécouper toute la surveillance/sessions.
  Étendre le document Mac pour les seules opérations utilisées ; un sélecteur requis absent fait
  échouer le banc. Les documents Mac et TV restent distincts ; attentes via helpers/wait.cjs.
- Garder les gardes de dépendances, exports, IDs, CSP, bridge public et retraits d'API. Les contrôles
  de contenu peuvent rester ; ils ne servent pas à prouver actions ou abonnements.
- Ajouter un ADR sur la couture réellement utilisée, sa fraîcheur et sa libération, prolongeant
  l'ADR 0025. Aucun changement de banc hôte T195, de métier, IPC, durée, harnais ou plancher.
  Aucun fichier de test supprimé ; conserver le nombre de cas et leurs garanties.

## Critères d'acceptation

1. Les six groupes sont exercés par la couture utilisée dans renderer, sans fragments JS recherchés.
   Le cas de carte observe le DOM de jobEntry : fraîcheur avant réponse, titre et détail replié.
   Le journal rapproche chaque ancienne assertion des groupes cités de son effet désormais testé.
2. Le branchement conserve ses groupes, adopte les dernières valeurs et retire ses abonnements à la
   libération. Une lecture retenue ne remplace pas une poussée plus récente. Retenir une autre
   lecture du Promise.all prouve que la fraîcheur est vérifiée après l'attente complète (ADR 0025).
3. Reset ou changement de session efface la recherche aboutie et refuse un résultat tardif.
   Le replay porte la session de la carte et refuse le passage d'une autre session. Les actions chat
   transmettent revendication, vérification et approfondissement attendus par le bridge du banc.
4. Une publication surveillance pilote bannière, badge et cartes sourcées ; un signal seul n'entre
   pas dans la pile. Un résumé passe par son réducteur ; la disponibilité d'une citation met sa
   présentation à jour. La mémoire suit la session ouverte même si la configuration hôte diffère.
5. Les assertions de forme remplacées disparaissent ; le journal justifie chaque garde statique
   conservée comme frontière ou contenu. Trois mutations isolées rendent les preuves rouges sur
   leurs effets : débrancher un abonnement, retirer la garde tardive, détourner une commande.
   Mutations retirées et sorties rouge/verte consignées ; aucun mutant vert n'est déclaré détecté.
6. À l'implémentation, exécuter mac-ui, state-delivery, mac-capture-actions et les nouveaux tests
   un par un, puis mac-ipc-contract et `node scripts/check.mjs`. Aucun lancement natif, installation
   ou baisse de cas n'est nécessaire. L'ADR décrit l'usage partagé réel de la couture.

## Test d'acceptation attendu

Les tests livrent les états par les abonnements du bridge et déclenchent les actions du document
en passant par la vraie couture du renderer. DOM, requêtes et désinscriptions sont observés avec
promesses retenues et horloge simulée. Les trois mutations prouvent que ce module n'est pas un
doublon décoratif contourné par la composition réelle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T195 livre le banc hôte et implique les trois lots d'attente. L'extraction limitée fait partie de
ce ticket, les coutures actuelles ne couvrant pas tous les raccords privés du renderer. La preuve
reste sous doublures, sans garantie de peinture physique, capture native ou Electron réel.
Le nombre « 44 » de l'audit n'est pas un objectif : chaque garantie est rapprochée d'une preuve.

## Journal

### Exploration

- Lu les consignes, les ADR 0018/0025, le renderer, ses vues et le banc Mac. État et périmètre consignés dans `.harness-state/tickets/T203/exploration.md` ; aucun écart prévu.
- `git status --short` : ticket déjà modifié, `design/continuous-context/` et `experiments/` préexistants laissés intacts.

### Couture et cycles observés

- `createRendererWiring` est maintenant instanciée dans `app/renderer.js`, puis liée avec ses actions restantes.
  Elle compose les états, les vraies cartes, les publications de surveillance, le résumé et la mémoire.
  `renderer-commands.mjs`, assemblé par cette fabrique, porte recherche/replay/vérification et le répartiteur de clics.
  Le banc importe cette fabrique sans réécrire d’imports ni recopier de callbacks ; ses callbacks de chrome sont des observateurs.
- Les captures, les archives de bibliothèque et le panneau détaillé de surveillance restent à leurs emplacements actuels.
  Les durées de pile, secours et replay sont conservées ; aucun protocole ni métier modifié.
- `node --test --test-name-pattern='freshness of a question' tests/mac-ui.test.cjs` : rouge sur l’absence
  d’abonnement (`red-cards.log`), puis vert avec la vraie carte (`green-cards.log`).
- `node --test --test-name-pattern='window tracks pushes|archive question read' tests/mac-ui.test.cjs` :
  rouge sur l’absence de lecture d’archive (`red-delivery.log`), puis vert (`green-delivery.log`).
- `node --test --test-name-pattern='search cards name|window takes its claim|saved history still' tests/mac-ui.test.cjs` :
  trois rouges sur les raccords absents (`red-actions.log`), puis trois verts (`green-actions.log`).
- `node --test --test-name-pattern='surveillance publications|recap publications|memory presents' tests/mac-ui.test.cjs` :
  la source de surveillance ne transmettait pas encore sa commande ; rouge sur les appels du bridge (`views.log`),
  puis vert après migration de cette commande dans la composition (`green-views.log`). Résumé et mémoire verts observés.
- `node --test --test-name-pattern='window tracks pushes' tests/mac-ui.test.cjs` : rouge au déchargement
  (six abonnements restants, `red-unload.log`), puis vert dans `mac-ui-shared.log`.
- `node --test --test-name-pattern='an archive question read checks freshness' tests/mac-ui.test.cjs` :
  rouge sur le défilement d’archive (0 au lieu de 2000, `red-archive-scroll.log`), puis vert après migration
  du suivi forcé dans la couture (`green-archive-scroll.log`).
- `node_modules/.bin/eslint --prune-suppressions app/renderer.js app/ui/renderer-wiring.mjs tests/helpers/mac-document.cjs tests/helpers/mac-renderer.cjs tests/mac-ui.test.cjs` :
  suppression de complexité devenue inutile élaguée, sans hausse du gel, conformément aux standards.
- ADR ajouté : `docs/adr/0043-les-raccords-du-renderer-mac-passent-par-une-composition-importable.md`.

### Correspondance exhaustive des anciennes assertions de raccordement

Les tests purs existants sont conservés. Les références ci-dessous désignent les anciens blocs de `mac-ui`,
par leurs garanties, indépendamment de leur nouveau numéro de ligne.

| Anciennes assertions | Effets désormais observés par la couture réelle |
| --- | --- |
| Carte : création de `job-fresh` avec le label choisi | `freshness of a question…` observe le texte du nœud de la vraie `jobEntry`. |
| Carte : affectation du titre avec la phrase complète | Le même cas observe `title` sur le nœud affiché. |
| Carte : détail après le libellé du bloc replié | Le même cas observe le résumé du bloc, son état fermé et le détail dans ses descendants ; le nœud de fraîcheur précède la réponse. |
| Surveillance : demande de `banner: true` | `a saved history still…` publie les registres non persistés et observe la bannière sans répétition dans l’activité. Les projections existantes gardent les quatre messages du registre, dont le stockage lent. |
| Surveillance : bannière masquée sans notice | Le même cas publie `ready` et `restoring` et observe `hidden`. |
| Surveillance : texte de bannière issu de la projection | Le même cas compare le DOM aux messages publiés pour `memory-only`, `unreadable`, `write-failed`. |
| Surveillance : bornes textuelles de `receiveSurveillance` avant `drawSurveillance`, puis appel à `nextSeen` dans cette tranche | Le même cas publie restauration, premier historique prêt puis nouveaux résultats ; le badge compte 0 puis 2. Le placement des fonctions n’est plus une garantie. |
| Recherche : changement de session appelle clear | `search cards name…` publie B après un résultat abouti de A et constate résultats vides et introduction restaurée. |
| Recherche : reset appelle clear | Le même cas déclenche `onReset` après un résultat abouti et constate les mêmes effets. |
| Recherche : callback onClear vide le DOM et remet l’introduction | Les deux chemins précédents observent enfants vides et texte initial ; succès et refus tardifs n’écrivent rien. |
| Replay : la carte est passée avec sa session | Le bouton réel d’une carte A ouvre `tvlens-media://session-a/moment-1`. |
| Replay : délégation à `replayTarget` et absence d’URL construite depuis la seule session courante | Le bouton de A retenu après ouverture de B refuse la lecture, sans nouveau play ni dialogue ; le passage de même ID dans B n’est pas utilisé. |
| Livraison : import de la couture de livraison et configuration des trois sources | `the window tracks pushes…` publie session, deux deep et vérification ; la session est adoptée, la dernière question et la vérification sont dessinées. L’import réel vérifie les dépendances. |
| Livraison : groupes session/chat et leurs dessins | Le même cas observe deux frames et les dessins séparés session/chat, avec redessin du chat par le groupe session. |
| Livraison : binding utilise bridge, livraison, boutons et notification | Le même cas observe la mise à jour des boutons aux publications et le DOM des cartes ; les tests de state-delivery conservent les refus et les règles propres aux lectures initiales. |
| Livraison : beforeunload appelle release | Le banc déclenche `beforeunload` sur la fenêtre injectée : six désabonnements, frames et secours annulés ; une seconde libération ne répète rien. |
| Livraison : garde deep après tout Promise.all | `an archive question read checks freshness…` résout deep, retient résumé/surveillance, pousse une question plus récente puis libère le lot : la récente reste affichée. |
| Livraison : résumé/surveillance et dessin restent adoptés quand deep est dépassé | Le même cas observe résumé, bannière de surveillance et suivi du dernier message en bas, même si la lecture deep est rejetée par sa garde. |
| Livraison : deux lectures facultatives tolèrent un refus, deep propage son refus | `archive question read failures propagate…` tolère les deux refus facultatifs, dessine la question fraîche malgré une poussée de vérification, puis observe le refus deep par identité. |
| Chat : import des règles et claimFrom remplit la revendication | `the window takes its claim…` clique Vérifier, puis observe la revendication nettoyée et le dialogue ouvert. Les imports sont chargés réellement. |
| Chat : withoutVerifyPrefix gouverne l’effacement du champ | Le même cas soumet le formulaire et observe le champ question vide ainsi que `verify` avec la revendication attendue. |
| Chat : deepenRequest gouverne la demande d’approfondissement | Le bouton réel Approfondir transmet à `ask` le préfixe attendu et les 1200 premiers caractères ; le bouton de vérification de la réponse remplit aussi la revendication. |
| Surveillance : seule alimentation de cardQueue par les cards de la projection | `surveillance publications feed…` livre un état du vrai core et observe une seule carte sourcée dans la pile, avec le bon texte de source et la commande de source. |
| Surveillance : un seul offer et aucune lecture directe des signals.cards par le renderer | Le même cas publie un signal seul, même mal rangé dans overlay, et constate la pile vide. Les projections et la queue conservent leurs tests purs de classification et de non-répétition. |
| Résumé : bornes textuelles receiveRecap/renderRecap et passage dans reduceRecap | `recap publications keep…` publie ready, updating et error : le contenu précédent reste ; une publication d’une autre session est ignorée. Le placement des fonctions n’est plus une garantie. |
| Résumé et cartes : disponibilité des citations | Le même cas publie l’expiration du passage : les références du résumé (deux vues) et de la vraie carte deviennent indisponibles ; la carte garde son nœud. |
| Mémoire : aucune rétention empruntée à la configuration de l’hôte | `memory presents…` ouvre une archive durable sur un hôte configuré en rolling et observe la conservation jusqu’à suppression. |
| Mémoire : describeMemory reçoit la session et la bibliothèque | Le même cas enlève la rétention du snapshot : repli sur l’entrée de cette session ; autre session sans rétention : aucun emprunt, titre identique au texte affiché. |

Preuves complémentaires : `published questions reach…` observe directement un brouillon poussé dans le DOM ;
`fresh initial reads draw…` adopte les deux lectures initiales fraîches et libère les autres lectures retenues
après déchargement sans aucun dessin tardif. Aucun cas existant supprimé : `mac-ui` passe de 44 à 51 cas exécutés.

### Gardes statiques conservées

- Imports/exports, syntaxe du point d’entrée et chargement direct des modules : frontières de dépendances,
  sans réécriture de la composition. Les nouveaux modules rejoignent aussi le scan des IDs.
- IDs uniques, existence des commandes, bannière HTML parmi les autres (attributs, rôle, texte sans action,
  avant main) et CSP des miniatures : frontières du document et des protocoles de médias.
- Bridge preload (57 méthodes), séparation capture/tvlens, méthodes des scripts smoke/probe : frontière IPC.
  Aucune exécution native des scripts ; leurs retraits d’API restent contrôlés.
- Ancien mode Auto, option d’affichage des signaux et ancien usage de mediaNote dans le résumé : retraits
  d’API/préférences conservés. Les effets des cartes et citations se prouvent séparément par le DOM.
- Libellés, accords français, limites/rétention non inventées et absence du verdict fixe dans renderer/card :
  gardes de contenu. Les trois contrôles `agreeText` subsistent comme contenu ; celui des avertissements
  de recherche suit son déplacement dans `renderer-commands.mjs` et ne sert pas de preuve d’action.

### Mutations isolées, retirées

Script local de reproduction : `.harness-state/tickets/T203/run-mutations.py` ; chaque fichier est restauré
avant la mutation suivante. Aucun mutant vert déclaré détecté.

- `node --test --test-name-pattern='published questions reach' tests/mac-ui.test.cjs` : abonnement deep
  débranché de son callback de livraison dans la vraie composition ; rouge sur le DOM vide au lieu du
  brouillon publié (exit 1), puis restauration verte (exit 0). `mutation-subscription-{red,green}.log`.
- `node --test --test-name-pattern='an archive question read checks freshness' tests/mac-ui.test.cjs` :
  garde après Promise.all retirée ; rouge, « Question archivée » remplace « Question plus récente »
  (exit 1), puis restauration verte (exit 0). `mutation-late-guard-{red,green}.log`.
- `node --test --test-name-pattern='the window takes its claim' tests/mac-ui.test.cjs` : approfondissement
  envoyé à verify ; rouge sur le nom de commande du bridge (exit 1), puis restauration verte (exit 0).
  `mutation-command-{red,green}.log`.

### Vérifications ciblées

Exécutées une par une, sans fournisseur réel, installation ni lancement natif ; sorties dans le dossier d’état :

- `node --test tests/mac-ui.test.cjs` : 51/51 verts (`mac-ui.log`).
- `node --test tests/state-delivery.test.cjs` : 13/13 verts (`state-delivery.log`).
- `node --test tests/mac-capture-actions.test.cjs` : 11/11 verts (`mac-capture-actions.log`).
- Les sept nouveaux cas ont aussi été exécutés séparément par `node --test --test-name-pattern='<nom>' tests/mac-ui.test.cjs` :
  `published questions reach`, `fresh initial reads draw`, `an archive question read checks freshness`,
  `archive question read failures propagate`, `surveillance publications feed`, `recap publications keep`,
  `memory presents` : un vert chacun, sorties et commandes exactes dans `new-case-1.log` à `new-case-7.log`.
- `node --test tests/mac-ipc-contract.test.cjs` : 30/30 verts (`mac-ipc-contract.log`).
- Un contrôle intermédiaire `node scripts/check.mjs --changed` a signalé deux lignes de test longues
  nouvellement ajoutées (`check-changed.log`) ; elles ont été repliées, sans modifier les assertions.
- Premier `node scripts/check.mjs` (`check-full.log`) : 2299/2299 tests JS et 30/30 Python verts ;
  règles/cliquet rouges sur les deux lignes longues mesurées au départ de ce contrôle, avant leur correction.
- `node scripts/check.mjs --changed` après correction (`check-changed-final.log`) : vert, 51/51 tests ;
  lignes longues production 431 → 425, tests 1604 → 1603, cas produit 1197 → 1204. Aucun plancher modifié.
- `node scripts/check.mjs` final (`check-full-final.log`) : vert. Règles, format, lint, gel et cliquet verts ;
  2299/2299 tests JS (133 fichiers) et 30/30 Python verts. Aucun contrôle requis non lancé.
- `git diff --check` : vert. Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T203/verdict.json` ;
  aucune réserve propre, aucun commit ni push. La relecture et l’intégration restent à la boucle.

### Reprise après relecture 1

- Rapport, ticket/journal, écarts, `git status --short` et `git diff` relus ; reprise du travail présent,
  sans commit ni push. Quatre mineurs retenus, aucune contestation ni écart prévu ; exploration mise à jour.
- Corrections de commentaires vérifiées par lecture, sans assertions sur le texte du code. La construction
  de carte et la preuve du badge sont reprises avec observation d’un rouge sur leurs effets avant validation.

### Corrections des quatre mineurs

1. Les trois refus ignorés dans les nouveaux modules portent maintenant leur raison dans le bloc `catch` :
   session initiale remise à jour par publication, surveillance initiale facultative, lecture relançable par
   les contrôles vidéo avec les incidents média présentés par `onerror`. Le callback de copie conservée
   resté au renderer documente également sa tolérance au refus de `play()`.
2. Les raisons perdues ont été rétablies près du code : index des passages, rétention de la session,
   rechargement, invalidation du résumé, référence du badge au premier état prêt, amorçage du registre
   restauré, pile sourcée, bannière sans action, absence de superposition avec le panneau ouvert et ligne
   de carte en fenêtre repliée ; recherche liée à sa session/requête, vérifications avant URL, timecode
   dans le passage et arrêt du recorder imposé par l’hôte. Aucun comportement changé pour ces commentaires.
3. Une seule construction DOM de carte demeure dans `renderer-commands.mjs`. Elle reçoit au besoin
   disponibilité et callback de lecture ; `renderer.js` garde la lecture des copies conservées et leur
   protocole. Le squelette dupliqué et sa branche morte sont supprimés. L’ADR 0043 précise ce partage.
4. `onState` ouvre `badge-session` avant ses trois publications de surveillance. Les assertions 0 puis 2
   restent en place et passent par les dessins programmés ; le redessin manuel tardif n’est plus nécessaire.

### Preuves de correction

- `node --test --test-name-pattern='a retained moment shares' tests/mac-ui.test.cjs` : rouge observé sur
  le bouton désactivé malgré la copie conservée (`correction-1-card-red.log`), puis vert après injection
  de la disponibilité et du callback (`correction-1-card-green.log`). Le cas observe image, intervalle,
  texte, libellé, disponibilité et appel unique au callback ; la carte ordinaire expirée reste indisponible.
- `node --test --test-name-pattern='a saved history still' tests/mac-ui.test.cjs` : raccord `nextSeen`
  temporairement retiré, rouge sur l’assertion du premier historique prêt (9 au lieu de 0), puis vert
  après restauration. Commande et sorties dans `correction-1-badge-{red,green}.log` ; mutation retirée.
  Reproduction locale : `.harness-state/tickets/T203/correction-1-badge-mutation.py`.
- Les commentaires ont été relus sur chacun des emplacements du rapport ; aucune assertion de texte
  de code ajoutée. Les garanties existantes et tous les cas précédents sont conservés.
- `node scripts/check.mjs --changed` : vert (`correction-1-check-changed.log`), dont mac-ui 52/52,
  format, lint, gel, règles et cliquet. Lignes longues production 431 → 422, tests 1604 → 1603,
  cas produit 1197 → 1205 ; aucun plancher modifié.
- Suites relancées une à une : `node --test tests/mac-ui.test.cjs` : 52/52 ;
  `node --test tests/state-delivery.test.cjs` : 13/13 ;
  `node --test tests/mac-capture-actions.test.cjs` : 11/11 ;
  `node --test tests/mac-ipc-contract.test.cjs` : 30/30.
  Sorties conservées dans `correction-1-{mac-ui,state-delivery,mac-capture-actions,mac-ipc-contract}.log`.
- `node scripts/check.mjs` : vert (`correction-1-check-full.log`) ; règles, format, lint, gel et cliquet verts,
  2300/2300 tests JS sur 133 fichiers et 30/30 Python verts. Aucun contrôle requis non lancé.
- `git diff --check` : vert. Nouveau verdict `TERMINÉ` écrit dans le dossier d’état, sans réserve propre,
  sans commit ni push. Les quatre mineurs sont corrigés ; la relecture et l’intégration restent à la boucle.

### Reprise après relecture 2

- Rapport, ticket/journal, écarts, `git status --short` et `git diff` relus ; témoin de reprise présent.
  Le mineur sur la preuve de délégation est retenu, sans contestation ni écart prévu.
- Le test va ouvrir une session offrant le passage de même ID, puis vérifier l’absence de lecture
  parasite (dialogue, URL, notice) et utiliser un clic ordinaire comme témoin positif. Aucun code
  produit ne nécessite de correction ; la sensibilité de l’assertion sera vérifiée par mutation.

### Correction de la preuve de délégation

- Le cas ouvre désormais `session` par `onState`, avec `moment-1` disponible, et la carte porte cette
  session. Le clic conservé doit appeler une fois son callback, laisser le dialogue fermé, ne choisir
  aucune URL de session et ne publier aucune notice. L’ancien cas sans session ne pouvait pas prouver
  l’absence d’un second replay : ce montage est remplacé, sans retirer ses garanties de présentation.
- Un clic ordinaire sur le même passage sert ensuite de témoin positif : dialogue ouvert et URL
  `tvlens-media://session/moment-1`. Il confirme que le scénario permet effectivement la lecture par défaut.
  Le nombre de cas reste 52 ; aucun changement produit permanent, aucune assertion de forme ajoutée.
- `node --test --test-name-pattern='a retained moment shares' tests/mac-ui.test.cjs` : mutation ajoutant
  `this.replay(moment.id, 0, moment)` après le callback, rouge observé sur le dialogue ouvert (`true !== false`),
  puis vert après restauration. Commande et sorties dans `correction-2-playback-{red,green}.log` ; mutation
  retirée. Reproduction locale : `.harness-state/tickets/T203/correction-2-playback-mutation.py`.
- `node scripts/check.mjs --changed` : vert (`correction-2-check-changed.log`), règles, format, lint,
  gel, cliquet et mac-ui 52/52 verts. Aucun plancher modifié.
- `node scripts/check.mjs` : vert (`correction-2-check-full.log`), règles, format, lint, gel et cliquet verts ;
  2300/2300 tests JS sur 133 fichiers et 30/30 Python verts. Aucun contrôle requis non lancé.
- `git diff --check` : vert. Nouveau verdict `TERMINÉ` écrit dans le dossier d’état, sans réserve propre.
  Aucun commit ni push ; la relecture et l’intégration restent à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T203/relecture-3.md : **1. `docs/architecture.md:355` et `:79-82`** — hors périmètre (repris des relectures 1 et 2, toujours vrai)
  - **Problème.** L'index des ADR s'arrête encore à 0042, et la section Mac ne parle pas de la composition importable. L'ADR 0025 ne signale pas non plus ce que l'ADR 0043 change.
  - **Attendu.** Ajouter l'ADR 0043 à l'index et annoter l'ADR 0025. Le ticket n'autorise pas `docs/architecture.md`, donc ce point passe en réserve de session.
