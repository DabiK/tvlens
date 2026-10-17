---
id: T108
titre: Make the architecture page and the docs index describe the current code
statut: termine
bloque_par: T030, T202, T194
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La page d'architecture décrit les propriétaires actuels, le chemin de perception réellement utilisé
et les frontières vérifiées par les tests. L'index distingue référence et rapports datés, et permet
de retrouver tous les documents de premier niveau et les décisions. Les affirmations périmées de
déploiement ou de branche quittent ces pages de référence ; les faits historiques restent datés.

## Sources

- `docs/audit-architecture.md`, rapport A, B12 et D3 ; décision du propriétaire, le 16/10 :
  attendre les gardes de T030/T202 et le retrait de T194 avant de décrire leur résultat.
  Cible du domaine figée le 16/10 dans `docs/domaine.md` (ADR 0029 et 0030).
- Documents vérifiés à `8340014` : `docs/architecture.md:3` ne cite que trois compositions partagées ;
  `docs/architecture.md:5` dit encore « ni commitée ni déployée » sur une ancienne branche.
  `docs/architecture.md:26` décrit deux files de deux éléments et les adaptateurs historiques
  `observe` ; `docs/architecture.md:61` annonce les variantes OpenRouter conservées.
  L'ADR 0016 a pourtant retiré les adaptateurs d'évaluation.
- Les nouveaux propriétaires sont câblés à `runtime/session-runtime.cjs:21`,
  `runtime/session-runtime.cjs:25`, `runtime/session-runtime.cjs:26`,
  `runtime/headless-runtime.cjs:12`, `runtime/headless-runtime.cjs:18`,
  `runtime/headless-runtime.cjs:34`, `adapters/codex-session-client.cjs:5`,
  `adapters/codex-session-client.cjs:6`, `app/renderer.js:5`,
  `app/renderer.js:17`, `app/renderer.js:21` et `tv/app/index.html:196`.
  Les ADR 0018 à 0027 en décrivent les coutures.
- `core/session.cjs:159` contient `shed()` : en perception séparée, la file audio peut garder
  jusqu'à `maxPending * 3` passages, tout en sautant la transcription des plus anciens au-delà de
  `maxPending`. `core/session.cjs:179` borne séparément la file vision. Relire après T194.
- `docs/README.md:25` dit encore « Rien n'est déployé » et classe plusieurs rapports avec la
  référence ; `docs/README.md:13` présente encore l'ambient comme livré, alors que le retrait
  est déjà expliqué à `docs/architecture.md:117` et `README.md:92`.
- Inventaire disque de ce worktree : dix Markdown de premier niveau sont absents de l'index,
  dont `standards.md` et les trois audits, audit d'architecture non suivi compris. L'ancienne liste
  de sept absents est périmée. Sur les ADR 0001 à 0027, seule la décision 0017 est liée depuis
  l'architecture ; « aucun ADR » et « dix ADR » sont donc tous deux périmés.
- `docs/installation.md:211` annonce encore le pont Auto ; le script appelle la surveillance à
  `scripts/probe-video-chat-live.mjs:28`. `README.md:177` conserve un décompte de tests daté.
  Aucun `tests/documentation-links.test.cjs` ni test d'index documentaire n'existe dans cette base :
  T107 ne doit pas être un prérequis implicite.

## Périmètre

- Modifier `docs/architecture.md` : présenter les couches selon la table de T025 et les exceptions de T030/T202 ;
  nommer les propriétaires session-providers, session-manifest, session-lifecycle, session-closing,
  capture-intake, headless-session-lifecycle et state-views, avec leur responsabilité.
  Décrire aussi les coutures Mac de capture/livraison d'état, les événements/tours Codex et
  modèles/polling/vue de chat TV. Éviter un inventaire de chaque fonction.
- Recaler le chemin capture → perception → question après T193/T194 : audio et vision distincts,
  bornes et surcharge conformes au code livré, DeepAsk pour les questions. Distinguer données
  `questions` des anciennes archives et API historique retirée. Ne pas annoncer le chemin série
  simulé ou les adaptateurs supprimés comme des capacités présentes.
- La page décrit l'état actuel. Pour la cible, elle renvoie à `docs/domaine.md` et aux ADR 0029 et 0030,
  sans recopier la cible ni la présenter comme livrée.
- Expliquer le partage des règles entre les hôtes et leurs ordres de fin propres (ADR 0007).
  Une section Décisions lie chaque ADR numéroté présent, hors gabarit, avec une phrase fidèle.
  Les ADR historiques ne sont pas réécrits ; préciser lorsqu'une décision ultérieure les remplace.
- Modifier `docs/README.md` : indexer tous les Markdown de premier niveau hors lui-même, les
  éventuels `archive/*/README.md`, `adr/`, `diagrams/README.md` et
  `architecture-improvements/index.md`. Séparer les rapports datés de la référence, classer les
  documents d'après leur titre/contenu et dater les relevés historiques. Recaler l'entrée ambient
  sur l'ADR 0017. L'audit peut être lié sans en recopier une affirmation non vérifiée.
- Corriger uniquement la phrase sur le pont Auto dans `docs/installation.md`, et les anciennes
  stratégies d'évaluation encore annoncées disponibles. Ne pas prétendre que la sonde live a été
  rejouée. **Ne pas modifier `README.md`** : décision du propriétaire, le 16/10, le README de
  présentation reste celui de `main` pour le hackathon. Son décompte daté reste tel quel.
- Arbitrage de l'orchestrateur, le 17/10, après le blocage de la première tentative : l'inventaire porte
  sur les documents **suivis par Git** (`git ls-files`). Un fichier ignoré n'est pas publié et n'entre ni
  dans l'index ni dans le test : c'est le cas du brouillon privé `docs/candidature-draft.md`
  (`.gitignore:33`), qui reste hors du dépôt. Le test donne le même résultat sur ce poste et sur un clone propre.
- Créer `tests/documentation-index.test.cjs`, autonome, sans dépendre du futur T107 : énumération
  locale des documents et ADR, vérification des liens attendus et de leurs cibles. Les diagnostics
  disent quel lien ou quelle phrase ajouter. Il refuse dans architecture/index/CONTRIBUTING les
  décomptes de tests et noms de branche présentés comme état courant.
- Ne déplacer ni renommer de document. Ne modifier ni code produit, ni ADR, ni harnais, ni
  `CLAUDE.md`, ni standards, ni `README.md`. Les recherches d'absence excluent audits, tickets et ADR historiques.

## Critères d'acceptation

1. Le nouveau test échoue sur les documents de début de session avec les chemins manquants,
   puis passe après correction ; il n'épingle ni sept absents ni dix ADR. La liste effective au
   démarrage du ticket et les sorties rouge/verte sont consignées au journal.
2. Chaque document de premier niveau, chaque index d'archive présent et chaque ADR numéroté hors
   gabarit sont liés par la page appropriée. Une fixture d'ADR ajouté sans lien échoue avec la
   consigne d'ajouter une phrase et un lien à la section Décisions. Une cible absente échoue aussi.
3. Architecture et index ne prétendent plus décrire une branche non commitée ou un état courant de
   déploiement. Ils distinguent référence, preuves datées et limites. Le test ignore les documents
   historiques pour ces interdictions.
4. Le test documentaire exige dans la carte les sept noms `session-providers`, `session-manifest`,
   `session-lifecycle`, `session-closing`, `capture-intake`, `headless-session-lifecycle` et `state-views`.
   Une fixture retirant un de ces noms échoue avec le module manquant. La carte donne leur rôle et
   leurs frontières ; files et cycle de session concordent avec T030/T202/T194 et l'ADR 0007.
   Le journal donne les modules relus et la correspondance entre paragraphes et code.
5. La phrase « ancien pont Auto » disparaît du guide ; `startSurveillance` y remplace cette
   affirmation. `git diff --exit-code -- README.md` est vide : le README n'est pas touché. Aucun essai matériel,
   exécution live ou déploiement n'est revendiqué.
6. À l'implémentation, lancer le test documentaire puis `node scripts/check.mjs --changed` ;
   rapporter exactement les étapes exécutées ou non lancées, sans supposer l'état des outils.

## Test d'acceptation attendu

`tests/documentation-index.test.cjs` lit les documents publiés et leur arborescence, sans réseau.
Ses fixtures prouvent qu'un document ou ADR oublié et une cible inexistante sont effectivement
refusés. La fidélité du texte architectural se relit contre les modules et la table de garde.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T202 dépend de T030, qui implique T025, T199 et T178 ; T194 implique T193 et T190 et attend sa propre décision.
T107 n'est plus nécessaire. L'état installé sur la TV ou le VPS n'est pas déduit du dépôt.
Les décomptes de documents sont des repères d'exploration à recalculer après les dépendances,
pas des valeurs à figer dans le test.

## Journal

- 17/10, orchestrateur : la première tentative s'est bloquée sur ce seul point (test documentaire 7/8, contrôle
  complet 2288/2289). Son travail est archivé dans `.harness-state/archives/T108-bloque-1/` : `code.patch`
  (architecture, index, guide, comparaison des stratégies), `fichiers/tests/documentation-index.test.cjs`,
  `ticket-journal.patch` et `etat/`. Le réappliquer, le vérifier contre le code du moment et restreindre
  l'inventaire aux documents suivis par Git, selon l'arbitrage ci-dessus.

### Reprise, inventaire Git et rouge — 17 octobre 2026

- Skill `ticket-codex`, méthode de tests, standards, journal et tentative archivée relus ; témoin de
  hooks présent. Exploration et absence d’écart consignées dans `.harness-state/tickets/T108/`.
- `git ls-files -z -- docs` : 50 Markdown de premier niveau hors index, 42 ADR numérotés hors gabarit,
  aucun index `archive/*/README.md`. Détail : `inventaire-initial.json` du dossier d’état.
  Absents de l’index : `active-goal.md`, `audit-architecture.md`, `audit-maintenabilite.md`,
  `audit-points-chauds.md`, `chat-overlay-validation.md`, `domaine.md`, `lg-companion-design.md`,
  `lg-pre-root-safety.md`, `reexamen-contract-original.md`, `research-dgx-spark-qwen38-2026-10-12.md`,
  `standards.md`, ainsi que les entrées `adr/`, `diagrams/README.md` et `architecture-improvements/index.md`.
  L’architecture ne liait que l’ADR 0017, sans section Décisions.
- Test archivé repris avant correction des documents ; inventaire fondé sur Git, fixtures dans des
  dépôts temporaires. Une fixture prouve l’exclusion des documents non suivis et ignorés dans les trois catégories.
- `node --test tests/documentation-index.test.cjs` : rouge observé, 8 réussites et 1 échec sur
  l’assertion des documents initiaux (chemins, décisions, propriétaires et affirmations périmées).
  Sortie complète : `.harness-state/tickets/T108/documentation-red.log`.

### Carte, index et vert documentaire

- Patch `code.patch` de la tentative bloquée réappliqué après vérification d’application ; aucune reprise
  de son ancien verdict. Carte et index revérifiés contre le code présent, les ADR et l’inventaire Git.
- Correspondance paragraphes/code : couches → `tests/architecture.test.cjs` (table de couches et exceptions) ;
  propriétaires → `runtime/session-runtime.cjs`, `session-providers.cjs`, `session-manifest.cjs`,
  `session-lifecycle.cjs`, `session-closing.cjs`, `capture-intake.cjs`, `headless-session-lifecycle.cjs`,
  `state-views.cjs`, `headless-runtime.cjs` ; perception/archives → `core/session.cjs` relu en entier
  et ADR 0035/0038 ; questions → `runtime/conversation-runtime.cjs`.
- Fin des hôtes → protocole commun, cycle de ressources, coordinateur headless et `endSession` Mac ;
  ordres de l’ADR 0007 conservés, règle vide de 0036 explicitée. Coutures Mac/Codex/TV → compositions
  renderer/client/companion, livraison Mac et polling TV, ADR 0018/0022/0025/0026/0027.
  Détail des lectures et correspondances dans `exploration.md` du dossier d’état.
- Les 42 ADR ont un lien et une phrase ; cible 0029/0030, retraits et décisions amendées sont distingués.
  Files : six références audio au plus en attente par défaut, dont deux transcriptions conservées,
  et deux places vision hors appel actif ; les passages à transcription sautée n’évincent pas la vision pleine.
- Index : documents suivis indexés, rapports classés et datés ; lien vers `experiments/README.md` non suivi
  retiré, dossier local préservé. Aucune cible locale des trois références n’est hors de Git.
- Guide : appel `startSurveillance` vérifié par lecture de la sonde ; aucun rejeu. Comparaison historique
  et guide distinguent les bancs d’évaluation retirés des préparateurs encore présents.
- `node --test tests/documentation-index.test.cjs` : 9/9 réussites, sortie `documentation-green.log`.
- `node scripts/check.mjs --changed` : règles, format, lint, gel, cliquet et test documentaire verts,
  9 réussites, 0 échec ; sortie `check-changed.log`. Aucun outil annoncé non lancé.
- `git diff --check` et `git diff --exit-code -- README.md` : code 0, sorties vides.

### Contrôle complet et remise à la boucle

- `node scripts/check.mjs` : code 0, contrôle vert. Règles, format, lint, gel et cliquet exécutés
  avec succès ; 133 fichiers JavaScript, 2 290 tests réussis, 0 échec ; 30 tests Python réussis.
  Sortie : `.harness-state/tickets/T108/check-full.log`. Aucune étape qualité non lancée.
- Recherche ciblée dans architecture/index/installation/comparaison : aucune ancienne mention de branche,
  du pont Auto ou des bancs retirés encore disponibles. Audits, tickets et ADR historiques exclus.
- Verdict `TERMINÉ` dans `.harness-state/tickets/T108/verdict.json` ; aucune réserve propre restante.
  Aucun essai matériel, live ou déploiement exécuté. Aucun commit ni push ; README de présentation inchangé.

### Reprise après relecture 1 — 17 octobre 2026

- Rapport `relecture-1.md`, ticket et journal, écarts, état Git et diff relus ; nouveau témoin de hooks présent.
  Les trois constats mineurs sont acceptés, sans écart ni contestation. Les travaux présents sont conservés.
- Correction prévue : cibles de liens validées dans l’inventaire Git du dépôt entier, y compris les dossiers
  contenant un fichier suivi ; fixtures contre les cibles présentes mais non suivies avant le correctif.
  Limite de preuve de la sonde datée d’après le livrable du 13 octobre 2026 ; consignes de travail classées en référence.

- `node --test tests/documentation-index.test.cjs` avant correction : 10 réussites, 1 échec sur la
  fixture des cibles présentes non publiées. Les neuf diagnostics attendus manquaient ; sortie
  `.harness-state/tickets/T108/correction-1-red.log`.
- Constat 1 corrigé : `git ls-files -z` couvre désormais le dépôt entier ; les liens locaux exigent
  une présence sur disque et un fichier suivi ou un préfixe de dossier publié. Les deux nouvelles fixtures
  prouvent le refus de fichiers non suivis/ignorés et de dossiers non publiés sur les trois références,
  ainsi que l’acceptation des fichiers suivis hors `docs/` et de leurs dossiers.
- Constat 2 corrigé : la limite de preuve de la sonde renvoie au livrable du 13 octobre 2026, qui signale
  son réalignement et son absence de lancement ; aucun rejeu ni essai live exécuté ou revendiqué.
- Constat 3 corrigé : « Travail et tickets » figure dans la table de référence pour développer ;
  le titre et les consignes actuelles de `docs/travail/README.md` ont été relus.
- `node --test tests/documentation-index.test.cjs` après correction : 11/11 réussites ; sortie
  `correction-1-green.log`. `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel,
  cliquet et tests verts, 11/11 ; sortie `correction-1-check-changed.log`. Aucune étape non lancée.

- `node scripts/check.mjs` après les trois corrections : code 0, règles, format, lint, gel et cliquet verts ;
  133 fichiers JavaScript, 2 292 tests réussis, 0 échec ; 30 tests Python réussis. Aucune étape qualité
  non lancée. Sortie `.harness-state/tickets/T108/correction-1-check-full.log`.
- `git diff --check` et `git diff --exit-code -- README.md` : codes 0, sorties vides ;
  `correction-1-diff.log`. Aucun changement produit, ADR, harnais ou README de présentation.
- Nouveau verdict `TERMINÉ`, trois constats corrigés, aucune contestation ni réserve propre restante.
  Aucun sous-agent, relecteur, essai matériel, live, déploiement, commit ou push lancé.
