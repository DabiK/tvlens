---
id: T125
titre: Decide description retries and verifier failures on error codes, not wording
statut: a-faire
bloque_par: T124, T145
adr: oui
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Aujourd'hui, `adapters/codex-perception.cjs` décide si une description est redemandée (ADR 0008) en
comparant le texte de l'erreur à 5 messages exacts, 4 refus exacts, 2 préfixes et 2 expressions régulières.
`adapters/codex-verifier.cjs` choisit le message montré pour une vérification échouée sur 3 préfixes.
Reformuler un message d'un émetteur change donc ce qui est retenté.

Après ce ticket, ces deux lecteurs ne lisent plus que des champs stables : `code`, `method` et `httpStatus`
posés par T124, ainsi que `turnStatus`, `turnError` et `authRequired`, déjà présents. Toutes les listes de
messages sont retirées. Ce qui est redemandé ne change pour aucune issue produite par un émetteur réel.

Un nouvel ADR modifie l'ADR 0008 sur ce seul point.

## Sources

- Constats : ADP-04
- Correction du relecteur sur ADP-04 :
  - preuve exacte : `codex-perception.cjs` lignes 23-41, `codex-verifier.cjs` lignes 36-38 ;
  - dette consignée par l'ADR 0008, qui n'écarte le code à la source que pour cause d'adaptateurs en
    lecture seule ;
  - les refus du test « a refusal is never marked… » sont recopiés à la main ;
  - la remédiation par codes est la bonne et suit l'ADR.
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `adapters/codex-perception.cjs` :
    - commentaire des lignes 17-22, qui cite les messages lus ;
    - liste `CONNECTION_LOST`, ligne 23, et regex `LOCAL_UNAVAILABLE`, ligne 30 ;
    - liste `REFUSED`, ligne 34, `REFUSED_PREFIXES`, ligne 40, regex `LOCAL_REFUSED`, ligne 41 ;
    - fonction `refused(error)`, ligne 43 : chaîne `cause` sur 4 niveaux ;
    - fonction `passing(error, caller, deadline)`, ligne 58 : appelant annulé, refus, échéance (raison
      même du signal, ou « Recherche annulée. » avec `turnStatus === 'interrupted'` sans `turnError`, ligne
      67), puis les listes ;
    - méthode `observeVisual`, `.catch` des lignes 173-178 : le marquage `TVLENS_VISION_TRANSIENT`, inchangé.
  - `adapters/codex-verifier.cjs` :
    - fonction `failure(error)`, lignes 34-41 : `startsWith('Outil hors du périmètre TVLens')` donne le
      message fixe (ligne 36) ; `authRequired`, `startsWith('Confinement Codex')` ou
      `startsWith('Rôle Codex')` rendent l'erreur telle quelle (ligne 38) ;
    - méthode `verify`, ligne 63. `this.client()` (ligne 67), qui appelle `assertRole`, est hors du `try` :
      la branche « Rôle Codex » ne s'exécute pas avec la fabrique par défaut. Elle est gardée, lue par code.
  - `adapters/codex-session-client.cjs`, méthode `event`, ligne 695 : seul endroit où `turnStatus` est
    posé ; `'interrupted'` y va toujours avec « Recherche annulée. ».
  - Constantes à importer : exports de `adapters/codex-rpc.cjs`, `adapters/codex-session-client.cjs`,
    `adapters/codex-confinement.cjs` et `adapters/local-vlm-agent.cjs`, livrés par T124.
- ADR : `docs/adr/0008-description-redemandee-une-fois-apres-un-echec-passager.md`, points 4 et 5 de la
  Décision, et tableau « Alternatives écartées » (code posé à la source : écarté pour la seule lecture
  seule ; messages « recopiés (dette) »).
- Tests existants :
  - `tests/architecture-f08.test.cjs` (le lot L07 peut le renommer ; on le retrouve par le nom de ses
    tests) :
    - « the adapter marks its own expired deadline, on the reason of its signal or on the turn Codex
      confirms it interrupted, and nothing that only looks like it » ;
    - « a refusal is never marked, even with the deadline already expired, a lost connection as its outer
      message or a caller that cancelled » : erreurs fabriquées à la main (listes `refusals` et `unknown`,
      cas « cause » et appelant annulé) ;
    - « the messages the adapter relies on are the ones the Codex pipe really writes… » : il marque aussi
      une erreur fabriquée « Codex : délai de connexion dépassé (thread/start). » ;
    - « behind the real Codex client: a connection lost… » ;
    - « behind the real Codex client: the deadline of the adapter… » ;
    - « behind the real local agent… » ;
    - « end to end behind the real Codex client… ».
  - `tests/verification.test.cjs` :
    - « the manual verifier is a web-only role without tool on a thread without execution environment;
      only opened pages become sources » (ligne 127) : outil hors périmètre, message fixe ;
    - « the manual verifier is refused like every role when Codex does not confirm the sub-agent block, and
      the viewer is told why… » (ligne 179) : refus de confinement rendu tel quel.

## Périmètre

- Règle cible, dans `refused` et `passing` de `adapters/codex-perception.cjs` (l'ordre et le sens de l'ADR
  0008 ne changent pas) :
  - **Refus**, sur l'erreur et sur sa chaîne `cause` jusqu'à 4 niveaux :
    - `authRequired === true` ;
    - `TVLENS_CODEX_INPUT_REFUSED`, `TVLENS_CODEX_CONFINEMENT_REFUSED`, `TVLENS_CODEX_TOOL_REFUSED`,
      `TVLENS_CODEX_SESSION_CLOSED` ;
    - `TVLENS_LOCAL_VLM_INPUT_REFUSED`, `TVLENS_LOCAL_VLM_CLOSED` ;
    - `TVLENS_LOCAL_VLM_UNAVAILABLE` avec un `httpStatus` de 400 à 499.
  - **Passager**, une fois l'appelant non annulé et aucun refus trouvé :
    - la raison même de l'échéance ;
    - `turnStatus === 'interrupted'` sans `turnError`, échéance expirée (le message n'est plus lu) ;
    - `TVLENS_CODEX_CONNECTION_LOST`, `TVLENS_CODEX_DISCONNECTED` ;
    - `TVLENS_CODEX_REQUEST_TIMEOUT` avec `method` égal à `initialize` ou `thread/start` ;
    - `TVLENS_LOCAL_VLM_UNREACHABLE` ;
    - `TVLENS_LOCAL_VLM_UNAVAILABLE` avec un `httpStatus` de 500 à 599.
  - **Définitif** : tout le reste, dont `TVLENS_CODEX_REQUEST_CUT` et le délai de `turn/start`.
- Règle cible dans `failure` de `adapters/codex-verifier.cjs` : `TVLENS_CODEX_TOOL_REFUSED` donne le message
  fixe ; `TVLENS_CODEX_CONFINEMENT_REFUSED`, `TVLENS_CODEX_ROLE_REFUSED` ou `authRequired` rendent l'erreur
  telle quelle ; `SyntaxError` et le cas par défaut ne changent pas.
- À modifier :
  - `adapters/codex-perception.cjs` : les listes `CONNECTION_LOST`, `REFUSED`, `REFUSED_PREFIXES`,
    `LOCAL_REFUSED` et `LOCAL_UNAVAILABLE` sont retirées ; la chaîne `cause` sur 4 niveaux, l'ordre
    (appelant, refus, échéance, passager) et le marquage restent. Le commentaire des lignes 17-22 est
    réécrit : il nomme les codes et dit pourquoi `TVLENS_CODEX_REQUEST_CUT` et le délai de `turn/start`
    restent définitifs.
  - `adapters/codex-verifier.cjs`, fonction `failure`.
  - `tests/architecture-f08.test.cjs`, seulement les entrées des erreurs fabriquées à la main : chacune
    reçoit, en plus de son message réel gardé, le code et les champs que son émetteur réel pose, avec les
    constantes importées des émetteurs :
    - liste `refusals` : les deux « Confinement Codex non confirmé … » → `TVLENS_CODEX_CONFINEMENT_REFUSED` ;
      les deux « Outil hors du périmètre TVLens (…). » → `TVLENS_CODEX_TOOL_REFUSED` ; « Entrée média non
      autorisée. » → `TVLENS_CODEX_INPUT_REFUSED` ; « Backend local : image invalide. » →
      `TVLENS_LOCAL_VLM_INPUT_REFUSED` ; « Backend local indisponible (HTTP 404). » →
      `TVLENS_LOCAL_VLM_UNAVAILABLE` et `httpStatus: 404` ; « Session Codex fermée. » →
      `TVLENS_CODEX_SESSION_CLOSED` ; « Backend local fermé. » → `TVLENS_LOCAL_VLM_CLOSED` ; l'erreur
      `authRequired` garde ses champs ;
    - liste `unknown` : « Connexion Codex interrompue. » → `TVLENS_CODEX_REQUEST_CUT` ; « boom »,
      « Connexion obsolète. » et le tour échoué avec `turnError` restent sans code ;
    - erreurs extérieures des cas « cause », du cas `authRequired`, de la cause inconnue et de l'appelant
      annulé : « Connexion Codex interrompue. Réessaie la question. » → `TVLENS_CODEX_CONNECTION_LOST` ;
      « Backend local indisponible (HTTP 503). » → `TVLENS_LOCAL_VLM_UNAVAILABLE` et `httpStatus: 503` ;
    - dans le test « the messages the adapter relies on… », l'erreur fabriquée « Codex : délai de connexion
      dépassé (thread/start). » reçoit `TVLENS_CODEX_REQUEST_TIMEOUT` et `method: 'thread/start'`, ou
      vient d'un vrai `rpc.request('thread/start', {}, 30)`.
  - Dans le test « a refusal is never marked… », la contre-épreuve (critère 6) et le nouveau test (Test
    d'acceptation attendu).
  - À créer : un ADR dans `docs/adr/`, au numéro suivant libre (0011 à la version `0d5a954`, il peut avoir
    été pris depuis). Il dit :
    - les erreurs des adaptateurs Codex et du modèle local portent un code posé par leur émetteur ;
    - la reprise et le vérificateur lisent ces codes ;
    - les points 1 à 7 de l'ADR 0008 tiennent ;
    - il remplace la ligne « code posé à la source » des alternatives écartées de l'ADR 0008 et la dette
      des « messages recopiés ».

    L'ADR 0008 n'est pas réécrit.
- À ne pas toucher :
  - les émetteurs et leurs messages ;
  - `core/session.cjs`, qui décide la redemande ;
  - le marquage `TVLENS_VISION_TRANSIENT` ;
  - le délai de 45 s ;
  - toute assertion existante.
- Lignes de 160 caractères au plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Cette commande rend `0` :

   ```sh
   grep -cE "Connexion Codex|Codex déconnecté|délai de connexion|Backend local|Confinement Codex|Outil hors du périmètre|Entrée média|Session Codex fermée|Recherche annulée" adapters/codex-perception.cjs
   ```

2. La commande `grep -cE "startsWith\('(Outil|Confinement|Rôle)" adapters/codex-verifier.cjs` rend `0`.
3. Une erreur qui porte le message exact d'un passager mais aucun code n'est pas marquée, échéance expirée
   ou non. Exemple : « Connexion Codex interrompue. Réessaie la question. » sans code.
4. Une erreur qui porte un code passager et un message reformulé est marquée. Exemples :
   - `TVLENS_CODEX_CONNECTION_LOST` ;
   - `TVLENS_CODEX_REQUEST_TIMEOUT` avec `method` `initialize` ou `thread/start` ;
   - `TVLENS_LOCAL_VLM_UNAVAILABLE` avec `httpStatus` 503.
5. Une erreur avec un code de refus, ou `TVLENS_LOCAL_VLM_UNAVAILABLE` avec `httpStatus` 404, n'est jamais
   marquée, même en cause sur 2 niveaux d'une erreur passagère. `TVLENS_CODEX_REQUEST_CUT` et
   `TVLENS_CODEX_REQUEST_TIMEOUT` avec `method` `turn/start` ne sont pas marqués.
6. Contre-épreuve dans le test « a refusal is never marked… » : chaque erreur extérieure utilisée avec une
   cause refusante, prise seule, est marquée.
7. Dans `tests/architecture-f08.test.cjs` et `tests/verification.test.cjs`, aucune assertion existante
   n'est retirée, et chacune garde sa valeur attendue : seules changent les erreurs passées en entrée,
   listées au Périmètre (relecture du `git diff` de ces deux fichiers, notée au journal). Le vérificateur
   rend toujours le message fixe pour un outil hors périmètre et l'erreur telle quelle pour un confinement
   non confirmé.
8. Un nouveau fichier de `docs/adr/` cite l'ADR 0008, et le tableau de ses alternatives écartées contient
   la lecture des erreurs par leur message.
9. `node --test tests/architecture-f08.test.cjs` puis `node --test tests/verification.test.cjs` passent, un
   par un ; `node scripts/check.mjs --changed` passe.
10. Mutation, notée au journal avec le résultat observé puis retirée :
    - retirer `TVLENS_CODEX_TOOL_REFUSED` des refus de `codex-perception.cjs` fait échouer au moins un
      test ;
    - le retirer de `failure` dans `codex-verifier.cjs` fait échouer le test du vérificateur sur l'outil
      hors périmètre.

## Test d'acceptation attendu

`tests/architecture-f08.test.cjs`, nouveau test « the retry decision reads the code an error carries, never
its wording ». Il appelle `observeVisual` avec un agent qui rejette des erreurs construites avec les
constantes exportées par les émetteurs, puis vérifie trois choses : un message exact sans code n'est pas
marqué ; un code passager sous un message reformulé l'est ; un code de refus en cause l'emporte.
Frontière : l'export `CodexPerception` de `adapters/codex-perception.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue. L'ADR 0008 désigne déjà le code posé à la source comme la bonne forme ; il
ne l'a écarté que parce que les adaptateurs étaient alors en lecture seule.

Si une issue d'un test qui passe par un émetteur réel change (marquée devenue définitive, ou l'inverse) :
verdict BLOQUÉ, avec le nom du test et l'erreur observée (code, message, champs). C'est un émetteur que
T124 a oublié, pas une assertion à changer.

## Journal
