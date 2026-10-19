---
id: T291
titre: Explain and fix the intermittent failure of the held upload cancellation test
statut: termine
bloque_par: T284
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le second test qui a échoué une fois sur un contrôle complet de la boucle, la nuit du 19/10, est expliqué : l'échec est
reproduit, sa cause nommée, puis corrigée dans le test ou dans le code du rejeu soutenu. Le contrôle complet ne dépend
plus de la chance.

## Sources

- Tentative 1 de T288, le 19/10 à 02:23 : `node scripts/check.mjs` rouge, 2 902 tests JS sur 2 903, un seul échec en
  110 ms : `cancellation while upload transport is held cannot turn a late question answer into success`
  (`tests/local-stream-replay.test.cjs:591`). Le contrôle ne garde que le titre, pas l'assertion en échec
  (`.harness-state/tickets/T288/echec-1.txt`). T288 ne touche que `prototypes/lg-remote/` : aucun lien de code.
  Charge relevée par la boucle à ce moment : moyennes 4,70 / 3,36 / 2,62.
- Même nuit, à 01:44, un autre test (`tests/session-events.test.cjs`) avait échoué de la même façon ; sa cause, un
  ordre entre voies non garanti, est corrigée par T287 (`1d8d64a`, voir T290).
- Le test, à `1d8d64a`, `tests/local-stream-replay.test.cjs:591-644` : horloge accélérée (`accelerated`), serveur HTTP
  dans le processus (`stage.host.exchange`), transport d'envoi retenu (`heldUpload`), réponse retenue (`heldAnswer`),
  attente `until` de l'annulation reconnue, puis `turns(5)` avant de comparer le rapport écrit.
- Code exercé : `scripts/replay-local-stream.cjs` et ses modules (rejeu soutenu, T259 et T261).
- Règle du projet : un échec intermittent se reproduit et s'explique ; un test ne s'affaiblit pas et ne se relance pas
  jusqu'au succès.

## Périmètre

- D'abord reproduire, de façon provoquée et répétable : par exemple un retard contrôlé d'une étape (envoi, réponse,
  écriture du rapport) ou le fichier lancé avec d'autres tests en parallèle et une charge processeur. Consigner
  l'assertion en échec et ses valeurs.
- Si la cause est une attente du test fondée sur le temps réel ou sur un nombre de tours : la remplacer par l'attente
  de l'état attendu, sans retirer aucune assertion.
- Si la cause est un défaut du rejeu (annulation, rapport ou fin de campagne) : le corriger, avec un test qui
  reproduit l'échec de façon déterministe.
- Si l'échec vient d'un comportement que le rejeu ne garantit pas et que le test affirme : s'arrêter avec un verdict
  PARTIEL et la preuve. Changer ce que l'assertion affirme revient au propriétaire.
- À modifier : `tests/local-stream-replay.test.cjs`, et le code du rejeu seulement dans le deuxième cas.
- À ne pas toucher : le harnais (`scripts/check.mjs`, `scripts/loop/`), les autres tests du fichier.

## Critères d'acceptation

1. La reproduction provoquée échoue avant la correction et passe après ; sa commande et son résultat figurent au
   journal.
2. Aucune assertion du test n'est retirée ni élargie.
3. `node --test tests/local-stream-replay.test.cjs`, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/local-stream-replay.test.cjs` : la reproduction provoquée de l'échec, gardée comme test si elle porte un défaut
du rejeu.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : rangé après le contrôle T284 ; ce rejeu sert la mesure du GX10, déjà figée dans
  `gx10-copie-b`.
- 19/10, orchestrateur : traité dans le commit de T288, sur décision de l'orchestrateur, propriétaire absent.
  Reproduction provoquée par Codex : les écritures des corps d'envoi retenues 1 000 tours de boucle
  (`.harness-state/tickets/T288/slow-upload-diagnostic.cjs`) ; l'horloge virtuelle atteint la fin à 4 000 ms avant
  l'écriture du premier corps, et l'assertion de la perte vision de `moment-1` échoue (`actual: false`). Rouge sans la
  correction, vert avec ; fichier : 43 tests ; contrôle complet vert. Cause : course du test, pas défaut du rejeu.
  Correction : attente de l'envoi retenu et de la perte publiée entre deux avances de l'horloge ; aucune assertion
  retirée ni élargie. Le détail de l'échec initial n'ayant pas été gardé, son identité avec cette cause reste une
  inférence.
