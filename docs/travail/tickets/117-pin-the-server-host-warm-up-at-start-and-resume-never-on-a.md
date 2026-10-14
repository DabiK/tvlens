---
id: T117
titre: Pin the server host warm-up at start and resume, never on a read-only open
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

L'hôte serveur préchauffe l'agent de chat et l'agent d'observation d'une session quand elle démarre ou
reprend, pour que la première réponse ne paie pas la connexion. Il ne le fait jamais pour une archive
ouverte en lecture seule. Aucun test ne fixe aujourd'hui ce comportement, qu'une extraction ultérieure
va déplacer dans une fonction partagée avec l'hôte Mac. Après ce ticket, un test le fixe sur
`HeadlessRuntime`, sans changer le code de production.

## Sources

- Constats : CORE-01, ADP-07
- Code à la version `0d5a954` (les numéros de ligne peuvent bouger : chercher d'abord le nom), dans
  `runtime/headless-runtime.cjs` :
  - `warmUp(session)`, lignes 644-649 : `this.agent.prepare?.(session.id).catch(() => {})`, puis
    `Promise.resolve(session.perception?.agent?.prepare?.(session.id + "-observe")).catch(() => {})`.
    Commentaire : « Same warm-up as the Mac host… Never for an archive that is only being read. » Le
    `prepare` de l'agent de chat doit rendre une promesse : sinon `.catch` lève et `start()` échoue.
  - `start()`, ligne 658, appelle `this.warmUp(session)` (ligne 673), seulement sur la branche qui crée
    une nouvelle session ; `resume(id)`, ligne 1018, l'appelle aussi (ligne 1035), quand la session
    n'accepte pas déjà des passages ; `open(id)`, ligne 983, ne l'appelle pas.
  - `end()`, ligne 904 : termine et archive la session ; c'est le geste du deuxième test de
    `tests/chat-instruction.test.cjs`.
  - `sessionOptions()`, lignes 618-626 : les options de l'hôte, dont `overrides`, vont au runtime de
    session. `runtime/session-runtime.cjs`, ligne 239 : `overrides.perception` remplace la perception.
- Modèle de construction directe : `tests/chat-instruction.test.cjs`, test « the instruction of the active
  surveillance reaches the chat agent of the host… », ligne 11 (`new HeadlessRuntime({ … smoke: true,
  agent: chat … })`, `runtime.start()`, `runtime.ingest(…)`).

## Périmètre

- À créer : `tests/server-warm-up.test.cjs`, qui construit `HeadlessRuntime` directement, en `smoke: true`,
  dans un dossier temporaire supprimé à la fin. L'agent de chat et l'agent d'observation
  (`overrides.perception`, avec `transcribe`, `observeVisual` et `agent.prepare`) enregistrent chaque
  appel à `prepare`. Les deux `prepare` sont `async`.
  1. `start()` appelle `prepare(id)` sur l'agent de chat et `prepare(id + '-observe')` sur l'agent
     d'observation, une fois chacun.
  2. Une session qui a reçu un passage, puis a été terminée et archivée par `end()`, puis rouverte par
     `open(id)`, ne préchauffe rien. `resume(id)` préchauffe de nouveau les deux agents, avec le même
     `id`.
  3. Un `prepare` qui rejette ne fait échouer ni `start()` ni `resume(id)`, et ne laisse aucun rejet non
     traité. Le test écoute `unhandledRejection` pendant le scénario.
- Les titres décrivent le comportement, en anglais, sans nom de chantier ni de ticket.
- À ne pas toucher : `runtime/headless-runtime.cjs` et tout code de production ; les autres tests.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/server-warm-up.test.cjs` passe sur le code de production de `0d5a954`, inchangé, en
   moins de dix secondes. Commande et durée dans le journal.
2. Preuve de détection, sans rien committer, chaque modification annulée ensuite. Commande et sortie de
   chaque essai dans le journal.
   - On ajoute `this.warmUp(session)` à la fin du chemin de lecture seule d'`open(id)` : le test 2 échoue.
   - On retire l'appel de `warmUp` dans `resume(id)` : le test 2 échoue.
3. `node scripts/check.mjs --changed` est vert. Un contrôle non lancé est rapporté tel quel.

## Test d'acceptation attendu

`tests/server-warm-up.test.cjs`, test 2 (archive rouverte puis reprise). La frontière est l'API publique
de `HeadlessRuntime`, avec des agents qui enregistrent leurs appels. Aucun réseau, aucun Codex.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le geste qui termine et archive une session est `end()`, déjà employé
par le deuxième test de `tests/chat-instruction.test.cjs`.

## Journal
