---
id: T155
titre: Wait for the analysed passages in the slow-disk server test instead of a fixed number of turns
statut: a-faire
bloque_par: T153
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Le test « a slow disk holds back neither what a client reads nor the analysis » de
`tests/server-sessions.test.cjs` attend vingt tours de boucle d'événements, puis lit le panneau. Quand le
Mac est chargé, l'analyse du troisième passage n'a pas encore fini à ce moment-là. Le test échoue alors
que le produit fait ce qu'il doit, et la boucle refuse le ticket en cours, quel qu'il soit. Après ce
ticket, le test attend que le panneau montre les trois passages analysés. Son attente est bornée dans le
temps, et en cas d'échec il nomme ce qu'il a vu. Ce qu'il affirme ne change pas.

## Sources

- Décision du propriétaire, le 14/10 : corriger ce test avant les tickets suivants du plan court, parce
  qu'il peut faire refuser n'importe lequel d'entre eux pendant la nuit.
- Échec observé le 14/10 pendant T153, qui ne touche pas ce code. Le contrôle complet est rouge sur ce
  seul test, 688 tests passent sur 689, et la mémoire d'échange est presque pleine. Le message :
  - l'assertion « both passages are published analysed while the save of the first is still on its way
    to the disk » ;
  - le panneau montre `['moment-3', 'analyzing']` là où `'ready'` est attendu.
- Reproduction déterministe, faite pendant T153, avec la sonde de disque lent (voir plus bas). Ralentir
  seulement `readFile` de 200 ms fait échouer le test, à la même assertion. Les témoins passent :
  `FLK_MS=0`, et `FLK_SLOW=mkdir FLK_MS=200`.
- Code concerné, à la version `621a5a1` :
  - `tests/server-sessions.test.cjs` :
    - `tick` et `turns` (l. 15-16) : `turns()` fait vingt tours de `setImmediate` ;
    - `disk(t, name)` (l. 31-49). `d.reached` (l. 47) est la forme d'attente à suivre : il interroge par
      `tick()`, s'arrête au bout de 5 s d'horloge réelle et échoue avec `assert.fail` en disant ce qu'il
      a vu ;
    - `f.polled` (l. 111-114) ;
    - le test, l. 640-683. L'attente fautive est l. 664 : `await held.reached(from + 1); await turns();`.
      Elle est suivie de `polled = await f.polled(polled);` et de l'assertion des l. 666-667, qui
      vérifie à la fois les trois passages `ready` et `held.seen.length - from === 1` ;
    - `published` (l. 650-653), une attente du même test bornée à 400 tours, utilisée pour la pause et la
      reprise ;
  - `core/session.cjs:254` : `if (!this.closed) { this.emit(); this.drain(); await this.persist(); }`.
    Le passage est publié avant la sauvegarde. C'est ce que le test prouve ;
  - `docs/adr/0003-dernier-etat-par-fichier-et-publication-avant-sauvegarde.md` ;
  - `docs/audit-maintenabilite.md`, FLK-08 : remplacer une attente à tours fixes par une attente de fait
    peut vider une assertion. D'où la mutation du critère 3.
- T074 corrige tout ce fichier par une barrière de l'hôte. Il est parqué derrière T145 et une chaîne
  d'environ vingt-cinq tickets, Prettier compris : il ne viendra pas cette semaine. Ce ticket ne corrige
  qu'un site, celui qui a échoué.

## Sonde de disque lent

`.harness-state/audit/flaky/slow-fs.cjs`, hors Git. S'il manque, le recréer à l'identique dans
`.harness-state/tickets/T155/slow-fs.cjs` :

```js
const fsp = require('node:fs/promises');
const realSetTimeout = globalThis.setTimeout;
const names = (process.env.FLK_SLOW || 'mkdir,writeFile,rename').split(',').filter(Boolean);
const ms = Number(process.env.FLK_MS || 5);
if (ms > 0) for (const name of names) {
  const original = fsp[name];
  if (typeof original !== 'function') continue;
  fsp[name] = function (...args) {
    return new Promise(resolve => realSetTimeout(resolve, ms)).then(() => original.apply(this, args));
  };
}
```

Commande de reproduction, depuis la racine du dépôt, où `<sonde>` est le chemin du fichier :

```
FLK_SLOW=readFile FLK_MS=200 node --require <sonde> --test --test-concurrency=1 --test-name-pattern="a slow disk holds back" tests/server-sessions.test.cjs
```

## Périmètre

- À modifier :
  - `tests/server-sessions.test.cjs`, dans ce test seulement. L'attente de la l. 664 et la lecture qui
    la suit deviennent une attente du fait publié : le panneau, interrogé avec l'étiquette que le client
    tient, montre les trois passages `ready`. Elle suit la forme de `d.reached` : interrogation par
    `tick()`, au plus 5 s d'horloge réelle, puis `assert.fail` avec les statuts vus. Si une aide est
    ajoutée, elle sert à ce seul test ou à `published`, et ne porte pas le nom d'un ticket.
- À ne pas toucher :
  - l'assertion des l. 666-667, avec son message et `held.seen.length - from`, le titre du test et ses
    autres assertions ;
  - les autres `turns()` et `store.serial` du fichier, qui sont l'objet de T074 ;
  - le code de production, en dehors de la mutation temporaire du critère 3 ;
  - les autres tests, le harnais et le plancher du cliquet.

## Critères d'acceptation

1. Avant toute modification, la commande de reproduction échoue à l'assertion « both passages are
   published analysed… », et les deux témoins (`FLK_MS=0`, puis `FLK_SLOW=mkdir FLK_MS=200`) passent.
   Les trois sorties vont au journal.
2. Après la modification, la commande de reproduction passe, avec `FLK_MS=200` puis avec `FLK_MS=1000`.
   Sorties au journal.
3. Mutation temporaire, dans `core/session.cjs:254` : `await this.persist()` passe avant
   `this.emit(); this.drain();`. Sans la sonde, le test échoue, avec un message qui donne les statuts
   vus. La sortie rouge va au journal, puis la mutation est retirée. C'est la preuve que l'attente n'a
   pas vidé l'assertion.
4. `git diff tests/server-sessions.test.cjs` ne touche que ce test, et ne retire ni ne change aucune
   ligne `assert`, à part la ligne `await turns()` de la l. 664 et la lecture qui la suit. Sortie au
   journal.
5. `node --test --test-concurrency=1 tests/server-sessions.test.cjs` passe cinq fois de suite, sans
   relance sélective.
6. `git diff --stat` ne cite que `tests/server-sessions.test.cjs` et le ticket.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test lui-même, frontière : le serveur HTTP d'un vrai `HeadlessRuntime`, comme aujourd'hui. La
commande de reproduction prouve qu'il tient sur un disque lent, et la mutation du critère 3 qu'il voit
toujours une publication retenue par la sauvegarde.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le ticket tranche ainsi :

- **Un seul site, celui qui a échoué.** Le reste du fichier attend T074. Si un autre site de ce test
  échoue sous la commande de reproduction, il est corrigé de la même façon, et le journal le dit. Un
  site d'un autre test donne un verdict BLOQUÉ, avec la sortie.
- **Une attente bornée dans le temps, pas en tours.** Sous charge, un nombre de tours ne dit rien du
  temps écoulé. La borne de 5 s est celle de `d.reached`, dans le même fichier.
- **Pas d'ADR.** Le test change sa façon d'attendre, pas ce qu'il prouve. L'ADR 0003 reste la règle
  vérifiée.

## Journal
