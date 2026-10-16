---
id: T061
titre: Use the shared wait helpers in the media, composition and session tests
statut: a-faire
bloque_par: T060
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Deuxième lot : média, compositions, session et perception utilisent les aides génériques partagées.
Les boucles qui attendent la fin d'une session restent des attentes métier ; elles ne deviennent
pas des nombres arbitraires de tours. T062 garde le dernier lot et la contraction globale.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et D14 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : lot après T060 ; T199 et T178 sont transitifs.
- Les aides existent déjà dans `tests/helpers/wait.cjs:11` à `:82` : pause réelle capturée avant
simulation, tick par setImmediate, turns avec nombre explicite, deferred avec resolve/reject,
until nommé et séquentiel borné par horloge monotone (5 s par défaut), bounded qui relaie les
rejets et retourne une sentinelle à l'échéance, failure pour un rejet attendu.

## Périmètre

Modifier seulement les quinze fichiers explicités dans cette table :

| Fichier et repères vérifiés | Migration et contrat conservé ou changé |
| --- | --- |
| `tests/clip-unreadable.test.cjs:24` et `:25` | tick partagé ; settle(watch) garde son attente métier watch.running. |
| `tests/disk-guard.test.cjs:14` et `:15` | tick partagé ; settle(watch) garde sa condition métier. |
| `tests/session-delete.test.cjs:14` à `:16` | tick/deferred partagés ; settle(watch) garde sa condition métier, reject devient disponible. |
| `tests/session-durable.test.cjs:18` à `:20`, `:1005` | tick/deferred partagés ; settle(watch) reste métier ; la fonction locale de vingt tours devient turns(20). |
| `tests/headless-session-lifecycle.test.cjs:9` | deferred partagé, résolution/rejet inchangés. |
| `tests/session-lifecycle.test.cjs:9` | deferred partagé remplace Promise.withResolvers(), même promesse et commandes. |
| `tests/server-sessions.test.cjs:17` à `:19` | tick/deferred/turns partagés ; turns() devient turns(20), tout nombre explicite est conservé. |
| `tests/server-state-views.test.cjs:11` | tick partagé, même tour d'événement. |
| `tests/server-warm-up.test.cjs:9` | until partagé nommé, timeoutMs: 10000 explicite ; sa durée de 10 s reste la même. |
| `tests/session.test.cjs:4` et `:5` | tick/deferred partagés, même résolution ; reject devient disponible. |
| `tests/session-latency.test.cjs:5` et `:6` | tick/deferred partagés, même résolution ; reject devient disponible. |
| `tests/session-warm-up.test.cjs:16` | settled n'est qu'un setImmediate : ses appels deviennent tick(). |
| `tests/split-perception.test.cjs:7` et `:8` | tick/deferred partagés, même résolution ; reject devient disponible. |
| `tests/moment-index.test.cjs:16` | tick partagé ; index.settle reste l'API métier, aucune ancienne boucle locale de six tours n'est à migrer. |
| `tests/recording.test.cjs:4` et `:39` | deferred/tick partagés ; les gates flush/ingest restent des variables métier. |

- Les quatre settle(watch), les boucles watch.running de server-sessions et la boucle diagnostique
  d'écritures de session-durable restent locales avec tick partagé ; ne pas les réduire à turns.
- Le changement est celui de chaque ligne : seul until de server-warm-up conserve une échéance
  réelle, aucun compte de tours n'est transformé en délai. Ne pas réintroduire les anciennes
  horloges locales déjà retirées de moment-index.
- Ne modifier ni produit, ni harnais, ni doubles App Server, ni `tests/helpers/wait.cjs` ou
  `tests/helpers/clock.cjs`. Aucun titre, résultat attendu ou cas de test ne disparaît.
- Les boucles métier et les flush de microtâches gardent leur sens. Aucun socket réel ne reçoit
  une horloge globale simulée. Une sentinelle de bounded n'est jamais assimilée à un succès.

## Critères d'acceptation

1. Consigner avant/après la sortie de cette commande exacte sur le lot, hors ticket-loop,
   agent-guards et helpers/codex-session :

```sh
rg -n --glob '*.cjs' \
  --glob '!tests/ticket-loop.test.cjs' \
  --glob '!tests/agent-guards.test.cjs' \
  --glob '!tests/helpers/codex-session.cjs' \
  -e '^\s*(async )?function (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\b' \
  -e '^\s*(const|let) (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\s*=\s*(async\s+)?(\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>' \
  tests/{clip-unreadable,disk-guard,session-delete,session-durable,headless-session-lifecycle,session-lifecycle,server-sessions,server-state-views,server-warm-up,session,session-latency,session-warm-up,split-perception,moment-index,recording}.test.cjs
```

   Après migration, la sortie contient seulement les quatre `settle(watch)` de clip-unreadable,
   disk-guard, session-delete et session-durable. Ce sont les seules exceptions attendues sur ce lot.
2. Les turns sans argument ont disparu ; les nombres explicites sont conservés et le défaut de
   server-sessions est écrit 20. Les appels de settled à un tour utilisent tick ; les gates métier
   gardent leurs promesses et leurs points de libération. until de server-warm-up nomme le fait attendu
   et reste à 10 s, avec contrôles séquentiels et valeur de retour compatible avec ses usages.
3. Le diff des assertions et le décompte des cas par fichier confirment les mêmes valeurs, titres et
   nombre de cas qu'au début de session. Les seuls changements d'appels/import sont consignés.
4. À l'implémentation, exécuter les quinze fichiers un par un, puis wait-helpers et
   `node scripts/check.mjs`, sans modification du harnais, de plancher ni cas de remplissage.

## Test d'acceptation attendu

Les scénarios existants des quinze fichiers, dont les attentes de fin métier et le préchauffage,
avec les tests publics de wait.cjs. Aucun test nouveau ne compare le texte des fichiers migrés.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères sont ceux du worktree à `8340014`, à relire après les dépendances. Une différence de
contrat non prévue se consigne avant migration ; elle ne se masque pas en allongeant un délai.
Au premier échec, conserver la sortie et diagnostiquer ; aucune relance jusqu'au vert ni ancienne
sonde slow-fs non livrée n'est nécessaire.

## Journal
