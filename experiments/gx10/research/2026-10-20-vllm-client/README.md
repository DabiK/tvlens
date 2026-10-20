# Sonde questions Ollama / vLLM — préparation du 20 octobre 2026

**Prêt pour un pré-vol réel borné ; aucune inférence réelle exécutée ici.** Le client est vérifié derrière
un faux serveur HTTP. La compatibilité effective du checkpoint, du schéma et de `enable_thinking=false`
avec l'image NVIDIA retenue reste à constater sur GX10. Un refus reste une sortie conservée, sans fallback.

Les skills `research-vllm` et `research-autoresearch` ont été appliquées. Aucun produit, harnais, service
ou fichier distant n'a été modifié. Le parent conserve la responsabilité du lancement, des verrous et de
l'exclusivité GPU, de la télémétrie système, des versions/digests et du budget global nocturne.

## Décision et adaptation nécessaire

Le client TVLens natif utilise `/api/chat`, `format`, `think`, des réponses `message/done`, puis une boucle
d'outils. vLLM sert `/v1/chat/completions`, `response_format`, `chat_template_kwargs`, `choices` et des
identifiants d'appels d'outils distincts. **Un simple changement d'URL ne fonctionne pas.**

La sonde courte utilise deux traductions HTTP expérimentales explicites et le validateur de réponse
existant `adapters/ollama/question-response.cjs`. Elle n'usurpe pas une identité Ollama pour vLLM.
Un futur adaptateur produit devra gérer messages, arguments JSON d'outils, identifiants `tool_call_id`,
les huit appels maximum, leur annulation, l'identité fournisseur et les métriques. Cela demande des
modifications/test produit séparés ; aucun proxy ni nouvel adaptateur applicatif n'est livré ici.

Pour cette nuit : comparer **la réponse depuis un contexte figé, sans outil**, avec les mêmes messages
et le même schéma JSON pour les deux serveurs. La différence Q4_K_M Ollama / NVFP4 vLLM reste une
**comparaison de stack**, pas une attribution de gain au moteur seul.

## Corpus et séparation des attendus

`corpus.json` contient dix questions : cinq CNRS et cinq Kennedy. Les sources sont les captures
antérieures dans `2026-10-20-propositions/captures/`. Kennedy était encore partiel à sa capture : seuls
les états déjà publiés à chaque ancre de question sont retenus, jamais les publications ultérieures.

`preparer.cjs` sélectionne la dernière révision de chaque passage avec `publication <= anchorMs` et
`passage.endMs <= anchorMs`. Il appelle le vrai `VideoTools.context()` (six passages récents utilisables),
puis `buildLocalPrompt()` et le schéma produit. Le nonce du bloc de données est tiré une seule fois et
les messages exacts sont figés avec SHA-256. La conversation est volontairement vide dans les deux bras.
Une consigne identique précise qu'aucun outil n'est disponible et qu'il faut s'abstenir si le contexte manque.

**Ce ne sont pas les prompts historiques exacts**, absents des campagnes. Cela ne reproduit ni la
conversation historique, ni son réexamen concurrent. Les archives ne sont lues que pour questions,
ancre et révisions des passages ; les anciennes réponses et les fiches attendues ne sont jamais
importées dans le corpus. Les résumés automatiques conservés sont des entrées du modèle, pas un oracle.
Le fichier de corpus suffit pour les deux branches ; aucune archive, image ou attendu n'est envoyé au serveur.

## Paramètres identiques et différences visibles

| Paramètre | Ollama | vLLM |
| --- | --- | --- |
| Modèle | `qwen3.8:27b` | `nvidia/Qwen3.8-27B-NVFP4` |
| Messages et schéma | Exactement `corpus.json` | Exactement `corpus.json` |
| Température | `options.temperature: 0` | `temperature: 0` |
| Sortie maximale | `options.num_predict: 1024` | `max_tokens: 1024` |
| Raisonnement demandé | `think: false` | `chat_template_kwargs.enable_thinking: false` |
| Contexte | `options.num_ctx: 16384` | Réglage serveur à fixer à 16384 ou documenter l'écart |
| Maintien | `keep_alive: 10m` | Serveur résident ; comportement différent |
| Outils / streaming | Absents / `false` | Absents / `false` |
| Contraintes JSON | `format: schema` | `response_format: json_schema`, strict |

Le plafond de 1024 tokens est introduit dans **les deux branches** ; le flux historique n'avait pas
ce plafond explicite. Les templates et tokenizers ne sont pas supposés identiques. Côté vLLM, utiliser
une configuration de génération déclarée et garder la commande serveur : un défaut issu du checkpoint
peut changer des paramètres absents de cette requête. Les métriques et réponses seront vérifiées au pré-vol.

Aucune chauffe ni décharge n'est réalisée par le client. Le premier appel est gardé. Les états froid/chaud
restent inconnus sans protocole indépendant ; un serveur prêt ne signifie pas que tous ses caches sont chauds.
Une répétition conserve le même ordre de dix questions. Pour A/B puis B/A, le parent doit séquencer
quatre invocations séparées `--repeats 1` ; `--repeats 2` signifie deux passages du même backend, pas un contrebalancement.
Si une seule transition Ollama → vLLM est possible cette nuit, qualifier l'ordre comme exploratoire confondu avec le temps.

## Commandes opérables

Validation sans réseau ni fournisseur, depuis la racine du dépôt :

```sh
kit=experiments/gx10/research/2026-10-20-vllm-client
node "$kit/sonder.cjs" --repo "$PWD" --corpus "$kit/corpus.json" --backend vllm --out /tmp/sonde-validation-UNIQUE
node "$kit/verifier.cjs" /tmp/sonde-fixtures-UNIQUE
```

Paquet minimal à transférer ultérieurement : `sonder.cjs`, `corpus.json` et `gel.json`. Le dépôt produit
existant fournit le validateur de sortie, dont l'empreinte est contrôlée. Ne pas régénérer le corpus entre
les branches : les messages doivent garder les mêmes octets, nonce compris.

Après lot courant, essais Ollama et réservation, le parent peut lancer une branche Ollama contemporaine :

```sh
node /chemin/sonder.cjs --repo /home/nvidia/tvlens --corpus /chemin/corpus.json \
  --backend ollama --base-url http://127.0.0.1:11434 --model qwen3.8:27b \
  --repeats 1 --out /chemin/ollama-questions-UNIQUE --execute
```

Après fin de cette branche, serveur vLLM disponible et exclusivité GPU confirmée :

```sh
node /chemin/sonder.cjs --repo /home/nvidia/tvlens --corpus /chemin/corpus.json \
  --backend vllm --base-url http://127.0.0.1:8001 --model nvidia/Qwen3.8-27B-NVFP4 \
  --identity-file /chemin/identite-vllm.json --repeats 1 --out /chemin/vllm-questions-UNIQUE --execute
```

`--identity-file` est facultatif pour le transport, mais nécessaire pour une attribution complète de stack.
Le rapport ne copie que `modelRevision`, `imageDigest`, `vllmVersion`, `maxModelLen`, `generationConfig`,
`fixture`, et l'empreinte du fichier ; aucun environnement global ou secret. Des valeurs absentes restent `null`.
Ces champs sont des déclarations opérateur à relier aux preuves du serveur, pas une identité auto-certifiée.
Le client vérifie en plus que `/v1/models` ou `/api/tags` liste le modèle demandé et que chaque réponse le nomme.
Il refuse URL non loopback numérique, identifiants URL, chemin privé, query string et redirection.

## Budget, sorties, annulation

Une invocation : dix questions × une ou deux répétitions maximum, séquentielles, **20 minutes maximum**
et **90 secondes par requête**. Trois erreurs consécutives arrêtent l'invocation ; pas de réessai, de
fallback, de correction de JSON ou de suppression d'échec. SIGINT/SIGTERM annule la requête en vol.
La fermeture de la connexion client est prouvée par le faux serveur ; l'arrêt effectif du calcul GPU
reste à observer côté moteur. Le client ne tue aucun service.

Chaque dossier de sortie doit être neuf. `campaign.json` est écrit avant requête et après chaque cas.
Par cas : requête complète, réponse HTTP brute (y compris JSON malformé ou erreur), statut HTTP,
temps de réception des en-têtes, code d'erreur stable, réponse normalisée et vérification des bornes
citations. Une réponse `finish_reason=length` reste tronquée ; une terminaison inconnue ou un appel d'outil
est refusé. Les réponses tardives après annulation ne sont pas promues en réussite.

`clientTotalMs` inclut le travail local de préparation de la requête et son aller-retour complet. Il ne
mesure pas la file applicative TVLens ni le délai du flux continu. `headersReceivedMs` n'est pas un premier
token. **TTFT reste null**, puisqu'il n'y a pas de streaming. Les compteurs `usage` vLLM et les durées
brutes en nanosecondes Ollama sont conservés séparément, sans conversion hasardeuse en phases manquantes.
`successfulResponses` signifie seulement réponse reçue et validée structurellement ; aucune qualité n'en découle.
`complete` signifie fin de la séquence demandée, même avec des échecs.

`a-annoter.json` exporte questions, réponses/citations, erreurs, délais et jugement `null`.
La vérification des bornes d'une citation ne prouve pas qu'elle soutient la réponse. `readyForScoring`
reste false. Juger les réponses contre les médias et références validés ; garder erreurs/abstentions
et dénominateur complet, comparer la vitesse à qualité égale. Le corpus reste hors des futurs attendus.

`integrite.json` contient les SHA-256 de tous les fichiers de la campagne. Le parent archive les sorties,
stdout/stderr de la CLI et la télémétrie, puis vérifie ces empreintes après rapatriement. Cette sonde
n'est ni un ordonnanceur GPU, ni un superviseur de services, ni une boucle d'expériences autonome.

## Vérification et sources

Neuf scénarios derrière un vrai serveur HTTP factice ont passé : vLLM et Ollama, mêmes messages/schéma,
refus 503 avec arrêt au troisième échec, JSON malformé, sortie tronquée, outil refusé, timeout,
budget global et SIGTERM avec fermeture de connexion. Bruts dans `preuves/serveur-factice/`.
Cette preuve valide les frontières réseau et la conservation des erreurs, **pas l'inférence réelle**.

Documentation actuelle obtenue par `ctx7` (résolution puis deux requêtes), sorties conservées :
`preuves/ctx7-schema.txt`, `preuves/ctx7-thinking.txt`.

- [vLLM : sorties structurées](https://docs.vllm.ai/en/stable/features/structured_outputs/) : forme `response_format.json_schema`.
- [vLLM : raisonnement](https://docs.vllm.ai/en/stable/features/reasoning_outputs/) : `enable_thinking=false` pour Qwen3 ; vérifier Qwen3.8 réel.
- [NVIDIA Spark : vLLM](https://build.nvidia.com/spark/vllm/instructions) : consultation du 20 octobre confirmant image `qwen38` et modèle NVFP4.

La recette NVIDIA est une preuve documentaire Spark, pas un benchmark ASUS GX10. Les tags sont mutables ;
le parent doit figer le digest de l'image, la révision du checkpoint et la version du serveur réellement lancés.
