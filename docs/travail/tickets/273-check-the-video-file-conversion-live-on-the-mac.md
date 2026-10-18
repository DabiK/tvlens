---
id: T273
titre: Check the video file conversion live on the Mac
statut: termine
bloque_par: T262
adr: non
installe: non
harnais: non
supprime_tests: non
niveau:
---

## Ce que le ticket livre

Ce ticket ne se traite pas en session : c'est un point de contrôle réel, sur le Mac, boucle arrêtée. Les tests du
dépôt simulent les modèles et les appareils ; avant de construire la suite dessus, l'orchestrateur vérifie en réel
la conversion d'un fichier vidéo en blocs TV et en manifeste de rejeu (T262). Tant que ce ticket n'est pas terminé,
T258 attend.

## Sources

- Décision du propriétaire, le 18/10 : « je veux un test sur le Mac pour chaque ticket critique ». Un ticket est
  critique quand son comportement dépend d'un modèle, d'un outil ou d'un appareil réel que les tests simulent.
- Précédent : T233, point de contrôle réel fermé le 18/10 par l'orchestrateur.
- T262, « Périmètre » : la vraie session TV témoin et les conversions du corpus réel restent hors boucle.

## Périmètre

- À modifier : rien dans le dépôt, hors journal de ce ticket. La boucle ne lance pas ce ticket : il attend une
  décision.
- Hors boucle, par l'orchestrateur, sur le Mac, boucle arrêtée, depuis le dernier commit intégré :
  1. une vidéo déjà présente sur le Mac ou fournie par le propriétaire, sans téléchargement ;
  2. conversion par la commande de T262 : blocs acceptés par `/v1/segments` d'un serveur headless local, dernier bloc
     partiel compris, et manifeste lu par le rejeu de T257 ; un court rejeu local de ce manifeste aboutit ;
  3. provenance : empreinte du fichier, intervalle source et paramètres de conversion présents, jamais présentés comme
     une capture LG ;
  4. écrire le résultat dans le journal de ce ticket, avec le commit exercé et les chiffres relevés. Un écart devient
     un ticket correctif sans bloqueur ; ce ticket reste à faire jusqu'à ce que le correctif soit intégré et le
     contrôle refait. Quand le contrôle est concluant : statut `termine`, commit de ce seul fichier, boucle relancée.

## Critères d'acceptation

1. Tant que ce ticket est à faire, `node scripts/loop/run.mjs --dry-run` ne propose ni T258 ni aucun ticket
   qui en dépend.
2. `node scripts/loop/tickets.mjs validate` ne signale aucun problème.

## Test d'acceptation attendu

Aucun test : ce ticket ne change ni le code ni le harnais. Le critère 1 se vérifie par la commande.

## Hypothèses bloquantes

Décision attendue du propriétaire : le contrôle réel de T262 est-il concluant ? Le propriétaire a décidé le 18/10
que l'orchestrateur fait ce contrôle et ferme ce ticket quand il est concluant.

## Journal

- 18/10, orchestrateur : contrôle réel concluant au commit `c13fd0e`, sur le Mac (M5 Max, 36 Go, boucle arrêtée),
  ffmpeg 9.0.2, avec les échantillons du dépôt.
  - Kennedy (`kennedy-rice-7min.mp4`, 0 à 65 s) : 9 blocs dont un dernier de 1 s, 3 s de calcul, images 1280×720 ;
    Spring (`spring.mp4`, 60 à 90 s) : 4 blocs dont un dernier de 6 s, images 1280×536, format conservé ; son WAV mono
    16 kHz ; empreintes des sources identiques à `media/samples/README.md` ; préparations et manifestes validés.
  - Rejeu local `gemma3:4b` par le runner de T257 : 13 / 13 réussis, 4,0 à 5,8 s par bloc ; deux réponses en anglais
    sur Kennedy, à mesurer en G2.
  - Serveur headless local, session neuve : 4 blocs rattachés et envoyés au rythme réel, tous acceptés (200), 3
    passages prêts et 1 partiel à l'archivage. Langue de transcription par défaut en français : discours anglais mal
    transcrit, signalé par les résumés.
  - Provenance `converted-video` complète (source, intervalle, ffmpeg). Trace :
    `experiments/essais/2026-10-18-conversion-video-mac/`. Statut `termine`.
