# Chat Codex et interface flottante — validation

- 39 tests Node réussis : mémoire de conversation limitée à la même session,
  abstention sans source, audit des URLs ouvertes, modèle transmis au CLI,
  persistance et validation des réglages, plus tests existants de capture/réexamen.
- `npm run test:electron` réussi : capture synthétique image/son, chat derrière le
  port d'agent, vérification simulée, replay, annulation, réglages sauvegardés,
  passage au mode flottant au-dessus des fenêtres, dépliage et retour au mode
  complet pendant que la capture continue. Inférence simulée dans ce test UI.
- `node scripts/probe-chat-web.cjs` réussi : véritable Codex et recherche web,
  contexte Kennedy synthétique et relance « Tu peux chercher ? ». Source Rice
  ouverte et date retrouvée ; aucune requête OpenRouter. Résultat intégral dans
  [chat-web-live.json](chat-web-live.json). La transcription est une fixture et ne
  prouve pas l'identité du discours que regardait l'utilisateur.
- Capture d'écran de validation flottante : `/tmp/tvlens-floating.png`.

Le nouveau chat ne passe plus par le classificateur de mots-clés. Codex peut répondre
avec les transcriptions déjà observées et choisir un réexamen quand nécessaire.
L'inspection forcée conserve sa règle de preuves vidéo ; les sources externes sont
un canal distinct. Les modèles de perception restent interchangeables derrière les
ports du domaine. Aucun embedding multimodal ajouté.

Les premières exécutions UI ont échoué sur une attente asynchrone du test : elle
laissait le deuxième job encore en cours. L'attente vérifie maintenant explicitement
la résolution IPC depuis le processus de test. Ces échecs n'ont pas été comptés comme
validation réussie. Le test final couvre le parcours entier.

## Commandes de capture dans la barre

Le test Electron démarre désormais depuis **● Analyser** : ouverture du sélecteur,
choix de la source synthétique, capture image/son et analyse, retour à la barre
compacte puis arrêt via **■ Arrêter**. La vérification du chat, du replay et des
changements de mode fait partie du même parcours.

## Correction de la mémoire du chat — 29 septembre 2026

Le contexte initial de chaque question contient désormais jusqu’à six résumés récents
exploitables, leurs références et le nombre de segments en attente ou en erreur.
Les résumés retournés par `search_moments` sont enregistrés comme preuves de mémoire,
au même titre que ceux de `get_transcript`. Ils permettent de répondre au sujet
abordé, mais restent des analyses automatiques, non des affirmations vérifiées.
Le mode d’inspection forcée conserve l’exigence de preuves issues d’`inspect_clip`.
Les anciens messages de manque de contexte ne décrivent pas l’état courant.

Les références arrondies à la milliseconde sont ramenées aux bornes réelles du
passage (tolérance maximale de 1 ms). Les références étrangères et intervalles hors
bornes restent rejetés. L’audit et les nombres de citations proposées/acceptées sont
conservés pour diagnostiquer les rejets. Une nouvelle observation actualise aussi
l’état du chat avant le premier segment, sans réutiliser l’affichage de la session
précédente.

42 tests Node passent, incluant : mémoire vide puis remplie, segment en erreur,
réponse à partir de la recherche seule, arrondis et séparation mémoire/inspection.
Le test Codex réel `node scripts/probe-chat-memory.cjs` utilise une mémoire de test
peuplée et une réponse antérieure insuffisante. Il obtient une réponse au sujet de
la vidéo avec deux citations, sans API OpenRouter ni réexamen inutile :
[réponse complète](chat-memory-live.json). Ce test ne valide pas la qualité de l’OCR
ou la véracité des accusations mentionnées dans le contenu vidéo.
