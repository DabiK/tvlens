---
id: T010
titre: Link no real Codex credential when the transport is a test double
statut: a-faire
bloque_par: T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Un client Codex construit par un test sans `authHome` lie aujourd'hui, dans son arbre temporaire, les
vrais identifiants du poste (`~/.codex/auth.json`), alors qu'il parle à un faux transport. Trois
constructions de test au moins le font. Après ce ticket, un client sur transport de substitution ne lie
aucun identifiant, et le chemin « dossier Codex absent » que huit fichiers de test recopient vient d'une
seule aide qui vérifie qu'il est bien absent.

## Sources

- Constats : TSTB-01, FLK-15
- Code concerné, à la version `0d5a954` :
  - `adapters/codex-confinement.cjs`, fonction `createContext(prefix, authHome, root = os.tmpdir())`
    (lignes 237 à 262) : `source = authHome || process.env.CODEX_HOME || ~/.codex`, puis lien symbolique
    de `auth.json` et `models_cache.json` quand ils existent.
  - `adapters/codex-session-client.cjs`, constructeur de `CodexSessionClient` : commentaire « TEST SEAM,
    the only one of this client » (lignes 90 à 97) et `const transportDouble = rpcFactory !== spawnRpc
    && features === undefined` (ligne 116). Deux usages existants : la tolérance de confinement (ligne
    428) et `checkSubAgents` (ligne 454).
  - `adapters/codex-session-client.cjs`, connexion : `createContext("tvlens-codex-session-",
    this.authHome)` (ligne 272).
  - Clients construits sans `authHome` sur un faux transport : `tests/chat-sources.test.cjs`, aide
    `fixture(steps)` (ligne 4) ; `tests/session-optimization.test.cjs`, tests « one warm Codex thread
    handles successive turns, streams answer only and carries context deltas » (ligne 9) et « interrupt
    keeps the same warm thread for the next question and does not deliver stale output » (ligne 19).
  - `tests/codex-confinement.test.cjs`, test « a role is launched without execution environment, in an
    empty directory apart from its credentials, with an allow-listed environment » (ligne 153) : il
    exige le lien vers `auth.json` (lignes 156, 176, 180) avec `authHome` et `features` — ce n'est pas un
    transport de substitution. C'est le test qui protège le lien du produit.
  - `tests/codex-confinement.test.cjs`, test « no product code injects a transport or a feature answer,
    nor passes a weaker mode than the default; a transport double never claims a block » (ligne 457).
  - Constante recopiée `path.join(os.tmpdir(), 'tvlens-test-absent-codex-home')` :
    `tests/architecture-f05.test.cjs:43`, `tests/architecture-f08.test.cjs:24`,
    `tests/codex-confinement.test.cjs:19`, `tests/codex-connect-race.test.cjs:9`,
    `tests/codex-thread-rotation.test.cjs:14`, `tests/review-regressions.test.cjs:25`,
    `tests/surveillance-runtime.test.cjs:21`, `tests/verification.test.cjs:75`. Binaire absent
    `tvlens-test-absent-codex` : `tests/codex-confinement.test.cjs:495`, `tests/verification.test.cjs:181`.

## Périmètre

- À modifier, production : `adapters/codex-session-client.cjs` et, si le geste l'exige,
  `adapters/codex-confinement.cjs`. Règle : un client `transportDouble` ne lie aucun identifiant dans
  son arbre, quel que soit `authHome`. Le chemin du produit (`spawnRpc`, ou un faux transport donné avec
  `features`) est inchangé. Le commentaire « TEST SEAM » est complété pour dire ce troisième effet.
- À créer : `tests/helpers/codex.cjs`, qui exporte `ABSENT_CODEX_HOME` et `ABSENT_CODEX_BINARY` et
  vérifie à son chargement que ces deux chemins n'existent pas, avec un message qui nomme le chemin
  trouvé.
- À modifier, tests : tout fichier de `tests/` qui écrit l'un des deux chemins littéraux — les huit
  fichiers cités à la version `0d5a954` — remplace sa constante locale par l'aide, et les deux usages
  du binaire absent aussi ; `tests/chat-sources.test.cjs` (ligne 4) et
  `tests/session-optimization.test.cjs` (lignes 10 et 21) passent `authHome: ABSENT_CODEX_HOME` à leurs
  trois constructions `new CodexSessionAgent({…})` — une ceinture en plus de la règle de production,
  qui les protège déjà ; deux tests nouveaux dans `tests/codex-confinement.test.cjs` (la règle, et
  l'aide).
- À ne pas toucher : les assertions des tests existants ; `tvlens-absent-sessions`
  (`tests/server-sessions.test.cjs:627`), que le dossier temporaire privé du lanceur couvre ; le reste
  de `createContext`. Aucun `catch` vide n'est ajouté en production, aucune ligne de plus de 160
  caractères nulle part : dans les fichiers à lignes longues, la ligne ajoutée est un `require` court.

## Critères d'acceptation

1. Rouge d'abord, puis vert — test nouveau dans `tests/codex-confinement.test.cjs` : `CODEX_HOME`
   pointe, le temps du test, vers un dossier temporaire qui contient un faux `auth.json` ; un client
   construit avec un `rpcFactory` seul, sans `authHome` ni `features`, se connecte ; le dossier Codex de
   son arbre ne contient ni `auth.json` ni `models_cache.json`. Sur le code non modifié, le test échoue
   parce que le lien existe. `CODEX_HOME` est rétabli dans `t.after`.
2. Les tests « a role is launched without execution environment, in an empty directory apart from its
   credentials… » et « no product code injects a transport or a feature answer… » passent sans
   modification : le produit lie toujours ses identifiants, et aucun code du produit ne passe par la
   couture de test.
3. `grep -n "tvlens-test-absent-codex" tests/*.test.cjs` ne rend plus rien : les deux chemins ne sont
   écrits que dans `tests/helpers/codex.cjs`.
4. Test de l'aide, dans `tests/codex-confinement.test.cjs` : un processus Node enfant dont `TMPDIR` est
   un dossier temporaire où un dossier portant le nom du chemin absent a été créé (nom lu dans l'aide,
   pas recopié) charge `tests/helpers/codex.cjs` et échoue, avec un message qui nomme ce chemin.
5. `grep -n "CodexSessionAgent({" tests/chat-sources.test.cjs tests/session-optimization.test.cjs` :
   chaque construction passe `authHome`. Sortie dans le journal.
6. `node --test --test-concurrency=1` sur les dix fichiers modifiés : aucun échec.
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Un test nommé d'après le comportement — par exemple « a client on a transport double links no credential,
even when the default Codex home holds one ». Frontière : `CodexSessionClient` connecté par son
`rpcFactory`, observé par le contenu du dossier `CODEX_HOME` passé au faux transport.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un test existant exige qu'un transport de substitution lie un
identifiant, ou si la règle ne peut pas s'écrire sans toucher au chemin du produit : verdict BLOQUÉ, avec
le test ou le code en cause.

## Journal
