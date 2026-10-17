---
id: T253
titre: Refuse session transitions with codes and give their HTTP status in the server
statut: a-faire
bloque_par: T250
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le cycle de vie refuse ses transitions par des erreurs codées à la source, sans statut HTTP.
Le serveur traduit ces codes en réponses historiques ; les clients gardent exactement leurs
codes publics, statuts, messages et séquences de commandes.

## Sources

- Coupe de T236, relecture A, constat 7 ; `docs/domaine.md:244-246`, règle 6 : domaine et
  application ne produisent aucun statut HTTP. ADR 0029/0030 ; T201 a livré la base d'erreurs.
  T250 modifie avant ce lot le même cycle de vie et les attentes du résultat de fin.
- Code vérifié à `1d8aa48` : `runtime/headless-session-lifecycle.cjs:6` importe
  `runtime/errors.cjs`, dont `:2-3` crée un refus avec statut. Huit sites :
  `runtime/headless-session-lifecycle.cjs:90`, `:93`, `:195`, `:209`, `:215-219`, `:240`,
  `:245-249`, `:280-284` ; cinq codes publics : `session-closing`, `read-only`, `not-found`,
  `capturing`, `not-open`. `core/shared/domain-error.cjs:1-4` fournit déjà l'erreur codée.
- `server/http.cjs:57` définit `PUBLIC_CODES`, `:80-81` accepte les codes applicatifs ;
  `:177-198` prend `error.status` et rend 400 par défaut. `HeadlessRuntime` vit dans `runtime/` :
  y transférer cette traduction ne respecte pas la frontière.
- `server/session-routes.cjs:57-81` expose les commandes ; filets existants :
  `tests/server-sessions.test.cjs`, `tests/server-routes.test.cjs` et `tests/wire-contract.test.cjs`.
  T227, transitif par T250, ordonne les changements de phase 1 des mêmes fichiers et contrats.

## Périmètre

- Remplacer les huit refus de `runtime/headless-session-lifecycle.cjs` par des erreurs fondées
  sur `core/shared/domain-error.cjs`, avec codes déclarés/exportés par leur module émetteur.
  Aucun champ `status` ni import de `runtime/errors.cjs` dans ce cycle de vie. Ne pas déplacer
  encore son propriétaire : T236 l'extraira ensuite dans `runtime/library/`.
- Dans `server/`, à côté de `PUBLIC_CODES` de `server/http.cjs`, traduire ces identités vers
  les codes et statuts publics historiques : `session-closing` → 400, `read-only` → 409,
  `not-found` → 404, `capturing` → 409, `not-open` → 409. Les messages publics restent les mêmes.
  Conserver le traitement existant des autres erreurs ; aucune reconnaissance de texte.
- La traduction appartient au serveur, jamais à `HeadlessRuntime`, à la bibliothèque, au futur
  coordinateur ou à un agrégat. Une erreur inconnue garde son traitement inattendu ; un errno
  ou un texte similaire ne suffit pas à en faire un refus de transition connu.
- Garder sérialisation, adoption atomique, préparation, disque, ressources, résultats T250 et
  tous les effets de commandes inchangés. Le fil `/v1`, ses aliases et séquences ne changent pas.
  Les refus des autres modules hors cycle de vie restent hors lot.
- Ajouter un test comportemental ciblé des erreurs émises et de leur traduction. Les fichiers
  `tests/server-sessions.test.cjs`, `tests/server-routes.test.cjs` et `tests/wire-contract.test.cjs`
  restent inchangés par ce ticket : leurs attentes après T250 sont les témoins de compatibilité.
  Élaguer les suppressions ESLint devenues inutiles ; aucun changement de harnais ou de format.

## Critères d'acceptation

1. Chaque refus de transition porte le code exporté de son émetteur et aucun statut HTTP,
   avec la même absence d'effets qu'avant. La classification reste la même si le message est
   reformulé ; aucun texte n'est comparé pour choisir le transport.
2. Par le vrai serveur, les cinq catégories rendent les codes publics et statuts 400/409/404
   ci-dessus, les mêmes messages et corps historiques. Les ajouts de résultat T250 restent intacts.
   Un refus inconnu ne reçoit pas par défaut un code de transition connu.
3. `rg -n 'runtime/errors|\./errors|\bstatus\b' runtime/headless-session-lifecycle.cjs` ne trouve
   plus d'import ou de production de statut HTTP. Les codes sont déclarés à la source ;
   le tableau de traduction et les statuts sont uniquement dans `server/`.
4. Les suites `server-sessions`, `server-routes` et `wire-contract` passent sans changement de
   leur fichier. Sérialisation, erreurs d'ouverture/reprise/suppression et contrôle d'identité
   gardent leurs effets et séquences, sans assouplir les gardes.
5. À l'implémentation, jouer en séquentiel le nouveau test, `headless-session-lifecycle`,
   `server-sessions`, `server-routes` et `wire-contract`, puis `node scripts/check.mjs`.
   Aucun test, plancher, code historique ou refus n'est retiré.

## Test d'acceptation attendu

Ajouter `tests/session-transition-refusals.test.cjs` : provoquer les cinq catégories par les
commandes publiques du vrai cycle de vie sur ressources contrôlées, puis par le vrai serveur
HTTP sur loopback. Vérifier code émis sans statut, code/statut public et absence d'effets ;
les suites serveur/fil existantes conservent leurs assertions sans réécriture de témoins.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les identités internes nouvelles suivent la convention des erreurs T201 ; les cinq identités
publiques et leurs statuts sont déjà établis. Ce lot applique la frontière décidée, sans
nouvelle politique de refus. Relire le cycle de vie et le résultat réellement livrés par T250.

## Journal
