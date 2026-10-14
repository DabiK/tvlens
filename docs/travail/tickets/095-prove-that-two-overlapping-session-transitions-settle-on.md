---
id: T095
titre: Prove that two overlapping session transitions settle on both hosts
statut: a-faire
bloque_par: T078, T079, T080, T081, T082, T086
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les deux hôtes (Mac par IPC, serveur par HTTP) sérialisent les transitions de session : démarrer, terminer,
ouvrir, reprendre, supprimer. Le banc à deux hôtes prouve déjà qu'une transition attend un passage ou une
question en cours ; aucun test ne lance deux transitions qui se chevauchent. Le refactor à venir des hôtes
vers une composition commune déplacera justement cette sérialisation.

Après ce ticket, le banc lance, sur chaque hôte, des paires de transitions dont la première est tenue au
milieu de son travail, et exige que les deux requêtes se terminent par un succès ou par un refus stable déjà
connu, jamais par une exception brute, et que l'état final soit celui d'un des ordres séquentiels possibles.
Le réglage de la langue de transcription, propre au serveur, a le même test au niveau du runtime.

## Sources

- Constats : TSTB-14
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `runtime/headless-runtime.cjs` : `exclusive(work)` (ligne 353) ; `start()` (ligne 658, 409 `read-only`
    ligne 663) ; `pause()` (ligne 686) ; `ingest` (ligne 778) ; `ask` (ligne 810) ; `end()` (ligne 904) ;
    `located` (ligne 912, 404 `not-found`) ; `open(id)` (ligne 983, 409 `capturing`) ; `resume(id)`
    (ligne 1018, 409 `not-open`) ; `remove(id)` (ligne 1044) ; 503 `session-closing` (lignes 73-74) ;
    `setTranscriptionLanguage(language)` (lignes 342-351), qui refuse un second réglage pendant le premier par
    « Réglage en cours, réessaie. » (ligne 343).
  - `app/main.cjs` : enveloppe `exclusive` (ligne 92) autour de `watch:start` (ligne 391), `watch:stop`
    (ligne 425), `watch:new` (ligne 426), `sessions:open` (ligne 433), `sessions:resume` (ligne 452),
    `sessions:delete` (ligne 465), `surveillance:start` (ligne 194). `sessions:resume` ne prend pas
    d'identifiant : il reprend la session ouverte en lecture seule, ou refuse par « Aucune session ouverte en
    lecture seule à reprendre. » (ligne 453).
  - Banc à deux hôtes, aujourd'hui dans `tests/architecture-f07.test.cjs` (le lot L07 le renomme ; le retrouver
    par `grep -ln "onBothHosts" tests/*.test.cjs`) : `deferred()` (ligne 27), `serverHost(t)` (ligne 169),
    `macHost(t)` (ligne 221), `HOSTS` (ligne 311), `onBothHosts(title, scenario)` (ligne 312), `passage(h, id)`
    (ligne 316). Gestes offerts par les deux adaptateurs : `start`, `send`, `pause`, `end`, `remove`, `open`,
    `ask`, `state`, `jobs`, `runtime()` ; ce que chaque hôte formule à sa façon est demandé à l'adaptateur
    (`endAnswer`, `reason`, `closing`). Il n'y a pas de geste `resume`. Modèle d'une transition tenue au
    milieu de son travail : le scénario « a passage whose storage has begun when its session ends lands
    first… » (ligne 339), barrière `deferred()` posée sur `live.store.put` de `h.runtime()` (ligne 344). Ce
    scénario met déjà en pause la session pendant l'écriture tenue d'un passage (ligne 349) : ce
    chevauchement-là est couvert.
  - Réglage de la langue au niveau du runtime : `tests/transcription-language.test.cjs`, test ligne 9
    (`TranscriptionSettings` et `HeadlessRuntime` sur un dossier temporaire).
- Mesure du constat : `grep -rn "Réglage en cours" tests/` ne rend rien ; aucun scénario du banc ne lance deux
  transitions à la fois.

## Périmètre

- À modifier : le fichier du banc à deux hôtes (trouvé par `grep`, pas renommé par ce ticket) — un geste
  `resume(id)` ajouté aux deux adaptateurs (l'adaptateur Mac ignore l'identifiant, puisque l'IPC n'en prend
  pas), puis les scénarios ci-dessous ; `tests/transcription-language.test.cjs`
  — un test du réglage concurrent.
- Paires jouées sur les deux hôtes par `onBothHosts`, la première transition étant tenue par une barrière
  `deferred()` posée sur une doublure de port obtenue par `h.runtime()` (jamais par une attente à durée fixe) :
  1. un démarrage demandé pendant qu'une fin de session est tenue ;
  2. ouverture d'une session archivée pendant la reprise, tenue, d'une autre session ouverte en lecture
     seule ;
  3. suppression d'une session archivée pendant qu'une question y est posée.
- Chaque scénario porte un `{ timeout }`. Les deux requêtes de la paire sont attendues ensemble
  (`Promise.allSettled`), la barrière est levée, puis l'état est lu.
- Refus admis comme issue stable, et seulement eux : 409 `capturing`, 409 `not-open`, 409 `read-only`, 503
  `session-closing`, 404 `not-found`, et « Session obsolète. » ; sur l'hôte Mac, la forme que l'adaptateur
  rend pour ces mêmes refus, plus « Aucune session ouverte en lecture seule à reprendre. ». L'issue observée de chaque paire est figée en littéraux après une première
  observation, et le journal dit laquelle des issues séquentielles elle reproduit.
- À ne pas toucher : le code de production (`app/`, `runtime/`, `server/`, `core/`) ; les scénarios existants
  du banc et leurs titres ; les aides du lot L05, citées si elles servent.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Le fichier du banc passe : `node --test --test-concurrency=1 <fichier du banc>` ; sa sortie montre les
   trois nouveaux scénarios une fois par hôte (six tests de plus qu'avant), et les tests existants
   inchangés.
2. Pour chaque scénario, le test exige : les deux requêtes se terminent ; chacune est un succès ou un refus de
   la liste admise ; aucun message ne contient `Error`, `TypeError`, `Cannot read` ni un chemin ; l'état final
   (`h.state()`, sessions listées, dossiers sur disque) est égal à celui d'un des deux ordres séquentiels,
   écrit en littéral.
3. Chaque scénario prouve que la première transition était bien tenue quand la seconde a été lancée : la
   barrière enregistre son entrée, et le test exige qu'elle ait été franchie avant la seconde requête.
4. `node --test tests/transcription-language.test.cjs` passe et contient un test où un premier réglage est
   tenu dans `save`, un second reçoit « Réglage en cours, réessaie. », le premier aboutit, et un troisième,
   lancé ensuite, aboutit.
5. Le fichier du banc passe dix fois de suite en séquentiel (`node --test --test-concurrency=1 <fichier>`),
   sans relance sélective ; commande, durée et décompte au journal, avec la charge de la machine (load
   moyen) pendant la série.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Trois scénarios ajoutés au banc à deux hôtes, joués par `onBothHosts`, et un test ajouté à
`tests/transcription-language.test.cjs`. Frontières : l'IPC du vrai hôte Mac lancé hors Electron par le banc,
et les routes HTTP d'un vrai `RemoteServer` devant un vrai `HeadlessRuntime`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une paire aboutit à un état qu'aucun ordre séquentiel ne donne, ou à une
exception brute : verdict BLOQUÉ, avec la paire, l'issue observée et la commande qui la reproduit, pour que
le propriétaire décide de la correction ; aucun test n'est écrit pour figer cette issue, et aucun test n'est
assoupli ni relancé jusqu'à ce qu'il passe. Si une paire ne peut être tenue sans modifier le code de production : elle est sortie du ticket et
nommée au journal.

## Journal
