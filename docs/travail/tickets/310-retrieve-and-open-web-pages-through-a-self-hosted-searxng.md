---
id: T310
titre: Retrieve and open web pages through a self-hosted SearXNG
statut: a-faire
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
