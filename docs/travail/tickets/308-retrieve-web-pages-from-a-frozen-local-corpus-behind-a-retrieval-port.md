---
id: T308
titre: Retrieve web pages from a frozen local corpus behind a retrieval port
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Le cœur sait dire, par une règle pure, si une question de chat appelle le web. Un port de récupération web existe. Son
premier adaptateur lit un corpus figé de pages déjà extraites, sur le disque local : il rend les pages pertinentes pour
une requête, bornées et reproductibles. Rien n'est encore branché sur l'agent local : aucun comportement produit ne
change.

## Sources

- Décision du propriétaire, le 22/10 : la voie locale (Ollama) doit répondre aux questions qui demandent internet (faits
  stables ou actualité), ou un fait de la vidéo plus un fait extérieur. Les essais reproductibles utilisent un corpus web
  figé ; le flux réel utilise SearXNG, auto-hébergé sur la GX10 (`experiments/essais/2026-10-22-searxng-gx10/README.md`).
- Règle du domaine conservée (`docs/domaine.md:17`) : une source ne compte que si sa page a été ouverte. Un document
  rendu par ce port est donc une page dont le texte a réellement été lu, jamais un simple résultat de recherche.
- Code à `c9f3cc2` :
  - `core/ports.cjs` : contrats JSDoc des ports (ADR 0029) ; le nom `search` est déjà pris par `MemorySearchPort`
    (`:41`) ;
  - précédent de règle pure sur le texte d'une question : `isRecentSummary`, `core/deep-ask.cjs:318-321` ;
  - `adapters/external-links.cjs` : `safeExternalUrl` (https seulement, sans identifiants, ni IP, ni `.local`, `.test`,
    `.invalid`) ;
  - copies existantes d'une clé d'URL de source : `adapters/codex-session-events.cjs:15-24` (`sourceKey`),
    `core/verification.cjs:2`, `core/surveillance.cjs:224` (non touchées ici) ;
  - fichiers plats de `core/` et zones de dépendances : ADR 0044, `tests/architecture.test.cjs`.
- Le dépôt GitHub est public : aucun texte de page web réelle dans Git. Les tests utilisent des pages inventées.

## Périmètre

- À modifier ou créer :
  - `core/ports.cjs` : typedefs `WebDocument` (`url`, `title`, `text`, `publisher?`, `publishedAt?`) et `WebRetrievalPort`
    (`residence: 'local'|'hybrid'`, `retrieve({ query, signal }) → Promise<{ documents: WebDocument[], limits: string[] }>`).
    Le commentaire dit qu'un document est une page lue, pas un résultat de recherche, et que `residence` vaut `hybrid`
    quand la requête quitte la machine.
  - `core/web-retrieval.cjs` (nouveau, pur, sans import hors de `core/`) :
    - `callsForWeb(question)` : vrai si la question appelle le web. Structure attendue : une demande explicite (web,
      internet, en ligne, chercher, source, lien, article, site, Wikipédia) ou une demande de vérification (« c'est
      vrai », « est-ce vrai », vérifier, confirmer, exact, faux, fake) rend vrai, même si la question parle de la vidéo ;
      sinon une référence à la vidéo (« dans la vidéo », « il dit », « elle dit », « on voit », « à l'écran », « ce
      passage ») rend faux ; sinon une demande de fait extérieur (actualité, aujourd'hui, en ce moment, actuellement,
      récemment, cette année, une année à quatre chiffres, « qui est », « en quelle année », date, âge, population, prix,
      record, officiel) rend vrai ; sinon faux. Insensible à la casse et aux accents.
    - `retrievalQuery(question)` : question nettoyée (espaces réduits), bornée à une longueur nommée.
    - Les constantes nommées partagées par les adaptateurs et l'agent : nombre maximal de pages
      (`WEB_DOCUMENT_LIMIT = 3`), longueur maximale du texte d'une page (`WEB_TEXT_MAX_CHARS = 2500`), longueur maximale
      de la requête.
  - `adapters/external-links.cjs` : `sourceKey(url)` exporté, qui rend la forme normalisée d'une URL sûre
    (`safeExternalUrl`, fragment retiré) ou `null`. C'est la clé qu'utiliseront les adaptateurs web et la validation des
    sources de l'agent local.
  - `adapters/web/frozen-corpus.cjs` (nouveau) : `FrozenCorpusRetrieval({ directory, readFile })`, `residence: 'local'`.
    Format du corpus, à documenter en tête du fichier et dans `docs/` (voir critère 5) :
    `corpus.json` = `{ "version": 1, "documents": [ { "url", "title", "publisher"?, "publishedAt"?, "file" ,
    "queries"? } ] }`, où `file` est un chemin relatif sous le dossier du corpus vers le texte UTF-8 déjà extrait de la
    page, et `queries` une liste facultative de requêtes exactes associées à ce document.
    Récupération : si des documents déclarent la requête exacte (comparaison après la normalisation de
    `retrievalQuery`, casse et accents ignorés), ils sont rendus dans l'ordre du corpus ; sinon classement lexical
    déterministe (nombre de mots distincts de la requête, hors mots vides, présents dans titre et texte), égalités dans
    l'ordre du corpus, seuil minimal de mots communs nommé. Au plus `WEB_DOCUMENT_LIMIT` documents, texte coupé à
    `WEB_TEXT_MAX_CHARS`, URL refusée par `sourceKey` ou doublon écartés.
    Un corpus illisible ou invalide (JSON, version, champ manquant, chemin absolu ou avec `..`, fichier absent) est refusé
    avec le code `TVLENS_WEB_CORPUS_INVALID`, sans chemin dans le message. Le corpus est lu une fois, à la première
    récupération.
  - Tests : `tests/web-retrieval.test.cjs` (règle, requête), `tests/frozen-corpus-retrieval.test.cjs` (adaptateur, sur un
    dossier temporaire avec des pages inventées).
- À ne pas toucher : `adapters/ollama/`, `adapters/companion-prompt.cjs`, `runtime/`, `adapters/config.cjs`, les
  adaptateurs Codex et leurs copies de `sourceKey`.

## Critères d'acceptation

1. `callsForWeb` rend vrai pour au moins : « Quelle est la population actuelle du Japon ? », « Le chiffre annoncé dans
   la vidéo est-il exact ? », « C'est vrai ce qu'il dit ? », « Trouve-moi l'article dont il parle », « Qui est le
   ministre cité ? », « Où en est la mission Artemis II aujourd'hui ? » ; et faux pour au moins : « Que dit-elle ? »,
   « Qu'est-ce qu'on voit à l'écran ? », « Résume les deux dernières minutes », « De quelle couleur est sa veste ? »,
   « Il dit quoi juste avant la pause ? ». Les deux listes sont des cas de `tests/web-retrieval.test.cjs`.
2. `FrozenCorpusRetrieval` rend les documents d'une requête exacte déclarée, puis un classement lexical stable pour une
   autre requête, avec au plus trois documents, des textes bornés et aucun doublon d'URL.
3. Un corpus invalide (chacun des cas du périmètre) est refusé avec `TVLENS_WEB_CORPUS_INVALID` et un message sans
   chemin.
4. `sourceKey` rend la même clé pour une URL avec et sans fragment, et `null` pour une URL http, avec identifiants, une IP
   ou un domaine `.local`.
5. Le format du corpus est décrit dans la documentation (`docs/gx10-experiment.md` ou le document qui décrit les entrées
   d'essai), avec la consigne de garder les pages réelles hors de Git.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/frozen-corpus-retrieval.test.cjs` : un corpus temporaire de quatre pages inventées, une requête déclarée et une
requête lexicale, puis les refus.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 22/10, orchestrateur : ticket ouvert depuis l'exploration de la recherche web locale (réponses extérieures sur la
  voie locale), découpée en T308 à T312.
