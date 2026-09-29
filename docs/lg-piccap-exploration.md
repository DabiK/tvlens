# Piste expérimentale : capture d’une TV LG avec PicCap

> **Piste non retenue pour la TV de l’utilisateur.** LG 75QNED87T (2024), non rootée ; aucune modification système demandée. PicCap exige root. L’effet exact sur la garantie n’a pas été établi : ne pas présenter une perte automatique de garantie comme un fait. Voir le [plan révisé](lg-piccap-test-plan.md).

Date de la recherche : 29 septembre 2026.

Statut : exploration future, aucune intégration implémentée ni testée sur une TV dans le cadre de cette recherche.

## Objectif

Recevoir sur le Mac les images affichées par une TV LG pour alimenter TVLens sans caméra externe. Conserver le moteur de contexte, la mémoire et le chat ; ajouter une source de capture interchangeable.

Cette piste concerne la capture. Une interface TVLens installée sur la TV pour consulter les réponses et poser des questions constitue un chantier distinct.

## Composants existants

- **PicCap** : application à installer sur une TV compatible et rootée. Elle configure et pilote le service natif de capture **hyperion-webos**.
- **hyperion-webos** : service utilisant des interfaces internes de webOS issues de rétro-ingénierie. Il peut capturer séparément la vidéo et l’interface, et envoyer les images sur le réseau vers un récepteur Hyperion.
- **Transport** : PicCap n’est pas lui-même un protocole. La piste consiste à recevoir les messages au format FlatBuffers employé par Hyperion. FlatBuffers est le format de sérialisation ; le cadrage des messages, l’enregistrement du client, les réponses et les formats d’image doivent être vérifiés dans le code avant d’écrire un récepteur.

Ces projets servent initialement à synchroniser un éclairage avec l’image. Leur existence démontre une voie de capture expérimentale, pas encore une qualité suffisante pour l’analyse audiovisuelle de TVLens.

## Architecture envisagée

    TV LG compatible et rootée
        → PicCap / hyperion-webos
        → réseau local
        → adaptateur de réception TVLens sur Mac
        → port de capture / ingestion
        → contexte, mémoire, questions

L’adaptateur traduirait les images reçues vers le contrat de capture du domaine. Le format Hyperion, les connexions et les particularités LG resteraient dans l’adaptateur, sans dépendance du domaine à PicCap.

Avant toute implémentation, inspecter les ports existants : le pipeline actuel peut attendre des segments vidéo et de l’audio, et pas uniquement des images isolées. Définir explicitement la conservation et la relecture possibles avec cette nouvelle source.

Pour le premier essai, il n’est pas nécessaire de développer une nouvelle app TV : utiliser PicCap sur la LG et réaliser le récepteur côté Mac. Une interface webOS TVLens peut être étudiée après validation de la capture.

## Prérequis et inconnues

| Sujet | État à ce stade |
| --- | --- |
| Modèle exact de TV | Non communiqué. |
| Version logicielle / firmware | Non communiquée ; indispensable pour vérifier la compatibilité. |
| Accès root | Requis par les projets. Le mode développeur seul ne suffit pas pour PicCap. |
| Capture vidéo effective | À tester : voir les menus ne prouve pas que les images du programme sont accessibles. |
| Résolution et fidélité | PicCap décrit une sortie de faible qualité adaptée à l’éclairage ; lisibilité des sous-titres, graphiques et OCR à mesurer. |
| Cadence, délai et stabilité | Dépendent du matériel, du backend et du firmware ; aucune mesure TVLens disponible. |
| Audio | Aucune solution de capture audio validée dans cette recherche. Le flux d’images ne résout pas la transcription. |
| Horodatage | Vérifier les informations disponibles dans les messages. Un timestamp de réception ne doit pas être présenté comme un timestamp exact de capture. |

Les API privées ne sont pas garanties par LG et peuvent changer avec les mises à jour. Vérifier la compatibilité exacte avant toute modification système ; l’accès root et les modifications système ne font pas partie de l’autorisation donnée pour cette note.

## Limites liées aux contenus

Le README PicCap signale des restrictions pour les contenus protégés des applications intégrées telles que Netflix ou Amazon sur les TV récentes. Il indique que des sources HDMI peuvent être capturables dans des situations où les applications intégrées ne le sont pas. Ces indications restent à vérifier sur la TV et les sources utilisées : aucune promesse de capture universelle.

Changer de protocole réseau ne rend pas capturables des images que la TV n’expose pas. Une image noire, une image figée ou une capture limitée aux menus doivent être rapportées comme un échec de capture.

## Expérience minimale à mener plus tard

1. Relever modèle, version webOS et firmware exacts. Vérifier les possibilités actuelles dans la documentation communautaire, sans supposer qu’une méthode ancienne fonctionne encore.
2. Si la TV est compatible et que son propriétaire choisit cette voie, préparer PicCap selon sa documentation. Ne pas commencer par une app TVLens complète pour webOS.
3. Tester un contenu non protégé. Recevoir et afficher ses images sur le Mac ; vérifier que la vidéo évolue réellement, au-delà des menus de la TV.
4. Mesurer résolution reçue, cadence utile, pertes, délai et lisibilité. Inclure du texte, un mouvement discret et un changement de plan. Conserver les échecs par source et backend.
5. Évaluer séparément l’audio : identifier une source disponible, mesurer son décalage avec l’image et valider une transcription synchronisée. Un micro externe peut être une option de test, sans constituer une capture native du son TV.
6. Une fois image et son validés, définir l’adaptateur hexagonal, la rétention, la relecture, les reconnexions et la gestion des erreurs. Prévoir un récepteur borné en taille et en cadence, accessible uniquement aux appareils locaux autorisés.

**Premier critère de succès :** une image réelle et exploitable du programme regardé arrive sur le Mac. Cela valide uniquement la capture visuelle. L’intégration audiovisuelle complète exige aussi l’audio, la synchronisation et une stabilité mesurée.

## Interface LG et télécommande vocale : chantier distinct

Une future interface LG pourrait partager la session hébergée sur le Mac ou le GX10 via une API locale. LG décrit une saisie vocale qui remplit un champ texte à partir de la Magic Remote. Ce comportement est à tester sur le modèle concerné.

Cela ne garantit ni l’interception globale du bouton vocal pendant Netflix, ni l’accès au microphone brut, ni un overlay au-dessus des autres applications. PicCap ne fournit pas à lui seul ces fonctions.

## Sources consultées

- [PicCap — README, prérequis et limites](https://github.com/TBSniller/piccap/blob/main/README.md)
- [hyperion-webos — capture, backends et exigences](https://github.com/webosbrew/hyperion-webos)
- [hyperion-webos — définitions FlatBuffers](https://github.com/webosbrew/hyperion-webos/tree/main/fbs)
- [hyperion-webos — génération des définitions FlatBuffers](https://github.com/webosbrew/hyperion-webos/blob/main/FLATBUFFERS.md)
- [webOS Brew — différences entre root et mode développeur](https://www.webosbrew.org/rooting/)
- [Vérification communautaire modèle / firmware](https://cani.rootmy.tv/)
- [LG — mode développeur officiel](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
- [Forum développeurs LG — saisie vocale et microphone](https://forum.webostv.developer.lge.com/t/how-to-access-microphone-input-and-voice-recognition-on-webos-tv/28117)

La compatibilité est évolutive : revérifier ces sources au moment de l’expérimentation.
