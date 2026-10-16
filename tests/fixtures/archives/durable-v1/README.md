# Archive durable de référence

Produit une seule fois avec le code du commit `4dfc282` (T193), par la commande :

```sh
node scripts/fixtures/write-reference-archive.cjs tests/fixtures/archives/durable-v1
```

Le fuseau du producteur est `Europe/Paris`. Le générateur livré avec ce corpus
pilote `HeadlessRuntime` : démarrage, ingestion,
perception smoke par les voies audio et vision par défaut, question avec agent
simulé immédiat, surveillance simulée, pause et sauvegardes réelles. Les deux
horloges injectées partent de `1790000000000` et de zéro. Deux passages de huit
secondes sont admis par session. Les UUID sont ceux du runtime ; toutes les
écritures attendues sont terminées avant la copie. Aucun outil média externe,
réseau, identifiant personnel ou fournisseur réel n'a été utilisé. Les embeddings
sont désactivés : ce corpus ne contient aucun journal JSONL.

Le clip est `tests/fixtures/ffmpeg-webm-head.webm` (696 octets), petite fixture de
conteneur existante. L'image JPEG uniforme 64 × 36 est produite en mémoire par
sharp puis sauvegardée par les vrais stores, qui produisent aussi les miniatures.
Les huit octets audio sont synthétiques, sans parole décodable ; la transcription
et la description sont simulées. Aucune garantie de décodage vidéo ou audio.

- `7dc1babe-e2b2-4199-9a4d-08811887ed9c` : fin confirmée par `end()`, manifeste
  `archived`, deux passages analysés, une question achevée et registre sauvegardé.
- `22b5e7e6-619e-4fd5-b18a-180d4da2e226` : copie après pause et barrières de
  sauvegarde, avant clôture ; manifeste non final `live`, donc `interrupted` à la
  lecture. Il s'agit d'une interruption simulée après écritures, pas d'un crash
  matériel. L'arrêt ultérieur du runtime ne touche que son dossier temporaire.

Deux altérations ont été appliquées à cette seconde copie, après sauvegarde :

1. `media/moment-2.webm` est tronqué de 696 à **16 octets**, en conservant son
   préfixe. Sa paire JSON et les miniatures sont présentes. L'inventaire compte
   donc toujours deux paires, sans analyser ni promettre le décodage du clip.
   Le manifeste garde 2953 octets ; l'inventaire physique en mesure 2273.
2. `session.json.tmp` contient exactement `{"id":"écriture interrompue",`, sans
   saut de ligne. Ce résidu volontairement incomplet n'est pas un document JSON
   d'archive. La lecture utilise `session.json` et laisse le temporaire intact.

Le registre conserve l'activation et deux passages lus, mais **zéro affirmation**,
zéro lot et zéro carte : le texte simulé n'énonce aucun fait chiffré vérifiable.
Ce témoin ne prouve pas la conservation d'affirmations ni de sources non vides.

`expected.json` décrit des attentes de lecture sélectionnées explicitement,
indépendantes du générateur ; il ne duplique pas les documents complets.
`SHA256SUMS` couvre tous les fichiers du corpus, README et attentes compris,
sauf lui-même. Les tests vérifient l'ensemble exact, les octets et les sommes
avant et après lecture. Ils ne lancent jamais le générateur et n'écrivent que sur
une copie temporaire. Toute date dépendant du système de fichiers est fixée par
`utimes` sur cette copie ; aucune attente ne dépend des dates Git.

## Conservation

Ce dossier est un témoin historique immuable. **Ne jamais le régénérer pour
accompagner un format courant.** Le générateur refuse toute destination existante.
Pour étudier un futur format, produire un autre corpus dans un nouveau dossier.
Un changement d'attente exige une explication du comportement et une relecture,
sans remplacer les octets historiques. Les sommes de la livraison servent de
référence lors de cette relecture ; les recalculer ne justifie pas une modification.

Limites : pas de `living-recap.json`, d'archive antérieure au manifeste, de média
sans intervalle, de rétention glissante ou réellement élaguée. Avant toute migration
de ces variantes, ajouter leurs propres témoins (T222, T215 et témoin du résumé
vivant). Cette archive constitue un socle, pas une preuve de compatibilité générale.
