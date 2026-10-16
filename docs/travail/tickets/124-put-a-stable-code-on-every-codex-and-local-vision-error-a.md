---
id: T124
titre: Put a stable code on every Codex and local vision error a retry reads
statut: a-faire
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
