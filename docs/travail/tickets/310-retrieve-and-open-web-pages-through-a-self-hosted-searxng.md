---
id: T310
titre: Retrieve and open web pages through a self-hosted SearXNG
statut: termine
bloque_par: T308
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un adaptateur du port de récupération web (T308) interroge l'API JSON d'un SearXNG auto-hébergé. Il ouvre les pages des
meilleurs résultats et en extrait le texte, puis rend seulement les pages réellement lues. Il est testé contre un faux
serveur en boucle locale, sans réseau réel. Rien n'est encore branché par la configuration (T311).

## Sources

- Décision du propriétaire, le 22/10 : SearXNG auto-hébergé sur la GX10, en conteneur, sur `127.0.0.1:8888`, API JSON
  (`/search?q=…&format=json`), sans clé ni quota. Installation et mesure : `experiments/essais/2026-10-22-searxng-gx10/
  README.md` (environ 3 s par recherche, résultats `{ url, title, content }`, moteurs amont variables).
- Règle conservée : une source ne compte que si sa page a été ouverte (`docs/domaine.md:17`). Un résultat de recherche
  seul n'est jamais rendu comme document.
- T308 : `WebRetrievalPort`, `WEB_DOCUMENT_LIMIT`, `WEB_TEXT_MAX_CHARS`, `sourceKey` ; `adapters/external-links.cjs`
  (`safeExternalUrl` : https seulement, sans identifiants, ni IP, ni domaines locaux).
- Précédent d'un adaptateur HTTP aux erreurs expurgées et signaux d'abandon : `adapters/ollama/http-client.cjs`.

## Périmètre

- À créer : `adapters/web/searxng.cjs`, `SearxngRetrieval({ url, fetchImpl, setTimer, clearTimer })`,
  `residence: 'hybrid'` ; `tests/searxng-retrieval.test.cjs`.
- Recherche : `GET <url>/search?q=<requête>&format=json`, délai nommé (5 s). Réponse validée (`results` tableau
  d'objets avec `url` et `title` chaînes) ; résultats dont l'URL est refusée par `safeExternalUrl` ou en doublon
  (`sourceKey`) écartés.
- Ouverture : les premiers candidats (nombre nommé, au plus cinq) sont ouverts en parallèle, chacun avec un délai nommé
  (4 s). Redirections suivies à la main (`redirect: 'manual'`), trois au plus, chaque cible revalidée par
  `safeExternalUrl` ; seuls `text/html` et `text/plain` en 200 sont lus ; lecture arrêtée au-delà d'une taille nommée
  (1,5 Mo) ; décodage UTF-8, ou du jeu de caractères annoncé s'il est connu de `TextDecoder`. Un en-tête `User-Agent`
  nommé est envoyé.
- Extraction sans dépendance : retirer `script`, `style`, `noscript`, `svg`, `template` et `head` (titre gardé) ;
  préférer le contenu de `article`, sinon `main`, sinon `body` ; retirer les balises ; décoder les entités courantes et
  numériques ; réduire les espaces ; couper à `WEB_TEXT_MAX_CHARS`. Une page dont le texte extrait est trop court (seuil
  nommé) n'est pas une page lue. Titre : `<title>` de la page, sinon celui du résultat.
- Rendu : au plus `WEB_DOCUMENT_LIMIT` pages lues, dans l'ordre des résultats ; `limits` compte les pages qui n'ont pas
  pu être lues, sans URL ni détail de fournisseur.
- Erreurs : SearXNG injoignable, statut non 200, JSON invalide ou délai dépassé → rejet avec le code
  `TVLENS_WEB_SEARCH_UNAVAILABLE`, message fixe sans adresse ni corps de réponse. L'annulation par `signal` interrompt
  la recherche et toutes les ouvertures.
- Tests : faux serveur HTTP sur `127.0.0.1` qui sert l'API JSON et des pages inventées. `safeExternalUrl` refuse les IP :
  les pages portent des URL `https://<nom>.example.org/...`, et le test injecte un `fetchImpl` qui route ces URL vers le
  faux serveur. Aucune requête ne sort de la machine.
- À ne pas toucher : `adapters/ollama/`, `adapters/companion-prompt.cjs`, `runtime/`, `adapters/config.cjs`, aucun script
  `*:live`, aucune requête vers la GX10.

## Critères d'acceptation

1. Contre le faux serveur, une recherche à cinq résultats rend les trois premières pages lisibles, avec leur texte
   extrait (scripts et styles absents, entités décodées) et borné, dans l'ordre des résultats. Le test échoue avant la
   correction.
2. Les résultats en http, avec IP, vers un domaine local ou en doublon ne sont jamais ouverts ; une redirection vers une
   cible refusée n'est pas suivie ; un contenu non HTML, une page trop courte ou trop lente n'est pas rendu et compte
   dans `limits`.
3. Une page trop grosse est lue jusqu'à la taille nommée seulement.
4. SearXNG en erreur (500, JSON invalide, délai dépassé par minuteries injectées) : rejet `TVLENS_WEB_SEARCH_UNAVAILABLE`
   dont le message ne contient ni l'adresse ni le corps ; une annulation rejette par l'erreur d'abandon et laisse le faux
   serveur sans requête en cours.
5. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/searxng-retrieval.test.cjs` : une recherche contre le faux serveur, jusqu'aux pages lues et bornées.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 22/10, orchestrateur : ticket ouvert depuis l'exploration de la recherche web locale ; indépendant de T309.
- 22/10, orchestrateur : exploration (`.harness-state/tickets/T310/exploration.md`). Port T308 confirmé (`core/ports.cjs:49-54`,
  `WEB_DOCUMENT_LIMIT` 3, `WEB_TEXT_MAX_CHARS` 2500, `clipText`) ; modèle `adapters/web/frozen-corpus.cjs` ; erreurs expurgées sans cause
  comme `adapters/ollama/http-client.cjs` ; faux serveur et `manualClock` déjà outillés dans les tests ; l'agent T309 ne lit que
  `documents`. Choix déclarés dans `ecarts.md` : extraction HTML dans `adapters/web/html-text.cjs`, URL finale après redirection.
- 22/10, implémenteur : `adapters/web/searxng.cjs`, `adapters/web/html-text.cjs`, `tests/searxng-retrieval.test.cjs` (14 tests, rouge vu
  par comportement ; plafond et attente des ouvertures prouvés par mutation). `node scripts/check.mjs --changed` : vert.
- 22/10, relecture 1 (`relecture-1.md`) : à corriger, 3 mineurs (titre non fermé en temps quadratique, `<head>` non fermé qui effaçait
  la page, borne exacte du critère 3 non fixée). Écarts 1 à 9 de `ecarts.md` acceptés.
- 22/10, implémenteur : corrections des trois constats, deux tests ajoutés, test du critère 3 fixé à l'octet près (16 tests).
- 22/10, relecture 2 (correction) : accepté, 0 constat, `NON CORRIGÉS : 0`.
- 22/10, orchestrateur : `node scripts/check.mjs` : vert, 3106 tests JS sur 158 fichiers, 71 tests Python ; cliquet
  `cas_de_test_produit` 1680 → 1696.
- 22/10, orchestrateur, tentative 2 : la boucle a refusé la tentative 1 (contrôle complet rouge, tests JS puis tests Python au-delà
  de 1200 s chacun). Cause lue dans `pmset -g log` : le Mac est entré en veille (capot fermé, sur batterie) à 17:11:20, 30 s après
  le début du contrôle, et n'a été éveillé qu'environ 80 s jusqu'à 18:05. Les budgets de `spawnSync` comptent le temps de veille :
  celui des tests JS est tombé au réveil de maintenance de 17:31:45, celui des tests Python à celui de 18:05:36. Les tests Python,
  que T310 ne touche pas, ont expiré de la même façon. Code inchangé depuis la relecture 2 (empreintes identiques à
  `reviewed-state.json`), donc pas de nouvelle relecture. `node --test tests/searxng-retrieval.test.cjs` : 16 tests en 110 ms.
- 22/10, orchestrateur : `caffeinate -i node scripts/check.mjs` de 18:18 à 18:27, une fois la charge du réveil retombée sous 8 :
  vert, 3106 tests JS sur 158 fichiers, 71 tests Python ; aucune veille pendant le contrôle (`check-final-2.log`).

### Réserves à la clôture

- Écart accepté, périmètre : extraction HTML dans un fichier à part, adapters/web/html-text.cjs, pour tenir max-lines et complexity du lint.
- Écart accepté, critère 1 : l'URL d'un document est la page finale après redirections ; deux résultats menant à la même page ne donnent qu'un document.
- Écart accepté, périmètre : la requête de recherche part en redirect: 'error' (une redirection de SearXNG rend la recherche indisponible) et sa réponse JSON est plafonnée à 1 Mio.
- Écart accepté, critère 2 : seuil de page courte MIN_PAGE_TEXT_CHARS = 200, choisi sans mesure.
- Écart accepté, périmètre : l'URL de SearXNG n'est pas validée à la construction de l'adaptateur ; la configuration (T311) devra le faire.
- Non vérifié : rien n'a tourné contre le vrai SearXNG de la GX10 ni sur de vraies pages https (exclu par le ticket).
- Question pour le propriétaire : sur une page sans body, article ni main, un <head> jamais fermé efface encore le texte, et un <title> jamais fermé donne une page vide comme dans un navigateur ; dans les deux cas la page compte comme non lue.
- À savoir : aucun code ne lit encore les limits de l'adaptateur ; l'agent de question (T309) ne lit que documents.
- Question pour le propriétaire : capot fermé sur batterie, le Mac dort malgré caffeinate et les budgets de check.mjs comptent la veille ; un contrôle de la boucle lancé à ce moment rend un faux rouge, comme à la tentative 1.
