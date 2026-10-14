---
id: T112
titre: Archive superseded plans and diagrams, and rewrite the roadmap from what is open
statut: a-faire
bloque_par: T109
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois générations de plans coexistent avec la documentation actuelle, sans marque d'archive :
- le cadrage initial : `PRD.MD` à la racine, la roadmap et les décisions d'origine, 33 brouillons de
  tickets ;
- les treize tickets du companion LG, aux cases non cochées ;
- deux diagrammes d'un état abandonné, dont l'un s'appelle « current ».

`ROADMAP.md`, à la racine, annonce « aucune implémentation » d'une tranche livrée et cite le mode Auto,
retiré. Après ce ticket, ces documents sont rangés dans trois dossiers d'archive datés, chacun avec un
README qui dit son statut. Le travail encore ouvert des tickets LG est inscrit au registre des dettes avant
le déplacement. `ROADMAP.md` dit où vit le travail ouvert, sans plan inventé.

## Sources

- Constats : DOC-08, DOC-17
- Documents, à la version `0d5a954` :
  - Cadrage initial : `PRD.MD` (racine, aucun lien entrant), `docs/roadmap-original.md`,
    `docs/ticket-drafts-original.json`, `docs/product-decisions-original.md`,
    `docs/reexamen-contract-original.md`. Liens entrants :
    - `ROADMAP.md`, lignes 11-13 ;
    - `docs/README.md`, section « Recherche et historique », ligne 57 ;
    - `docs/temporal-research.md`, ligne 5.

    Aucun script ni test ne lit ces fichiers :
    `git grep -nE "roadmap-original|ticket-drafts-original|product-decisions-original|reexamen-contract-original|PRD\.MD" -- scripts tests`
    ne renvoie rien.
  - Tickets LG : `docs/lg-companion-tickets/01.md` à `13.md`.
    - Statuts : 01-02 « en cours — … », 03-06 « en cours, non publié », 07-13 « brouillon, non publié ».
    - Cases non cochées par fichier (`grep -c '^\s*- \[ \]'`) : 5, 5, 4, 5, 5, 4, 5, 3, 3, 3, 4, 5, 5.
    - `docs/lg-companion-roadmap.md` : section « État actuel » (lignes 5-20), puis « Plan initial et
      journal historique » (ligne 21) jusqu'à la fin (97 lignes). Le tableau « Ordre proposé »
      (lignes 48-60) lie les treize fichiers.
  - Diagrammes : `docs/diagrams/README.md` (« Diagnostic réel du 4 octobre 2026, **avant** la séparation
    audio/vision »), `continuous-analysis-current.puml`, `continuous-analysis-target.puml`. Aucun lien
    entrant hors du dossier : `git grep -n "diagrams/" -- ':!docs/diagrams'` ne renvoie rien à
    `0d5a954` ; T108 y ajoute le lien de l'index.
  - `ROADMAP.md` :
    - ligne 5 : « aucune implémentation de cette tranche annoncée » pour le companion LG, que `README.md`
      présente comme livré ;
    - ligne 9 : cite « Auto », retiré (`docs/architecture.md`, section « Surveillance et résumé
      progressif ») ;
    - lignes 15-25 : tableau des 33 tickets de cadrage ;
    - lignes 31-52 : la demande « embeddings multimodaux » ; ligne 54 : l'exploration « moteur embarqué
      dans la TV ». Ce sont deux travaux futurs encore ouverts.

## Périmètre

- Avant tout déplacement : chaque case `- [ ]` non cochée d'un ticket LG entre au registre
  `docs/travail/dettes.md`, avec l'origine `LG-NN`. Plusieurs cases d'un même ticket peuvent former une
  seule dette si elles disent la même chose. Un critère déjà rempli d'après `lg-companion-roadmap.md`
  (« État actuel ») est inscrit avec l'état `close`, et la source de clôture est citée.
- Déplacements par `git mv` :
  - `docs/archive/2026-09-cadrage/` : les cinq documents du cadrage initial ;
  - `docs/archive/2026-09-lg/` : `docs/lg-companion-tickets/` (devient `tickets/`), et la partie « Plan
    initial et journal historique » de `docs/lg-companion-roadmap.md`, qui devient `plan-initial.md`. La
    section « État actuel » reste dans `docs/lg-companion-roadmap.md`, avec une ligne qui renvoie à
    l'archive et au registre ;
  - `docs/archive/2026-10-04-analyse-continue/` : le contenu de `docs/diagrams/`. Les deux sources sont
    renommées `avant.puml` et `cible-proposee.puml`, et le README les cite sous ces noms.
- Chaque dossier d'archive a un `README.md`. Sa première ligne de contenu est
  `> Statut : archive du JJ/MM/AAAA — remplacé par <lien>`, avec la date que porte le document archivé, ou
  sinon `git log -1 --format=%ad --date=short -- <fichier>`. Il dit ensuite en trois à six lignes ce que
  le lot a produit et liste ses fichiers. Le README des diagrammes est celui de `docs/diagrams/`, complété
  de la ligne de statut.
- `ROADMAP.md` est réécrit, en quarante-cinq lignes au plus :
  - il renvoie au travail ouvert : `docs/travail/tickets/`, `docs/travail/dettes.md`, `docs/PRD-V2.md`,
    `docs/lg-on-device-exploration.md` ;
  - il garde telles quelles la section « embeddings multimodaux » et l'exploration du moteur embarqué ;
  - il ne contient ni le tableau des 33 tickets, ni « aucune implémentation », ni « Auto ». Le tableau
    part dans le README de `2026-09-cadrage`.

  Aucun plan, date ou priorité n'est ajouté.
- Tous les liens relatifs des fichiers déplacés et de leurs appelants sont réécrits. `docs/README.md`
  pointe vers les README d'archive au lieu des fichiers.
- À ne pas toucher : les fichiers JSON que des scripts écrivent ou lisent (`docs/*-live.json` et
  apparentés), `docs/PRD-V2.md`, le code.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. Couverture des tickets LG : une commande `node -e`, consignée dans le journal, liste les fichiers de
   `docs/archive/2026-09-lg/tickets/` qui contiennent une case `- [ ]`. Elle vérifie que chacun a au moins
   une ligne du registre dont les origines contiennent `LG-NN`. Sortie attendue : `13 tickets, 0 sans dette`.
2. `test -e PRD.MD`, `test -d docs/lg-companion-tickets` et `test -d docs/diagrams` échouent.
3. `git grep -n "continuous-analysis-current" -- . ':!docs/travail/tickets'` ne renvoie rien. Les tickets
   sont exclus : leur rubrique « Sources » cite l'ancien nom.
4. `grep -n "aucune implémentation" ROADMAP.md` et `grep -nw "Auto" ROADMAP.md` ne renvoient rien, et
   `wc -l < ROADMAP.md` vaut 45 au plus. Les deux sections gardées (lignes 31-59 à `0d5a954`) ne
   contiennent pas le mot « Auto ».
5. `for d in docs/archive/2026-09-cadrage docs/archive/2026-09-lg docs/archive/2026-10-04-analyse-continue; do sed -n '1,5p' $d/README.md | grep -c "Statut : archive du"; done`
   affiche 1 trois fois.
6. `node --test tests/documentation-links.test.cjs`, `node --test tests/documentation-index.test.cjs` et
   `node --test tests/debt-register.test.cjs` passent.
7. `git diff -M --name-status HEAD | grep -c '^R'` vaut au moins 20 : cinq documents du cadrage, treize
   tickets LG et les deux sources de diagrammes sont vus comme renommés (`git mv` met le déplacement dans
   l'index ; sans `HEAD`, `git diff` ne le montre pas). La sortie de `git diff -M --stat HEAD` est dans le
   journal.
8. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. Les trois tests de documentation existants gardent les liens, l'indexation des archives
et la forme du registre. La couverture des tickets LG se vérifie par la commande du critère 1.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le ticket range et relie sans trancher ce qui reste à faire. Les nouveaux
diagrammes (couches, états d'une session) ne sont pas dans ce ticket.

## Journal
