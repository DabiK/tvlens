---
id: T040
titre: Serialize errors for the journal with their cause, system code and a short stack
statut: a-faire
bloque_par: T036, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Le résumé d'erreur du produit, `safeError`, retire la pile, la cause et les champs système : c'est voulu,
parce qu'il sert aussi à ce qui est publié à la TV. Mais le journal hérite de cette perte, et une erreur
de disque ou de processus y arrive sans `errno`, sans `syscall` et sans origine. Après ce ticket, le
journal sérialise son champ `error` par un second sérialiseur, réservé au journal, qui garde ce qu'il
faut pour diagnostiquer. `safeError` et ses lecteurs ne changent pas.

## Sources

- Constats : GAP1-04, OUBLI-58
- Code vérifié à la version `0d5a954` :
  - `adapters/chat-trace.cjs` : `clean(value, max = 240)` ligne 2 ; `safeError(error, depth = 0)`
    ligne 13, avec `MAX_DEPTH = 1` ligne 12 ; exports ligne 44. Après T036, les deux fonctions vivent
    dans `adapters/redaction.cjs` et `chat-trace.cjs` les réexporte.
  - `tests/chat-trace.test.cjs` : `e.stack === undefined` ligne 18 — la pile ne doit jamais sortir de
    `safeError`.
  - `server/http.cjs`, `catch` de `handle` lignes 275-290 : une erreur sans statut devient un 400 et son
    message part au client (ligne 285) ; rien d'autre n'en est gardé.
  - `runtime/headless-runtime.cjs` : `tick()` lignes 360-363, `try { this.surveillance.tick(); }
    catch {}` ; `close()`, `catch` vide ligne 1138.
- `safeError` a trois lecteurs : la trace du chat, le détail d'erreur d'une réponse publié à la TV
  (`job.errorDetail`) et l'erreur de tour rejeté (`rejected.turnError`). C'est pourquoi il n'est pas
  élargi.
- Livré par T036 : `runtime/journal.cjs`, où le champ `error` passe par `safeError`.

## Périmètre

À modifier :

- `adapters/redaction.cjs` : une fonction nouvelle, réservée au journal, `journalError`.
  Elle rend ce que rend `safeError`, plus, quand ils existent : `status`, `errno`, `syscall`, `exitCode`,
  `signal`, et `cause` sur un seul niveau, sérialisée de la même façon. Pour une erreur qui n'a ni
  `status` ni `code` — une erreur inattendue — elle ajoute une pile d'au plus cinq cadres, aux chemins
  relatifs à la racine du projet, sans chemin absolu ; un cadre hors de la racine ne garde que le nom du
  fichier. Tout texte passe par `clean`. Elle ne lève jamais, et aucun `catch` ajouté n'est vide.
- `runtime/journal.cjs` : le champ `error` d'un événement passe par cette fonction.
- `tests/journal.test.cjs` : cas ajoutés. `docs/diagnostic.md` : les champs d'une erreur au journal.

À ne pas toucher :

- `safeError` : ni son code, ni ses champs, ni ses lecteurs (`adapters/chat-trace.cjs`,
  `adapters/codex-session-client.cjs`, le détail d'erreur publié). Rien de ce qui est publié à la TV ne
  gagne de champ.
- Les `catch` de production : ce ticket ne branche aucun appelant.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/journal.test.cjs` passe et prouve, par `createJournal` et le puits mémoire :
   - une erreur système (`code: 'ENOSPC'`, `errno`, `syscall`) sort avec ces trois champs et sans pile ;
   - une erreur portant `status: 503` et `code` sort avec les deux et sans pile ;
   - une erreur sans `status` ni `code` sort avec une pile d'au plus cinq cadres, dont aucun ne contient
     de chemin absolu ;
   - une erreur dont `cause` est une erreur sort avec `cause` sérialisée, et la cause de la cause ne sort
     pas ;
   - un secret planté dans le message de la cause ou dans la pile sort expurgé ;
   - une erreur dont la lecture d'un champ lève, une chaîne, `null` et un objet cyclique ne font pas
     lever `event`.
2. `node --test tests/chat-trace.test.cjs` passe sans qu'une ligne de ce fichier ait changé :
   `safeError` ne rend toujours ni pile ni cause.
3. `grep -rln "journalError" core adapters runtime server mcp app` ne rend que
   `adapters/redaction.cjs` et `runtime/journal.cjs`.
4. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Cas ajoutés à `tests/journal.test.cjs`. Frontière : `createJournal` et le puits mémoire ; la fonction de
sérialisation n'est pas appelée directement par le test, sauf pour le cas « ne lève jamais ».

## Hypothèses bloquantes

Aucune décision n'est attendue. Si garder `safeError` inchangé s'avère impossible, ou si un champ du
second sérialiseur doit être publié ailleurs que dans le journal : verdict BLOQUÉ, avec l'écart constaté.

## Journal
