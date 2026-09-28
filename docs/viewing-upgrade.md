# Chat et outils de visionnage — 29 septembre 2026

## Correction

La trace utilisateur montrait une bonne compréhension de « lien de l’article » dans
l’aperçu Codex, puis une réponse finale remplacée par plusieurs résumés. Le filtre
rejetait les sources dont l’ouverture n’avait pas été observée ; le repli générique
renvoyait de la mémoire sans répondre à la demande. Les anciens journaux ne
conservaient pas les URLs rejetées, donc le motif exact de chaque rejet historique
ne peut pas être reconstruit.

Le registre de pages consultées persiste dans le fil, y compris les consultations
terminées avant une interruption. Les fragments d’URL sont normalisés sans élargir
la confiance à un autre chemin/domaine. Le prompt expose les URLs réutilisables.
Une seule tentative de confirmation explicite est autorisée, dans le même délai
60 s. Si les sources restent invalides, la réponse est une abstention spécifique,
plus jamais une concaténation de résumés. Les rejets sont diagnostiqués dans le journal.
L’ouverture observée d’une URL ne certifie pas à elle seule chaque affirmation de la page.

## Expérience

- Questions manuelles : FIFO, jusqu’à cinq en attente, annulation par question.
  Le temps en file est séparé des 60 s de traitement. Une nouvelle session annule tout.
- Ancrage : horloge d’observation au clic Envoyer, snapshot du contenu disponible.
  Une attente ne décale jamais « vient de dire ». Les quelques secondes du segment
  encore en cours ne sont pas disponibles avant sa finalisation ; la couverture le montre.
- Le fil conversationnel reste le même pendant la session et après pause/reprise.
  Une reconnexion après panne reconstruit seulement un contexte borné ; ce n’est pas
  une garantie de conservation illimitée du contexte interne du modèle.
- Persona : expliquer utilement, rechercher spontanément les preuves quand la réponse
  exige un fait externe, réutiliser les sources et attribuer les accusations à leur auteur.
  Une question de sujet appelle d’abord une réponse depuis les observations.
- Étapes : transcription locale, lecture/réexamen d’intervalle, recherche web et
  consultation d’une source sont déclenchées par les opérations réelles. Aucun raisonnement
  interne n’est montré. Les messages utilisateur de type commentary et les fragments de
  réponse sont présentés comme provisoires jusqu’à validation des références.
- Capture/analyse : deux horizons distincts, nombre d’attentes et lacunes affichés,
  également dans le chat flottant. « Analysé jusqu’à » n’affirme pas une couverture sans trous.
- Actions : source à ouvrir, passage à revoir, approfondissement et vérification d’un chiffre.
- Moments gardés : copie durable des segments entiers couvrant les 30 dernières secondes
  disponibles (donc parfois plus de 30 s). Transcription disponible conservée ; tentative
  locale si absente. L’échec est explicite. Suppression retire média, aperçu et texte.
  Le raccourci global est configurable ; son conflit est signalé, sans remplacer un autre raccourci.
- Recherche : moteur hybride existant, cartes avec aperçu, texte, temps et relecture ;
  si le brut a expiré, seul le résumé reste. Les appels d’embeddings sont comptabilisés.
- Auto : consigne libre, fréquence 15–300 s de visionnage, nouveaux segments seulement,
  démarrage prospectif, thread séparé et résultats cités. Les questions manuelles préemptent
  sa recherche. Dédoublonnage textuel (Jaccard ≥ 0,8) + rappel des derniers résultats ;
  ce n’est pas un détecteur sémantique parfait de paraphrases. Sous retard, les six segments
  les plus récents sont examinés, pas une garantie de veille exhaustive.

## Optimisation et mesures

Cache source de session, cache audio par empreinte, cache de réexamen de 32 entrées
(question normalisée + intervalle + IDs), cache embeddings existant. Une variation
sémantique de question ne réutilise pas aveuglément la même réponse.

Capture : candidats toutes les 400 ms (64 maximum), six images envoyées, ancrages
répartis dans le temps puis deltas globaux/localisés/de contours pour capter plans,
texte et mouvement. Ce sont des heuristiques de pixels, pas une détection sémantique
infaillible ; la vidéo brute reste disponible pour réexamen. En retard, la perception
utilise trois vues réparties et signale cette limite ; la file d’analyse peut sauter
un segment avec une lacune explicite. Audio local conservé dans la limite de rétention.

Comparaison indicative sur la même vidéo Kennedy, pas un benchmark statistique :

| Question | Premier passage corrigé | Après fonctions de visionnage | Premier retour utile après |
|---|---:|---:|---:|
| Sujet | 6,25 s | 6,34 s | 1,99 s |
| Date avec web | 14,60 s | 18,25 s | 4,10 s (provisoire) |
| Lien, relance 1 | 4,26 s | 4,58 s | 2,23 s |
| Lien, relance 2 | 4,24 s | 4,64 s | 1,99 s |

Les deux relances ont réutilisé la source sans aucun appel web : deux recherches
évitées. Le délai total n’a pas diminué sur cet essai ; le bénéfice observé est le
retour provisoire et la continuité. Le temps en file était 18,21 s puis 22,76 s.
Un segment a été sauté pendant le retard, puis le retard final est revenu à 0 s.
Le retour provisoire est une sortie du modèle, pas une mesure de vérification achevée.

OpenRouter après ce test : **0,50270824 USD cumulés / 5 USD**, antériorité incluse
(avant la campagne : 0,5026976 USD). Le delta correspond aux embeddings facturés.
Codex ne retourne pas ici de facture USD : coût monétaire inconnu, consommation
suivie par quota ; ne pas interpréter le champ historique `cost:0` comme une gratuité.
Quota observé : **63 % restants**, réserve **55 %**. Lecture avant inférence, cache
60 s ; ce garde ne peut contrôler les usages simultanés dans d’autres applications.

## Validation et limites

61 tests Node réussis : domaine hexagonal, sources, FIFO/annulation, ancrage relatif
pendant attente, reprise, expiration, cache, Auto/priorité/dédoublonnage, copie et
suppression durable, réserve quota, sélection d’images et échecs explicites.

Test Electron synthétique réussi (capture, son, relecture, file, pause/reprise).
Test réel complet : [rapport conservé](video-chat-live-1790636778921.json).
Vidéo réellement décodée et enregistrée par Chromium, Whisper local et Luna réels,
Codex/web réels ; seul le sélecteur macOS est substitué. Rétention accélérée à 45 s
pour vérifier l’expiration. Aucun attendu ni titre de fixture donné au modèle.

Le test vérifie sujet avec citations, date correcte et source, relances, même fil,
annulation ciblée, capture indépendante, marque-page/relecture/suppression, recherche,
Auto après activation et reprise du lien après pause. La frappe du raccourci global
à travers une autre application n’est pas automatisée ; l’enregistrement est vérifié
séparément. Les unités vérifient aussi l’absence de contenu postérieur à l’ancrage.

Limites conservées : Whisper a notamment transcrit « cart » comme « cock » dans
un segment du discours. La sélection visuelle ne garantit pas la compréhension
d’actions fines. L’ancien échec Luna sur un cercle mobile reste documenté dans
[les mesures précédentes](session-optimization.md) ; aucun score 8/10 n’est revendiqué
pour Luna ni pour cette nouvelle capture. Pas de nouveaux embeddings multimodaux.


### Dernière validation avec Auto sourcé

[Rapport final](video-chat-live-1790637182683.json) : tous les contrôles passent,
y compris Auto avec source externe liée à un passage postérieur à l’activation.
Auto a retrouvé la date dans la transcription de Rice en 18,47 s. Chat : sujet
6,19 s, date 15,57 s, relances de lien 4,63 s et 5,90 s. Premier retour utile :
1,97 s pour le sujet et 2,61 s pour la date. La source reste réutilisée après pause.
Un segment sauté reste explicitement dans les lacunes ; retard final 0 s.
OpenRouter final : **0,50271496 / 5 USD** cumulés. Codex : **63 % restants**.
[Validation du raccourci réel](shortcut-validation.json) : enregistrement OS,
remplacement et persistance réussis ; frappe physique inter-applications non automatisée.
