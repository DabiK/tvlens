---
id: T312
titre: Share one source URL key between the Codex and local adapters
statut: a-faire
bloque_par: T311
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une seule fonction côté adaptateurs dit quelle URL de source est recevable et sous quelle clé on la compare : les
adaptateurs Codex et la voie locale utilisent la même. Aucun comportement visible ne change. Ticket facultatif, en fin de
file : il ne bloque aucun essai.

## Sources

- Exploration de la recherche web locale, le 22/10 : la normalisation des URL de source existe en trois copies,
  `adapters/codex-session-events.cjs:15-24` (`sourceKey`), `core/verification.cjs:2`, `core/surveillance.cjs:224`
  (lignes à `c9f3cc2`). T308 a ajouté `sourceKey` à `adapters/external-links.cjs` pour la voie locale.
- `core/` n'importe rien hors de `core/` (`tests/architecture.test.cjs`) : les deux copies du cœur ne peuvent pas lire
  `adapters/external-links.cjs`.

## Périmètre

- À modifier : `adapters/codex-session-events.cjs` (sa copie remplacée par celle de `adapters/external-links.cjs`) et ses
  appelants ; pour les deux copies du cœur, soit une fonction unique dans `core/` réexportée par
  `adapters/external-links.cjs`, soit le constat écrit dans le journal qu'elles diffèrent volontairement (avec la
  différence nommée).
- Vérifier d'abord que les règles sont identiques (https, identifiants, fragment, IP, domaines locaux) ; une différence
  qui changerait un comportement Codex est signalée et non corrigée ici.
- À ne pas toucher : le comportement de validation des sources Codex et locales.

## Critères d'acceptation

1. Une seule définition de la clé d'URL de source est utilisée par `adapters/codex-session-events.cjs` et par la voie
   locale ; les tests Codex des sources (`tests/chat-sources.test.cjs`, `tests/chat-codex.test.cjs`,
   `tests/codex-confinement.test.cjs`) passent sans modification de leurs assertions.
2. Les copies du cœur sont unifiées ou leur différence est nommée dans le journal.
3. `node scripts/check.mjs`.

## Test d'acceptation attendu

Les suites Codex des sources, inchangées, et le test de `sourceKey` de T308.

## Hypothèses bloquantes

Décision attendue du propriétaire : les règles de recevabilité diffèrent (voir le journal). Faut-il (a) ne partager que
la normalisation et nommer deux politiques, stricte (voie locale) et lâche (Codex, cœur), ce qui recoupe T126 ; (b) aligner
Codex et le cœur sur la règle stricte, changement de comportement décidé à part ; ou (c) abandonner ce ticket facultatif ?
Recommandation de l'orchestrateur : (c) pendant le hackathon, puis (b).

## Journal

- 22/10, orchestrateur : ticket facultatif ouvert depuis l'exploration de la recherche web locale.
- 22/10, orchestrateur : exploration faite (`.harness-state/tickets/T312/exploration.md`). Les règles ne sont pas identiques :
  les trois copies Codex et cœur (`adapters/codex-session-events.cjs`, `core/verification.cjs`, `core/surveillance.cjs`) sont lâches
  (https sans identifiants, fragment retiré) ; celle de `adapters/external-links.cjs` est stricte (en plus : port 443 seul, pas d'IP,
  pas d'hôte sans point, pas de `localhost` ni `.local`/`.internal`/`.lan`/`.home`/`.test`/`.invalid`). Observé avec `node -e` :
  `https://localhost/x`, `https://127.0.0.1/a`, `https://[::1]/a`, `https://example.org:8443/p`, `https://intranet/p` et
  `https://nas.local/p#x` donnent une clé côté Codex et `null` côté local ; les https publics donnent la même clé.
- 22/10, orchestrateur : verdict BLOQUÉ, aucun code modifié. Unifier la clé change ce que Codex compte comme page ouverte, et aucun
  test Codex ne couvre un https privé : les suites resteraient vertes. Le ticket demande de signaler cette différence, pas de la
  corriger. Décision attendue du propriétaire : (a) réduire le ticket à la normalisation commune (fragment retiré), avec la
  recevabilité stricte et lâche nommées comme deux politiques voulues, ce qui recoupe T126 (`core/source-provenance.cjs`, non fait) ;
  ou (b) aligner Codex sur la stricte, comme changement de comportement décidé à part ; ou (c) abandonner ce ticket facultatif.
- 22/10, orchestrateur : remis à faire avec une décision attendue, pour que la file reste ouverte à T314.
