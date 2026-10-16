---
id: T124
titre: Put a stable code on every Codex and local vision error a retry reads
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Chaque erreur Codex ou de vision locale lue par une politique de reprise porte un code stable
défini et exporté par son émetteur. Le délai RPC porte aussi sa méthode et le refus HTTP local son
statut numérique. Messages et décisions de reprise restent identiques ; T125 migrera les lecteurs.

## Sources

- `docs/audit-architecture.md`, rapport A, B4 et D4 ; rapport B, B2 et D2.
  Décision du propriétaire, le 16/10 : retirer les dépendances inutiles T028, T038 et T145,
  puis attendre T199 ; T178 est transitif. T038 n'est pas nécessaire : les codes des émetteurs
  se prouvent dans les bancs RPC, client Codex et backend local déjà livrés.
- Code vérifié à `8340014` : `adapters/codex-rpc.cjs:95` lève la déconnexion,
  `adapters/codex-rpc.cjs:96` le délai par méthode et `adapters/codex-rpc.cjs:126` la coupure de
  requête. Cette dernière n'est pas la perte d'un tour actif.
- Depuis l'extraction de l'ADR 0022, la perte en plein tour est émise par
  `adapters/codex-session-events.cjs:70`, l'entrée média refusée par
  `adapters/codex-session-run.cjs:7`. L'ancienne attribution de ces erreurs aux méthodes
  event/run de `codex-session-client.cjs` est périmée.
- Dans le client : fil étranger à `adapters/codex-session-client.cjs:383` et
  `adapters/codex-session-client.cjs:392` ; confinement à
  `adapters/codex-session-client.cjs:412` ; sous-agents non confirmés à
  `adapters/codex-session-client.cjs:472` ; outil refusé à
  `adapters/codex-session-client.cjs:480` ; session fermée à
  `adapters/codex-session-client.cjs:630`.
- `adapters/codex-confinement.cjs:367` refuse les rôles ; `adapters/local-vlm-agent.cjs:39`
  refuse l'image, `adapters/local-vlm-agent.cjs:56` la connexion,
  `adapters/local-vlm-agent.cjs:57` la réponse HTTP, `adapters/local-vlm-agent.cjs:68` la fermeture.
  Ces erreurs n'ont pas encore les codes ci-dessous.
- Lecteurs à conserver ici : `adapters/codex-perception.cjs:23` et
  `adapters/codex-verifier.cjs:24`. L'ADR 0008 impose une seule redemande sous conditions et
  distingue coupure de requête et perte en plein tour. L'ADR 0005 garde les garanties de fermeture.
- Tests existants : `tests/architecture-f08.test.cjs:291` exerce le vrai RPC ;
  `tests/architecture-f08.test.cjs:342` exerce le vrai client ;
  `tests/architecture-f05.test.cjs:190`, `tests/local-vlm-agent.test.cjs`,
  `tests/codex-confinement.test.cjs`, `tests/chat-error-ui.test.cjs`.
  Les fichiers par chantier n'ont pas été renommés dans ce worktree.

## Périmètre

- Chaque émetteur définit et exporte les constantes suivantes, de valeur égale à leur nom :

  | Émetteur | Issue | Code | Champ |
  | --- | --- | --- | --- |
  | codex-rpc | envoi déconnecté | TVLENS_CODEX_DISCONNECTED | — |
  | codex-rpc | délai de requête | TVLENS_CODEX_REQUEST_TIMEOUT | method |
  | codex-rpc | requête coupée | TVLENS_CODEX_REQUEST_CUT | — |
  | codex-session-events | perte du tour actif | TVLENS_CODEX_CONNECTION_LOST | — |
  | codex-session-run | média interdit | TVLENS_CODEX_INPUT_REFUSED | — |
  | codex-session-client | fermeture explicite | TVLENS_CODEX_SESSION_CLOSED | — |
  | codex-session-client | confinement ou sous-agents non confirmés | TVLENS_CODEX_CONFINEMENT_REFUSED | — |
  | codex-session-client | outil ou fil étranger | TVLENS_CODEX_TOOL_REFUSED | — |
  | codex-confinement | rôle interdit | TVLENS_CODEX_ROLE_REFUSED | — |
  | local-vlm-agent | image invalide | TVLENS_LOCAL_VLM_INPUT_REFUSED | — |
  | local-vlm-agent | connexion impossible | TVLENS_LOCAL_VLM_UNREACHABLE | — |
  | local-vlm-agent | erreur HTTP | TVLENS_LOCAL_VLM_UNAVAILABLE | httpStatus |
  | local-vlm-agent | fermeture | TVLENS_LOCAL_VLM_CLOSED | — |

- Conserver messages, causes, champs existants et première erreur de tour prioritaire. Les deux
  modules extraits n'importent pas leur client pour obtenir une constante : éviter tout cycle.
  Aucun champ HTTP `status` ajouté au modèle local ; `httpStatus` est un nombre.
- Étendre les tests cités, à côté des assertions de message, pour les codes et champs. Ajouter dans
  architecture-f08 un cas de fermeture du vrai client pendant un tour `stalled`, avec son double
  App Server existant. Ne pas ajouter un second double.
- Garder les lecteurs perception/vérificateur et les messages intacts. Les erreurs non classées
  (connexion obsolète, requête RPC refusée, JSON local invalide, configuration locale) restent hors
  de cette table. Aucun renommage de code existant, aucun changement core/HTTP/IPC/TV.
- La propagation HTTP relève de T188, les refus métier de T201 et les lecteurs TV de T189. Ce ticket
  n'étend pas le contrat IPC Mac, qui perd encore le code au preload.

## Critères d'acceptation

1. Chaque constante est importable de son émetteur et vaut son nom. Les vrais émetteurs, pas seulement
   des erreurs fabriquées, prouvent chaque issue de la table sans changer les messages attendus.
2. Le vrai RPC distingue déconnexion, délai initialize/thread/start/turn/start avec `method`, et
   coupure d'une requête pendante. REQUEST_CUT reste distinct de CONNECTION_LOST.
3. Le vrai client prouve codes de confinement, sous-agents, outil/fil, média et rôle refusés.
   Fermer un tour `stalled` rejette avec « Session Codex fermée. » et SESSION_CLOSED.
4. Le vrai backend local prouve image, connexion et HTTP 500/404 avec `httpStatus` exact et sans
   `status`. Sa fermeture code la requête active, celle en file et l'appel ultérieur.
5. Toutes les décisions actuelles d'architecture-f08 restent identiques. Dans chat-error-ui,
   `errorDetail.code` de premier niveau ne remplace pas le diagnostic
   « Codex · failed · rate_limit » provenant de turnStatus/turnError.
6. Deux mutations en copie isolée sont détectées : REQUEST_CUT remplacé par CONNECTION_LOST ;
   code retiré de la raison de fermeture locale. Sorties et restauration consignées au journal.
7. À l'implémentation, exécuter les fichiers cités un par un puis `node scripts/check.mjs`.
   Aucun cas supprimé, aucune assertion de message affaiblie.

## Test d'acceptation attendu

Le cas du vrai RPC d'architecture-f08 vérifie le triplet message/code/method. Les cas du vrai client
et du serveur local assurent que le code est réellement posé à la source, pas seulement dans les
fixtures des futurs lecteurs.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les noms prolongent la convention TVLENS_ existante. La taxonomie de l'ADR 0008 reste inchangée.
L'ajout des champs est additif ; une incompatibilité d'un test comparant l'erreur entière est signalée
avant toute modification de son attente. Les repères sont à relire après T199, sans attendre un
contrat-fil ou un port de journal non livrés.

## Journal

- Cadrage : consignes, skills, ADR 0005/0008/0022, émetteurs, appelants, tests et diff initial lus. Exploration et absence d’écart consignées dans `.harness-state/tickets/T124/`. Les deux dossiers non suivis préexistants restent hors périmètre. Tests et contrôles à venir, aucun résultat annoncé.

- RPC, tests d’abord : `node --test --test-name-pattern='messages the adapter relies on' tests/architecture-f08.test.cjs` : rouge sur assertion, `undefined` au lieu de `TVLENS_CODEX_DISCONNECTED` (`rpc-red.log`), puis 1/1 vert (`rpc-green.log`). Le vrai RPC vérifie message/code/method pour initialize, thread/start et turn/start, puis REQUEST_CUT ; horloge pilotée. Les trois constantes sont vérifiées sur l’export de leur émetteur.
- Tour actif et fermeture : `node --test --test-name-pattern='connection lost during the turn|closing the real Codex client' tests/architecture-f08.test.cjs` : 2/2 rouges sur absence des codes (`turn-errors-red.log`), puis 2/2 verts (`turn-errors-green.log`). CONNECTION_LOST reste sur la cause du marquage vision ; fermer un tour stalled avec le seul double App Server existant rend « Session Codex fermée. » et SESSION_CLOSED, sans redemande.
- Refus, tests d’abord : `node --test --test-name-pattern='sub-agent creation is prevented|thread/start answer that contradicts|any thread item|a thread the host did not start|media inputs are' tests/codex-confinement.test.cjs` : 5/5 rouges sur assertions de codes (`refusals-red.log`). L’assertion d’export des sous-agents a ensuite été placée uniquement sur l’issue refusée pour observer l’erreur réelle. `node --test --test-name-pattern='sub-agent creation is prevented|role refusals carry' tests/codex-confinement.test.cjs` : rouge sur les codes émis, dont les quatre variantes de rôle (`subagents-role-red.log`). `node --test --test-name-pattern='sub-agent creation is prevented|thread/start answer that contradicts|role refusals carry|any thread item|a thread the host did not start|media inputs are' tests/codex-confinement.test.cjs` : 10/10 verts (`refusals-green.log`). Les assertions de message et de nettoyage restent présentes ; exports vérifiés pour chaque émetteur.
- Backend local, tests d’abord : `node --test --test-name-pattern='timeout, HTTP|anything but|close aborts' tests/local-vlm-agent.test.cjs` : 3/3 rouges sur absence de code (`local-errors-red.log`). Après ajout du code HTTP, `node --test --test-name-pattern='timeout, HTTP' tests/local-vlm-agent.test.cjs` reste rouge sur UNREACHABLE (`local-unreachable-red.log`). Après correction, première commande : 3/3 verts (`local-errors-green.log`). Le serveur de boucle locale prouve HTTP 500/404, httpStatus numérique exact, absence de status, entrée refusée et fermeture des appels actif, en file et ultérieur ; les quatre exports sont vérifiés.
- Implémentation : treize constantes définies et exportées par les six émetteurs ; ajout des champs sans migration des lecteurs, sans cycle des modules extraits vers le client, sans modification de core/HTTP/IPC/TV. Les messages et les causes restent inchangés. Les cas de spawn refusé d’architecture-f05 vérifient aussi le code de déconnexion. Le cas existant chat-error-ui porte désormais un code au premier niveau et conserve exactement « Codex · failed · rate_limit ».
- Premier contrôle : `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel et cliquet verts, 73/73 tests JS sur 5 fichiers (`check-changed.log`). Le message long de confinement a ensuite été découpé par concaténation sans changer son texte ; les bancs et contrôles finaux portent sur cette version.
- Bancs d’acceptation exécutés un par un, tous code 0 : `node --test tests/architecture-f08.test.cjs` : 20/20 ; `node --test tests/architecture-f05.test.cjs` : 15/15 ; `node --test tests/local-vlm-agent.test.cjs` : 9/9 ; `node --test tests/codex-confinement.test.cjs` : 22/22 ; `node --test tests/chat-error-ui.test.cjs` : 7/7. Sorties intégrales dans `acceptance-<nom>.log`, soit 73 tests réussis, aucun ignoré. Aucun fournisseur réel appelé.
- Mutations : `python3 .harness-state/tickets/T124/run-mutations.py` : code 0 (`mutations.log`). Dans deux copies isolées sous /private/tmp, remplacement du champ REQUEST_CUT par CONNECTION_LOST, puis retrait du code de la raison close locale. `node --test --test-name-pattern='messages the adapter relies on' tests/architecture-f08.test.cjs` et `node --test --test-name-pattern='close aborts' tests/local-vlm-agent.test.cjs` : chacune rouge, code 1, sur l’assertion attendue (`mutation-rpc.log`, `mutation-local-closure.log`, diffs associés). Restaurations des copies vérifiées par SHA-256, mêmes commandes ensuite vertes 1/1, code 0 (`restored-rpc.log`, `restored-local-closure.log`) ; copies supprimées. SHA-256 des deux sources du dépôt identiques avant/après ; aucune mutation dans le dépôt de travail.

- Contrôle final des fichiers modifiés : `node scripts/check.mjs --changed` : code 0, `check : vert`, règles, format, lint, gel et cliquet verts ; 73/73 tests JS (`check-changed-final.log`). Aucun contrôle ignoré.
- Contrôle complet final : `node scripts/check.mjs` : code 0, `check : vert` ; règles, format, lint, gel et cliquet verts ; 1 658/1 658 tests JS sur 120 fichiers, 22 tests Python OK (`check-full.log`). `git diff --check` : code 0. Aucun fournisseur réel appelé. Aucun test supprimé ni assertion de message affaiblie ; harnais et plancher inchangés.
- Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T124/verdict.json`, sans réserve ni écart restant. Aucun commit ni push ; la relecture et l’intégration sont laissées à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T124/relecture-1.md : **1. `adapters/codex-perception.cjs:17-18`, hors périmètre**
  - **Problème :** le commentaire du lecteur attribue encore la perte en plein tour à `codex-session-client`. Depuis l'ADR 0022, c'est `codex-session-events.cjs:71` (`connectionClosed`) qui l'émet. Le ticket dit lui-même que cette attribution est périmée.
  - **Attendu :** corriger l'attribution quand T125 migrera ce lecteur vers les codes. Ce ticket interdit de toucher aux lecteurs.
- .harness-state/tickets/T124/relecture-1.md : **2. `adapters/chat-trace.cjs:21`, hors périmètre**
  - **Problème :** `safeError` laisse déjà passer `code`. Les erreurs codées font donc apparaître un `errorDetail.code` de premier niveau dans l'instantané des travaux (`core/deep-ask.cjs:153`), envoyé au Mac et à la TV.
  - **Effet aujourd'hui :** aucun. Aucun lecteur ne l'utilise : `app/ui/job-view.mjs:93-98` et `tv/app/chat-model.js:122-128` ne lisent que `turnError.code`. Le critère 5 avait prévu ce cas, et le test chat-error-ui le couvre.
  - **Attendu :** que T188 et T189 en tiennent compte.
