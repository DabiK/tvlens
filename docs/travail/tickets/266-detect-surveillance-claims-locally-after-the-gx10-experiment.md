---
id: T266
titre: Detect surveillance claims locally after the GX10 experiment
statut: a-faire
bloque_par: T261
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Après l'expérience GX10, la surveillance peut détecter les affirmations avec Ollama tout en
conservant sa recherche web distante. Les deux rôles restent identifiés séparément dans les
traces et bilans. Une session Codex, un commit ; la boucle ne prend pas ce ticket avant la décision ci-dessous.

## Sources

- Décision du propriétaire du 17/10 au soir : écrire ce ticket maintenant, mais placer la
  détection locale de la surveillance après la fin de l'expérience, à la différence de T263–T265.
- Code relu à `4599eea` : `runtime/surveillance-runtime.cjs:81-90` compose un agent Codex ;
  `:251-254` le fournit à la fois comme `detector` et `researcher`.
  `:392-396` fait de même pour la validation de restauration.
- `core/surveillance.cjs:20-24` distingue déjà les ports `detect` et `verify` ;
  `:367-369` les reçoit séparément. Aucune nouvelle API métier n'est nécessaire.
- `adapters/codex-surveillance-agent.cjs:35-41` crée/préchauffe un détecteur sans web et
  des chercheurs avec web ; `:54-59` compose le prompt de détection, `:62-76` vérifie
  les affirmations et `:11-23` relève les pages effectivement ouvertes dans le tour.
  `adapters/local-vlm-agent.cjs:38-71` sait répondre à un prompt/schéma JSON sans outils.
  Son endpoint est `/api/chat` (`:23`), avec un message et un schéma (`:50-51`).
- `runtime/surveillance-runtime.cjs:464-475` ferme l'agent à l'arrêt, `:547-550` le prépare
  à l'activation ; `:609-627` assure reset/close. `adapters/local-vlm-agent.cjs:73-75`
  ferme définitivement son instance : une réactivation exige une nouvelle instance locale.
- T232 possède les causes quota, T252 leur affichage ; T227 possède la politique entre
  questions et Mémoire. T220/T224–T226, T235 et T234–T245/T253 migrent leurs propriétaires ;
  T250 possède l'écriture finale obligatoire de surveillance et les diagnostics de libération.
  Le découpage de la Vérification prévu par `docs/domaine.md:488-490` reste distinct.
- `tests/local-vlm-agent.test.cjs:13-30` fournit le faux Ollama ;
  `tests/surveillance-runtime.test.cjs` et `tests/server-surveillance.test.cjs` couvrent
  activation/restauration/persistance. ADR 0019, 0029 et 0030.

## Périmètre

- À créer : adaptateur du port de détection dans `adapters/verification/` recevant son agent
  d'inférence, raccord au transport Ollama de T263 dans `adapters/ollama/`,
  `tests/local-surveillance-detection.test.cjs`.
  À modifier : `runtime/surveillance-runtime.cjs`, `adapters/config.cjs`, composition
  de `adapters/codex-surveillance-agent.cjs` pour ne garder que ses chercheurs lorsque demandé,
  tests et lecture des identités par le rapport T261. Aucun déplacement général des fichiers.
- Réutiliser ce transport pour `/api/chat` ; aucun second client. La détection produit des
  affirmations structurées, pas les vecteurs de `/api/embed` utilisés par T264.
- Ajouter `TVLENS_SURVEILLANCE_DETECTION_BACKEND=codex|local` →
  `config.surveillanceDetectionBackend` et `TVLENS_LOCAL_DETECTION_*` →
  `config.localDetection` (URL, modèle, contexte/résidence facultatifs, jeton non persisté).
  Garder Codex par défaut pour l'existant ; les campagnes choisissent explicitement.
  Refuser valeur inconnue ou configuration locale incomplète, sans repli vers Codex.
- Composer séparément `detector` et `researcher`, en conservant l'injection de doubles.
  Le détecteur local réutilise prompt et schéma de détection, sans outil ni web, avec les seuls
  passages/contexte/affirmations connus fournis par le cœur. Chaque appel part sans historique
  modèle hérité ; les validations métier et la causalité restent dans Surveillance.
  Le détecteur local n'est pas exposé sous `surveillance.agent.detector` lu par `app/main.cjs:197`,
  ou ignore les affectations `:283` et `:289` ; un test le prouve.
- La recherche web reste le port distant Codex actuel : pages ouvertes, sources, verdicts et
  travailleurs inchangés. Ne pas construire ni préchauffer un détecteur Codex inutilisé lorsque
  le détecteur choisi est local. Une panne locale ne déclenche jamais une détection distante.
- Préparer et fermer les ressources réellement composées ; arrêter puis réactiver recrée le
  détecteur local fermé, sans ressusciter un appel abandonné. Préserver les époques de session,
  l'annulation et l'absence d'adoption tardive d'affirmations d'une activation précédente.
  Les obligations d'écriture de T250 et les diagnostics de fermeture restent distincts.
- Fournir diagnostics et traces des deux rôles, avec backend/modèle réels, refus et paramètres
  disponibles sans secrets. Le bilan de T261 nomme détection locale et recherche distante ;
  rôle non exercé ou identité inconnue restent explicites. Ne pas changer les anciens rapports.
- Hors périmètre : recherche web locale, vérification manuelle, seuil de saturation, dédoublonnage,
  bornes/délais/reprises, file par session, nouveaux événements, refonte du registre ou des hôtes.
  Ne pas reprendre T232/T252, T240, T250 ou la migration de la phase 2 dans ce ticket.
- Aucun essai réel dans la session Codex : faux Ollama, chercheur distant doublé et fichiers
  temporaires. Modèle local, TV, VPS et fournisseurs restent à l'orchestrateur/propriétaire, hors boucle.

## Critères d'acceptation

1. Par le vrai runtime et Surveillance, un passage admissible après activation va au faux
   Ollama ; ses affirmations valides sont transmises au chercheur distant doublé et publiées
   dans le registre. Aucun passage antérieur à l'activation ni contexte futur n'est ajouté.
2. Le mode local ne construit/préchauffe/appelle aucun détecteur Codex. Le chercheur garde
   les règles de preuve web actuelles ; une URL non ouverte n'est pas une source validée.
   Les diagnostics distinguent les deux rôles, sans qualifier la surveillance entière de locale.
   Les accès de l'hôte à `surveillance.agent.detector`, `model` et `authHome` ne changent
   ni le modèle local appelé ni son identité ; seuls les clients Codex exposés reçoivent ces réglages.
3. Backend inconnu, modèle manquant, panne HTTP ou réponse mal formée sont refusés sans
   détection de repli. Une panne est comptée comme échec de détection, pas comme lot vide réussi.
   Les choix fichier/cache/environnement et l'absence de jeton persisté sont vérifiés.
4. Une réponse retenue jusqu'après arrêt/reset/changement de session n'enrichit aucun registre.
   Après réactivation, une nouvelle instance répond ; les ressources abandonnées restent fermées.
   Les preuves existantes de restauration, dernière sauvegarde et diagnostic de libération restent valides.
5. Un rapport contrôlé porte les identités effectives des deux rôles, même en échec ou sans
   appel, et rejette toute usurpation par le JSON modèle. La recherche web reste déclarée distante.
6. À l'implémentation future, jouer en séquentiel `local-surveillance-detection`,
   `surveillance`, `surveillance-runtime`, `server-surveillance`, `portable-config`, `review-regressions`
   et `local-stream-replay` sous `tests/` (`.test.cjs`), puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/local-surveillance-detection.test.cjs` avec vrai runtime, magasin temporaire,
horloge maîtrisée, faux Ollama et chercheur distant doublé. Traverser activation → passage →
détection → vérification → état sauvegardé. Retenir une réponse, arrêter puis réactiver pour
prouver que l'ancien appel ne participe jamais à la nouvelle activation.

## Hypothèses bloquantes

Décision attendue du propriétaire : l'expérience GX10 est-elle terminée ? Le propriétaire a décidé le 17/10 que la détection locale de la surveillance passe après l'expérience.

Cette décision doit être levée dans cette section, pas par la seule fin de T260 ni le gel de
T254, qui précède l'expérience. Après accord, relire les raccords contre le code alors intégré :
la phase 2 et la migration Vérification peuvent avoir déplacé leurs propriétaires.
Le modèle textuel local et sa qualité de détection restent à vérifier hors boucle.
T261 doit être livré pour étendre son bilan ; il est le seul prérequis technique direct.
Il apporte transitivement T263 et son transport HTTP partagé ; aucune dépendance directe redondante.

## Journal
