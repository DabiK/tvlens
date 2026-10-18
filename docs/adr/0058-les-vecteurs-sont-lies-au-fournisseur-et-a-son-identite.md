# 0058 — Les vecteurs sont liés au fournisseur et à son identité

- Date : 2026-10-18
- Ticket : `docs/travail/tickets/264-index-and-search-a-session-with-model-bound-ollama-embeddings.md`
- Statut : acceptée

## Contexte

La composition de session utilisait l’en-tête OpenRouter même pour un fournisseur injecté.
Deux modèles de même dimension pouvaient ainsi comparer leurs vecteurs. Le store refusait déjà
un autre modèle, mais sa première écriture remplaçait le fichier incompatible, requête comprise.
Les archives ouvertes en lecture seule ne doivent pas déclencher de reconstruction ni d’inférence.

## Décision

`config.embeddingsBackend` choisit `local`, `openrouter` ou `disabled`, indépendamment des questions
et de la perception. Sans choix, les configurations historiques conservent OpenRouter avec clé,
sinon l’index désactivé ; le diagnostic porte `selection: legacy`. La simulation historique garde
sa désactivation distante. Un choix inconnu ou incomplet est refusé avant construction ; `disabled`
prime aussi sur une injection. Le budget distant n’est construit que pour OpenRouter.

`TVLENS_LOCAL_EMBEDDINGS_URL`, `MODEL` et le jeton facultatif `TOKEN` alimentent
`config.localEmbeddings`. Import, cache et environnement suivent les priorités de la perception ;
le jeton n’est jamais persisté. L’adaptateur de rôle `adapters/embeddings/ollama-embeddings.cjs`
réutilise le transport Ollama partagé pour `/api/embed`, sans repli distant. Il transmet le même
modèle aux passages et requêtes, refuse la troncature et valide tout le lot avant mise en cache :
cardinalité, nombres finis et dimension constante. Les limites restent 32 textes, 48 000 octets
par lot et 6 000 octets par texte ; l’échéance de 8 secondes est injectable par signal.

Chaque fournisseur déclare `identity: { backend, model, parameters?, revision? }`. La sérialisation
canonique inclut les paramètres qui changent l’espace vectoriel ; son SHA-256 nomme un fichier
`embeddings-<identité>.json`. Une identité injectée absente est refusée. La garde vérifie l’identité
avant et après l’inférence, à chaque lecture et avant écriture, cache de requêtes compris ; une
modification constatée condamne cette vie de l’index et exige d’en créer une nouvelle.

Un tag Ollama ne prouve pas les poids. L’adaptateur local lui donne donc une révision aléatoire
propre à son instance ; une injection Ollama sans révision reçoit aussi un espace neuf. Ces caches
ne se réutilisent pas après réouverture. Une révision déclarée par un port injecté engage ce port
sur l’identité immuable des poids. Aucun appel de découverte de modèle n’a lieu à l’ouverture.
Un modèle différent annoncé dans la réponse Ollama condamne l’index ; les autres métadonnées
d’identité du contenu ne sont pas adoptées. Un changement de poids non annoncé sous le même tag
ne peut pas être détecté : le fournisseur doit rester fixé pendant cette vie.

Seule l’identité historique exacte OpenRouter, `openai/text-embedding-3-small` en flottants et
sans paramètre supplémentaire, conserve `embeddings.json` et son ancien en-tête `model`.
Les anciens formats objet et journal restent lisibles. Aucune identité locale ne reçoit cet
alias. Une autre identité ne lit ni ne réécrit ce fichier ; les autres caches restent disponibles.
Le diagnostic de reconstruction existant signale un cache incompatible, sans lancer de travail.
Les nouveaux vecteurs sont reconstruits seulement par les appels autorisés à l’index.

La composition et ses résultats de recherche exposent `enabled`, backend, modèle, empreinte et
sélection explicite ou historique. La trace consultable `search.lastEmbeddingTrace` (`TVLENS_EMBEDDINGS_SEARCH`) ajoute le mode
réellement utilisé, sans encombrer le journal d’erreurs des hôtes. Ni URL, ni jeton, ni passage n’y figurent. Mode lexical, hybride, couverture et
avertissements gardent leurs règles ; une panne locale ne devient pas un succès sémantique.
Les archives de session et le protocole de scellement ne changent pas.

## Alternatives écartées

- Un fichier partagé réécrit au changement de modèle : il détruirait les vecteurs de l’autre identité.
- Réutiliser un cache sur la seule dimension ou un tag local : cela ne prouve pas le même espace.
- Résoudre ou charger les poids à l’ouverture : cela ajouterait un accès fournisseur implicite.

## Conséquences

Les tags locaux reconstruisent à la demande à chaque nouvelle instance et laissent leurs anciens
fichiers jusqu’à suppression de la session. Une future identité de poids attestée pourra permettre
leur réutilisation. Aucun essai matériel, gain de qualité ou débit réel n’est établi par ce ticket.

## Protégée par

`tests/ollama-embeddings.test.cjs`, `tests/moment-index.test.cjs`,
`tests/session-providers.test.cjs` et `tests/portable-config.test.cjs`, exécutés en séquentiel,
ainsi que les contrats existants de recherche et d’archives.
