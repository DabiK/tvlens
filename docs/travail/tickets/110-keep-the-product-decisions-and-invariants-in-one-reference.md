---
id: T110
titre: Keep the product decisions and invariants in one reference page
statut: a-faire
bloque_par: T108, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les règles produit que le code applique n'ont pas de page de référence. Les neuf décisions prises par le
propriétaire le 13 octobre 2026 sont au milieu d'un document de mission, entre un relevé technique et des
propositions non acceptées. Les invariants produit de la première boucle tiennent en une seule ligne de
`mission.md`, compressée au point d'être illisible (« questions5min », « failclosed »). Le code cite pourtant
ces décisions par leur numéro (« Product decision 1 », « decision 8 »). Après ce ticket, une page
`docs/decisions-produit.md` reprend les neuf décisions avec leur numéro et les invariants, chacun avec sa
source. Les archivages qui suivent (T111, T113) peuvent alors ranger les documents d'origine sans perdre
ces règles.

## Sources

- Constats : OUBLI-18
- Documents, à la version `0d5a954` :
  - `docs/features-proactives-et-retention-2026-10-13.md`, sections « Décisions prises — première ronde »
    (ligne 80, décisions 1 à 3), « deuxième ronde » (ligne 97, décisions 4 à 6) et « troisième ronde »
    (ligne 103, décisions 7 à 9). La section « Propositions pratiques, non encore acceptées » (ligne 109)
    n'en fait pas partie.
  - `docs/architecture-improvements/mission.md`, section « Invariants produit » (ligne 19), paragraphe
    de la ligne 21 : dix invariants séparés par des virgules, puis la phrase « Ne présente jamais
    simulation… ». La ligne suivante donne des consignes de conception, pas des règles produit.
- Citations dans le code, commande `git grep -nE "[Pp]roduct decision|decision [0-9]\)" -- core tests` :
  - `core/deep-ask.cjs:8`, commentaire au-dessus de `QUESTION_TIMEOUT_MS` : « Product decision 1 ».
  - `tests/viewing-features.test.cjs:4`, commentaire d'en-tête : « decision 8 ».

## Périmètre

- À créer : `docs/decisions-produit.md`, en français.
  - Section « Décisions du 13 octobre 2026 » : neuf sous-titres `### Décision N — …`, N de 1 à 9, dans
    l'ordre et avec la numérotation d'origine. Chaque décision reprend le texte de la source : la phrase en
    gras et ses précisions, sans règle ajoutée. Les citations entre guillemets du propriétaire restent
    telles quelles. Chaque décision renvoie à sa section d'origine.
  - Section « Invariants » : une puce par invariant. On compte les dix éléments de la liste et la phrase
    sur la simulation, soit onze puces. Chaque puce développe l'abréviation en phrase française, sans en
    changer le sens. Un terme abrégé (« baux », « garde de contexte vidéo », « scellement ») est défini à
    partir d'un ADR ou du code qui l'emploie, avec la référence. Sinon, il est cité tel quel entre
    guillemets, avec la mention « non défini dans les sources ».
  - Une ligne d'en-tête dit que la page est la référence et que les documents d'origine sont des archives
    de travail.
- À modifier : `docs/README.md`, une ligne dans la section de référence qui renvoie à la nouvelle page.
- À ne pas toucher : le document de la mission et `mission.md`, qui seront archivés par T111 et T113 ;
  les commentaires du code ; `docs/standards.md`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -cE "^### Décision [1-9] " docs/decisions-produit.md` vaut 9.
2. Pour chaque N de 1 à 9, la phrase en gras de la décision N figure dans la page. Commande à consigner dans
   le journal :

   ```sh
   node -e 'const fs=require("fs");const s=fs.readFileSync("docs/features-proactives-et-retention-2026-10-13.md","utf8");
   const d=fs.readFileSync("docs/decisions-produit.md","utf8");const m=[...s.matchAll(/^([1-9])\. \*\*(.+?)\*\*/gm)];
   console.log(m.length, m.filter(x=>!d.includes(x[2])).map(x=>x[1]))'
   ```

   Sortie attendue : `9 []`.
3. La section « Invariants » compte onze puces :
   `awk '/^## Invariants/{p=1;next} p&&/^## /{exit} p&&/^- /{n++} END{print n}' docs/decisions-produit.md`
   vaut 11.
4. `grep -n "decisions-produit.md" docs/README.md` renvoie une ligne.
5. `grep -niE "proposition|non encore accept" docs/decisions-produit.md` ne renvoie rien.
6. `node --test tests/documentation-links.test.cjs` et `node --test tests/documentation-index.test.cjs`
   passent.
7. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

Aucun nouveau test. Les tests existants `tests/documentation-links.test.cjs` et
`tests/documentation-index.test.cjs` gardent le lien et l'indexation. Le contenu se vérifie par les
commandes des critères 1 à 3, qui comparent la page à sa source.

## Hypothèses bloquantes

Aucune décision n'est attendue. La page reprend des décisions déjà prises, sans en ajouter. Une décision
qui contredit le code n'est pas corrigée ici : l'écart est signalé dans le journal.

## Journal
