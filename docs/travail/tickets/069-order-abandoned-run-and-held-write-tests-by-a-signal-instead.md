---
id: T069
titre: Order abandoned-run and held-write tests by a signal instead of a delay
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Quatre tests attendent le fait qui ordonne leur scénario : fin d'un lancement Whisper abandonné,
disparition de son processus, entrée d'une écriture tenue et début de fermeture, ou rejet avec la
raison de l'appelant. Leur preuve ne dépend plus d'une pause supposée suffisante sous charge.

## Sources

- `docs/audit-architecture.md`, rapport B, B7 ; rapport A, B8 ; annexe, réserve T100.
  Décision du propriétaire, le 16/10 : viser notamment le test Whisper abandonné.
  L'échec historique à 5 003,68 ms n'a pas été reproduit et sa cause reste inconnue :
  ne pas le déclarer corrigé ni l'attribuer à la charge.
- Code vérifié à `8340014` : `tests/review-regressions.test.cjs:112` est le test
  « an abandoned Whisper run settling late does not unregister the run that replaced it ».
  `tests/review-regressions.test.cjs:120` fait répondre le faux enfant après 400 ms ;
  `tests/review-regressions.test.cjs:130` suppose après 120 ms que l'ancien run est réglé.
- `adapters/local-transcriber.cjs:60` protège le registre par l'identité du run dans finally ;
  `adapters/local-transcriber.cjs:67` oublie le run abandonné et annule son signal ;
  `adapters/local-transcriber.cjs:81` démarre le vrai enfant, tué à
  `adapters/local-transcriber.cjs:86`. La méthode run est enveloppable sur l'instance en test.
- `tests/transcriber-sharing.test.cjs:9` crée le faux binaire à durée fixe ;
  `tests/transcriber-sharing.test.cjs:46` emploie 600 ms et n'enregistre pas de PID.
  Le nettoyage actuel ne prouve donc pas qu'un enfant retenu est parti.
- `tests/chat-instruction.test.cjs:61` retient put ; `tests/chat-instruction.test.cjs:65`
  attend 20 ms avant de le libérer. La fermeture lève maintenant le domaine par
  `runtime/session-closing.cjs:73` et `runtime/session-lifecycle.cjs:69`.
  L'ancien emplacement dans session-runtime a disparu avec l'extraction de l'ADR 0020.
- `tests/local-vlm-agent.test.cjs:94` attend une première requête sans réponse ;
  `tests/local-vlm-agent.test.cjs:103` mesure un délai mural inférieur à une seconde.
  L'identité de la raison et la fermeture sans réponse sont déjà vérifiées.
  `adapters/local-vlm-agent.cjs:43` combine signal appelant, délai propre et fermeture.
- `tests/helpers/wait.cjs:31` fournit until nommé ; `tests/helpers/wait.cjs:70` fournit bounded,
  qui retourne une sentinelle à l'échéance : l'assertion du test doit la refuser explicitement.
  ADR 0007, 0015 et 0020 : ordre de fin et sens des bornes.

## Périmètre

- Modifier seulement les quatre fichiers de tests cités et leurs fixtures locales. Réutiliser les
  helpers déjà livrés dans `tests/helpers/wait.cjs`. Ne pas changer les titres, valeurs attendues ou code produit.
- Review-regressions : garder le vrai LocalTranscriber devant un vrai faux binaire, avec PID et
  libération explicite par fichier ou pipe. Envelopper run pour observer ses promesses et retenir
  le règlement du premier jusqu'à ce que le remplaçant soit enregistré et réellement démarré.
  Libérer ensuite le règlement du premier et attendre que son finally ait été exécuté.
  Le remplaçant reste tenu pendant le troisième appel : sinon le cache pourrait faire passer le
  test sans vérifier le partage. Seulement alors libérer le faux enfant et attendre les résultats.
- Transcriber-sharing : remplacer les 600 ms du scénario d'abandon par la même poignée de main.
  Suivre les PID, prouver que l'enfant abandonné disparaît avant de libérer le nouveau, puis garder
  les résultats et événements start/start/end. Les autres scénarios de partage gardent leur sens.
- Chat-instruction : signaler l'entrée réelle du second put, lancer la fin et observer
  watch.ending avant de libérer l'écriture. Les preuves de passage conservé, absence de toute
  transcription/description tardive et archive confirmée restent.
- Local-vlm-agent : retirer abortedAt et la comparaison d'une seconde. Le serveur ne répond toujours
  pas à la première requête. Borner l'attente et exiger error === reason, fermeture avant réponse,
  refus d'un signal déjà annulé et réutilisation de l'agent. La sentinelle de bounded est un échec.
- Tout processus retenu est libéré puis, si nécessaire, tué dans t.after ; attendre sa disparition
  avant de retirer ses fichiers. Une attente de sécurité échoue avec le fait/PID manquant.
  Ne relever ni les 5 s du helper ni les délais produit pour stabiliser le scénario.
- Les mutations de preuve restent dans des copies isolées et sont retirées après observation.
  Hors périmètre : expirations voulues, autres tests de performance et injection des minuteries produit.

## Critères d'acceptation

1. Les pauses fonctionnelles 120 ms, 20 ms et 600 ms du périmètre disparaissent, ainsi que la
   mesure abortedAt. Les événements/promesses décrits les remplacent ; chaque attente est bornée.
2. Dans le test du registre, le journal d'événements prouve l'ordre premier abandonné →
   remplaçant vivant → premier réglé → troisième appel → libération du remplaçant.
   Les deux réponses sont Bonjour et il n'y a que deux démarrages, avec cache encore vide lors du
   troisième appel. Un simple allongement de la pause ne satisfait pas le critère.
3. Les deux scénarios à enfant réel prouvent sa disparition après abandon et dans le nettoyage,
   y compris après échec d'assertion. Le répertoire n'est jamais retiré sous un enfant vivant.
4. Les quatre mutations suivantes sont détectées par la nouvelle version ; consigner aussi leur
   résultat sur le test initial dans la copie isolée :
   - retirer la garde d'identité du finally du transcripteur déclenche un troisième lancement ;
   - désactiver le kill d'abandon laisse un PID vivant et fait échouer son attente ;
   - retirer ensemble les deux appels beginEnding du protocole et du cycle de ressources fait
     échouer le scénario d'écriture tenue ;
   - retirer le signal appelant du signal combiné local empêche le rejet attendu avec sa raison.
   Une protection déjà présente avant réécriture doit rester détectée ; aucun mutant vert n'est
   présenté comme preuve acquise.
5. Les assertions métier des quatre tests gardent leurs valeurs, avec seulement le remplacement
   explicite de la mesure murale par une preuve causale. Consigner une série fixée à l'avance de
   dix exécutions séquentielles des quatre fichiers ; au premier échec, arrêter et diagnostiquer,
   sans relancer sélectivement pour obtenir dix verts.
6. À l'implémentation, mutations retirées, `node scripts/check.mjs` est vert.
   La cause de l'incident Whisper historique reste inconnue sans reproduction supplémentaire.

## Test d'acceptation attendu

Les quatre tests existants, surtout celui du registre Whisper, passent par leurs frontières
actuelles : vrai enfant, vrai runtime sur ports contrôlés, vrai backend HTTP local.
Le run enveloppé règle l'ordre du scénario sans exposer une nouvelle API de production.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T199 implique T178. T069 passe tôt, sans attendre T062 : l'échec historique a été observé sous
charge et les coutures nécessaires sont déjà accessibles dans ces quatre tests. Trois fichiers
importent déjà wait.cjs ; aucune migration de T062 n'est requise pour le quatrième.
T057/T058/T059/T063/T064 ne sont plus requis.
Le test ne mesure ni une vitesse Whisper réelle ni une fréquence d'intermittence.

## Journal

- Exploration : coutures confirmées sur les instances réelles, sans API produit nouvelle. Plan et écarts
  dans `.harness-state/tickets/T069/`. Comparaison des mutations sur tests initiaux puis réécrits,
  dix exécutions séquentielles fixées à l'avance, puis contrôles changed et complet.
- Rouge/vert : `python3 .harness-state/tickets/T069/mutations.py initial`, puis `causal`, dans des
  copies temporaires supprimées. Initial : registre rouge (3 lancements), kill rouge (2 end),
  fermeture verte, signal refusé par timeout du test (10 s). Réécrit : quatre rouges sur les assertions
  ciblées (3 lancements, PID vivant, ending absent, sentinelle refusée au lieu de la raison).
  Journaux `initial-*.log` et `causal-*.log` conservés dans le dossier d'état.
- Diagnostic de fixture : première exécution saine rouge sur texte vide ; le faux enfant avec fs.watch
  quittait sur EMFILE (observé sur stderr). Remplacement par sondage du fichier de libération,
  sans libération temporelle. Détail dans `fixture-diagnostic.md` ; les premières mutations
  `rewritten-*` ne servent pas de preuve pour cette fixture défectueuse.
- Vert : `node --test --test-concurrency=1 tests/review-regressions.test.cjs tests/transcriber-sharing.test.cjs tests/chat-instruction.test.cjs tests/local-vlm-agent.test.cjs`
  donne 33/33 (`green.log`). `node scripts/check.mjs --changed` : vert, 33/33 (`check-changed.log`).
- Série fixée : `python3 .harness-state/tickets/T069/repeat.py` : dix exécutions séquentielles,
  chacune à 33/33, aucun échec (`series-01.log` à `series-10.log`).
- Nettoyage après assertion échouée : `python3 .harness-state/tickets/T069/cleanup.py`, copies isolées
  supprimées après observation. Troisième lancement tardif (mutation du registre), assertion forcée
  avec remplaçant retenu, puis enfant ignorant la libération (kill de secours) : échecs attendus,
  respectivement 3, 2 et 2 PID enregistrés, aucun vivant au retour, aucun répertoire de fixture restant
  (`cleanup.json`, `cleanup-*.log`). Les attentes de disparition précèdent la suppression.
- Contrôle final : `node scripts/check.mjs` : vert, 120 fichiers JS, 1 652 tests JS réussis,
  22 tests Python réussis (`check-full.log`). `git diff --check` : vert.
- Livraison : pauses du périmètre et abortedAt remplacés par signaux bornés ; processus libérés et
  disparition des PID vérifiée avant suppression, y compris après assertion échouée. Aucun changement
  du code produit ou du harnais, aucun commit/push. La cause de l'incident historique reste inconnue.
- Reprise de relecture 1 : trois mineurs acceptés. Préparation d'une preuve isolée de règlement trop
  précoce, observation du journal depuis la promesse réelle, déplacement de la fixture vers helpers
  et séparation des instructions. Aucun changement du périmètre, aucune contestation.
- Correction 1, preuve rouge/verte : `python3 .harness-state/tickets/T069/settlement-proof.py correction-before`
  laisse passer le règlement forcé avant le remplaçant (exit 0) ; `correction-after` le refuse sur
  « the abandoned result is still held while the replacement is alive » (exit 1). Le journal observe
  désormais le finally de la promesse abandonnée ; la libération est inscrite après son écriture.
- Correction 2 : fixture déplacée dans `tests/helpers/held-whisper.cjs`, imports ajustés.
  `node_modules/.bin/eslint --max-warnings=0 tests/fixtures/held-whisper.cjs` refusait l'avertissement
  de fichier ignoré (exit 1) ; sur `tests/helpers/held-whisper.cjs`, exit 0 sans avertissement.
  Correction 3 : instructions séparées dans les deux rejets, le put tenu et le try de alive.
- Vérifications de correction : les quatre fichiers donnent 33/33 (`correction-green.log`).
  `python3 .harness-state/tickets/T069/correction-mutations.py correction` : quatre rouges ciblés.
  `python3 .harness-state/tickets/T069/correction-cleanup.py` : trois échecs forcés, 3/2/2 PID tous
  disparus, aucun répertoire restant. Toutes ces perturbations sont restées dans des copies supprimées.
- Nouvelle série fixée : `python3 .harness-state/tickets/T069/correction-repeat.py`, dix passages
  séquentiels à 33/33, aucun échec (`correction-series-*.log`). `node scripts/check.mjs --changed` :
  vert, 33/33 (`correction-check-changed.log`).
- Contrôle complet après correction : `node scripts/check.mjs` vert, 1 652/1 652 tests JS et
  22 tests Python réussis (`correction-check-full.log`). `git diff --check` : vert. Les trois
  constats de la relecture 1 sont corrigés ; nouveau verdict TERMINÉ, sans réserve propre.
  La cause de l'incident Whisper historique reste inconnue. Aucun commit ni push.
