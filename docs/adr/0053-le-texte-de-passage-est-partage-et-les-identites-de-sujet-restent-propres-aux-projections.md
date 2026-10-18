# 0053 — Le texte de passage est partagé et les identités de sujet restent propres aux projections

- Date : 2026-10-17
- Ticket : `docs/travail/tickets/218-place-clean-memory-modules-behind-the-public-entry.md`
- Statut : acceptée

## Contexte

Le texte d'un passage sert à plusieurs contextes : recherche, résumé et preuves de question.
Le résumé cumulatif appartient à la Mémoire. Perception et frise dupliquaient leur décision de
continuité, tout en préparant différemment l'identité du sujet. Les ADR 0029 et 0044 imposent
un placement par contexte et une entrée publique pour les lecteurs étrangers.

## Décision

`passage-text.cjs` rejoint `core/shared/`, sans dépendance au contexte Mémoire.
`topic-summary.cjs` rejoint `core/memory/` ; ses consommateurs extérieurs passent par l'index public.
Les trois exceptions de migration liées à leurs anciennes adresses disparaissent, sans réexport.

L'aide pure `continuesTopic` reçoit deux identités préparées, la continuité explicite et le trou
entre passages. Elle refuse un sujet absent ou différent, `change`, `uncertain` et un trou
strictement supérieur à la tolérance de 1000 ms, nommée une seule fois.
La perception garde la comparaison exacte de ses libellés bornés ; la frise garde sa normalisation
de casse et d'accents. Le plan saute les passages sans sujet et mesure le trou depuis le dernier
passage avec sujet ; le contexte actif et la récupération cumulative s'arrêtent à ces passages.
`completeTopicSummary` garde sa condition distincte de continuation explicite et de résumé valide.

Le service et son port prennent les noms `MemorySearch` et `MemorySearchPort`. Le fichier gelé
reste `core/moment-search.cjs` ; les champs et identifiants historiques ne changent pas.

## Alternatives écartées

- Placer le texte sous Mémoire : imposerait ce contexte aux lecteurs d'une représentation partagée.
- Uniformiser les identités : modifierait le regroupement observé sans décision métier.
- Fusionner les projections ou leurs résumés : confondrait contexte cumulatif et preuve d'un passage.
- Déplacer les cinq modules encore gelés : transporterait leur dette dans de nouveaux fichiers.

## Conséquences

Les lecteurs partagent une seule décision de continuité tout en conservant leurs résultats.
Les modules propres changent d'adresse ; les modules gelés restent plats pour un lot ultérieur.
Aucune permission supplémentaire, donnée persistée, dépendance ni minuterie n'est introduite.

## Protégée par

`perception-context`, `topic-summary`, `session-timeline` : frontières 1000/1001 ms, analyses
manquantes, ruptures explicites, identité exacte ou normalisée, bornes et provenance cumulative.
`moment-index`, `video-research`, `session-providers`, `stream-simulation` : recherche et budgets.
`architecture` et `architecture-guard` : placement, entrée publique et refus des imports internes.
