# Rapatriement des étapes closes du lot nocturne original

Source : `/home/nvidia/tvlens-setup/nuit-20261020T210107Z` sur GX10. Le run s'est scellé `blocked` le 20 octobre 2026 à 22:35:59 UTC à cause de l'accès Docker hérité de l'ancien serveur tmux. Les étapes perception, vision/questions et sonde Ollama ont terminé avec code 0 avant cet incident ; elles ne sont pas rejouées. Le dossier distant reste intact. La partie vLLM texte a été reprise séparément dans `experiments/essais/2026-10-21-reprise-docker-gx10/`.

La sélection exacte figure dans `selection.txt`. Elle comprend les réponses brutes Ollama, les synthèses, indices et campagnes des deux variations, les manifests d'entrée sans médias, les états et journaux du lanceur. Elle exclut les vidéos, images et audios préparés, `config.env`, les archives de code, les sorties média des replays et la télémétrie volumineuse. Les fichiers exclus restent sur GX10 dans le dossier scellé. Les réponses sont conservées pour annotation ; aucune note de pertinence n'est calculée (`readyForScoring=false`). Les cas `acquired:false` devront rester séparés dans le bilan final.

Vérification : 172 fichiers sous `results/`, soit 24 783 561 octets, ont été copiés. Les 171 fichiers référencés par `results/integrite.json` correspondent tous à leur SHA-256 ; le 172e est le manifeste lui-même. Son empreinte locale égale l'empreinte distante : `862c45eac73f216791af18e6fb46a832b412a6cd07c7ee99b0cd592f817f5aa9`. Les deux journaux du lanceur correspondent également :

| Fichier | SHA-256 |
| --- | --- |
| `launcher.stdout.log` | `bf981a1d7938083f83105ce8c2509db8bbece796f352a1909140fb58c50e219e` |
| `launcher.stderr.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

La sélection n'est pas une archive complète des 2 902 fichiers du sceau distant. Elle fournit les données et journaux utiles à l'analyse sans intégrer les médias ni les artefacts volumineux dans Git.
