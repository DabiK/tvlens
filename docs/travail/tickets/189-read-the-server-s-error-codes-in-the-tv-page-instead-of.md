---
id: T189
titre: Read the server's error codes in the TV page instead of matching its texts
statut: a-faire
bloque_par: T201
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La TV classe les refus par leurs codes et conserve ces codes jusqu'au rapport de capture affiché.
Une séquence ancienne refusée 409 ne devient plus une archive en lecture seule dans l'interface ;
reformuler une phrase du serveur ne change plus le repli des vues ou le diagnostic de capture.

## Sources

- `docs/audit-architecture.md`, rapport A, B4 et D4 ; rapport B, B2. Décision du propriétaire,
  le 16/10 : migrer les lecteurs TV après les catalogue T201 sur le transport T188.
- Code vérifié à `8340014` : `tv/app/remote-client.js:13` construit une erreur avec status et code,
  mais `tv/app/chat-model.js:217` classe une vue inconnue par 404 ou une phrase de 400.
  `tv/app/chat-model.js:244` transforme ce classement en repli permanent ou temporaire.
- `tv/app/sessions-view.js:241` décrit la capture ; ses lignes 253 et 255 recherchent 507 et 409
  dans le dernier texte d'erreur. Les motifs structurés stopReason/connection existent déjà à côté.
- La chaîne de cette erreur est distincte du polling serveur : `tv/transport.py:22` décode le code,
  `tv/transport.py:85` l'abandonne sur un refus définitif générique au profit de `HTTP <status>`,
  `tv/capture.py:42` construit le rapport sans champ de refus et `tv/capture.py:65` assimile tout
  409 de démarrage à read-only. `tv/controller.py:96` sert le rapport sur `/capture` ;
  `tv/app/capture-control.js:39` le lit puis transmet son contenu au modèle de présentation.
- Tests : `tests/tv-panel.test.cjs:123` pour les replis, `tests/tv-panel.test.cjs:191` pour le
  transport et `tests/tv-panel.test.cjs:482` pour la capture ;
  `tests/test_tv_control.py:237` distingue les 409 dans le transport mais attend encore
  `HTTP 409` dans le rapport ; `tests/test_tv_capture.py:181` épingle les champs du rapport.
  Lire aussi `tests/tv-chat-model.test.cjs`, `tests/tv-poll-controller.test.cjs`,
  `tests/tv-paired-page.test.cjs` et `tests/tv-chat-view.test.cjs`.
- ADR 0011, 0026 et 0027 : scripts classiques, propriétaire du polling et vue de conversation.

## Périmètre

- Faire lire `unknown-view` de T201 dans `chat-model.js`. Garder le repli permanent pour un 404
  sans code d'un ancien serveur, ou `route-not-found` sur la lecture d'une vue. Un autre 400 garde
  le repli temporaire existant ; un 401, un 5xx ou un refus étranger ne signifie pas vue inconnue.
  Supprimer la reconnaissance de la phrase française, sans supprimer la compatibilité 404.
- Ajouter au rapport Python `lastRefusal`, nul au départ puis `{ status, code }` lors d'un refus
  HTTP. Le mettre à jour au démarrage et à la livraison ; conserver le dernier refus rencontré,
  sans ajouter de file. Le contrôleur transmet ce champ tel quel. Les textes de `errors` restent
  des diagnostics affichables, jamais des clés de décision.
- Dans `transport.py` et `capture.py`, identifier read-only par son code et conserver les autres
  codes, notamment `stale-sequence`, `sequence-conflict` et `capture-changed`. Un 409 générique ne
  devient plus read-only au démarrage. Les raisons locales structurées déjà présentes restent
  valides ; 507 sans code peut conserver son sens non ambigu pour un ancien serveur.
- Faire consommer ce refus structuré par `sessions-view.js`, avec stopReason, connection et
  contexte serveur. Supprimer les regex 409/507 sur `errors`. Un ancien rapport sans lastRefusal
  reste lisible : ses raisons structurées sont reconnues, ses textes seuls restent génériques.
- Ajouter les tests aux modèles, au polling et à la capture Python. Une fixture JSON de rapport
  refusé, utilisée par les tests Python et JavaScript, relie le producteur au rendu sans installer
  la TV. Adapter la liste exacte des champs et les attentes des anciens tests ; déclarer dans
  `ecarts.md` les changements de caractérisation des regex et du 409 de démarrage. Écrire un ADR
  court pour le champ additif et les replis des versions antérieures.
- Ne changer ni statuts serveur, ni contrat de Range, ni nombre/durée des reprises, ni TTL des
  blocs, ni comptabilité des pertes, ni règle « première cause d'arrêt gagnante ». Aucun lancement
  de capture ou redémarrage automatique ; pas de framework, d'ESM ou de nouveau protocole versionné.

## Critères d'acceptation

1. Une vue refusée 400 `unknown-view`, avec un texte arbitraire, déclenche le repli permanent.
   La même phrase française sans ce code est seulement un 400 temporaire ; un code différent
   contenant cette phrase ne devient pas unknown. Le 404 ancien sans code reste compatible.
2. Le client JS conserve status/code sous une reformulation. Les lectures réelles du contrôleur
   de polling conservent cadence, repli temporaire, gestion des 401, backoff des 5xx et absence de
   concurrence ; la nouvelle classification ne dépend d'aucune ponctuation ni langue de message.
3. Le faux serveur Python répond successivement read-only, storage-full, stale-sequence et
   sequence-conflict : les codes et statuts se retrouvent dans lastRefusal à l'arrivée dans le
   rapport. Un refus de séquence reste un bloc rejeté, sans arrêt pour lecture seule ni nouvelle
   tentative ; les compteurs sent/dropped/dropReasons et les règles de reprise restent exigés.
4. Au démarrage, 409 `read-only` garde son diagnostic ; 409 avec un autre code reste un refus
   générique. Un 507 ancien sans code est encore stockage plein. Les textes reformulés, ou contenant
   un nombre 409/507 sans refus structuré correspondant, ne changent aucune de ces décisions.
5. La fixture de rapport Python est rendue par `describeCapture`, puis par le contrôle `/capture`
   du banc de page : un conflit de séquence ne propose jamais de reprendre une archive, tandis que
   le code read-only donne le diagnostic attendu. La page n'extrait aucun numéro de statut du texte.
6. Un rapport historique sans lastRefusal reste affichable, avec les motifs structurés existants,
   les diagnostics génériques et les compteurs conservés. Aucun texte issu du réseau n'est inséré
   en HTML ; les scripts restent chargeables dans leur ordre réel sur le banc appairé.
7. Les tests JS cités passent en séquentiel, puis les suites Python `test_tv_control.py` et
   `test_tv_capture.py`, avec faux réseau et fausse capture ; `node scripts/check.mjs` est vert à
   l'implémentation. Aucun test n'est supprimé et les attentes remplacées sont nommées au journal.

## Test d'acceptation attendu

Dans `tests/test_tv_control.py` et `tests/test_tv_capture.py`, conduire le transport et le démarrage
réels sur des refus contrôlés et comparer lastRefusal à la fixture commune. Dans
`tests/tv-panel.test.cjs`, rendre ce même rapport par `describeCapture` ; dans le banc de page
appairée, servir la fixture sur `/capture` et vérifier texte et action proposés. Les tests de
polling font varier le message à code constant, puis le code à message constant.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T201 fournit le catalogue et implique T188, T124, T199 puis T178. lastRefusal est un ajout technique borné
au rapport existant. La compatibilité ne repose pas sur les anciennes phrases : 404 et 507 ont un
sens de transport explicite, un 409 sans identité reste générique. Ce ticket ne prétend pas livrer
le contrat serveur–TV versionné prévu pour la vague 2, ni valider le moteur d'une TV réelle.

## Journal
