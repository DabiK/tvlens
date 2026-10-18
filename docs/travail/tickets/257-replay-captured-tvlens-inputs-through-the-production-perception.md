---
id: T257
titre: Replay captured TVLens inputs through the production perception
statut: termine
bloque_par: T255, T265, T271
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une commande valide puis rejoue des entrées capturées par TVLens ou issues d'une vidéo convertie
dans sa perception de production, avec backend explicite `local` ou `codex`.
Chaque cas laisse un résultat ou un refus identifié et
des mesures brutes exploitables pour G1 et la référence G2. Tranche C d'Astra : une session, un commit.

## Sources

- Rapport Astra du 17/10, non versionné ; le ticket en reprend tout ce qui sert.
  Section 3, C, « Replay captured TVLens inputs through the production
  perception », base `beb9589` ; synthèse croisée GX10 et analyse `astra-gx10.md`, préparation du corpus.
- Décision du propriétaire du 17/10 au soir : T262 fournira aussi des entrées depuis une vidéo,
  convertie en blocs TV avec ffmpeg. Leur provenance reste distincte d'une capture réelle LG.
- Code relu à `4599eea` : `runtime/session-providers.cjs:130` fournit la fabrique de perception ;
  `:148` donne priorité à une perception injectée, `:149` sélectionne le simulé en smoke et
  `:150` compose le rôle réel avec l'agent local selon la configuration. Ne pas mesurer un simulé.
- `adapters/codex-perception.cjs:134` reçoit le transcript déjà disponible ; `:140` borne à six
  images, `:152` prépare le contexte historique admissible, `:165` forme les entrées du modèle
  et `:179` valide sa réponse. T255 complète les métriques transmises à cette frontière.
- `adapters/local-store.cjs:55` conserve images, audio et intervalle ; `:82` relit images/audio,
  `:88` relit l'intervalle séparément. Transcript, contexte et provenance ne sont pas dans ce JSON média.
- `core/perception-context.cjs:9-69`, appelé par `core/session.cjs:72`, calcule le contexte à
  partir des passages précédents. `core/memory/lanes.cjs:243-245` le calcule au départ de la vision ;
  `:282-291` conserve l'observation, le résumé et les métriques, pas ce contexte d'entrée.
  Une archive finale ne permet donc pas de recopier le contexte exact de cet appel.
  `docs/PRD-V2.md:192-202` exige une référence identifiée pour comparer compatibilité et qualité.
- `tests/local-vlm-agent.test.cjs:180` traverse déjà vraie perception et faux serveur Ollama.
  ADR 0019, 0029 et 0046 ; T220/T226 migrent la Mémoire et ses lecteurs privés, hors de ce runner.

## Périmètre

- À créer : `scripts/replay-local-perception.cjs`, son test `tests/local-perception-replay.test.cjs`,
  et, si nécessaire, des aides de lecture/identité/écriture réutilisables sous `scripts/`.
  Documenter le format près du runner ; T260 réunira les commandes d'exploitation.
- Définir un manifeste transportable minimal : identifiant du cas, intervalle, images ordonnées
  avec leurs temps, transcript effectivement disponible et ses limites, contexte antérieur
  admissible, drapeau `lightweight`, provenance (capture TVLens ou vidéo convertie) et empreintes des entrées.
  Les médias existants sont lus
  sans modification ; aucune lecture des collections privées de Mémoire ni exporteur général.
- Le manifeste peut être préparé par l'orchestrateur depuis une capture, ou produit par la source
  vidéo T262 au même format. La provenance vidéo conserve empreinte du fichier, intervalle source
  et paramètres de conversion ; elle ne vaut pas capture LG. Le lecteur valide les deux provenances
  sur fixtures sans attendre l'existence du convertisseur.
- Pour une capture conservée, images, audio et intervalle viennent du JSON média.
  Le transcript vient de `observation.transcript` de l'archive ; sa disponibilité au départ de
  la vision doit être justifiée ou marquée inconnue. L'incertitude finale peut mêler audio et vision :
  ne pas la présenter comme la limite audio d'origine. Sans trace d'entrée conservée, le contexte
  reste vide et cette limite est déclarée ; ne pas le reconstruire depuis les observations finales
  ni recalculer `perceptionContext`. Un contexte fourni exige une provenance et des bornes antérieures.
  Le drapeau `lightweight` vient des métriques sauvegardées, ou vaut `false` explicitement déclaré.
  Sans transcript disponible, laisser le champ vide avec sa limite. Les exemples montrent une entrée
  documentée et une entrée aux champs absents ou inconnus ; ils ne promettent pas le rejeu exact
  d'un état d'entrée que l'archive n'a pas conservé.
- Pour une vidéo convertie, transcript et contexte restent vides avec leur limite explicite,
  sauf apport documenté par l'opérateur selon les mêmes règles. Le convertisseur n'infère rien.
  Un corpus généré ne démontre pas la fidélité à la capture LG ; une vraie session TV reste son témoin.
- Appeler la fabrique partagée et `observeVisual()` réels. Le transcript figé ne déclenche pas
  Whisper dans ce rejeu de composant. Conserver prompt, sélection effective et validation du produit ;
  enregistrer les images effectivement envoyées après ses bornes, sans inventer d'observation dense LG.
- Backend explicite, `local` ou `codex`, consigné. L'exécution `codex` fournit la référence G1 et G2,
  jamais présentée comme locale. Aide et validation ne construisent aucun agent ; les tests
  n'utilisent que le faux Ollama et un agent Codex doublé.
- Séparer totalement annotations attendues et entrées d'inférence. Refuser le contexte futur ou
  hors préfixe ; les données du corpus ne deviennent jamais des instructions d'outil.
- Livrer un mode de validation sans fournisseur et une exécution exigeant une option explicite,
  avec aide CLI sans effet. Identifier les campagnes et conserver progressivement résultats,
  erreurs et mesures déjà acquises en cas de refus intermédiaire ou d'interruption.
- À ne pas toucher : perception produit, capture TV/Mac, formats d'archive, rétention, files,
  politiques de reprise, convertisseur vidéo (T262), juge automatique ou fournisseur de repli implicite.
- Aucun essai réel dans la session Codex : modèle local, TV, VPS et fournisseurs restent des
  opérations de l'orchestrateur ou du propriétaire. Tests avec faux Ollama, agent Codex doublé
  et fichiers temporaires.

## Critères d'acceptation

1. Le test du runner traverse fabrique partagée → vraie perception → faux Ollama. Il vérifie
   l'ordre et les temps des images réellement envoyées, le transcript et le seul contexte admissible ;
   aucun champ d'annotation ni réponse attendue ne figure dans la requête. Une exécution `codex`
   traverse la même perception avec un agent doublé et reste identifiée comme référence Codex.
2. Fichier absent, empreinte incorrecte, intervalle invalide, images hors intervalle ou contexte
   futur, y compris dans un résumé cumulatif ou ses passages en attente, sont refusés avant tout appel.
   Les champs non récupérables restent absents ou inconnus dans le rapport ; ils ne sont pas reconstitués.
   Une entrée valide en mode validation et l'aide CLI ne construisent ni n'appellent de fournisseur ;
   l'option d'exécution est obligatoire pour inférer.
   Une fixture de capture et une fixture « vidéo convertie » conservent chacune leur provenance ;
   les limites des champs absents et les empreintes de conversion restent dans le résultat.
3. Chaque cas tenté garde son identifiant et une issue explicite, y compris JSON modèle invalide,
   refus, erreur et annulation. Un échec intermédiaire conserve les sorties précédentes ; une
   réponse tardive ne devient pas une réussite. Une campagne interrompue est marquée incomplète.
4. Le dossier de sortie contient SHA du code, identité d'exécution, empreinte du manifeste et des
   entrées, configuration effective sans secrets, backend réellement utilisé, résultats et métriques
   T255, ainsi que l'empreinte du fichier d'annotations passé en option, jamais son contenu.
   Cette empreinte est acquise avant le premier appel ; sans elle, G1 reste possible mais la
   campagne n'est pas admissible à la notation G2 d'annotations figées avant inférence.
   Une donnée inconnue reste inconnue ; aucun fallback Codex n'est compté comme mesure locale.
5. À l'implémentation future, jouer en séquentiel `local-perception-replay`, `local-vlm-agent`
   et `session-providers` sous `tests/` (`.test.cjs`), vérifier les modes sans fournisseur
   documentés, puis `node scripts/check.mjs`.

## Test d'acceptation attendu

Créer `tests/local-perception-replay.test.cjs` par la frontière publique du runner et sa CLI,
avec petit manifeste temporaire, médias maîtrisés et faux serveur Ollama. Observer la requête
et les fichiers de sortie ; retenir puis refuser un appel pour prouver la conservation partielle.
Ajouter la référence avec agent Codex doublé et les exemples avec transcript/contexte documentés
ou absents. Vérifier aussi la sélection allégée de trois images et le refus d'un contexte cumulatif futur.
Les doublures ne remplacent ni la préparation de perception ni sa validation de réponse.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Décision du propriétaire du 17/10 : il constitue le corpus réel, une dizaine d'extraits français ;
l'orchestrateur prépare le format et la grille d'annotation à partir des outils livrés ici et par
T258. Le corpus réel n'est pas un prérequis à l'implémentation sur fixtures maîtrisées. Les formats
et exemples livrés doivent permettre cette préparation sans nouveau développement.

T255 est le seul prérequis fonctionnel. T262 dépend de ce format et ajoutera la conversion, pas
l'inverse : le lecteur et sa fixture vidéo sont vérifiables avant le convertisseur. T220/T226 ne
bloquent pas le rejeu de composant, qui ne lit
pas les internes de Mémoire. La copie finale reste postérieure à T227, répétée sur Mac avant accès,
avec `hackathon-rc` en repli ; T254 retient la phase 2. Ce runner ne prouve pas une tenue de trente minutes.

## Journal

- 18/10, propriétaire : ordre de la copie GX10 A : questions et recherche locales d'abord (T263, T264), puis T255,
  T265, T257, T262, T258, T267. Dépendance d'ordre ajoutée (`T265`), sans lien de code ; la retirer rend l'ordre par
  numéro.
- 18/10, propriétaire : un contrôle réel sur le Mac suit chaque ticket critique (T269 à T275). Ce ticket attend
  aussi T271.
- 18/10, Codex : exploration de la fabrique, de la perception, du stockage média et des ADR 0019/0029/0031/0046.
  Manifeste explicite et campagne progressive prévus ; aucun essai réel ni reconstruction du contexte depuis l'archive.
- 18/10, Codex : cycles rouge/vert par `node --test tests/local-perception-replay.test.cjs` : validation sans
  fournisseur (1 test), refus avant appel (3), vraie perception vers faux Ollama et référence Codex doublée (5),
  erreurs/interruption/CLI (9), images identiques (10), exemples et intégrité (13), fermeture sur disque plein (14).
  Assertions rouges et sorties vertes conservées dans `.harness-state/tickets/T257/`.
- 18/10, Codex : manifeste version 1, trois exemples fictifs et format documentés dans `scripts/perception-replay.md`.
  Runner et aides sous `scripts/`, aucune modification de la perception produit, des archives ni de Mémoire.
  Chaque appel conserve prompt et images effectivement sélectionnées ; les annotations restent hors inférence.
- 18/10, Codex : `node scripts/replay-local-perception.cjs --help` : aide affichée, sortie 0.
  `node scripts/replay-local-perception.cjs --manifest scripts/fixtures/perception-replay/manifest.json --out
  .harness-state/tickets/T257/validation-local --backend local --validate` : 3 cas validés, campagne complète, sortie 0.
  Même commande avec `--out .harness-state/tickets/T257/validation-codex --backend codex` sans `--validate` :
  3 cas validés, campagne complète, sortie 0 ; aucune construction de fournisseur.
- 18/10, Codex : `node --test --test-concurrency=1 tests/local-perception-replay.test.cjs tests/local-vlm-agent.test.cjs
  tests/session-providers.test.cjs` : 49 tests réussis, 0 échec. Preuve : `acceptance-sequential-final.log`.
  Contrôles initiaux rouges (complexité, ligne longue, format JSON) corrigés sans modifier le harnais ni le cliquet.
- 18/10, Codex : `node scripts/check.mjs --changed` : vert, 14 tests du runner réussis, cliquet produit en hausse de 14.
  `node scripts/check.mjs` : vert, 149 fichiers de tests JS, 2 747 tests réussis, 0 échec ; 47 tests Python réussis.
  `git diff --check` : sortie 0. Preuves : `check-changed-complete.log` et `check-full.log` dans le dossier d'état.
  Verdict `TERMINÉ` remis à la boucle pour relecture ; aucun essai réel, commit ou push.
- 18/10, Codex, reprise : relecture 1, ticket/journal, écarts et arbre relus. Neuf constats acceptés.
  Renforcement des preuves temporelles, des sorties persistées et des refus CLI ; corrections prévues
  des diagnostics, de leur cause, des valeurs effectives et de l'empreinte Git, sans changer la perception produit.
- 18/10, Codex, corrections de relecture 1 : constats 1 à 4 couverts par des assertions supplémentaires sur les
  préfixes futurs cohérents, `campaign.json`, le contexte exact envoyé et les refus CLI avec manifeste valide.
  `node --test --test-name-pattern='future context is refused' tests/local-perception-replay.test.cjs` :
  rouge avec le garde temporel temporairement retiré (3 constructions contre 0 attendu), puis vert après restauration.
  `node --test --test-name-pattern='execution traverses the shared' tests/local-perception-replay.test.cjs` :
  rouge avec empreinte du manifeste temporairement retirée, puis vert après restauration dans la suite complète.
- 18/10, Codex, corrections de relecture 1 : constats 5 à 8 corrigés après assertion rouge observée :
  cause codée du HTTP 500 conservée, un seul diagnostic final par mesure HTTP, configuration lue sur l'agent
  réellement construit, empreinte du diff suivi calculée en flux (fixture dépassant 1 Mio), portée documentée.
  Commandes ciblées : `node --test --test-name-pattern='<motif>' tests/local-perception-replay.test.cjs`,
  motifs `held calls preserve`, `one HTTP request leaves`, `configuration records`, `code identity hashes`.
  Assertions rouges puis vertes observées ; journaux `reprise-cause-*`, `reprise-diagnostic-*`, `reprise-config-*`,
  `reprise-diff-*` dans le dossier d'état. Constat 9 : instructions séparées sur leurs lignes dans la CLI et les tests.
- 18/10, Codex, vérifications de correction : `node --test tests/local-perception-replay.test.cjs` : 20 tests verts.
  `node --test --test-concurrency=1 tests/local-perception-replay.test.cjs tests/local-vlm-agent.test.cjs tests/session-providers.test.cjs` :
  55 tests réussis, aucun échec (`reprise-acceptation-sequentielle.log`). Aide CLI et validation des trois exemples pour
  chacun des backends : sorties 0 (`reprise-aide.log`, `reprise-validation-local.log`, `reprise-validation-codex.log`).
- 18/10, Codex, fin de correction : `node scripts/check.mjs --changed` : vert, 20 tests du runner réussis.
  `node scripts/check.mjs` : vert, 149 fichiers JS et 2 753 tests réussis, aucun échec ; 47 tests Python réussis.
  Preuves : `reprise-check-changed-final.log` et `reprise-check-full.log`. `git diff --check` : sortie 0.
  Nouveau verdict `TERMINÉ` pour la boucle, neuf constats traités, aucune contestation ni réserve ; aucun commit ou push.
