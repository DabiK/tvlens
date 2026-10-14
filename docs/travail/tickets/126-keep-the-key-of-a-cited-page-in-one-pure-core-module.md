---
id: T126
titre: Keep the key of a cited page in one pure core module
statut: a-faire
bloque_par: T028
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Une source citée par Codex ne compte que si sa page a été ouverte pendant la recherche. Les deux URL sont
comparées sur une clé : adresse `https:`, sans identifiants, sans fragment. Cette clé est écrite trois
fois : dans le client Codex, dans la vérification et dans la surveillance. L'ensemble des pages ouvertes
est aussi construit deux fois de la même façon.

Après ce ticket, `core/source-provenance.cjs` porte seul ces deux fonctions pures, et les trois lieux
l'importent. Les exports publics restent (`sourceKey` de `core/surveillance.cjs` et du client) : leurs
importeurs ne changent pas.

Les règles de filtrage des sources, différentes dans chaque lieu, ne bougent pas. La forme suit le modèle
d'un module par comportement partagé, comme `runtime/session-closing.cjs` (arbitrage A8).

## Sources

- Constats : ADP-12
- Risque noté par le relecteur sur ADP-12 : fusionner les trois normalisations d'URL en changeant un
  détail (conversion en chaîne, fragment, identifiants) changerait quelles sources citées sont gardées.
  `chat-sources`, `opened-pages`, `verification` et `surveillance` le détectent.
- Code à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `adapters/codex-session-client.cjs` :
    - fonction `sourceKey(value)`, lignes 58-67 : `new URL(value)` ;
    - remplissage de `this.opened`, ligne 652 ;
    - export ligne 871 : `{ CodexSessionClient, streamedAnswer, sourceKey }`.
  - `core/verification.cjs` :
    - fonction `pageKey(value)`, lignes 2-8 : `new URL(String(value))` ;
    - ensemble `opened`, ligne 30, dans `VerificationService` ;
    - filtre des sources, lignes 31-36 : dédoublonnage par URL brute, 6 sources au plus.
  - `core/surveillance.cjs` :
    - fonction `sourceKey(value)`, lignes 220-227 : `new URL(String(value))` ;
    - ensemble `opened` dans `applyVerdicts`, ligne 237 ;
    - filtre des sources, lignes 250-257 : dédoublonnage par clé, 3 sources au plus ;
    - `module.exports`, lignes 920-921, qui exporte `sourceKey`.
  - Importeurs de `sourceKey` hors de ces fichiers, inchangés :
    - `adapters/codex-session-agent.cjs`, import ligne 4, filtre des sources lignes 120-128 ;
    - `adapters/codex-surveillance-agent.cjs`, lignes 1 et 18 ;
    - `scripts/probe-confinement.cjs`, import ligne 53, usages lignes 439 et 443-444.
  - Équivalence des deux variantes (`new URL(value)` et `new URL(String(value))`), observée à la version
    `0d5a954` en comparant `require('./adapters/codex-session-client.cjs').sourceKey` et
    `require('./core/surveillance.cjs').sourceKey` par `node -e` sur 17 entrées (adresse avec port 443 et
    fragment, `http:`, identifiants, chaîne vide, `null`, `undefined`, nombre, `Symbol`, objet `URL`, objet à
    `toString`, tableau, majuscules, espaces, texte quelconque) : 17 sorties identiques.
- Tests existants :
  - `tests/opened-pages.test.cjs` : « pages opened by reference are credited whatever the action is
    called; a search listing never is » ;
  - `tests/chat-sources.test.cjs` : « mislabeling a sourced claim as explanation does not bypass
    rejected-source validation » ;
  - `tests/verification.test.cjs` : « a cited page that was never opened is not evidence, however many
    searches ran » ;
  - `tests/surveillance.test.cjs` ;
  - `tests/architecture.test.cjs`, « portable core has no Electron, provider, platform or adapter
    imports » : un fichier de `core/` n'importe que `./`.

## Périmètre

- À créer :
  - `core/source-provenance.cjs`, sans import. Il exporte :
    - `sourceKey(value)`, au comportement de la fonction actuelle ;
    - `openedKeys(urls)`, l'ensemble des clés non nulles d'un tableau, vide pour une valeur qui n'est pas
      un tableau.
  - `tests/source-provenance.test.cjs`, nommé d'après ce qu'il teste (arbitrage A1).
- À modifier :
  - `core/verification.cjs` : retirer `pageKey`, importer `sourceKey` et `openedKeys` de
    `./source-provenance.cjs` ;
  - `core/surveillance.cjs` : retirer sa définition de `sourceKey`, importer les deux fonctions, et
    continuer d'exporter `sourceKey` ;
  - `adapters/codex-session-client.cjs` : retirer sa définition de `sourceKey`, l'importer de
    `../core/source-provenance.cjs`, et continuer de l'exporter.
- À ne pas toucher :
  - les trois règles de filtrage (dédoublonnage, nombre de sources gardées, contrôle des champs) ;
  - `adapters/codex-video-agent.cjs`, ancien transport qui compare les URL brutes ;
  - les importeurs listés en Sources ;
  - les tests existants.
- Lignes de 160 caractères au plus.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. La commande `grep -rlE "function (sourceKey|pageKey)" core adapters` ne rend que
   `core/source-provenance.cjs`.
2. `tests/source-provenance.test.cjs` fixe `sourceKey` sur des valeurs observées en lançant le test, jamais
   déduites :
   - une adresse `https:` avec fragment est rendue sans lui, requête gardée ;
   - le schéma et l'hôte sont mis en minuscules, le port 443 retiré ;
   - `http:`, une adresse avec identifiants (utilisateur seul, ou utilisateur et mot de passe), une chaîne
     vide, `null`, `undefined`, un nombre et un `Symbol` rendent `null` ;
   - un objet `URL` et un objet à `toString` sont acceptés.
3. Même fichier : `openedKeys` rend un ensemble sans `null` ni doublon de clé (deux URL qui ne diffèrent que
   par le fragment comptent une fois), et un ensemble vide pour `undefined` ou un objet.
4. Même fichier : `require('../core/surveillance.cjs').sourceKey` et
   `require('../adapters/codex-session-client.cjs').sourceKey` sont la même fonction que
   `require('../core/source-provenance.cjs').sourceKey` (`assert.equal`).
5. `node --test tests/architecture.test.cjs` passe, et `grep -c "require(" core/source-provenance.cjs` rend
   `0`.
6. Ces fichiers passent, lancés un par un, sans retouche : `tests/opened-pages.test.cjs`,
   `tests/chat-sources.test.cjs`, `tests/verification.test.cjs`, `tests/surveillance.test.cjs`, et
   `tests/surveillance-rules.test.cjs` s'il existe au lancement. `node scripts/check.mjs --changed` passe.
7. Mutation, notée au journal avec le résultat observé puis retirée : supprimer `url.hash = ''` dans
   `core/source-provenance.cjs` fait échouer au moins un test de `tests/source-provenance.test.cjs`. Le
   journal note aussi quels fichiers existants échouent sous cette mutation (aucun est une réponse
   recevable).

## Test d'acceptation attendu

`tests/source-provenance.test.cjs`, test « a cited page counts as opened only under its https key, without
credentials and whatever its fragment ». Il appelle directement `sourceKey` et `openedKeys`, puis vérifie
que les deux anciens points d'entrée exportent la même fonction. Frontière : les exports de
`core/source-provenance.cjs`.

## Hypothèses bloquantes

Aucune décision n'est attendue. La forme suit la remédiation d'ADP-12 (`core/source-provenance.cjs`) et
l'arbitrage A8.

Si le lot L12 a déjà déplacé `sourceKey` de `core/surveillance.cjs` vers un autre module au moment du
lancement : on part de ce module, qui importe alors `core/source-provenance.cjs` et continue d'exporter
`sourceKey`, et on le note au journal.

## Journal
