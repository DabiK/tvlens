# Choisir le modèle de transcription

## Dans l’application Mac

Dans l’assistant initial ou **Réglages IA → Configurer ce Mac → Modèle de transcription**, choisir un modèle et la langue,
puis **Télécharger et utiliser**. Un modèle déjà présent peut être vérifié et réutilisé sans nouveau transfert si son empreinte correspond.
Les autres modèles installés sont conservés. Fermer la session courante avant de modifier ces réglages, puis quitter et rouvrir TVLens.
Le choix du modèle et de la langue concerne les prochaines transcriptions ; les archives ne sont pas retranscrites.

Le catalogue embarqué couvre les 33 fichiers GGML publiés dans le dépôt officiel vérifié le 23 octobre 2026 :
Tiny, Base, Small, Medium, Large v1/v2/v3 et Large v3 Turbo, avec leurs variantes anglaises et quantifiées disponibles.
Il ne couvre pas tous les modèles affinés par des tiers. Les poids se téléchargent à la demande ; ils ne sont pas inclus dans le ZIP de l’application.
Le paquet inclut le catalogue et son interface. Whisper reste un outil externe à installer.

| Modèle multilingue | Téléchargement, arrondi au Mio supérieur | Usage à envisager |
| --- | ---: | --- |
| Tiny | 75 Mio | Priorité aux faibles ressources, avec davantage de risques d’erreurs |
| Base | 142 Mio | Défaut conservé ; léger, mais limité sur les échanges difficiles |
| Small | 466 Mio | Premier compromis à essayer pour améliorer la fidélité |
| Medium | 1 463 Mio | Capacité supérieure, davantage de calcul et de mémoire |
| Large v3 Turbo | 1 550 Mio | Décodage accéléré par rapport à Large v3 ; à mesurer sur le Mac cible |
| Large v3 Turbo Q5_0 | 548 Mio | Poids compressés ; mémoire réduite, fidélité susceptible de varier |
| Large v3 | 2 952 Mio | Priorité à la fidélité, coût de calcul important |

Ces tailles sont celles des fichiers, pas des besoins en mémoire vive. Les descriptions sont des orientations,
pas des résultats de benchmark TVLens. La quantification ne garantit pas une accélération sur chaque matériel.
Il n’existe pas de réglage qui garantisse une transcription exacte ; noms propres, voix simultanées et phrases coupées restent difficiles.

Pour une émission française, sélectionner **Français** et un modèle multilingue. Les modèles `.en` sont exclusivement anglais :
leur sélection exige **Anglais**. **Détection automatique** reste disponible pour les modèles multilingues.
Les installations existantes sans choix de langue conservent leur comportement automatique.
**Enregistrer la langue seule** évite de télécharger ou de changer de modèle.

La sélection manuelle d’un fichier GGML reste possible. Son existence est contrôlée, mais ni son identité ni sa compatibilité
ne sont attestées par une inférence. Pour les modèles du catalogue, le téléchargement utilise une révision fixe,
une taille maximale propre au fichier et son SHA-256 attendu. Une interruption ne remplace pas le modèle précédent.
Le transfert est limité à une heure ; aucun téléchargement ne démarre simplement en ouvrant les réglages.

## Depuis un dépôt neuf

```sh
npm ci
npm run setup:speech -- --list
npm run setup:speech -- small
# Ou, par exemple :
# npm run setup:speech -- large-v3-turbo-q5_0
npm start
```

Le script conserve `base` si aucun argument n’est fourni. Les fichiers sont enregistrés dans `.local/models/ggml-<identifiant>.bin`,
ou à l’emplacement explicite `TVLENS_WHISPER_MODEL`. Après le téléchargement, choisir ce fichier dans l’assistant,
ou renseigner son chemin absolu dans `TVLENS_WHISPER_MODEL` de `.env.local`. Un chemin déjà choisi dans l’assistant garde la priorité.
Le script réutilise le même catalogue et la même vérification que l’application. `--list` ne télécharge et n’installe rien.
Sur Linux, préparer `whisper-cli` selon le guide serveur ; le script ne tente Homebrew que sur macOS.

Les modèles gérés par l’application sont dans `~/Library/Application Support/TVLens/models/`.
Le chemin sélectionné et la langue sont persistés dans `installation.json`, sans secret.
Changer de modèle ne modifie ni la durée des blocs audio ni le moteur : le traitement reste assuré par `whisper.cpp`.

## Alternatives étudiées

- **Whisper.cpp + Large v3 Turbo** : directement compatible avec l’application et les téléchargements intégrés.
  Le moteur prend en charge Apple Silicon/Metal et la quantification. Le bénéfice sur les noms français reste à mesurer.
- **MLX Whisper** : autre implémentation de Whisper pour Apple Silicon, avec modèles convertis et environnement Python/MLX.
  Il faudrait un adaptateur et un conditionnement propres. Changer de moteur ne change pas à lui seul les capacités des poids Whisper.
- **Parakeet TDT 0.6B v3** : modèle NVIDIA multilingue incluant le français, sous licence CC BY 4.0.
  Il nécessite un autre moteur ; ses poids ne sont pas chargeables par l’appel `whisper-cli` de TVLens.
  Aucune mesure locale ne permet ici de conclure qu’il serait préférable sur ce Mac et ces extraits.

MLX et Parakeet ne sont donc pas proposés comme options opérationnelles dans ce catalogue Whisper.
Aucun paquet Python ni poids alternatif n’est installé implicitement.

Pour choisir sur preuves, comparer Base, Small et Large v3 Turbo sur les mêmes audios sauvegardés,
avec langue, découpage et charge identiques. Vérifier à l’écoute une référence, puis mesurer les erreurs de mots,
les noms/nombres, les hallucinations sur silence, le temps par bloc et le retard accumulé.
Aucun benchmark de qualité supplémentaire n’a été exécuté pour cette intégration.

Sources primaires consultées le 23 octobre 2026 :

- [Moteur whisper.cpp, accélération Apple et quantification](https://github.com/ggml-org/whisper.cpp).
- [Catalogue des poids et licence MIT](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1).
- [Métadonnées des fichiers et empreintes LFS](https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1).
- [Whisper Large v3 Turbo](https://huggingface.co/openai/whisper-large-v3-turbo).
- [MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper).
- [Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).
