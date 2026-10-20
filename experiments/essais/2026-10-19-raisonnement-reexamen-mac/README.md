# Essai du 19/10/2026 — raisonnement des questions et modèle de réexamen, tout en local sur le Mac

Contrôle T284, de 08:49 à 09:11, boucle arrêtée : les réglages livrés par T282 (raisonnement par rôle) et T283
(modèle de réexamen dédié) justifient-ils une copie GX10 `gx10-copie-b2` ? Règle fixée avant l'essai, sur l'avis
d'Astra : retenir un réglage s'il fait gagner au moins 20 % sans nouvelle erreur critique.

## Question

1. Couper le raisonnement de `qwen3.8:27b` pour les questions (`TVLENS_LOCAL_QUESTIONS_THINK=off`) accélère-t-il les
   réponses sans en perdre ?
2. Confier le réexamen des clips à `qwen3.8:27b` sans raisonnement, la perception restant sur `gemma3:4b`, donne-t-il
   de meilleures réponses visuelles que `gemma3:4b` ?

## Configuration exacte

| Élément | Valeur |
| --- | --- |
| Code | `479b376` (T282 et T283 intégrés), serveur headless `server/main.cjs`, API HTTP locale |
| Machine | MacBook Apple M5 Max, 36 Go unifiés, Ollama 0.33.2, boucle arrêtée, aucun autre modèle chargé au départ |
| Session | `ec55a89c` du 17/10 (live YouTube en français, 19 passages), copiée à neuf pour chaque passage |
| Questions | `qwen3.8:27b`, contexte 16 384, `keep_alive` 2 min, température 0 |
| Réexamen de base | `gemma3:4b` (modèle de perception, aucun modèle dédié) |
| Réexamen dédié | `TVLENS_LOCAL_INSPECTION_MODEL=qwen3.8:27b`, `_THINK=off`, contexte 16 384 |
| Script | `questions-session.mjs` de l'essai du 18/10 (identique), piloté par `mesures.sh` et `reexamen.sh` |
| Protocole | étape 1 : un passage froid à part, puis cinq paires `off` / `default` en ordre alterné, deux questions ; étape 2 : trois paires en ordre alterné, une question visuelle |
| Données brutes | `brut/raisonnement/*.json`, `brut/reexamen/*.json`, `brut/raisonnement-sortie.txt` |

## Résultats

Étape 1, cinq passages par réglage, hors passage froid (34,9 s et 30,1 s) :

| Question | `default` : médiane (min–max), issue | `off` : médiane (min–max), issue |
| --- | --- | --- |
| « Que dit exactement l'intervenant sur la mobilisation des lycéens ? » | 30,1 s (27,1–34,6), 5 abstentions, 2 recherches chaque fois | 13,6 s (13,6–13,6), 5 abstentions, aucun outil |
| « De quoi parle cette session, en trois points ? » | 39,2 s (22,6–48,2), 5 réponses, 1 à 4 citations | 13,6 s (12,0–18,1), **5 refus**, aucun outil |

Avec `off`, les dix réponses sont `insufficient` : « La réponse proposée n'a pas passé la validation des preuves. »
L'abstention sur la première question est la même qu'avec `default` et qu'à l'essai du 18/10 : le passage cherché
n'existe pas dans la session.

Étape 2, « Qu'est-ce qui est écrit à l'écran au début du live ? » :

| Réexamen | Issue | Durée de la question | Dernier appel de réexamen |
| --- | --- | --- | --- |
| `gemma3:4b` | 3 réponses sur 3, une citation chacune | 60, 86 et 99 s | 8,3 à 8,9 s |
| `qwen3.8:27b`, `off` | 3 abstentions sur 3 | 117, 140 et 154 s | 31,4 à 38,3 s |

`qwen3.8:27b` juge la résolution des images trop faible pour lire les incrustations, et ses observations datées ne
passent pas la validation (« Aucune observation horodatée valide issue du réexamen »). `gemma3:4b` lit des mots
(« SECOURS », « SANS RÉPONSE ») et dit ne pas pouvoir lire la bande du bas.

## Lecture

- **Couper le raisonnement des questions casse l'usage des outils** : le modèle répond sans chercher et sa réponse
  est refusée par la validation des preuves. Le gain de temps (environ 55 %) ne compte pas : c'est une perte
  critique. Le réglage par défaut reste.
- **Le réexamen par le 27B sans raisonnement est plus lent et moins utile** que `gemma3:4b` : prudent jusqu'à
  l'abstention, et ses observations ne respectent pas le format daté. Non retenu.
- Conséquence : la copie `gx10-copie-b` reste celle du GX10 ; aucun tag `gx10-copie-b2`. Les réglages restent
  disponibles, par défaut inchangés.
- Le chemin produit tient : chaque réglage est publié dans l'identité des rôles (`think`, modèle, hôte), ce qui a
  permis de vérifier la configuration de chaque passage dans les rapports.

## Limites et incidents

- Une seule session, trois questions, aucune annotation : la justesse du texte lu par `gemma3:4b` n'est pas vérifiée
  sur les images.
- Le réexamen dédié n'a été essayé qu'avec `off` ; `default` sur le 27B n'a pas été mesuré.
- Étape 3 du ticket (modèle de questions plus petit capable d'outils) non faite : aucun modèle local plus petit n'a
  la capacité `tools`, et le GX10 fait tourner le 27B.
- Le contrôle a démarré à 08:49 au lieu de la nuit : la boucle était arrêtée devant lui depuis 03:24.
