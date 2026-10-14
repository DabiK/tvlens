---
id: T001
titre: Prove the duplicate answer to a resent block without racing the ingestion lane
statut: termine
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le test « a client that leaves while its block is prepared cancels nothing… » échoue par intermittence
sous charge : il reçoit 429 là où il attend 200. Après ce ticket, il prouve le même comportement sans
dépendre du moment où le serveur libère sa voie d'ingestion, et il ne perd aucune de ses exigences.

## Sources

- Constats d'audit TSTA-01 et FLK-01. Échec observé une fois le 2026-10-13, sur les 602 tests lancés
  en parallèle.
- Code concerné, à la version `932b8e0` :
  - `tests/architecture-f06.test.cjs:514-532` : le test ; attente ligne 529, assertion ligne 530.
  - `server/http.cjs:247-248` : réponse 429 tant que `ingesting` est vrai ; `:258` appel à
    `runtime.ingest` ; `:262` inscription du bloc dans `accepted` ; `:270` libération de la voie.
  - `core/session.cjs:117` : le passage devient visible ; `:126-128` écriture d'état du premier
    passage, attendue ; `:133-134` écriture de la vignette, attendue.
  - `tv/transport.py:85` : le client réel renvoie un bloc refusé par 408 ou 429.
- Mécanisme : le passage est visible dans `/v1/state` dès `segments.push`, alors que le serveur
  n'inscrit le bloc comme accepté qu'au retour de `runtime.ingest`. Entre les deux, un renvoi ne trouve
  pas de bloc accepté et reçoit 429, la réponse prévue du produit (« à renvoyer »). C'est l'attente du
  test qui est fausse, pas le serveur.
- Reproduction établie le 2026-10-14 sur `932b8e0` : avec la sonde ci-dessous et `FLK_MS=10`, le test
  échoue trois fois sur trois avec 429 ; sans elle, il passe. Charge pendant la mesure : load 5,3,
  mémoire d'échange 23,8 Go utilisés sur 24,6.

## Sonde de reproduction

À enregistrer dans `.harness-state/tickets/T001/slow-fs.cjs` (hors Git). Elle retarde les écritures
du disque comme le ferait une machine chargée, sans toucher au code de production.

```js
const fsp = require("node:fs/promises");
const realSetTimeout = globalThis.setTimeout;
const names = (process.env.FLK_SLOW || "mkdir,writeFile,rename").split(",").filter(Boolean);
const ms = Number(process.env.FLK_MS || 5);
if (ms > 0) {
  for (const name of names) {
    const original = fsp[name];
    if (typeof original !== "function") continue;
    fsp[name] = function (...args) {
      return new Promise((resolve) => realSetTimeout(resolve, ms)).then(() => original.apply(this, args));
    };
  }
}
```

Commande, appelée « commande de sonde » dans les critères :

```sh
FLK_MS=10 node --require ./.harness-state/tickets/T001/slow-fs.cjs --test \
  --test-name-pattern="a client that leaves" tests/architecture-f06.test.cjs
```

## Périmètre

- À modifier : `tests/architecture-f06.test.cjs` — ce test et, si nécessaire, les aides locales du
  fichier.
- À ne pas toucher : le code de production (`server/`, `core/`, `runtime/`, `adapters/`) et les autres
  tests.
- Aucun délai n'est allongé. Le test n'est jamais relancé jusqu'à ce qu'il passe.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Reproduction avant correction : la commande de sonde échoue cinq fois sur cinq avec 429 sur le test
   dans sa forme actuelle. Commande et sortie dans le journal.
2. Le test corrigé renvoie le bloc comme le fait un client : de nouveau tant que la réponse est 429,
   dans une attente bornée. Il exige ensuite exactement
   `{ status: 200, value: { id: 'moment-1', duplicate: true } }`, `stored: ['moment-1']`,
   `prepared: 1` et `cancelled: false`. Il ne lit aucun état interne du serveur ou du runtime
   (`ingesting`, `admitted`…) pour décider quand renvoyer.
3. La commande de sonde passe cinq fois sur cinq sur le test corrigé. Commande et sortie dans le
   journal.
4. Sans sonde, `node --test --test-concurrency=1 tests/architecture-f06.test.cjs` passe vingt fois de
   suite. Commande et sortie dans le journal.
5. `git status --porcelain` ne montre que `tests/architecture-f06.test.cjs` et ce ticket.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Le test existant, corrigé, dans `tests/architecture-f06.test.cjs`. Frontière : la route HTTP
`POST /v1/segments` d'un vrai `RemoteServer` devant un vrai `HeadlessRuntime`, comme aujourd'hui.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la correction exige de modifier le code de production, ou si la
sonde ne reproduit pas l'échec : verdict BLOQUÉ, avec l'écart constaté.

## Journal

### 2026-10-14 — Cadrage

Première session, pas une reprise : journal vide, dossier d'état vide. `git diff --stat 932b8e0 HEAD` sur
les quatre fichiers cités par le ticket ne montre aucun changement. Au départ, `git status --porcelain`
montre déjà, outre ce ticket, des fichiers non suivis étrangers au ticket : `design/continuous-context/`,
`docs/travail/README.md`, `experiments/`.

### 2026-10-14 — Reproduction avant correction (critère 1)

Sonde enregistrée dans `.harness-state/tickets/T001/slow-fs.cjs`. Commande de sonde lancée cinq fois de
suite sur le test non modifié :

```sh
FLK_MS=10 node --require ./.harness-state/tickets/T001/slow-fs.cjs --test \
  --test-name-pattern="a client that leaves" tests/architecture-f06.test.cjs
```

Résultat : cinq échecs sur cinq (`exit=1` à chaque fois), tous avec 429. Sortie complète dans
`.harness-state/tickets/T001/reproduction-avant.txt`. Extrait, identique aux cinq lancements :

```
✖ a client that leaves while its block is prepared cancels nothing: the block is stored once, and sent again it is answered as a duplicate
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      again: {
  +     status: 429,
  -     status: 200,
        value: {
  +       error: 'Préparation du passage précédent.'
    actual: { cancelled: false, again: { status: 429, value: [Object] }, stored: [ 'moment-1' ], prepared: 1 },
    expected: { cancelled: false, again: { status: 200, value: [Object] }, stored: [ 'moment-1' ], prepared: 1 },
```

Charge pendant la mesure : load 4,10.

### 2026-10-14 — Exploration

Rapport complet dans `.harness-state/tickets/T001/exploration.md`. En cinq lignes :

- Les lignes citées par le ticket sont exactes ; aucun écart ne change le périmètre ni n'impose de toucher
  au code de production.
- L'attente fautive est la ligne 529 : le passage est visible dans `/v1/state` avant que `server/http.cjs`
  inscrive le bloc dans `accepted` ; ce test est le seul du fichier exposé, faute de réponse à attendre.
- Entre l'inscription (`:262`) et la libération de la voie (`:270`) il n'y a aucun `await` : un renvoi ne
  voit que 429 puis 200 doublon, et un renvoi refusé par 429 n'a aucun effet sur `stored`, `prepared` ou
  l'horloge.
- Correction retenue : remplacer l'attente de la ligne 529 par un `until` existant qui renvoie le bloc et
  s'arrête sur toute réponse autre que 429 ; `stored` et `prepared` restent lus après. Aucune aide modifiée.
- Points de vigilance : lignes ajoutées sous 160 caractères sans raccourcir les lignes longues existantes,
  titre du test inchangé, et critère 5 gêné par les fichiers non suivis déjà présents au départ.

### 2026-10-14 — Implémentation

Un seul fichier modifié : `tests/architecture-f06.test.cjs`, dans le seul test visé. L'attente « le passage
est visible dans `/v1/state` » est remplacée par un renvoi du bloc dans le `until` existant, qui s'arrête
sur toute réponse autre que 429 ; le `deepEqual` exige ensuite cette réponse, puis `stored` et `prepared`
lus après la boucle. Titre, lignes 514-528, aides locales et valeurs attendues inchangés. Le fichier garde
48 lignes de plus de 160 caractères et 17 tests, comme à `HEAD`.

`node scripts/check.mjs --changed` : vert (règles par fichier, cliquet, 17 tests sur 17) ; format et lint
non lancés (Prettier et ESLint ne sont pas installés).

### 2026-10-14 — Relecture (tour 1)

Diff et liste des fichiers dans `.harness-state/tickets/T001/revue-1.diff` et `revue-1.fichiers`.
Verdict du relecteur : **accepté**, aucun constat bloquant. Remarques mineures : le commentaire ajouté
disait « for as long as it prepares the block » alors que, dans ce fichier, « prepared » désigne
l'assemblage, déjà terminé à ce point ; le critère 5 n'est pas rempli à la lettre ; le journal et le
contrôle complet restaient à faire.

Suite donnée : le commentaire a été reformulé par l'orchestrateur (« until it has stored the block and
registered it as accepted »). C'est la seule modification postérieure à la relecture ; elle ne touche
aucune instruction et **n'a pas été relue**. Les preuves ci-dessous ont été refaites sur ce texte final.

### 2026-10-14 — Sonde après correction (critère 3)

Commande de sonde lancée cinq fois de suite sur le test final :

```sh
FLK_MS=10 node --require ./.harness-state/tickets/T001/slow-fs.cjs --test \
  --test-name-pattern="a client that leaves" tests/architecture-f06.test.cjs
```

Résultat : cinq réussites sur cinq. Décompte de `.harness-state/tickets/T001/sonde-finale.txt` :

```
   5 ℹ fail 0
   5 ℹ pass 1
   5 exit=0
```

Même résultat, cinq sur cinq, sur le texte d'avant la reformulation du commentaire (`sonde-apres.txt`).
Non observé directement : le nombre de 429 reçus avant le 200. Que la boucle en traverse au moins un sous
sonde est déduit des cinq échecs sur cinq avec 429 obtenus avant correction, même sonde et même `FLK_MS`.

### 2026-10-14 — Vingt passages sans sonde (critère 4)

```sh
node --test --test-concurrency=1 tests/architecture-f06.test.cjs
```

Lancée vingt fois de suite sur le test final, sans relance sélective. Résultat : vingt réussites sur
vingt. Décompte de `.harness-state/tickets/T001/stabilite-20-finale.txt` :

```
  20 ℹ fail 0
  20 ℹ pass 17
  20 ℹ tests 17
  20 exit=0
```

Charge en fin de série : load 5,25. Même résultat, vingt sur vingt, avant la reformulation du commentaire
(`stabilite-20.txt`).

### 2026-10-14 — État du dépôt (critère 5)

`git status --porcelain` en fin de session :

```
 M docs/travail/tickets/001-resent-block-duplicate-without-race.md
 M tests/architecture-f06.test.cjs
?? design/continuous-context/
?? docs/travail/README.md
?? experiments/
```

Le critère n'est **pas rempli à la lettre** : trois entrées non suivies s'ajoutent au test et au ticket.
Elles étaient là avant la session (dates de modification du 2026-10-04 au 2026-10-14 02:00, session
ouverte à 02:10), ne contiennent aucun fichier de code et n'ont pas été touchées. Les seuls fichiers
suivis modifiés sont le test et ce ticket. Ce qu'il faut faire de ces fichiers est une décision du
propriétaire, pas de ce ticket.

### 2026-10-14 — Contrôle complet (critère 6)

`node scripts/check.mjs` : code de sortie 0. Sortie (`.harness-state/tickets/T001/check-complet.txt`) :

```
✔ règles par fichier
– format : non lancé (Prettier n'est pas installé)
– lint : non lancé (ESLint n'est pas installé ou pas configuré)
✔ cliquet
✔ tests JS (74 fichier(s))
    ℹ tests 645
    ℹ pass 645
    ℹ fail 0
✔ tests Python
    Ran 84 tests in 29.160s

    OK (skipped=1)
check : vert
```

Format et lint ne sont pas des contrôles réussis : ils n'ont pas été lancés.
