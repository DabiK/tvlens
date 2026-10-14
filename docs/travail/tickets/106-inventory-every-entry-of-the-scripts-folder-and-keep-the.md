---
id: T106
titre: Inventory every entry of the scripts folder and keep the table in sync
statut: a-faire
bloque_par: T040, T041, T043, T044, T045, T098, T099, T105, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

`scripts/` compte une quarantaine de fichiers au premier niveau, plus `loop/` et `quality/`. Rien ne dit
lesquels construisent, lesquels installent, lesquels rejouent un parcours hors ligne, ni lesquels consomment
le quota Codex, des crédits OpenRouter ou un appareil réel. La plupart n'ont pas d'entrée npm. Pour savoir
s'il peut lancer un script, un agent doit le lire en entier.

Après ce ticket, `scripts/README.md` porte une table : une ligne par entrée de `scripts/`, dossiers compris,
avec son rôle, sa nature (vocabulaire fixe), son coût et son entrée npm. Un test garde la table juste. Toute
entrée de `scripts/` y figure une seule fois, aucune ligne ne nomme un fichier absent, et un script payant
qui a une entrée npm la voit finir par `:live`. Le message d'échec dit quelle ligne ajouter.

## Sources

- Constats : OPS-11, TSTC-18
- État vérifié à la version `0d5a954` :
  - `ls scripts` : 42 entrées, dont `check.mjs`, `loop/` et `quality/` (le harnais). Classement indicatif des
    40 fichiers, tiré de leur nom et d'une lecture rapide :
    - construction : `package.mjs`, `package-tv-ambient.mjs`, `open-mac.mjs`, et
      `generate-action-fixtures.py`, qui fabrique un corpus synthétique local par PIL et FFmpeg ;
    - installation : `setup-codex.cjs`, `setup-speech.mjs` ;
    - parcours hors ligne : `smoke-*`, `simulate-*`, `replay-*` ;
    - bancs : `bench-*` ;
    - Codex réel : `probe-verify`, `probe-codex-speed`, `probe-chat-*`, `probe-confinement`, `probe-refactor-live`,
      `probe-video-chat-live`, `probe-overlap-live`, `probe-surveillance`, `capture-showcase` (drapeaux
      `--live-video-agent`, `--live-inspection`), `check-codex-quota.cjs` (ouvre une session Codex pour lire
      le quota) ;
    - OpenRouter : `probe-live`, `evaluate-actions` (aussi Codex, par l'agent hérité),
      `compare-inspection-strategies`, `probe-retrieval`, `diagnose-inspect` (`OPENROUTER_API_KEY`) ;
    - appareil réel : `probe-lg-companion`, `probe-lg-network`, `probe-tv-ambient-capture` ;
    - à classer en le lisant : `probe-shortcut.mjs`, qui lance Electron avec `--live-shortcut` et enregistre
      un vrai raccourci global du système, sans fournisseur payant visible.
    Ce classement est un point de départ : le ticket vérifie chaque fichier en le lisant, et c'est la table
    qui fait foi.
  - `package.json`, bloc `scripts` : après T098, toute commande payante finit par `:live`.
  - Entrées ajoutées par des tickets antérieurs :
    - `scripts/package-filter.cjs` (T099) ;
    - `scripts/package-tv.mjs` (T105) ;
    - `scripts/test-probes/` (lot:L01) ;
    - `scripts/fixtures/` (lot:L17).
    Aucun autre ticket écrit des lots L01, L02, L04 à L08, L17 et L18 ne crée d'entrée au premier niveau de
    `scripts/`.
  - `tests/npm-scripts.test.cjs` (T098) : la règle `:live` côté `package.json`, que ce ticket ne double pas.

## Périmètre

À créer :

- `scripts/README.md`, en français. Une phrase d'en-tête dit quand ajouter une ligne. Puis une table à
  quatre colonnes :
  - `Entrée` : nom exact, avec `/` final pour un dossier ;
  - `Nature` : une valeur parmi `construction`, `installation`, `contrôle`, `parcours hors ligne`, `banc`,
    `Codex réel`, `OpenRouter`, `appareil réel` ;
  - `Coût` : `aucun`, `quota Codex`, `crédits OpenRouter` ou `appareil` ;
  - `Entrée npm` : le nom, ou `—`.
  Le harnais (`check.mjs`, `loop/`, `quality/`) est classé `contrôle`. Les rapports et fichiers que les
  scripts écrivent ne sont pas décrits ici.
- `tests/scripts-inventory.test.cjs`, qui lit `scripts/README.md`, le dossier `scripts/` et `package.json`.
  Il vérifie :
  - chaque entrée du dossier (fichier ou dossier, sauf `README.md`) a exactement une ligne ; sinon le message
    donne la ligne à ajouter, avec des colonnes à remplir ;
  - aucune ligne ne nomme une entrée absente ;
  - chaque `Nature` et chaque `Coût` appartient au vocabulaire, et un coût autre que `aucun` va avec une
    nature payante ;
  - une ligne de coût autre que `aucun` qui cite une entrée npm cite un nom qui finit par `:live` et qui
    existe dans `package.json` ; une ligne de coût `aucun` ne cite jamais un nom en `:live`.

À ne pas toucher : les scripts eux-mêmes, `package.json`, le harnais. Aucun script n'est déplacé, renommé ni
supprimé ici.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/scripts-inventory.test.cjs` passe.
2. L'agent constate une fois, en local, que le test échoue si l'on crée un fichier vide
   `scripts/essai-inventaire.cjs`, et que le message contient la ligne à ajouter. Il supprime le fichier et
   note la sortie au journal.
3. `grep -c "^| " scripts/README.md`, moins les deux lignes d'en-tête de la table, égale `ls scripts | grep
   -v README.md | wc -l`.
4. `node --test tests/npm-scripts.test.cjs` passe toujours.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/scripts-inventory.test.cjs`, nouveau. Frontière : le contenu réel du dossier `scripts/`, la table de
`scripts/README.md` et le bloc `scripts` de `package.json`. Aucun script n'est lancé.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si la lecture d'un script ne permet pas de dire s'il appelle un fournisseur
réel, le ticket le classe payant, par prudence, et le journal le cite. Un ticket ultérieur, de ce lot ou d'un
autre, qui ajoute une entrée à `scripts/` verra ce test échouer tant qu'il n'ajoute pas sa ligne : c'est
voulu, et le message d'échec lui donne la ligne à écrire. Si un script payant a une entrée npm
sans `:live`, ce qui contredirait T098 : verdict BLOQUÉ, avec l'entrée.

## Journal
