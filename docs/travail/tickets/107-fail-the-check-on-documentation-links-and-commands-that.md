---
id: T107
titre: Fail the check on documentation links and commands that point nowhere
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Treize liens relatifs de la documentation mènent nulle part sur un clone du dépôt, et rien ne le détecte.
Huit visent `.scratch/`, ignoré par Git ; cinq visent `experiments/`, qui n'est pas suivi. Après ce ticket,
un test hors ligne échoue dès qu'un document Markdown pointe vers un fichier absent ou ignoré par Git. Il
échoue aussi quand un document cite une commande `npm run …` absente du `package.json` concerné, ou un
`node <chemin>` vers un fichier qui n'existe pas. Il vérifie enfin les chemins de code cités entre accents
graves dans les pages de référence. Les treize liens morts sont remplacés par du texte. Les tickets
suivants du lot déplacent des documents ; c'est ce test qui les garde.

## Sources

- Constats : DOC-07
- Mesures à la version `0d5a954`. L'univers « publiable » correspond à
  `git ls-files --cached --others --exclude-standard`.
  - 119 fichiers Markdown, environ 450 liens relatifs. Huit liens sont cassés pour cet univers, treize
    pour les seuls fichiers suivis. Commande qui liste les treize :
    `git grep -nE "\]\((\.\./)+(\.scratch|experiments)/" -- '*.md'`.
  - `npm run <nom>` : seize documents en citent. Tous les noms existent dans le `package.json` le plus
    proche du document, celui de la racine ou bien `film/package.json` ou `promo/package.json`.
  - `node <chemin>` vers `scripts/`, `tests/`, `mcp/`, `server/` ou `app/` : une soixantaine de
    citations hors `docs/travail/tickets/` (le décompte exact dépend de l'expression employée). Une seule
    vise un fichier absent : `.claude/skills/tests/SKILL.md:53`, `tests/mon-module.test.cjs`. C'est un
    exemple de la skill.
  - Chemins de code entre accents graves (préfixe `core/`, `adapters/`, `runtime/`, `server/`, `mcp/`,
    `app/`, `tv/`, `scripts/`, `tests/`, `deploy/`, `prototypes/` ou `docs/`, suffixe `:ligne` retiré) :
    aucun absent dans `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/README.md`,
    `docs/architecture.md`, `docs/installation.md` et `docs/server-installation.md`.
- Liens à remplacer, à la version `0d5a954` :
  - `docs/tvlens-night-tickets.md`, tableau « Ticket | Dépendances | État… », lignes 16-23 : huit liens
    vers `../.scratch/tvlens-night/issues/0N-*.md`.
  - `docs/README.md`, section « Candidature et prochaines expériences », ligne 44 : lien vers
    `../experiments/README.md`.
  - `docs/PRD-V2.md` : en-tête « Document de travail consolidé » (ligne 3), puis lignes 115, 129 et 258,
    liens vers `../experiments/…`.
- Fichiers non suivis mais non ignorés à la version `0d5a954` : `experiments/`,
  `design/continuous-context/`, `docs/travail/README.md`. Ils sont présents sur la machine du
  propriétaire, absents d'un clone.

## Périmètre

- À créer : `tests/documentation-links.test.cjs`. Les fonctions d'analyse sont locales au fichier, sans
  dépendance externe. Le test lance `git ls-files --cached --others --exclude-standard` depuis la racine du
  dépôt : un fichier qu'un ticket vient de créer compte donc, un fichier ignoré ne compte pas.
- Ce que le test vérifie :
  1. Dans tout fichier `.md` de l'univers, chaque lien relatif `](…)` ou `<img src="…">` (ancre retirée,
     URL décodée) résout vers un fichier ou un dossier de l'univers. Les liens `http(s):`, `mailto:` et
     `#ancre` sont ignorés.
  2. Chaque `npm run <nom>` cité existe dans le `package.json` le plus proche du document.
  3. Chaque `node [--option …] <chemin>` cité vers `scripts/`, `tests/`, `mcp/`, `server/` ou `app/` existe.
     Le dossier `.claude/` est exclu de ce point : ses exemples de code ne sont pas des fichiers.
  4. Dans les sept pages de référence nommées dans « Sources », chaque chemin de code entre accents graves
     existe.
- Exclusions :
  - les fichiers de `docs/travail/tickets/` sont hors du contrôle : un ticket cite des fichiers et des
    commandes qui n'existent pas encore, et des exemples de commande ;
  - un lien écrit dans un bloc de code ou entre accents graves n'est pas un lien : le point 1 l'ignore ;
  - aux points 3 et 4, un chemin qui contient un joker ou un gabarit (`*`, `<…>`, `…`) est ignoré : il ne
    nomme pas un fichier.
- Chaque échec nomme le document, la ligne et la cible.
- À modifier, sans rien changer d'autre :
  - `docs/tvlens-night-tickets.md` : les huit liens deviennent du texte simple (titre du ticket inchangé).
    Une phrase sous le tableau précise que les fiches sources sont restées dans un dossier local, non publié.
  - `docs/README.md` (ligne 44) et `docs/PRD-V2.md` (lignes 3, 115, 129, 258) : chaque lien vers
    `experiments/` devient le nom du fichier entre accents graves, suivi de « (dossier local, non publié) ».
- À ne pas toucher : `experiments/`, `design/`, `docs/travail/README.md`. Aucun fichier du harnais.
  `scripts/check.mjs` n'est pas modifié : il lance déjà tout `tests/*.test.cjs`.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/documentation-links.test.cjs` passe, en moins de dix secondes. Commande et durée
   dans le journal.
2. Le fichier contient un cas qui applique les fonctions d'analyse à un texte Markdown écrit dans le test.
   Ce texte porte un lien mort, une commande `npm run` absente, un `node scripts/absent.cjs` et un chemin
   de code absent. Le cas exige quatre signalements, chacun avec sa ligne.
3. Preuve de détection sur le vrai dépôt, sans rien committer : on rétablit un des huit liens
   `../.scratch/…`, et le test échoue en nommant `docs/tvlens-night-tickets.md` et la ligne. On annule
   ensuite la modification. Commande et sortie dans le journal.
4. `git grep -nE "\]\((\.\./)+(\.scratch|experiments)/" -- '*.md'` ne renvoie rien (code de sortie 1).
5. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

`tests/documentation-links.test.cjs`. La frontière est le dépôt tel que Git le publierait : les fichiers
Markdown, `package.json` et la liste des fichiers. Aucun réseau.

## Hypothèses bloquantes

Aucune décision n'est attendue. Publier `experiments/` ou non reste une décision du propriétaire. Si le
dossier est committé plus tard, ses liens se rétablissent, et le test les vérifiera.

## Journal
