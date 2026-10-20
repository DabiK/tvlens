# Reprise bornée de la sonde vLLM textuelle GX10

La nuit du 20 octobre a scellé et vérifié l'ablation perception, l'ablation vision/questions et la
sonde textuelle Ollama (20 réponses retournées), puis s'est arrêtée dès `docker pull` : le serveur
`tmux` initial avait conservé les groupes du compte `nvidia` d'avant son ajout au groupe Docker.
Ce dossier prépare **une seule reprise** des étapes vLLM manquantes, dans un dossier de résultats
neuf. Le run initial, ses sceaux et les réponses Ollama demeurent intacts. La correction
d'environnement consiste à lancer depuis une connexion SSH neuve sur un **nouveau socket tmux**,
sans redémarrer Docker, Ollama ni le serveur tmux d'origine.

Mise à jour à 22:49 UTC le 20 octobre : cette reprise est [déployée](deployment.json) et son
premier stage réel `docker-pull` a démarré avec accès Docker. Aucun résultat vLLM n'est encore
revendiqué à ce relevé.

Le [lanceur](scripts/resume_vllm.py) refuse de travailler si les six étapes d'origine ne sont pas
exactement les cinq succès suivis de `docker-pull:EXIT_1`, si leurs fichiers clés ne correspondent
pas au sceau, si les 20 réponses Ollama ne sont pas réelles et complètes, si le paquet figé, le
commit TVLens, le modèle Ollama ou les trois verrous ont changé. Il vérifie aussi l'absence de
conteneur du premier run encore actif et attend que les replays, le GPU et les modèles Ollama
résidents soient au repos. Il prend alors les trois verrous, échantillonne CPU/RAM/GPU, et importe
les fonctions du `vllm_stage.py` **du paquet original** pour le téléchargement, le contrôle CUDA,
le serveur et la sonde vLLM. Il ne relance ni le visionnage, ni les ablations, ni les 20 questions
Ollama. L'identité du premier run et les SHA-256 sont inscrits dans `resume.json` ; les journaux,
réponses et métriques sont scellés dans le nouveau `results/integrite.json`.

Le plafond reste le 21 octobre à 05:00 UTC, comme dans le protocole initial. Le modèle, l'image
ARM64, les paramètres vLLM, les dix prompts en deux passages, les délais par étape et l'ordre
Ollama puis vLLM ne changent pas. La mesure concerne une pile de réponse textuelle depuis des
entrées figées, pas le flux TV complet ni l'effet isolé du moteur. La pertinence reste à annoter
humainement (`readyForScoring=false`) ; les réponses absentes et erreurs demeurent visibles.

Déploiement autorisé uniquement après vérification du correctif Docker dans le nouveau serveur
`tmux`, avec un dossier distant **absent** de la forme
`/home/nvidia/tvlens-setup/reprise-<horodatage>/results` :

```sh
python3 scripts/resume_vllm.py \
  --original-root /home/nvidia/tvlens-setup/nuit-20261020T210107Z/results \
  --package /home/nvidia/tvlens-setup/nuit-20261020T210107Z/package \
  --repo /home/nvidia/tvlens \
  --out /home/nvidia/tvlens-setup/reprise-<horodatage>/results
```

L'étape Qwen visuelle attend ensuite le **nouveau** sceau terminé, puis le pilote StreamingVLM
attend la reprise et Qwen ; le corpus étendu suit. Les files échouées précédentes ne sont pas
réutilisées ni altérées. Si la sonde vLLM échoue pour incompatibilité réelle, conserver ce résultat
et réexaminer les prédécesseurs plutôt que de réessayer silencieusement.

Vérification hors GPU :

```sh
python3 -m unittest discover -s experiments/essais/2026-10-21-reprise-docker-gx10/tests -v
node scripts/check.mjs --changed
```

À la préparation locale, trois tests factices et le contrôle par fichiers modifiés sont verts.
Aucun téléchargement, conteneur ou essai GX10 n'est lancé par cette préparation seule.
