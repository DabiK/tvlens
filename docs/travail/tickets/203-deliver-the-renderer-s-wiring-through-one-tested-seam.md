---
id: T203
titre: Deliver the renderer's wiring through one tested seam instead of its source shape
statut: a-faire
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
