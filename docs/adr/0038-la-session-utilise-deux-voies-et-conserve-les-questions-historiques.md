# 0038 — La session utilise deux voies et conserve les questions historiques

- Date : 2026-10-16
- Ticket : `docs/travail/tickets/194-remove-the-unused-answer-path-the-serial-lane-and-the-masked.md`
- Statut : acceptée

## Contexte

Les hôtes posent leurs questions par DeepAsk et utilisent les voies audio et vision depuis la
migration smoke. WatchSession conserve pourtant un second port de réponse et une voie observe-only.
La capture TV ne produit plus la déclaration d’occultation encore interprétée par l’ingestion.
Le propriétaire autorise leur retrait et la baisse exacte du plancher de tests dans le ticket.

## Décision

WatchSession ne reçoit plus answer et n’expose plus ask ni selectEvidence. Son drainage, sa surcharge
et son expiration appliquent toujours le contrat transcribe/observeVisual. DeepAsk conserve ses règles
actives de preuves, ses explications sans citation en chat et sa file. L’activité de question reste
possédée par setQuestionPending, conformément à l’ADR 0035.

RemoteMedia et WatchSession ignorent l’ancien champ facultatif d’occultation sans nouveau refus.
Les images, leur cadrage géométrique, les identités, séquences et sources gardent leur contrat.
Aucune nouvelle note d’occultation n’est créée. Les routes et files de surveillance overlay restent.
Le simulé retire ses méthodes observe et ask sans consommateur. CodexPerception.observe conserve
son appelant explicite scripts/probe-codex-speed.cjs ; aucune sélection série ne subsiste dans la session.

La validation, la restauration et le snapshot conservent les questions historiques. Les observations,
leurs notes et leurs métadonnées archivées restent lisibles ; ouvrir puis refermer ne réanalyse ni ne
réécrit l’archive et n’appelle aucun fournisseur. Aucune migration sur disque n’est nécessaire.

## Alternatives écartées

- Garder un second chemin de réponse sans appelant produit : entretient une conversation parallèle.
- Renforcer les règles actives pour reproduire les anciens textes : dépasse le retrait autorisé.
- Retirer la méthode combinée Codex encore appelée par une sonde : sort du retrait facultatif sans appelant.

## Conséquences

Le contrat de session possède deux voies. Les anciennes données survivent à la disparition de leur API
d’écriture. Les scénarios génériques de rétention, de fin, de miniature et de publication passent par les deux voies.
L’inventaire précis des déclarations retirées et leurs remplacements se trouve dans le journal du ticket :

- session.test.cjs : six cas ask/selectEvidence (rétention ciblée, barrière, référence inconnue,
  citation du présent, références temporelles, question après pause).
- topic-summary.test.cjs : un cas du port historique excluant le cumul.
- simulated-providers.test.cjs : un cas observe/ask simulé.
- session-durable.test.cjs : un cas de création/conservation de déclaration et note.
- server-ingest-path.test.cjs : un cas de validation/relais de déclaration et note.
- watch-session-ending.test.cjs : un cas de concurrence ask en fin, et deux déclarations de la matrice
  série/deux voies remplacées par les mêmes preuves pour les deux voies uniquement.

Les cas mixtes restent : architecture-f06 retire seulement le fragment de refus de déclaration overlay ;
session-timeline tient la transcription pour prouver la miniature avant tout résultat d’analyse.

Au sens littéral des déclarations `test(` retirées et ajoutées : P = 1467, n = 13, a = 6,
M final = 1460. Le plancher devient P − n = 1454 et M = P − n + a. Les six ajouts sont quatre preuves
comportementales (validation DeepAsk, archive historique, ingestion tolérante, refus pendant/après fin)
et deux remplacements de la matrice. Aucun cas de remplissage, aucun autre plancher relâché.
Les versions supprimées se retrouvent dans le parent du commit qui ajoute cet ADR ; base d’exploration : 26fa76b.

## Protégée par

Les nouvelles preuves publiques de evidence-refresh, archive-compat et server-ingest-path précèdent ou
accompagnent la contraction. Les tests DeepAsk, de rétention/restauration, split-perception, de fin et
de surveillance restent actifs. Le journal conserve le rouge d’ingestion, les verts observés, les
recherches d’absence et les contrôles séquentiels puis complets de `node scripts/check.mjs`.
