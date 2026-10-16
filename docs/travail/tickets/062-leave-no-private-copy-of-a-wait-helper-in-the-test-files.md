---
id: T062
titre: Leave no private copy of a wait helper in the test files
statut: a-faire
bloque_par: T061
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Dernier lot : surveillance et vues prennent leurs primitives génériques dans le module partagé.
L'inventaire global contracte ensuite les copies génériques des trois lots ; chaque attente
spécifique restante est nommée avec son contrat distinct.

## Sources

- `docs/audit-architecture.md`, rapport A, B8 et D14 ; rapport B, B7.
  Décision du propriétaire, le 16/10 : dernier lot après T061, qui dépend de T060 puis T199/T178.
- Les aides existent déjà dans `tests/helpers/wait.cjs:11` à `:82` : pause réelle capturée avant
simulation, tick par setImmediate, turns avec nombre explicite, deferred avec resolve/reject,
until nommé et séquentiel borné par horloge monotone (5 s par défaut), bounded qui relaie les
rejets et retourne une sentinelle à l'échéance, failure pour un rejet attendu.

## Périmètre

Modifier seulement les six fichiers du lot, avec le changement propre à chacun :

| Fichier et repères vérifiés | Migration et contrat conservé ou changé |
| --- | --- |
| `tests/surveillance-runtime.test.cjs:12`, `:15`, `:809` | settle devient turns(20) ou le nombre explicite ; until reste en deux phases, 500 tours rapides puis grâce réelle de 5 s, avec primitives partagées et libellé ajouté ; renommer la variable turns qui désigne les messages turn/start. |
| `tests/surveillance.test.cjs:8` et `:9` | deferred partagé ; flush conserve ses microtâches Promise.resolve et son nombre de tours, sans devenir un tour d'événement. |
| `tests/verification.test.cjs:62` | settle devient turns(10) ou le nombre explicite. Aucune autre aide locale dans ce fichier : l'ancien `until` de 2000 tours n'existe plus. |
| `tests/tv-chat-view.test.cjs:108` et `:362` | deferred partagé ; settle d'un seul setImmediate devient tick(). |
| `tests/tv-paired-page.test.cjs:37` et `:71` | mêmes changements deferred/tick ; les identifiants de timers nommés tick restent des variables métier. |
| `tests/mac-ipc-contract.test.cjs:20` et `:214` | pause réelle partagée ; until(t, check, label, stepMs) reste local et conduit l'horloge virtuelle, sans devenir un until réel. |

- Conserver le flush de microtâches de mac-ui et le settle propre à l'horloge partagée : ils ne sont
  pas des copies d'une attente générique. T060/T061 ont déjà migré leurs fichiers ; ne pas les rouvrir
  pour agrandir le lot. Une nouvelle copie hors de ce lot se signale avant extension de périmètre.
- Ne modifier ni produit, ni harnais, ni doubles App Server, ni `tests/helpers/wait.cjs` ou
  `tests/helpers/clock.cjs`. Aucun titre, résultat attendu ou cas de test ne disparaît.
- Les boucles métier et les flush de microtâches gardent leur sens. Aucun socket réel ne reçoit
  une horloge globale simulée. Une sentinelle de bounded n'est jamais assimilée à un succès.

## Critères d'acceptation

1. Consigner avant/après l'inventaire global exact des définitions, tests et aides compris,
   hors ticket-loop, agent-guards et helpers/codex-session. Il couvre aussi les définitions indentées :

```sh
rg -n --glob '*.cjs' \
  --glob '!tests/ticket-loop.test.cjs' \
  --glob '!tests/agent-guards.test.cjs' \
  --glob '!tests/helpers/codex-session.cjs' \
  -e '^\s*(async )?function (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\b' \
  -e '^\s*(const|let) (tick|deferred|turns|until|settle|settled|pause|bounded|failure|flush|eventually)\s*=\s*(async\s+)?(\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>' \
  tests
```

   Après les trois lots, la liste exacte des exceptions attendues est :
   - wait.cjs : pause, tick, turns, deferred, until, bounded, failure (les sept exports canoniques) ;
   - helpers/clock.cjs : settle propre à l'horloge virtuelle ;
   - architecture-f09 : deferred(t, options), port de résumé spécialisé ;
   - architecture-f06 : eventually booléen ; codex-confinement : bounded sans propagation du rejet ;
   - clip-unreadable, disk-guard, session-delete, session-durable : leurs quatre settle(watch) ;
   - surveillance-runtime : until à deux phases ; mac-ipc-contract : until de l'horloge virtuelle ;
   - surveillance et mac-ui : leurs deux flush de microtâches.
   Chaque nom sans chemin développé dans cette liste désigne `tests/<nom>.test.cjs`, les deux
   helpers étant sous `tests/helpers/`. Aucune autre définition ne reste dans la sortie ; les
   données et variables homonymes ne sont pas des fonctions et ne sont pas visées par cette commande.
2. Chaque until générique migré nomme son fait et sa borne ; la variante de surveillance conserve
   ses deux phases et until Mac ses pas simulés. Aucun contrôle asynchrone n'est lancé deux fois
   avant son règlement. Les deux settle de page à un tour deviennent tick, jamais turns arbitraires.
3. Assertions, titres et nombre de cas par fichier restent ceux du début de session. Chaque compte
   explicite reste identique ; les défauts 20 et 10 deviennent explicites. Le journal rapproche
   chaque définition restante de l'exception ci-dessus et donne les changements d'appels/import.
4. À l'implémentation, exécuter les six fichiers un par un, puis wait-helpers et
   `node scripts/check.mjs`. Aucun nouveau test de forme, aucune hausse de délai pour obtenir le vert.

## Test d'acceptation attendu

Les scénarios existants des six fichiers et les contrats publics de wait.cjs. La commande de
contraction et la lecture de ses seules exceptions complètent cette preuve sans ajouter de garde
au harnais. T195 attend ce lot car il modifie aussi mac-ipc-contract, dans une autre zone.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les repères sont ceux du worktree à `8340014`, à relire après les dépendances. Une différence de
contrat non prévue se consigne avant migration ; elle ne se masque pas en allongeant un délai.
Au premier échec, conserver la sortie et diagnostiquer ; aucune relance jusqu'au vert ni ancienne
sonde slow-fs non livrée n'est nécessaire.

## Journal
