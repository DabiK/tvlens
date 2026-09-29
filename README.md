<div align="center">

# TVLens

### Le film continue. Le contexte reste.

Un compagnon de visionnage qui voit, écoute et retrouve le passage dont tu parles.

**macOS · Mémoire temporelle · Chat & sources · Architecture hexagonale**

[Installer](docs/installation.md) · [Découvrir l’interface](docs/interface.md) · [Architecture](docs/architecture.md) · [Documentation](docs/README.md)

</div>

![TVLens : aperçu vidéo et conversation contextuelle](screenshots/current/direct.png)

> « Qu’est-ce qui vient de se passer ? » — « Explique ce moment. » — « Tu as une source ? »
>
> TVLens rattache la question au moment où tu la poses, retrouve les passages utiles et peut consulter des sources externes. Tu continues à regarder.

**Prototype fonctionnel sur Mac.** L’inférence visuelle et le chat utilisent aujourd’hui Codex ; l’audio est transcrit localement. L’exécution sur ASUS Ascent GX10 est une cible de développement, pas une capacité déjà validée.

## Une interface qui laisse la place au contenu

**Direct** réunit le flux, une courte description du contexte et la conversation. **Mémoire** rassemble les résumés, passages et moments conservés.

Le **mode flottant** reste au-dessus du lecteur. Déplie le chat quand tu en as besoin, puis replie-le sans interrompre l’observation.

<p align="center">
  <img src="screenshots/current/floating-bar.png" width="420" alt="Barre flottante : Demander, Garder, Pause et menu">
</p>
<p align="center">
  <img src="screenshots/current/floating-chat.png" width="420" alt="Conversation déployée dans le mode flottant">
</p>

<details>
<summary>Voir la mémoire de session</summary>

![Résumé et passages de la session](screenshots/current/memory.png)

</details>

*Captures de l’application avec un extrait réel de **Spring**. Leur protocole de production, les limites et les crédits figurent dans [la documentation des captures](screenshots/current/README.md).*

## Ce que tu peux faire

| Pendant le visionnage | TVLens |
| --- | --- |
| **Poser une question** | Utilise les observations récentes et le fil de conversation ; recherche sur le web lorsque nécessaire. |
| **Expliquer un instant** | Ancre l’action au clic et permet de réexaminer un passage avec des images plus rapprochées. |
| **Rattraper le fil** | « J’ai décroché » retrouve les passages depuis le dernier repère. |
| **Revoir une preuve** | Les citations temporelles ouvrent le passage disponible ; les sources web ouvrent l’article associé. |
| **Garder un moment** | Conserve le média et sa transcription sur le Mac jusqu’à suppression explicite. |
| **Retrouver un passage** | Recherche temporelle, textuelle et, avec une clé OpenRouter, sémantique. |
| **Activer Auto** | Surveille une consigne à partir de son activation, à une fréquence réglable. Les questions manuelles restent prioritaires. |

Les questions sont traitées dans l’ordre, avec annulation individuelle. Pause/reprise conserve le contexte de la session. Les étapes affichées correspondent au traitement observé ; aucun raisonnement interne n’est exposé.

## Essayer sur son Mac

Prérequis : **Mac Apple Silicon, Node.js 24+, Homebrew et Codex CLI connecté**. Le guide détaille les autorisations d’écran et de son système.

```sh
npm ci
brew install ffmpeg
npm run setup:speech
npm run setup:codex
npm start
```

Choisis une fenêtre vidéo, puis **Lancer l’observation**. Le mode choisi reste ouvert. Une fois les premiers passages analysés, pose une question ou clique sur **Explique ce moment**.

La clé OpenRouter est **facultative** : elle sert uniquement aux embeddings texte. Elle se configure dans `.env.local`, jamais dans le dépôt. Sans clé, la recherche temporelle et lexicale reste disponible.

Pour créer l’app macOS :

```sh
npm run package:mac
npm run open:mac
```

→ [Installation, modèles et dépannage](docs/installation.md)

## Un cœur portable, des adaptateurs remplaçables

La capture produit des segments horodatés. Le cœur gère mémoire, ordre des questions, rétention et validation des références. Les fournisseurs d’IA et le stockage sont injectés derrière des ports.

| Couche | Implémentation actuelle |
| --- | --- |
| Capture | Electron, MediaRecorder et AudioWorklet ; vidéo WebM, images et audio WAV |
| Perception et réexamen | Codex, Luna par défaut ; planches d’images horodatées et sélection adaptative |
| Paroles | Whisper multilingue exécuté sur le Mac |
| Conversation | Codex App Server persistant, un fil par session ; outils vidéo et recherche web |
| Mémoire | Médias récents sur disque, historique textuel et récapitulatif progressif |
| Recherche sémantique | Embeddings texte OpenRouter, avec cache et repli lexical |
| Interface | Vues Direct / Mémoire et chat flottant partageant le même état |

→ [Architecture et frontières de dépendance](docs/architecture.md) · [Contribuer](CONTRIBUTING.md)

## Données, preuves et limites

- **Ce POC n’est pas entièrement local.** Les images et transcriptions sont envoyées à Codex. L’audio brut est transcrit localement ; OpenRouter reçoit le texte à vectoriser lorsque cette option est activée.
- **Cinq minutes de média détaillé**, mesurées dans l’ordre de l’observation. Les textes restent disponibles après expiration ; un marque-page conserve explicitement le média.
- **60 secondes de traitement par question**, hors attente dans la file. Les recherches longues et lacunes restent visibles.
- Une observation, un OCR ou une accusation rapportée **ne constituent pas une preuve indépendante**. L’app distingue observations, explications, hypothèses et sources externes ; les modèles peuvent néanmoins se tromper.
- Les contenus protégés peuvent empêcher la capture. Le prototype ne promet pas de capturer toutes les applications ou toutes les TV.
- Fermer l’app termine le fil conversationnel actif. Les archives ne constituent pas encore une reprise complète de session après redémarrage.
- Les quotas et dépenses restent visibles, **sans plafond local de consommation**. Les limites des fournisseurs s’appliquent.

## Validation

```sh
npm test                 # Domaine et adaptateurs, sans inférence réelle
npm run test:electron    # Parcours Electron avec vidéo synthétique et modèles simulés
```

La dernière passe comprend **97 tests Node** et un parcours Electron : capture, chat, références rejouables, sauvegarde, file, pause/reprise et navigation. Les essais réels sont documentés séparément ; ils ne constituent pas une garantie générale d’exactitude ou de latence.

→ [Résultats et limites des tests](docs/validation.md) · [Reproduire les captures](screenshots/current/README.md)

## La suite

- Tester l’exécution continue sur **ASUS Ascent GX10**, en remplaçant les adaptateurs de modèle.
- Valider une source **caméra + microphone** devant une télévision, sans modifier son système.
- Mesurer les actions rapides et le retard d’analyse sur un corpus plus diversifié.
- Explorer les **embeddings multimodaux** pour retrouver sons, images et texte. Ils restent dans la roadmap.

La capture native LG via PicCap est une exploration distincte, non implémentée et exclue du POC sans modification système. [État de la piste TV](docs/lg-piccap-test-plan.md).

---

**Crédit vidéo :** *Spring* (2019), réalisé par Andy Goralczyk — © Blender Foundation | [cloud.blender.org/spring](https://cloud.blender.org/spring), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Extraits visibles dans des captures d’interface ; le film n’est pas distribué dans ce dépôt. [Provenance des médias](media/samples/README.md).
