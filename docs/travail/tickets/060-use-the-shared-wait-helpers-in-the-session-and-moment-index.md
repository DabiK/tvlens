---
id: T060
titre: Use the shared wait helpers in the protocol and Codex tests
statut: a-faire
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Premier lot : les protocoles et bancs Codex prennent leurs aides génériques dans le module partagé.
Les attentes jusque-là bornées en tours réels deviennent des échéances nommées ; les scénarios et
leurs résultats attendus sont conservés. T061 migre le lot suivant, puis T062 contracte l'inventaire.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et D14 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : trois lots successifs ; retirer T145 et T055, déjà terminé.
- Les aides existent déjà dans `tests/helpers/wait.cjs:11` à `:82` : pause réelle capturée avant
simulation, tick par setImmediate, turns avec nombre explicite, deferred avec resolve/reject,
until nommé et séquentiel borné par horloge monotone (5 s par défaut), bounded qui relaie les
rejets et retourne une sentinelle à l'échéance, failure pour un rejet attendu.

## Périmètre

Chaque nom ci-dessous désigne le fichier `tests/<nom>.test.cjs`, seul périmètre modifiable du lot.
La table donne les définitions actuelles et chaque changement de sémantique :

| Fichier et repères vérifiés | Migration et contrat conservé ou changé |
| --- | --- |
| `tests/architecture-f04.test.cjs:13` | settle de quatre tours devient turns(4). |
| `tests/architecture-f05.test.cjs:31` à `:40`, `:568` | pause/tick/deferred/bounded/failure partagés ; settle devient turns(10), ou le nombre explicite de l'appel. until de 400 pas de 5 ms devient une échéance 5 s nommée ; l'appel à 300 pas garde une borne au moins aussi longue. |
| `tests/architecture-f06.test.cjs:26` à `:38` | pause/tick/deferred/bounded/failure partagés ; until de 600 pas de 5 ms devient une échéance 5 s nommée. eventually reste booléen. |
| `tests/architecture-f07.test.cjs:23` à `:27` | pause/tick/deferred partagés ; until de 600 pas de 5 ms devient une échéance 5 s nommée, séquentielle et capable d'attendre un contrôle asynchrone. |
| `tests/architecture-f08.test.cjs:16` à `:22` | tick/deferred/failure partagés ; settle devient turns(8), ou le nombre explicite ; until de 600 pas de 5 ms devient une échéance 5 s nommée. |
| `tests/architecture-f10.test.cjs:18` à `:21` | tick/deferred partagés ; until de 600 pas de 5 ms devient une échéance 5 s nommée. |
| `tests/codex-confinement.test.cjs:82`, `:137`, `:138`, `:760` | settle devient turns(10), ou le nombre explicite ; pause partagée ; until de 500 pas de 10 ms (5 s nominales) devient timeoutMs: 10000, allongement explicite prévu par la migration, avec attente nommée. bounded local garde son traitement historique distinct du rejet. |
| `tests/codex-connect-race.test.cjs:8` | tick partagé, même tour d'événement. |
| `tests/codex-handler-failure.test.cjs:9` | deferred partagé ; resolve reste identique, reject devient disponible sans être requis. |
| `tests/codex-thread-rotation.test.cjs:10` et `:11` | tick/deferred partagés, avec résolution et rejet inchangés. |

- Garder la boucle d'horloge simulée de `tests/architecture-f05.test.cjs:138` (50 ms, 40 pas,
  assertion finale), distincte d'un until réel. Aucun export advanceUntil n'existe.
- Garder `eventually` d'architecture-f06 (retour booléen) et son attente métier `f.settled`,
  ainsi que celle de serverHost dans architecture-f07 et la boucle watch.running d'architecture-f10.
  Seules leurs primitives équivalentes sont partagées.
- La conversion du confinement en échéance réelle de 10 s reprend la cible de la fiche T062
  relue : elle allonge explicitement sa borne nominale de 5 s, et se consigne comme telle au journal.
- Les pauses réelles passent par le timer capturé de wait.cjs, y compris celles implémentées par
  un intervalle à usage unique. Les bornes de sécurité de bounded gardent leurs valeurs.
- Ne modifier ni produit, ni harnais, ni doubles App Server, ni `tests/helpers/wait.cjs` ou
  `tests/helpers/clock.cjs`. Aucun titre, résultat attendu ou cas de test ne disparaît.
- Les boucles métier et les flush de microtâches gardent leur sens. Aucun socket réel ne reçoit
  une horloge globale simulée. Une sentinelle de bounded n'est jamais assimilée à un succès.

## Critères d'acceptation

1. Consigner avant/après la sortie de cette commande exacte, sur les dix fichiers du lot,
   hors ticket-loop, agent-guards et helpers/codex-session :

```sh
rg -n --glob '*.cjs' \
  --glob '!tests/ticket-loop.test.cjs' \
  --glob '!tests/agent-guards.test.cjs' \
  --glob '!tests/helpers/codex-session.cjs' \
  -e '^\s*(async )?function (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\b' \
  -e '^\s*(const|let) (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\s*=\s*(async\s+)?(\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>' \
  tests/{architecture-f04,architecture-f05,architecture-f06,architecture-f07,architecture-f08,architecture-f10,codex-confinement,codex-connect-race,codex-handler-failure,codex-thread-rotation}.test.cjs
```

   Après migration, elle ne rend que `eventually` d'architecture-f06 et `bounded` de codex-confinement,
   exceptions sémantiques nommées ci-dessus. Les variables de fixtures homonymes ne sont pas des aides.
2. Tous les until migrés ont un libellé, une échéance réelle et des contrôles séquentiels ; le délai
   explicite de confinement vaut 10 s. Aucun compte explicite de turns ne change ; les défauts
   4/10/8/10 de la table deviennent des arguments aux appels concernés.
3. Comparer le diff des assertions, titres et cas par fichier au début de session : valeurs et
   nombre de cas sont identiques. Le journal décrit imports, appels et changements de borne.
4. À l'implémentation, exécuter les dix fichiers un par un, puis wait-helpers et
   `node scripts/check.mjs`. La boucle simulée garde ses pas et sa preuve finale ; bounded
   continue de distinguer résultat, rejet et échéance selon sa variante. Aucun test nouveau de forme.

## Test d'acceptation attendu

Les scénarios existants des dix fichiers et `tests/wait-helpers.test.cjs` prouvent les résultats.
L'inventaire ci-dessus prouve la migration des copies, sans remplacer ces scénarios.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères sont ceux du worktree à `8340014`, à relire après les dépendances. Une différence de
contrat non prévue se consigne avant migration ; elle ne se masque pas en allongeant un délai.
Au premier échec, conserver la sortie et diagnostiquer ; aucune relance jusqu'au vert ni ancienne
sonde slow-fs non livrée n'est nécessaire.

## Journal
