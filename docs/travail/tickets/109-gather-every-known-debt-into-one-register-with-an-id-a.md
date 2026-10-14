---
id: T109
titre: Gather every known debt into one register with an id, a module and a state
statut: a-faire
bloque_par: T108
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les dettes connues du projet sont dispersées. On en compte 182 lignes dans les tableaux « Limites et
dettes » des dix historiques de la première boucle, et 58 puces dans les sections « Limites » des dix ADR.
Une même dette y revient sous plusieurs formes, et aucune n'a d'identifiant ni d'état. Après ce ticket, un
registre unique `docs/travail/dettes.md` les reprend toutes. Chaque dette y porte un identifiant stable
`DET-NNN`, le module touché, un énoncé, ses origines, la suite proposée et un état. Les tickets suivants
renvoient à ces identifiants : les ADR (T115), l'archivage des tickets LG (T112) et des tickets de la
nuit (T113). Un test garde la forme du registre.

## Sources

- Constats : DOC-05
- Documents, à la version `0d5a954` :
  - `docs/architecture-improvements/history/F01.md` à `F10.md`, section « Limites et dettes », tableau
    `Sujet | Origine | Suite proposée`. Lignes par fichier : F01 7, F02 14, F03 16, F04 12, F05 27,
    F06 31, F07 26, F08 20, F09 16, F10 13, soit 182.
  - `docs/adr/0001-*.md` à `0010-*.md`, section « Limites » : 58 puces.
  - Commande qui reproduit les deux décomptes (à lancer depuis la racine) :

    ```sh
    node -e '
    const fs=require("fs");let t=0,a=0;
    for(let i=1;i<=10;i++){const f="docs/architecture-improvements/history/F"+String(i).padStart(2,"0")+".md";
    const L=fs.readFileSync(f,"utf8").split("\n");let p=false;for(const l of L){if(/^## Limites et dettes/.test(l)){p=true;continue}
    if(p&&/^#/.test(l))break;if(p&&l.startsWith("|")&&!/^\|[-| ]+\|$/.test(l)&&!/^\| Sujet/.test(l))t++}}
    for(const f of fs.readdirSync("docs/adr").filter(x=>/^00(0[1-9]|10)-/.test(x))){const L=fs.readFileSync("docs/adr/"+f,"utf8").split("\n");
    let p=false;for(const l of L){if(/^## Limites/.test(l)){p=true;continue}if(p&&/^#/.test(l))break;if(p&&/^\s*[-*] /.test(l))a++}}
    console.log("historiques",t,"adr",a)'
    ```

    Sortie à `0d5a954` : `historiques 182 adr 58`.
  - Volume à lire : les sections citées font environ 49 000 caractères au total, sur 331 000 pour les
    vingt fichiers. Le ticket lit les sections « Limites et dettes » et « Limites », pas les fichiers
    entiers.
  - Exemple de recoupement à examiner : `docs/adr/0003-*.md`, section « Limites » (ligne 65), écrit « La
    règle de cadence des questions est dupliquée dans les deux hôtes ». L'historique F03 et le tableau de F07
    sont à relire pour savoir si la même dette y figure, et si elle a été levée depuis.

## Périmètre

- À créer : `docs/travail/dettes.md`.
  - Un court en-tête dit le rôle du registre et la règle d'ajout : un ticket qui laisse une dette l'ajoute
    ici, avec un nouvel identifiant. Il dit aussi la signification des états.
  - Un tableau a les colonnes `Id | Module | Dette | Origines | Suite proposée | État`.
  - `Id` : `DET-001`, `DET-002`, etc., sans trou ni réemploi.
  - `Module` : le chemin de code le plus précis que la source nomme (`core/session.cjs`, `server/`, `tv/`…).
    Si la source n'en nomme aucun : `transverse`.
  - `Origines` : une ou plusieurs étiquettes, séparées par des virgules. `F01:3` désigne la troisième ligne
    de données du tableau de `history/F01.md`. `ADR0003:2` désigne la deuxième puce de « Limites » de l'ADR
    0003. Quand deux sources disent la même dette, une seule ligne garde toutes leurs origines.
  - `Suite proposée` : celle de la source, reprise sans règle nouvelle. Une puce d'ADR n'en a pas : la case
    porte alors `à décider`.
  - `État` :
    - `ouverte` par défaut ;
    - `sans suite` seulement si la source écrit que rien ne sera fait (« Aucune », « Non traité » sans
      reprise prévue) ;
    - `close` seulement si la section « Limites et dettes » d'un historique postérieur, ou la section
      « Limites » d'un ADR, dit la dette levée. La ligne cite alors cette source après la flèche `→`. Le
      ticket ne cherche pas de clôture dans le reste des fichiers ni dans le code.
- `docs/README.md` reçoit un lien vers le registre, dans la section de référence.
- À créer : `tests/debt-register.test.cjs`. Il lit le tableau du registre et exige que :
  - les identifiants soient uniques, au format `DET-\d{3}`, et croissants ;
  - chaque ligne ait un module, une dette et au moins une origine non vides ;
  - chaque origine suive le format `F\d{2}:\d+`, `ADR\d{4}:\d+`, `LG-\d{2}`, `NUIT-\d{2}` ou
    `T\d{3}` ; les deux formats `LG` et `NUIT` servent aux tickets T112 et T113 ;
  - l'état soit `ouverte`, `close` ou `sans suite` ;
  - une ligne `close` cite sa source de clôture.

  Le test ne lit ni les historiques ni les ADR : ces fichiers seront déplacés ou réécrits par la suite.
- À ne pas toucher : les historiques, les ADR, le code de production, `docs/travail/README.md` (fichier non
  suivi qui n'appartient pas au ticket). Le registre n'invente aucune dette, aucune suite et aucune
  priorité.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/debt-register.test.cjs` passe. Le fichier contient aussi un cas qui applique
   l'analyse à un tableau écrit dans le test, avec un identifiant en double, un état inconnu et une origine
   mal formée : le cas exige trois signalements.
2. Couverture complète, vérifiée par une commande `node -e` consignée dans le journal. Elle extrait toutes
   les origines `F..:n` et `ADR....:n` du registre, puis les compare aux 182 lignes et aux 58 puces que
   compte la commande des Sources. Chaque ligne source apparaît exactement une fois, et aucune origine ne
   désigne une ligne qui n'existe pas. Sortie attendue : `manquantes 0, en trop 0, en double 0`.
3. `grep -c "^| DET-" docs/travail/dettes.md` est inférieur ou égal à 240 et supérieur à 0 ; la valeur et le
   nombre de fusions sont dans le journal.
4. `grep -n "dettes.md" docs/README.md` renvoie une ligne.
5. `node --test tests/documentation-links.test.cjs` et `node --test tests/documentation-index.test.cjs`
   passent. Le second est créé par T108, d'où la dépendance.
6. `node scripts/check.mjs --changed` est vert ; format et lint sont rapportés « non lancés » tels quels.

## Test d'acceptation attendu

`tests/debt-register.test.cjs`, par la frontière du fichier publié `docs/travail/dettes.md`, sans réseau.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le choix des états suit la lettre des sources. Une dette dont l'état ne se
déduit pas du texte reste `ouverte`, et le journal la liste.

## Journal
