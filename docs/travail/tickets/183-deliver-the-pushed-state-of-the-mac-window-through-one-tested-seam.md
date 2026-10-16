---
id: T183
titre: Deliver the pushed state of the Mac window through one tested seam
statut: termine
bloque_par: T168, T058
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La réception et l’application des états poussés de la fenêtre Mac passent par une couture importable
et testée. Elle conserve le regroupement par frame et le secours à 100 ms, permet d’observer la fin
du dessin réel et se libère sans appliquer un état tardif. T178 réutilise cette couture pour sa mesure.

## Sources

- `docs/audit-points-chauds.md`, section B, réception/préparation du rendu Mac, et section C
  « Latence », délai manquant de livraison à la vue.
  Décision du propriétaire, le 15/10 : isoler cette couture du scénario de mesure de T178.
- Repères vérifiés à `e92c6a6`, avant T129 et T167/T168 :
  - `app/renderer.js:40`, `batched`, regroupe les dessins par frame et timer de secours à 100 ms ;
  - `app/renderer.js:201`, `receiveState`, adopte la session et programme `drawState` ;
    `app/renderer.js:214` dessine l’état, `:232` compose son ordonnanceur ;
  - `app/renderer.js:274`, `chatContext`, lit `Date.now()` ; `:278`, `drawChat`, applique
    `jobEntry`/`KeyedList`, puis `:298` compose l’ordonnanceur de chat ;
  - `app/renderer.js:315` et `:317` reçoivent vérifications et questions poussées ; `:318-319`
    lit leurs états initiaux. T129 sécurise ces lectures avant le présent déplacement ;
  - `app/ui/job-card.js:34`, `jobBlocks`, et `app/ui/list-view.mjs:9`, `KeyedList`, fournissent
    les vrais nœuds et leur réconciliation. Ils servent à prouver une application DOM réelle ;
  - `tests/mac-ui.test.cjs:10` importe les modules UI sans Electron ; ses gardes d’imports et
    de bridge commencent à `:1049`. Aucun `app/ui/state-delivery.mjs` n’existe à ce commit.
- T168 achève la possession des ressources de capture ; T058 livre `tests/helpers/clock.cjs`.
  ADR 0003, publication avant disque ; ADR du contrôleur T167 à relire après sa livraison.

## Périmètre

- Créer `app/ui/state-delivery.mjs`, importable sans DOM, bridge ou Electron au chargement :
  réception, regroupement et application reçoivent horloge, demande/annulation de frame,
  minuteries et callbacks de dessin. La fabrique expose réception/programmation et libération.
- Brancher le renderer sur cette couture pour les états de session, questions et vérifications.
  Conserver la séparation actuelle de leurs dessins, le dernier état reçu, l’ordre de mise à jour
  et le secours à 100 ms. Les autres consommateurs de `batched` gardent leur comportement.
- Fournir des observations optionnelles de réception et de retour du dessin avec identité d’émission
  locale, utilisables par T178. Horodatage et callback d’application ont lieu autour du vrai dessin,
  sans nouvel IPC, champ d’instantané, écriture disque ou statistique produit obligatoire.
- Rendre le chemin d’application des cartes réutilisable avec les vrais `jobEntry` et `KeyedList`,
  sans reconstituer le renderer par réécriture de son source ni recopier son dessin dans un test.
  Limiter toute extraction de dessin à ce qui rend la couture et ses cartes observables.
- Ajouter `tests/state-delivery.test.cjs`, avec l’horloge commune de T058, frames contrôlées et
  document minimal pour les vraies cartes. Réutiliser les helpers DOM existants s’ils suffisent,
  sinon compléter leur seule surface nécessaire. Garder les gardes d’imports/IDs/bridge de T016
  et les scénarios de fraîcheur de T129 ; remplacer seulement une garde de placement touchée.
- Ajouter un ADR au premier numéro libre sur la couture, ses dépendances et sa libération.
  Ne pas modifier capture, cartes/modèles, protocole du preload ou règles de fraîcheur T129.
  Aucun scénario de mesure, fournisseur, Electron, installation ou changement de harnais ici.

## Critères d'acceptation

1. Le vrai module s’importe sans navigateur. Plusieurs états de la même source reçus avant une
   frame produisent une seule application du dernier état. Le callback de réception précède celui
   d’application, qui n’est observé qu’au retour du vrai dessin.
2. Sans frame, le timer applique à 100 ms ; si la frame arrive avant, elle annule le secours.
   Une frame tardive après le secours ne redessine pas. Le test conduit les deux ordres et vérifie
   comptes de dessins, nœuds/texte des vraies cartes et aucune minuterie de secours restante.
3. Des états de session, approfondissement et vérification gardent leurs effets sur la même page,
   sans mélange entre sources. Les lectures écartées par T129 n’appliquent rien, et une poussée
   plus récente reste visible après résolution d’une ancienne lecture.
4. Libérer annule timer et frame détenus, puis rend leurs callbacks tardifs sans effet. La
   libération répétée ne réarme rien ; l’horloge expose `armed = 0` à la fin de chaque cas.
5. Un cas de câblage reçoit une question par le faux bridge de la page minimale et observe sa
   carte réelle après la frame. Une mutation qui programme un deuxième dessin après le secours
   rend le test du critère 2 rouge ; sortie au journal puis mutation retirée.
6. Les tests de couture, fraîcheur, cartes et contrôles Mac passent en séquentiel avec leurs
   assertions conservées, puis `node scripts/check.mjs` est vert. Le journal donne l’interface
   réutilisable par T178 et les fichiers de rendu réellement traversés.

## Test d'acceptation attendu

`tests/state-delivery.test.cjs` importe la couture réelle et conduit réception, frame, secours et
libération. L’application utilise les vrais constructeurs de cartes et la vraie réconciliation DOM ;
un callback qui compte seulement sans dessiner ne vaut pas preuve d’application. Un cas de page
minimale vérifie le câblage au bridge sans démarrer Electron.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T168 implique T167, T129, T016, T021 et T150 ; T058 fournit l’horloge sans nouvelle copie locale.
Relire leurs interfaces livrées avant de déplacer réception et dessin. Ce ticket fournit une
couture d’ordonnancement et d’application, sans mesure physique de pixels ou objectif de latence.
Le scénario de mesure et sa corrélation serveur/TV restent dans T178.

## Journal

### Exploration

- Lecture des consignes, règles, ADR 0003/0018, renderer, cartes, réconciliation, fraîcheur et horloge commune.
- État initial : seul le statut du ticket est modifié ; deux dossiers non suivis préexistants conservés.
- Exploration et absence d’écart consignées dans `.harness-state/tickets/T183/`.
- Prévu : ordonnanceur par dessin session/chat, adoption immédiate, observations locales et libération ;
  composition des cartes extraite sans changer leurs constructeurs ni les règles de fraîcheur.

### Couture et cartes

- `node --test tests/state-delivery.test.cjs` : rouge observé sur l’assertion d’adoption du dernier
  état (`red-burst.log`), puis 1/1 vert (`green-burst.log`). Les imports réussissent sans DOM.
- Même commande : rouges sur le secours absent et sa concurrence avec la frame (`red-fallback.log`),
  puis 3/3 verts (`green-fallback.log`). Horloge T058 et frames conduites ; cartes réelles dessinées.
- Même commande : rouge sur l’abonnement du bridge absent (`red-bridge.log`), puis 5/5 verts
  (`green-bridge.log`). Rouges sur les lectures initiales et la garde d’archive (`red-freshness.log`),
  puis 8/8 verts (`green-freshness.log`).
- Même commande : rouge sur une session absente qui était adoptée (`red-null-session.log`), puis
  10/10 verts (`green-release.log`). La libération annule les deux groupes, abonnements et lectures.
- `node --test --test-name-pattern='the window tracks pushes' tests/mac-ui.test.cjs` : rouge observé
  sur la garde de composition avant branchement (`red-renderer.log`).
- `node --test --test-concurrency=1 tests/state-delivery.test.cjs tests/mac-ui.test.cjs` : 52/52 verts
  après branchement (`green-renderer.log`). Les six scénarios de fraîcheur existants restent inchangés.
- `node scripts/check.mjs --changed` : premier passage rouge uniquement pour l’import `agree` devenu
  inutilisé (`check-changed-first.log`), import retiré ; second passage vert, 54/54 tests JS
  (`check-changed-second.log`). Aucun assouplissement des règles ni du gel.
- `node --test tests/state-delivery.test.cjs` : 13/13 verts (`card-application.log`), dont effets d’une
  session sur les boutons des vraies citations, erreur du vrai dessin sans observation d’application
  et lecture initiale de vérification acceptée. Les cas finissent avec `armed = 0`.

### Mutation exigée

- Mutation temporaire : retrait de la comparaison d’identité du lot dans `fire`, permettant à une
  ancienne frame de redessiner après le secours.
- `node --test --test-name-pattern='the timer wins once' tests/state-delivery.test.cjs` : rouge,
  assertion `old callbacks must not consume a new batch`, trois dessins au lieu d’un. Sortie complète :
  `.harness-state/tickets/T183/mutation-duplicate-after-fallback.log`.
- Mutation retirée, même module restauré ; `node --test tests/state-delivery.test.cjs` : 10/10 verts
  (`green-after-mutation.log`), avant les trois cas supplémentaires de cartes.

### Interface réutilisable et chemins traversés

- `createStateDelivery({ sources, draws, now, requestFrame, cancelFrame, setTimer, clearTimer,
  onReceived?, onApplied? })` expose `receive(source, state)`, `schedule(group)` et `release()`.
  Chaque source fournit `adopt` et son `group` ; chaque groupe fournit un vrai dessin synchrone.
  Les observations portent `{ source, emissionId, receivedAt }`, puis aussi `appliedAt` au retour du
  dessin. Les états remplacés avant dessin ne sont pas annoncés comme appliqués.
- `bindPushedStates({ bridge, delivery, changed, onError })` expose `beginDeepRead()` et `release()`.
  Les gardes de fraîcheur sont toujours celles de `freshness.mjs` ; l’archive vérifie sa garde après
  toutes ses lectures. Le déchargement de page retire les abonnements et libère les attentes.
- `createChatView({ list, box, intro, queueStatus })` renvoie le dessin des cartes à partir du contexte,
  des états deep/vérification et de l’écho de question. Réutilisable par T178 avec les observateurs.
- Rendu traversé : `renderer.js` compose `state-delivery.mjs` et `chat-view.mjs` ; les tests de page
  minimale traversent le même branchement, `job-card.js`, `job-view.mjs`, `format.js`, `list-view.mjs`
  et les modèles de présentation associés. Aucun source du renderer n’est réécrit pour l’exécuter.
- ADR ajouté : `docs/adr/0025-la-livraison-des-etats-mac-possede-ses-dessins-et-ses-attentes.md`.

### Validation finale

- `node --test --test-concurrency=1 tests/state-delivery.test.cjs tests/mac-ui.test.cjs tests/mac-capture-actions.test.cjs tests/mac-ipc-contract.test.cjs tests/capture-controller.test.cjs tests/recording.test.cjs` :
  128/128 verts, sans Electron natif ni fournisseur réel (`mac-sequential.log`).
- `node scripts/check.mjs --changed` : vert, 57/57 tests JS ; règles, format, lint, gel et cliquet verts
  (`check-changed.log`).
- `git diff --check` : code de sortie 0.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet verts ; 115 fichiers JS,
  1 443/1 443 tests JS et 22/22 tests Python (`.harness-state/tickets/T183/check-full.log`).
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T183/verdict.json`. Relecture et intégration
  laissées à la boucle ; aucun commit ni push. Les dossiers non suivis préexistants restent intacts.

### Reprise après relecture 1

- Rapport `.harness-state/tickets/T183/relecture-1.md`, ticket/journal, écarts, `git status --short`
  et `git diff` relus. Trois mineurs confirmés : secours dupliqué, nom du test de garde d’archive
  trop large et tolérance de l’écho non nommée. Aucun constat contesté ni nouvel écart.
- Les corrections conservent les valeurs et toutes les assertions ; tests existants lancés d’abord.
- `node --test --test-concurrency=1 tests/state-delivery.test.cjs tests/mac-ui.test.cjs` avant
  correction : 57/57 verts (`correction-1-before.log`).
- Constat 1 corrigé : `FALLBACK_MS` exporté par la couture, importé et utilisé par `batched` ;
  définition unique à 100 ms, mêmes consommateurs. ADR 0025 précisé. La garde de composition
  existante attend cet import partagé avant l’édition de production :
  `node --test --test-name-pattern='the window tracks pushes' tests/mac-ui.test.cjs` rouge sur
  son assertion d’import (`correction-1-red-import.log`).
- Constat 2 corrigé : test renommé en
  `an archive deep-read guard is overtaken by a later deep read or deep push, not by a verification push`.
  Corps et assertions inchangés ; l’ordre dans le renderer reste couvert par la garde existante.
- Constat 3 corrigé : la tolérance d’écho utilise `ECHO_TOLERANCE_MS = 1000`, au même endroit que
  `STICK_PX`. Extraction de littéral sans changement de comportement ; aucun faux rouge ajouté.
- `node --test --test-concurrency=1 tests/state-delivery.test.cjs tests/mac-ui.test.cjs` après
  correction : 57/57 verts (`correction-1-after.log`).
- `node scripts/check.mjs --changed` : vert, 57/57 tests JS, règles, format, lint, gel et cliquet
  verts (`correction-1-check-changed.log`).
- `git diff --check` : code de sortie 0. Aucun test ajouté, supprimé ou assoupli pour ces corrections.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet verts ; 115 fichiers JS,
  1 443/1 443 tests JS et 22/22 tests Python (`correction-1-check-full.log`).
- Les trois constats mineurs de la relecture 1 sont corrigés. Nouveau verdict `TERMINÉ` écrit ;
  aucun commit, push ou lancement de relecteur. Relecture de correction laissée à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T183/relecture-2.md : **Écart accepté (helper de document) :** `ecarts.md` ne déclare aucun écart aux critères. La note sur le helper `tests/helpers/mac-document.cjs` reste acceptée, pour la même raison qu'en relecture 1 : le helper TV ne fournit pas les opérations DOM dont `KeyedList` a besoin.
