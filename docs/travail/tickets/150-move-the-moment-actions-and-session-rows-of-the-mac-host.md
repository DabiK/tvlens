---
id: T150
titre: Move the moment actions and the session rows of the Mac host into their own modules
statut: a-faire
bloque_par: T148, T149
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

`app/main.cjs` écrit en ligne deux logiques qui lisent la session chargée sans la faire vivre ni mourir :
les actions sur un moment (recherche de passages, explication, rattrapage, réexamen) et les lignes de la
liste des sessions. Les questions envoyées à l'agent pour un moment sont rédigées au milieu de la
composition, et seuls les bancs qui lancent tout l'hôte les voient. Après ce ticket, chacune vit dans son
module de `app/`, selon la forme fixée par T149, et se teste sans Electron. `main.cjs` garde la table des
canaux et le cycle de vie de la session. Le comportement de l'hôte ne change pas.

## Sources

- Constat : ADP-06 (`docs/audit-maintenabilite.md`, ancre `ADP-06`).
- Plan court : section « Plan court » de `docs/travail/tickets/INDEX.md`.
- Forme à suivre : le paragraphe ajouté par T149 à la section « Interface et dépendances » de
  `docs/architecture.md`, et les modules `app/window-mode.cjs` et `app/capture-sources.cjs`.
- Code concerné, à la version `0d4c495` d'`app/main.cjs` (le nom d'abord, la ligne ensuite ; T146, T148 et
  T149 auront décalé les lignes, et T148 aura réuni la session chargée en un objet) :
  - recherche de passages : `let searchController;` et `handle('moments:search', …)` (l. 103-112). La
    session qui demande est gardée jusqu'à la réponse ; une réponse prête quand une autre session est
    chargée, ou aucune, est refusée par « Session obsolète. ». Une recherche nouvelle annule la
    précédente ; l'attente est bornée à 15 s ;
  - annulation de cette recherche au début de la fin de session :
    `searchController?.abort(new Error(reason)); searchController = null;` dans `endSession` (l. 351) ;
  - actions sur un moment : `moments:freeze` et `moments:mark` (l. 480-481), `startMomentAction`
    (l. 482-502), `moments:explain`, `moments:catch-up`, `moments:reexamine` (l. 503-509). Elles lisent
    `viewingActions` (`core/viewing-actions.cjs`), `ask` (l. 141) et `deep.jobs` ;
  - lignes de la liste : `sessionRows` (l. 312-325), qui complète la liste lue par `library.list` avec
    les chiffres en mémoire de la session chargée, et la rend avec la session courante ;
  - restent dans `app/main.cjs` : `storageInfo` et `storageShown` (l. 328-332), le raccourci
    d'explication (`globalShortcut`, l. 510-521), `keepMoment` et les canaux `saved:*` et `viewing:*`.
- Tests protecteurs : `tests/mac-ipc-contract.test.cjs` (la l. 716 vérifie le refus « Session obsolète. »
  après un changement de session), `tests/architecture-f07.test.cjs` (l. 571, recherche annulée par la fin
  de session), `tests/architecture-f05.test.cjs`.

## Périmètre

- À modifier :
  - créer `app/moment-actions.cjs`, qui exporte une fabrique. Elle reçoit une fonction qui rend la session
    chargée au moment de l'appel, `ask`, `viewingActions` et les questions de la conversation (`deep`).
    Elle rend les fonctions des canaux `moments:search`, `moments:freeze`, `moments:mark`,
    `moments:explain`, `moments:catch-up`, `moments:reexamine`, et une qui annule la recherche en cours
    avec une raison. Le contrôleur de la recherche vit dans l'instance. La borne de 15 s porte un nom ;
  - créer `app/session-rows.cjs`, qui exporte une fonction pure : elle reçoit la liste lue par la
    bibliothèque, la session chargée et l'heure, et rend `{ current, sessions }` tels que `sessionRows`
    les rend aujourd'hui ;
  - `app/main.cjs` : requérir ces modules en tête ; chaque canal devient une ligne `handle('…', …)` qui
    appelle le module ; `endSession` annule la recherche par le module, au même endroit qu'aujourd'hui ;
    `sessionRows` lit la bibliothèque puis appelle la fonction pure ;
  - créer `tests/moment-actions.test.cjs` et `tests/session-rows.test.cjs`.
- Forme imposée : celle de T149 (pas d'Electron requis, pas d'état de module, pas de module substitué par
  les bancs, ni `process.env` ni `process.argv`, aucun `handle('…')` ni `send('…')` dans les modules).
- À ne pas toucher :
  - les textes des questions envoyées à l'agent, au caractère près, et les options passées à `ask` ;
  - les noms des canaux, leurs entrées, leurs réponses et leurs messages d'erreur ;
  - l'ordre des étapes de `endSession` ; `closeSession({` et `settleQuestions(` restent dans
    `app/main.cjs` (`tests/architecture-f07.test.cjs:578-591`) ;
  - les canaux `watch:*`, `sessions:*` et le cycle de vie de la session ;
  - les tests existants.

## Critères d'acceptation

1. `tests/moment-actions.test.cjs`, avec une session simulée et un faux `ask`, et le vrai
   `core/viewing-actions.cjs`, vérifie :
   - une recherche sans session est refusée par « Démarre une observation. » ;
   - une recherche dont la réponse arrive après un changement de session est refusée par
     « Session obsolète. » ;
   - une recherche nouvelle annule la précédente, et l'annulation par la fonction de fin de session passe
     sa raison au signal ;
   - le rattrapage envoie à `ask` une question qui cite le début et la fin de l'intervalle en secondes,
     avec l'intention `recap` ;
   - l'explication refuse une question de plus de 1600 caractères par « Question invalide. » et une
     intention inconnue par « Action inconnue. » ;
   - un instant sans passage nouveau est refusé par « Aucun nouveau passage capturé pour cet instant. »,
     suivi de la phrase d'aujourd'hui.
2. `tests/session-rows.test.cjs` vérifie, sans bibliothèque :
   - une session en capture absente de la liste lue est ajoutée en tête, avec ses chiffres en mémoire ;
   - présente, sa ligne est remplacée par ces chiffres ;
   - une session ouverte en lecture seule garde la ligne lue, marquée `readOnly`, et n'est pas marquée
     en capture ;
   - sans session chargée, `current` vaut `null`.
3. `grep -cE "searchController|J’ai décroché|Instant sélectionné|firstTopic" app/main.cjs` rend 0. Sortie
   dans le journal.
4. `grep -nE "require\(['\"]electron['\"]\)|process\.|handle\(|send\(" app/moment-actions.cjs app/session-rows.cjs`
   ne rend rien. Sortie (vide) dans le journal.
5. Les tests existants passent sans modification : `git diff --stat` ne cite sous `tests/` que les deux
   fichiers créés.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/moment-actions.test.cjs` et `tests/session-rows.test.cjs`, frontière : la fabrique et la fonction
pure, appelées comme `app/main.cjs` les appelle. Les bancs du Mac existants, inchangés, prouvent que les
canaux répondent comme avant.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **La session est lue, pas tenue.** Les modules reçoivent une fonction qui rend la session chargée au
  moment de l'appel, jamais la session elle-même : c'est ce qui permet le refus « Session obsolète. ».
- **Les lignes de la liste restent propres au Mac.** L'hôte serveur calcule des lignes voisines
  (`runtime/headless-runtime.cjs`, méthode `sessions`) mais pas identiques : titre, dates, borne de la
  liste. Les réunir dans `runtime/` changerait ce que rend l'un des deux hôtes : hors du plan court.
- **L'espace disque reste dans l'hôte.** `storageInfo` tient `storageShown`, un état de l'hôte lu par sa
  minuterie.
- **Après T148 et T149** : T148 réunit la session chargée en un objet, que la fonction de lecture rend ;
  T149 fixe la forme des modules de l'hôte Mac.

## Journal
