# Accueil avec cartes de chapitres — 23 octobre 2026

Question : retrouver les chapitres dès l’accueil tout en conservant la vue courante et la conversation.

Configuration : Mac local, Electron 44.4.5, branche `codex/home-chapter-cards` basée sur
`0c7797f7688662d8fec89ead29137ddb477738e7`. Exécution `electron . --smoke-test` avec profil temporaire
séparé et copie d’une session existante de trois chapitres. Aucune capture ou question envoyée.
Application installée et sessions originales non modifiées.

Parcours manuel par les contrôles de l’application : ouvrir Bibliothèque puis l’archive, constater
les trois chapitres et leurs vignettes, cliquer Questionner, basculer En ce moment puis Chapitres.
Le titre et l’intervalle sont préremplis ; la conversation et le brouillon sont conservés.
La nouvelle session est accessible dans l’en-tête. Le résumé peut être replié sur deux lignes. À la demande de l’utilisateur, les cartes sont ensuite
passées en carrousel horizontal avec flèches et navigation clavier.

Revue fonctionnelle indépendante : aucun défaut bloquant trouvé. Revue des standards : un paragraphe
imbriqué dans summary a été remplacé par un span dans la vue compacte.

Premier contrôle des fichiers modifiés : vert, quatre nouveaux tests réussis avant ajout du carrousel.
Le journal final remplace cette première exécution après les corrections du carrousel.
Le contrôle complet est consigné séparément après son achèvement.

Limites : pas de mesure d’inférence, de nouvelle capture ni de validation de transcription.
Le profil isolé affiche un avertissement de modèle Whisper absent ; il ne reproduit pas la configuration
de l’application installée. La fenêtre flottante n’a pas fait l’objet d’une recette manuelle complète.

Incidents de l’outil de pilotage : perte de la première instance pendant une tentative de rechargement
(cause non établie), puis erreur ScreenCaptureKit et expiration d’une capture d’écran. Une nouvelle
instance isolée a été ouverte ; l’archive et les cartes ont été constatées de nouveau. Aucun résultat
fonctionnel n’est déduit de ces erreurs de pilotage.

Reproduction : lancer Electron avec `--smoke-test`, copier une session de test dans le dossier
`sessions` du profil temporaire `tvlens-smoke-<pid>`, puis utiliser Bibliothèque > Ouvrir.
Ne pas envoyer de question ni lancer une capture pour cette recette de présentation.

Premier contrôle complet : 3 325 tests JS réussis sur 3 326 ; 71 tests Python réussis.
L’unique échec JS concerne le faux DOM du test de plafond de résumé dans architecture-f09 :
absence de classList. Cette exécution a commencé avant l’ajout du carrousel ; elle n’est pas une
preuve de validation complète de la version finale. Les corrections et leur contrôle ciblé sont
consignés dans le journal final des fichiers modifiés.

Validation finale du carrousel : 77 tests ciblés réussis (home-chapters, architecture-f09, mac-ui),
puis `node scripts/check.mjs --changed` vert avec 17 tests dans les deux fichiers modifiés.
Le contrôle complet n’a pas été relancé après ces corrections ciblées.

Recette Electron finale : flèche précédente désactivée au début ; suivant atteint la dernière
position et désactive la flèche suivante ; précédent revient au début et se désactive.
Position conservée après deux actualisations masquées couverte par test automatisé.
Capture visuelle finale gardée hors Git dans le dossier de visualisation de cette conversation,
`.../tvlens-accueil/carrousel.png`. Aucune installation ni publication réalisée pour cette refonte.
