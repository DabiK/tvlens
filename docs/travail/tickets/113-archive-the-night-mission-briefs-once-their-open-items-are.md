---
id: T113
titre: Archive the night mission briefs once their open items are in the register
statut: a-faire
bloque_par: T110, T112, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois documents de la mission du 13 octobre 2026 restent au premier niveau de `docs/`, présentés comme le
contrat en cours : l'objectif de la nuit, l'index des huit tickets de nuit et le document des demandes
produit. Les huit tickets y sont « partiel » ou « non clos », avec une colonne « Ce qui reste à prouver ».
Ce reste n'existe nulle part ailleurs. Les neuf décisions du document des demandes ont été reprises par
T110. Après ce ticket, le reste à prouver de chaque ticket de nuit est inscrit au registre des dettes. Les
trois documents sont ensuite rangés dans une archive datée, avec un README qui dit son statut. Le livrable
de la nuit, `docs/night-features-delivery.md`, reste en place : il porte encore le tableau des réglages et
l'état de déploiement.

## Sources

- Constats : DOC-08
- Documents, à la version `0d5a954` :
  - `docs/night-hackathon-objective.md` (11 lignes).
  - `docs/tvlens-night-tickets.md` (45 lignes) :
    - lignes 9-10 : « Cette session n'a rien commité… » et « La supervision a installé la version de la
      nuit sur le VPS et sur la TV… » ;
    - tableau `Ticket | Dépendances | État | Livré et prouvé, et à quel niveau | Ce qui reste à prouver`
      (lignes 14-23), huit tickets 01 à 08 ;
    - liste « Ce que la passe finale a changé, ticket par ticket » qui suit le tableau.
  - `docs/features-proactives-et-retention-2026-10-13.md` (126 lignes) : décisions 1 à 9
    (lignes 80-107), reprises dans `docs/decisions-produit.md` par T110 ; section « Propositions
    pratiques, non encore acceptées » (ligne 109).
  - Liens entrants :
    - `docs/README.md`, section « Mission du 13 octobre 2026 » (lignes 37-38) ;
    - `docs/night-features-delivery.md`, ligne 85 (vers l'index des tickets) et ligne 913.

    Commande :
    `git grep -nE "night-hackathon-objective|tvlens-night-tickets|features-proactives" -- .`.
  - `docs/night-features-delivery.md` reste en place : `README.md`, `SECURITY.md` (section « Avant tout
    déploiement ») et `docs/architecture.md` y renvoient. Sa section de réglages relève d'un autre constat
    (tableau de configuration déclaratif).

## Périmètre

- Avant le déplacement : pour chacun des huit tickets, la case « Ce qui reste à prouver » entre au registre
  `docs/travail/dettes.md`, avec l'origine `NUIT-0N`. Une case qui énumère plusieurs preuves distinctes
  peut donner plusieurs dettes. Une dette déjà présente au registre, venue d'un historique ou d'un ADR,
  reçoit l'origine `NUIT-0N` en plus, sans nouvelle ligne. Le texte reprend la source, sans juger si la
  preuve a été faite depuis.
- Déplacement par `git mv` vers `docs/archive/2026-10-13-nuit/` des trois documents. Leurs noms ne changent
  pas.
- `docs/archive/2026-10-13-nuit/README.md`, première ligne de contenu :
  `> Statut : archive du 13/10/2026 — remplacé par` suivi des liens vers `docs/decisions-produit.md`,
  `docs/travail/dettes.md` et `docs/night-features-delivery.md`. Trois à six lignes disent ensuite ce que
  la mission a produit, puis listent les fichiers.
- `docs/README.md` : la section « Mission du 13 octobre 2026 » garde le livrable et renvoie au README de
  l'archive. Les liens de `night-features-delivery.md` vers les fichiers déplacés suivent le nouveau
  chemin.
- `docs/decisions-produit.md`, créé par T110 : ses renvois vers les sections d'origine des décisions
  pointent vers le document dans l'archive. Commande qui liste tous les liens à réécrire avant le
  déplacement :
  `git grep -nE "night-hackathon-objective|tvlens-night-tickets|features-proactives" -- . ':!docs/travail/tickets'`.
- À ne pas toucher : le contenu des trois documents archivés (sauf leurs liens relatifs, réécrits pour le
  nouvel emplacement), `docs/night-features-delivery.md` et `docs/decisions-produit.md` hors de leurs
  liens, le code. Les commentaires `core/deep-ask.cjs:8` et `tests/viewing-features.test.cjs:4` citent
  une décision par son numéro, sans chemin : ils restent tels quels.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -oE "NUIT-0[1-8]" docs/travail/dettes.md | sort -u | wc -l` vaut 8.
2. `ls docs/night-hackathon-objective.md docs/tvlens-night-tickets.md docs/features-proactives-et-retention-2026-10-13.md`
   échoue pour les trois, et `ls docs/archive/2026-10-13-nuit/` les montre avec `README.md`.
3. `sed -n '1,5p' docs/archive/2026-10-13-nuit/README.md | grep -c "Statut : archive du 13/10/2026"` vaut 1.
4. `test -f docs/night-features-delivery.md` réussit.
5. `node --test tests/documentation-links.test.cjs`, `node --test tests/documentation-index.test.cjs` et
   `node --test tests/debt-register.test.cjs` passent.
6. `git diff -M --name-status HEAD -- docs | grep -c '^R'` vaut au moins 3 : les trois documents sont vus
   comme renommés. La sortie de `git diff -M --stat HEAD` est dans le journal.
7. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. Les trois tests de documentation existants gardent les liens, l'indexation de
l'archive et la forme du registre.

## Hypothèses bloquantes

Aucune décision n'est attendue. L'archivage du livrable de la nuit attend le tableau des réglages et la
décision sur l'état de déploiement ; il n'est pas dans ce ticket.

## Journal
