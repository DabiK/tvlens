# Sélection adaptative des images — mesure shadow

## Question

Sur les blocs déjà préparés de 8 s et cinq images, une règle légère peut-elle proposer trois images
représentatives ou un appel VLM potentiellement évitable, sans masquer un changement visuel évident ?
Cette mesure ne modifie aucun replay, aucun appel VLM et aucune réponse. Elle ne chiffre **aucun**
gain réel de latence ou de pertinence.

## Entrées et règle figées avant mesure

Le script lit `blocks.json` et les cinq JPEG de chaque bloc préparé par `prepare-video-replay.cjs`.
Chaque JPEG est refusé si son SHA-256 diffère de l'index ; la sortie consigne le SHA de l'index, les
SHA des images et le temps CPU par bloc. Les dimensions sont réduites à 32 × 18 en niveaux de gris,
puis la différence est la moyenne absolue des pixels divisée par 255.

Les images aux indices 0 et 4 restent toujours couvertes. L'image intérieure retenue est celle qui
maximise sa distance minimale à ces deux bornes ; en cas d'égalité, l'indice le plus petit gagne. Si
une des deux images écartées diffère d'au moins **0,12** de chacune des trois retenues, la règle
revient aux cinq images. Ce seuil est une alarme visuelle approximative, **pas** un rappel
d'événements validé. Les sous-titres, textes fins et gestes brefs peuvent être manqués malgré un
score bas.

Un bloc est candidat à un appel évitable si sa différence maximale interne et sa différence avec la
fin du bloc précédent sont toutes deux inférieures à **0,035**. Le premier bloc ne peut jamais être
candidat et deux blocs consécutifs ne peuvent pas l'être. Le résultat est seulement une hypothèse
contrefactuelle ; `actualVlmCallRemoved` reste toujours `false` et le compteur réel reste zéro. Le
seuil doit être revu contre les six vidéos et leurs preuves avant toute suppression effective.

## Exécution prévue

Sur une préparation scellée contenant les JPEG, installer `requirements.txt` dans un environnement
Python isolé puis lancer :

```sh
python3 shadow_selection.py --preparation /chemin/preparation-kennedy --output /chemin/neuf/kennedy-shadow.json
python3 shadow_selection.py --preparation /chemin/preparation-spring --output /chemin/neuf/spring-shadow.json
```

La sortie préexistante est refusée. Le script ne lit ni service ni GPU, n'écrit aucun fichier dans
la préparation et ne contacte pas Ollama. Le dossier de sortie doit rester distinct des résultats
d'inférence. `--max-blocks N` sert uniquement au pré-vol et doit être consigné comme sous-ensemble.
Pour les quatre autres vidéos, utiliser leurs préparations figées et leurs SHA propres ; comparer
par vidéo, sans agréger un ratio qui masquerait la langue ou les événements courts.

## Lecture et limites

Rapporter par vidéo le nombre de blocs, la part de trois images, le nombre de replis aux cinq
images, les candidats d'appel évitable, les alarmes d'image écartée et le temps CPU p50/p95.
Confronter **manuellement** chaque alarme et un échantillon des blocs sans alarme aux vidéos et aux
questions, notamment OCR, actions brèves et rappels anciens. Les alarmes peuvent être des
changements inutiles ; une absence d'alarme ne démontre pas l'absence d'événement pertinent. Aucun
classement de pertinence tant que les fiches restent `readyForScoring=false`.

La mesure shadow ne doit pas être exécutée sur les mêmes ressources pendant une mesure GPU
chronométrée si elle perturbe la cadence.

## Résultat GX10 du 21 octobre, 08:13 UTC

Le script a été copié dans un dossier neuf sur la GX10, avec SHA-256 identique à la copie locale.
Il a tourné sur les six préparations scellées, dans un environnement isolé avec Pillow 12.1.1.
Les six [sorties brutes](resultats/) ont été rapatriées et comparées aux
[empreintes distantes](resultats.sha256). Aucun appel VLM n'a été supprimé. Le dossier de
déploiement et les versions sont consignés dans [deployment.json](deployment.json).

| Vidéo | Blocs | Proposition 3 images | Repli 5 images | Appels évitables présumés | CPU médian par bloc |
| --- | ---: | ---: | ---: | ---: | ---: |
| CNRS | 110 | 110 | 0 | 50 | 8,84 ms |
| Bœuf | 92 | 88 | 4 | 2 | 11,02 ms |
| Kennedy | 53 | 53 | 0 | 7 | 9,45 ms |
| Tears | 91 | 65 | 26 | 0 | 8,90 ms |
| Artemis | 263 | 245 | 18 | 83 | 9,69 ms |
| Spring | 58 | 55 | 3 | 0 | 6,83 ms |

Le grand nombre de candidats statiques sur CNRS et Artemis est **une hypothèse de filtre**,
pas autant d'appels réellement économisables. Un changement de texte sur une diapositive ou une
action subtile peut échapper aux miniatures. Les 51 replis au total indiquent seulement que le
proxy détecte parfois une image écartée différente ; leur pertinence visuelle reste à vérifier.
Le coût CPU inclut lecture, SHA et décodage des JPEG, mais pas l'inférence. Le point suivant est
de revoir toutes les alarmes et un échantillon de blocs sans alarme contre les vidéos, puis de
confirmer éventuellement **une seule** variante par replay contrôlé. Aucun gain de pertinence ou
de vitesse de TVLens n'est inféré de cette passe.

## Contrôles locaux

`python3 -m unittest -v test_shadow_selection.py` vérifie le refus d'une image modifiée, le repli à
cinq images lors d'un changement écarté, et le plafond d'un candidat de saut par deux blocs
statiques.
