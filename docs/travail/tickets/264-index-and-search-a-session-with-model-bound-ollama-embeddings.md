---
id: T264
titre: Index and search a session with model-bound Ollama embeddings
statut: a-faire
bloque_par: T263
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La recherche sémantique d'une session peut utiliser Ollama sans clé OpenRouter. Les passages et
la requête emploient la même identité de modèle ; rouvrir un cache d'un autre modèle ne permet
jamais d'en réutiliser les vecteurs. Une session Codex, un commit, avant l'accès GX10.

## Sources

- Décision du propriétaire du 17/10 au soir : embeddings locaux avant le GX10. Rapport Astra
  du 17/10, fin de section 3 : défaut d'identité confirmé, à corriger avant cette expérience.
- Code relu à `4599eea` : `runtime/session-providers.cjs:164-202` compose index et recherche.
  `:172-179` accepte un fournisseur injecté, mais `:181-184` donne toujours
  `EMBEDDING_MODEL` OpenRouter au cache. L'absence de clé supprime aujourd'hui l'index réel.
- `adapters/openrouter-embeddings.cjs:1-7` expose le modèle ; `:19-43` fournit `embed`
  et `embedMany`, avec cache, ordre et validation. Les bornes existantes sont 32 textes et
  48 000 octets par lot ; ce fournisseur possède son propre budget distant.
- `adapters/embedding-store.cjs:44-45` refuse une autre identité, `:76-83` la diagnostique,
  `:89-103` relit/écrit les vecteurs, dont l'en-tête du modèle.
  Comme `:22` initialise `restart` à vrai, le premier enregistrement après ce refus remplace
  le fichier (`:101-103`) ; `tests/moment-index.test.cjs:535-539` fige ce comportement.
  Une recherche suffit à écrire : `core/moment-index.cjs:106-108` passe par `embedCached`
  et son `cache.put` (`:63-71`). Un fichier partagé par identités perdrait donc les anciens vecteurs.
  `core/moment-index.cjs:63-110` emploie le même fournisseur pour passages et requête ;
  `:247-299` alimente par lots et `:395-410` abandonne les travaux à la fermeture.
- `core/moment-search.cjs:93-111` borne l'attente et conserve le classement lexical en cas
  d'indisponibilité ; `:135-150` publie mode et couverture sémantique. Ce n'est pas un repli
  vers un autre fournisseur. `runtime/session-providers.cjs:205-232` abonne l'index à la Mémoire.
- `tests/session-providers.test.cjs:259-302` caractérise la composition actuelle ;
  `tests/moment-index.test.cjs:519-553` couvre le stockage et `:651` le changement de modèle.
  `tests/local-vlm-agent.test.cjs:13-30` fournit le modèle du faux serveur HTTP.
- Quatre tests injectent des embeddings sans identité : `tests/session-providers.test.cjs:437`
  et `:467`, `tests/server-state-views.test.cjs:34`, `tests/review-regressions.test.cjs:316`.
  `scripts/probe-retrieval.cjs:3` construit aussi un cache avec `EMBEDDING_MODEL`.
- T197 a déjà livré les diagnostics de reconstruction ; ne pas les recréer. T224/T225 et
  T220/T226 possèdent projections, abonnements et vocabulaire de Mémoire, T227 sa retenue.
  T235 et la phase 2 T234–T245/T250/T253 possèdent les archives et leur cycle, notamment
  l'absence d'inférence à l'ouverture en lecture seule prévue par T238.
  ADR 0019, 0029 et 0030 ; `docs/domaine.md:266-289`.

## Périmètre

- À créer : adaptateur de rôle dans `adapters/embeddings/`,
  `tests/ollama-embeddings.test.cjs` et ADR court sur l'identité
  des vecteurs. À modifier : `runtime/session-providers.cjs`, `adapters/config.cjs`,
  `adapters/embedding-store.cjs` seulement si nécessaire au contrat d'identité, leurs tests.
  Donner une identité aux doubles de ces quatre tests, sans changer leurs assertions,
  et adapter `scripts/probe-retrieval.cjs`, sans exécuter cette sonde réelle dans la session.
  `docs/architecture.md`, section Décisions : une phrase et le lien du nouvel ADR
  (`tests/documentation-index.test.cjs:50-55`).
  Les fichiers existants restent à leur place ; pas de déplacement de l'index ou du stockage.
- T263 livre le transport HTTP dans `adapters/ollama/`.
  Réutiliser ce transport pour `/api/embed` ; aucun second client.
- Ajouter `TVLENS_EMBEDDINGS_BACKEND=local|openrouter|disabled` → `config.embeddingsBackend`
  et `TVLENS_LOCAL_EMBEDDINGS_*` → `config.localEmbeddings` (URL, modèle, jeton facultatif).
  Sans choix dans une ancienne configuration, conserver OpenRouter avec clé, sinon l'index
  désactivé, en le consignant. Un choix local explicite construit l'index même sans clé distante.
  Un choix inconnu ou incomplet est refusé ; aucun repli implicite vers OpenRouter.
- Implémenter le port existant `embed(text, signal)`/`embedMany(texts, signal)` par un
  fournisseur fixé pour la vie de l'index. Conserver l'ordre des textes lors de l'assemblage des
  lots et du cache ; vérifier cardinalité, nombres finis et dimension cohérente avant toute mise
  en cache. Garder les lots bornés, annulations et délais maîtrisables,
  sans budget OpenRouter ni nouvelle politique de classement/reprise.
- Faire dériver l'identité du cache du fournisseur effectivement composé, injection comprise :
  backend et modèle identifié, paramètres qui changent l'espace vectoriel. Aucun défaut
  OpenRouter pour un fournisseur injecté sans identité. Décrire la compatibilité de l'ancien
  en-tête OpenRouter sans rebaptiser ses vecteurs locaux ni changer le format des archives de session.
- L'identité doit distinguer deux modèles de même dimension. Pour un modèle local identifié
  seulement par un tag mutable, une identité de poids stable ou un espace de cache neuf est
  nécessaire : une identité inconnue ne prouve pas la compatibilité d'un cache persistant.
  Figer cette identité pour passages et requêtes ; un changement annoncé en cours de vie est
  refusé et demande un nouvel index, jamais une comparaison dans deux espaces différents.
- À la réouverture avec une autre identité, les anciens vecteurs ne sont pas consultés ;
  conserver le diagnostic de reconstruction T197 et reconstruire à la demande avec le
  fournisseur sélectionné, dans un fichier propre à son identité : `embeddings.json` reste
  celui de l'identité historique `openai/text-embedding-3-small` et n'est jamais réécrit par
  une autre identité. Ne pas lancer une reconstruction complète à l'ouverture d'une archive.
  Le scellement et les réponses tardives gardent les garanties du store et de l'index.
- Exposer identité effective et état activé/désactivé dans les diagnostics de composition et
  traces de recherche, lisibles par T259/T261. Conserver le mode lexical/hybride et les avertissements :
  une recherche lexicale après panne locale ne compte pas comme succès d'embeddings locaux.
  Aucun texte de passage, jeton ou URL privée complète dans ces diagnostics.
- Import/cache/environnement suivent les priorités de `config.localVlm`, avec jeton non
  persisté. Choisir le backend des questions ou de la perception ne choisit pas les embeddings.
- Hors périmètre : optimisation du classement, réglage des files, contrats d'événements de
  T225, règle de T227, quota Codex T232/affichage T252, accès à l'agent T240, migration
  Bibliothèque ou format général des archives. Aucun ADR sur une nouvelle architecture d'index.
- Aucun essai réel dans la session Codex : faux Ollama et fichiers temporaires. Modèle local,
  TV, VPS et fournisseurs restent des opérations de l'orchestrateur/propriétaire, hors boucle.

## Critères d'acceptation

1. Par `createSessionIndex`, un réglage local sans clé OpenRouter indexe des passages puis
   répond à une recherche sémantique avec le vrai index/cache/recherche et un faux Ollama.
   Passages et requête portent la même identité ; aucun constructeur/appel OpenRouter n'a lieu.
2. Deux modèles A/B de même dimension, ainsi que deux backends de même nom de modèle, ont
   des caches incompatibles. Après fermeture et réouverture avec B, aucun vecteur A n'entre
   dans le classement ; les vecteurs reconstruits et celui de la requête viennent tous de B.
   Après indexation et recherche avec B, rouvrir avec A retrouve tous les vecteurs A
   sans appel au fournisseur.
   Le test passe aussi par l'injection et reproduit le défaut de composition actuel.
3. Un fournisseur injecté sans identité est refusé explicitement. Un changement d'identité
   pendant la vie de l'index ne mélange rien ; l'identité locale inconnue ne permet pas de
   réutiliser un cache existant. La lecture historique OpenRouter garde sa compatibilité documentée.
4. Les requêtes en lots et les succès de cache conservent l'ordre des textes. Réponse incomplète,
   vecteur non fini ou dimension changeante : aucun lot partiellement valide n'est mis en cache.
   Annulation/fermeture suivie d'une réponse
   tardive ne ressuscite pas le dossier scellé et n'écrit aucun vecteur abandonné.
5. En panne locale, la recherche conserve ses avertissements et son classement lexical
   existants, sans appel distant caché. Traces et résultats de diagnostic nomment backend,
   modèle/identité et mode réellement utilisé ; une identité usurpée par le contenu est ignorée.
6. Les tests couvrent configuration absente, `disabled`, OpenRouter explicite, local, choix
   invalide, priorités fichier/cache/environnement et absence de jeton persisté. Une simple
   ouverture/restauration ne déclenche pas d'inférence ; l'indexation suit les appels autorisés.
7. À l'implémentation future, jouer en séquentiel `ollama-embeddings`, `moment-index`,
   `session-providers`, `session-optimization`, `server-state-views`, `portable-config`,
   `review-regressions` et les contrats de
   recherche affectés sous `tests/` (`.test.cjs`), puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/ollama-embeddings.test.cjs` avec faux serveur Ollama et cache temporaire, traverser
`createSessionIndex` puis la recherche publique. Reprendre les preuves de réouverture et de
diagnostic dans `tests/moment-index.test.cjs` ; utiliser deux identités pour des vecteurs de
même taille, pas seulement une différence de dimension. Aucun index utilisateur n'est touché.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le modèle d'embeddings, sa dimension et son identité immuable disponibles sur le GX10 restent
inconnus ; le ticket exige une identité explicite et refuse d'en déduire une depuis OpenRouter.
La politique exacte de compatibilité/reconstruction sera consignée dans l'ADR de cette tranche,
en conservant la lecture historique. Ni le classement actuel ni le repli lexical ne sont réévalués.
T263 est le seul prérequis direct : il livre le transport HTTP partagé. La composition et l'index
existent déjà ; la sélection du rôle questions ne choisit pas celle des embeddings. La phase 2 ne bloque pas ce ticket.
Relire les interfaces après T220/T224–T227 si ces tickets sont intégrés entre-temps.

## Journal
