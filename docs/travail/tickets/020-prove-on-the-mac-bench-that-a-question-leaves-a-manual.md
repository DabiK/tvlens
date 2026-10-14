---
id: T020
titre: Prove on the Mac bench that a question leaves a manual verification running
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

La décision « une question n'annule plus la vérification manuelle » n'est gardée que par le nombre
d'occurrences de `verifierAdapter?.cancel?.()` dans le texte de `app/main.cjs`. Après ce ticket, un test
du banc de l'hôte Mac la prouve par le comportement : une vérification lancée, une question posée
pendant qu'elle tourne, et la vérification va à son terme avec son verdict.

## Sources

- Constats : TSTC-03
- Code concerné, à la version `0d5a954` :
  - `app/main.cjs`, vérificateur simulé du mode `--smoke-test` (l.227-235) : `verify` attend 2 500 ms
    par `setTimeout`, puis rend le verdict `contradicted` avec la source
    `https://www.nasa.gov/mission/apollo-11/`. Il n'a pas de méthode `cancel`.
  - `app/main.cjs`, canaux `verify:run`, `verify:state`, `verify:cancel` (l.239-244) ; annulation à la
    fermeture (l.564).
  - `tests/mac-ipc-contract.test.cjs`, test « every bridge call has its handler, every event its
    listener, and the host no longer purges, preempts or knows Auto » (l.86) : comptages et motifs sur
    le texte (l.106-109).
  - `tests/mac-ipc-contract.test.cjs`, banc : `launch` (l.141-194), `stage` avec minuteries simulées
    (l.197-202), `until` (l.204).
  - `tests/mac-ipc-contract.test.cjs`, test « a Mac session is archived instead of purged, listed,
    reopened read-only without a write, resumed only explicitly, and deleted alone » (l.227) : lance
    `host.verify('Apollo 11 a aluni en 1970.')` (l.239), attend `done` (l.240), exige le verdict
    (l.241-242) ; ouvre ensuite une session, envoie deux passages, attend leur analyse, puis pose
    `host.ask('Que voit-on maintenant ?')` et attend la réponse par `host.deepState()` (l.245-256). La
    question y est posée après la fin de la vérification : le croisement n'est pas couvert.
- Le relecteur de l'audit propose ce test pour la décision ; la non-interruption de la surveillance par
  une question est déjà prouvée par le test « a question neither suspends nor cancels the surveillance;
  quitting archives, and the next start finds the session and its registry » (l.372).

## Périmètre

- À modifier : `tests/mac-ipc-contract.test.cjs` seulement — un cas de test ajouté, qui réutilise
  `stage`, `launch`, `until` et les aides d'envoi de passage du fichier.
- Les comptages et motifs des l.106-109 restent : ils disent « nulle part ailleurs », ce qu'un scénario
  ne prouve pas, et le vérificateur simulé n'ayant pas de `cancel`, l'effet du bouton d'annulation n'est
  pas observable sur le banc. Aucune doublure n'est ajoutée au code de production pour l'observer.
- À ne pas toucher : le code de production, les autres tests. La faute injectée pour la preuve du
  critère 3 est défaite avant la fin de la session (`git checkout -- app/main.cjs`) : aucun fichier de
  `app/` ne reste modifié par ce ticket.
- Aucun délai réel n'est attendu : le temps avance par les minuteries simulées du banc. Aucune ligne de
  plus de 160 caractères n'est ajoutée.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test --test-concurrency=1 tests/mac-ipc-contract.test.cjs` passe, avec un cas de test de plus
   qu'avant.
2. Le cas ajouté, sur un hôte lancé par `launch()` : ouvre une session, y envoie un passage et attend
   son analyse ; lance `host.verify(…)` sans l'attendre ; constate par `host.verificationState()` que
   la vérification n'est pas terminée ; pose alors une question par `host.ask(…)` ; fait avancer le
   temps jusqu'à ce que la question soit répondue (`host.deepState()`) et la vérification `done` ;
   exige pour celle-ci le verdict `contradicted`, sa source NASA et aucune limite — les valeurs de
   l'assertion existante des l.241-242.
3. Preuve que le test voit la faute, consignée au journal puis défaite : dans `app/main.cjs`, la session
   fait lever `ask` (l.141) un drapeau que le vérificateur simulé (l.227-235) lit après son attente
   pour rejeter la vérification en cours au lieu de rendre son verdict. Le cas ajouté échoue alors, sur
   le verdict attendu ou sur l'attente de `done`.
4. Lancé cinq fois de suite, le fichier passe cinq fois (commande et décompte au journal).
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un cas de test ajouté à `tests/mac-ipc-contract.test.cjs`. Frontière : le pont `tvlens` du vrai preload
devant le vrai `app/main.cjs` lancé par `launch()`, minuteries simulées.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si, sur le banc, une question ne peut pas être posée avant la fin de la
vérification simulée sans modifier le code de production, ou si la faute du critère 3 ne fait pas
échouer le test : verdict BLOQUÉ, avec l'écart constaté.

## Journal
