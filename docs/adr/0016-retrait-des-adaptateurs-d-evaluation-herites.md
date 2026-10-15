# 0016 — Retirer les adaptateurs d’évaluation hérités

- Date : 2026-10-15
- Ticket : `docs/travail/tickets/139-remove-the-legacy-openrouter-and-codex-exec-adapters-and-the.md`
- Statut : acceptée

## Contexte

Le produit utilise les rôles de `CodexSessionClient` ; deux adaptateurs subsistaient pour
des scripts d’évaluation et leurs tests. L’agent historique lançait `codex exec`, sans
interdire la lecture du disque. Maintenir ce transport et les complétions OpenRouter
imposait un second chemin sans lecteur dans les hôtes actifs.
La décision écrite du propriétaire du 15 octobre, dans « Hypothèses bloquantes » du ticket,
autorise le retrait et la perte des évaluations, ainsi que la baisse exacte du plancher de tests.

## Décision

Supprimer `adapters/openrouter.cjs`, `adapters/codex-video-agent.cjs` et les cinq scripts
`probe-live.cjs`, `evaluate-actions.cjs`, `compare-inspection-strategies.cjs`,
`diagnose-inspect.cjs`, `generate-action-fixtures.py`. Supprimer les entrées npm
`test:live`, `test:actions:live` et `test:strategies:live`.

Le vérificateur conserve seulement les exports `CodexVerifier`, `verifierRole` et `schema`.
Ses aides `isolatedEnvironment` et `invocation`, réservées à l’agent retiré, disparaissent.
Quatre cas OpenRouter dans `adapters.test.cjs` et un cas exec dans `chat-codex.test.cjs`
disparaissent. Les assertions de lancement exec du test de vérification sont retirées ;
les assertions actives de `childEnvironment` restent avec le même parent.

Mesure de début de session : **M = 1102** cas statiques et **P = 1102** au plancher.
Le compteur de `scripts/quality/metrics.mjs` compte les lignes `test(`, pas les exécutions.
Après retrait de cinq cas, les cibles sont **M − 5 = 1097** et **P − 5 = 1097**.
La seule ligne du cliquet modifiée est `cas_de_test` ; aucun cas de remplissage n’est ajouté.
L’autorisation vient de la décision du propriétaire dans le ticket, pas du présent ADR.

## Alternatives écartées

- Garder les adaptateurs pour les seuls bancs historiques : entretient deux chemins sans usage produit.
- Migrer les évaluations dans ce retrait : recréerait une capacité abandonnée par décision et élargirait le périmètre.

## Conséquences

Le rejeu comparant Ask et réexamen sur le corpus d’actions, la comparaison appariée des
stratégies et la génération de leurs fixtures ne sont plus exécutables dans cet arbre.
La sonde de perception/Ask et le diagnostic d’inspection liés à ces adaptateurs disparaissent aussi.
Leurs anciens rapports restent historiques. Aucun remplacement ni couverture équivalente des
formats audio/vidéo OpenRouter, de la conversion du ralenti ou du rejet 402 n’est revendiqué.
Le journal du ticket inventorie chaque cas et chaque assertion héritée retirés.

Les rôles Codex actifs, `adapters/openrouter-embeddings.cjs`, la sonde de retrieval,
les `probe-chat-*` utilisant `CodexSessionAgent` sous un alias local, et le serveur MCP restent.
`WatchSession.ask()` et `cleanupRawMedia` restent également hors de ce retrait.
Un retour des évaluations passerait par les ports actuels et demanderait de nouvelles preuves.

Pour retrouver exactement le code supprimé, prendre **le parent du commit qui ajoute cet ADR**.
Par exemple, `git log --diff-filter=A --format=%H -- docs/adr/0016-retrait-des-adaptateurs-d-evaluation-herites.md`
donne ce commit ; `git show <commit>^:adapters/openrouter.cjs` restitue l’ancien fichier.
La base de travail avant intégration était `eef7bf5` ; elle ne remplace pas ce repère Git pérenne.

## Protégée par

Le cas existant d’architecture vérifie l’absence physique des deux adaptateurs, en plus des
interdictions d’import conservées. Les tests restants d’adaptateurs, chat, vérification et confinement
protègent les chemins actifs. La recherche d’absence et les mesures avant/après figurent au journal.
Le contrôle complet `node scripts/check.mjs` est requis avant de rendre la main à la boucle.
