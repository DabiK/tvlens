---
id: T242
titre: Pause TV capture and resume from the server session clock
statut: a-faire
bloque_par: T241
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La pause demandée depuis la page TV arrête sa capture locale et met la session nommée en pause
sur le serveur. La reprise relance la capture sur l'horloge de cette session, sans compter le
temps passé en pause et sans interrompre les analyses ou questions déjà lancées.

## Sources

- `docs/domaine.md`, section 10 ; ADR 0030. T241 apporte les commandes nommées ; T204 a fixé
  le comportement Python réel et T038 le client TV. Les lire avant de changer le contrôle.
- Code vérifié à `1d8aa48` : `tv/app/capture-control.js:43` commande le contrôleur local,
  `:76` à `:88` basculent seulement start/stop local. `tv/controller.py:51` demande l'arrêt
  puis attend le processus sur un thread ; sa première réponse ne confirme pas encore sa sortie.
- `tv/app/companion.js:72` câble reprise/fermeture serveur ;
  `tv/app/sessions-view.js:473` ne pause le serveur qu'avant une action de bibliothèque, quand
  la TV ne capture déjà plus (`:175`). Arrêter la capture seule ne fige donc pas l'horloge serveur.
- Correction du constat du plan : `tv/capture.py:59` demande déjà start au serveur ; `:72`
  prend `session['elapsedMs']` comme décalage et une origine monotone ; `:90` calcule les temps
  depuis ces deux valeurs. Il ne part pas simplement de zéro. T204 exige déjà ce décalage non nul.
- `runtime/headless-session-lifecycle.cjs:58` décrit l'horloge au démarrage/reprise ;
  `runtime/session-lifecycle.cjs:162` la fige à la pause. `tv/transport.py:55` relit la session
  avant livraison, mais `/v1/session` ne publie pas elapsedMs (`server/state-routes.cjs:5`).
- Code et tests Python, wire-contract, tv-paired-page et les modèles de sessions ont été lus
  en entier. `tests/test_tv_capture.py:456` vérifie déjà un offset serveur non nul ;
  `tests/tv-paired-page.test.cjs` charge les vrais scripts de page avec les deux clients contrôlés.

## Périmètre

- Modifier la coordination de `tv/app/capture-control.js`, ses hooks dans companion, les appels
  de pause de sessions-view et les méthodes nécessaires de remote-client. Étendre les tests
  de page et Python. `tv/controller.py` ne change que si sa confirmation existante doit être
  exposée autrement ; ne pas lui donner la décision de fin ou des commandes shell paramétrables.
- Mémoriser l'identité visée au geste de pause. Demander stop local, attendre `active:false`
  et l'absence d'arrêt en cours, puis appeler la pause nommée T241 ; réutiliser une attente
  bornée et maîtrisée par les tests. Un simple POST stop réussi ne vaut pas confirmation locale.
  Le geste est celui du bouton `capture` existant, dont l'arrêt devient une pause de session ;
  adapter son libellé et son modèle sans créer un second bouton de pause concurrent.
- La reprise est un geste explicite : reprendre la session nommée côté serveur, puis relancer
  la capture locale. Vérifier dans les états/rapports que la capture appartient à cette session ;
  un changement concurrent de session est montré comme refus, jamais comme reprise confirmée de l'ancienne.
- Conserver l'origine Python déjà correcte : chaque nouveau lancement reprend l'elapsedMs donné
  par le serveur et mesure ensuite des deltas monotones. Renforcer le test pour une pause longue
  suivie de reprise avec décalage non nul ; ne pas ajouter une synchronisation continue ou une
  nouvelle horloge civile. Corriger le producteur seulement si ce parcours révèle un écart établi.
- Afficher la confirmation de pause complète seulement quand les deux côtés sont confirmés.
  Si le contrôleur ou le serveur refuse, conserver les faits acquis et proposer un nouvel essai
  explicite, sans reprise automatique compensatoire. Une réponse ou un poll ancien ne confirme
  pas une commande plus récente ; garder les protections de révision et le focus télécommande.
- Les analyses et questions admises continuent ; aucun appel à end, annulation de file ou reprise
  d'archive implicite. Les anciens start/stop du contrôleur et clients sans identité restent admis.
  Le fetch reste dans remote-client, les scripts classiques et les libellés français indexés par codes.
- Ce lot est un parcours vertical de pause/reprise ; la fin et ses deux confirmations durables
  sont affichées par T243, à partir du résultat serveur T250. Aucun découpage général de Python, nouvelle source, protocole de rapport renommé,
  installation ou commande sur une TV réelle. Élaguer les suppressions ESLint devenues inutiles.

## Critères d'acceptation

1. Le bouton capture, en action de pause, attend l'arrêt local puis envoie le `sessionId` figé au geste. Après
   confirmation serveur, admission et horloge sont arrêtées ; avancer l'horloge du banc ne crée
   aucun bloc et ne fait pas avancer la session. Une question et une analyse déjà admises terminent.
2. Une reprise explicite de cette session précède start local. Les premiers `startMs`, `endMs`
   et `frames[].atMs` Python utilisent le nouvel offset serveur et ses deltas monotones, sans
   inclure la durée de pause ni revenir à zéro. Identité et séquences restent cohérentes avec l'époque serveur.
3. Contrôleur lent/inaccessible, stop non confirmé, pause serveur refusée et reprise disque bloqué
   donnent chacun un état fidèle. Aucun échec ne relance tout seul la capture ni n'annonce la
   pause complète ; une identité serveur changée laisse la nouvelle session intacte.
4. Double appui, poll tardif et changement de contexte ne contournent ni l'attente locale ni la
   cible nommée. Lecture seule garde son choix explicite « Reprendre ici »/« Nouvelle session ».
   Les anciens appels locaux start/stop restent admis ; l'ancien client serveur sans identité
   conserve le comportement T241, sans promettre une pause locale qu'il n'a pas commandée.
5. À l'implémentation, jouer les suites JS de page/client/fil en séquentiel, puis
   `python3 -B -m unittest discover -s tests -p 'test_tv_control.py'` et la même commande pour
   `test_tv_capture.py`, puis `node scripts/check.mjs`. `--changed` seul ne couvre pas Python.
   Aucune perte n'est effacée des compteurs et aucun test historique indépendant n'est supprimé.

6. Après un arrêt `idle` simulé, aucune pause n'est envoyée et la relance appelle
   `/capture/start` sans reprise nommée.

## Test d'acceptation attendu

Le banc de page de `tests/tv-paired-page.test.cjs` retient séparément stop local et pause serveur,
observe leur ordre et le corps nommé. Le banc T204 exécute la vraie capture avec faux Luna/arecord,
horloge monotone maîtrisée et réponses de start successives avant/après pause. Le rapport et la
fin réelle des threads/processus sont attendus ; aucun délai matériel ou fournisseur réel.
La partie serveur du critère 1 est prouvée par `tests/wire-contract.test.cjs` avec la pause
nommée émise par la méthode de `tv/app/remote-client.js` que la page appelle.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Hypothèse nommée : seul l'arrêt demandé par le bouton devient une pause, comme `watch:stop`
sur le Mac (`app/main.cjs:449-451`). Un arrêt décidé par Python (`tv/capture.py:83`, `:95`,
`:98`, `:155`) ne met pas la session en pause : comportement actuel conservé, relance par le
chemin start ; la reprise nommée n'est proposée que si le serveur dit la session en pause
(`accepting:false`, hors lecture seule). Faire pauser ces arrêts serait une décision du propriétaire.

Hypothèse technique nommée : « reprendre sur l'horloge serveur » signifie réobtenir l'origine de
session à chaque lancement, puis utiliser les deltas monotones locaux, comme le producteur actuel.
Une synchronisation continue n'est ni établie dans le code ni nécessaire au parcours demandé ;
si elle est souhaitée, elle demande un contrat distinct et une coupe Python/fil puis page.
Le lot reste borné par la réutilisation de cette origine et du contrôleur existants. Si un
changement de protocole d'horloge est nécessaire, proposer cette coupe avant de l'absorber ici.

## Journal
