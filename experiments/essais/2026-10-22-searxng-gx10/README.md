# SearXNG auto-hébergé sur la GX10, pour la recherche web des essais

## Question

La catégorie « connaissance extérieure et outils » (W, M, O) demande un vrai moteur de recherche pour les essais
dans le flux réel. Décision du propriétaire, le 22/10 : SearXNG auto-hébergé sur la GX10, sans clé ni quota, dans un
conteneur. Fonctionne-t-il localement, et à quelle vitesse ?

## Configuration

- Image `searxng/searxng`, arm64, figée par son empreinte
  `sha256:5ed0323b5f5f8701264ef65e239a2bd83cb57098f2b971fa30bf79c06eeae271` (construite le 19/10/2026).
- Conteneur `tvlens-searxng`, lancé le 22/10 à 12:41 UTC, sans redémarrage automatique :
  `docker run -d --name tvlens-searxng -p 127.0.0.1:8888:8080 -v /home/nvidia/tvlens-setup/searxng/config:/etc/searxng`
  `-e SEARXNG_BASE_URL=http://127.0.0.1:8888/ <image@empreinte>`.
- Écoute sur la boucle locale seulement (127.0.0.1:8888), jamais sur Tailscale ni sur le réseau.
- Réglages : [`settings-sans-secret.yml`](settings-sans-secret.yml). API JSON active, limiteur coupé, recherche sûre
  à 0. La clé secrète est générée sur la GX10 et reste hors du dépôt.
- Image tirée en priorité basse (`nice -n 19`) à 12:40 UTC pendant J3 (11 s, aucun calcul GPU).

## Résultats

| Requête de test | Résultats | Durée | Moteurs en échec |
| --- | ---: | ---: | --- |
| « Artemis II mission status » (langue fr, format JSON) | 50 | 3,0 s | wikidata (délai dépassé) |

Premiers résultats : nasa.gov (suivi de la mission Artemis II), whereisartemis.com, issinfo.net. Au démarrage, les
moteurs Tor (ahmia, torch) ne se chargent pas, ce qui est sans effet ici.

## Lecture

Le moteur répond en environ 3 s : c'est le coût d'une recherche réelle avant une réponse. Il est trop lent pour être
appelé sur chaque question ; la récupération devra se déclencher seulement quand la question l'appelle. Les essais
reproductibles utiliseront le corpus figé de l'oracle v4 ; SearXNG sert au flux réel (F1).

## Limites et incidents

- Les résultats dépendent des moteurs amont (Google, Brave, etc.) et varient d'un jour à l'autre : seul le corpus figé
  permet de comparer des variantes.
- Pour l'arrêter : `docker stop tvlens-searxng` ; pour le relancer : `docker start tvlens-searxng`.
