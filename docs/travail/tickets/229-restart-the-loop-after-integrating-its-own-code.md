---
id: T229
titre: Restart the loop after integrating its own code
statut: termine
bloque_par:
adr: oui
installe: non
harnais: oui
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Après l'intégration d'un changement de `scripts/loop/` ou `scripts/quality/`, la boucle reprend
avec le code sur disque avant de traiter le ticket suivant. Ce ticket autorise la modification
du harnais de relance ; le lancement, les journaux et les limites de la commande sont conservés.

## Sources

- Plan du 17/10, T229 ; journal versionné de T196, « Réserves à la clôture » : l'orchestrateur
  a intégré à la main parce que la boucle conservait son ancienne fonction d'intégration.
  Les traces sont dans le dépôt principal `/Users/Dabi/Documents/ISN/tvlens/.harness-state/`,
  consulté en lecture seule. ADR 0012, 0014 et règles de découpage.
- Code vérifié à `1d8aa48` : `scripts/loop/run.mjs:17-29` importe les modules une seule fois ;
  `scripts/loop/run.mjs:399` intègre et `scripts/loop/run.mjs:501` poursuit la file dans la même
  instance. Le resserrement utilise déjà un CLI neuf à `scripts/loop/run.mjs:403`.
- `scripts/loop/run.mjs:36` lit les options, `scripts/loop/run.mjs:75` ajoute au journal,
  `scripts/loop/run.mjs:81` retire seulement son propre verrou et `scripts/loop/run.mjs:109-122`
  prend un verrou contenant le PID. Aucun mode détaché n'est défini par ce programme.
- Appelants à préserver : `package.json:28` ; `scripts/watch-loop/reader.mjs:142` lit le verrou
  et son instant de lancement ; `scripts/loop-view/events.mjs:119` filtre les événements par
  lancement. Banc : `tests/helpers/harness-repo.cjs:11`, `tests/ticket-loop.test.cjs:1608`.

## Périmètre

- Modifier `scripts/loop/run.mjs`, ajouter au besoin un petit propriétaire de relance dans
  `scripts/loop/`, et étendre `tests/ticket-loop.test.cjs` et ses helpers. Adapter les lecteurs
  de boucle cités seulement si la continuité du lancement l'exige. Aucun changement des hooks,
  des permissions de ticket, du contrôle qualité ou des planchers pour obtenir le vert.
- Décider la relance sur les chemins réellement intégrés, renommages et suppressions compris,
  pas sur le seul drapeau `harnais`. Seuls les modules chargés par le processus (`.mjs` et `.cjs`
  sous `scripts/loop/` et `scripts/quality/`) déclenchent la relance. `scripts/quality/baseline.json`,
  réécrit par le resserrement de `integrate` (`scripts/loop/run.mjs:403`) dans presque chaque commit
  d'intégration et lu par un processus neuf, ne la déclenche pas ; un ticket documentaire non plus.
- Après commit et push réussi ou désactivé, terminer proprement l'ancienne exécution et démarrer
  une instance neuve. Ne pas continuer avec des imports périmés si la relance échoue. Un commit
  ou push refusé conserve son arrêt actuel ; il ne provoque ni ticket suivant ni second push.
- Transmettre options effectives, répertoire, environnement, sorties et budget restant de `--max`.
  `--ticket` ne s'applique qu'au premier choix ; compter les intégrations déjà faites pour
  `--tune-every`. Rétrospective, harmonisation due et intégration ne s'exécutent qu'une fois.
  Ne pas remettre les compteurs à zéro ni traiter un ticket supplémentaire après la limite.
  La rétrospective et l'harmonisation due du ticket intégré s'exécutent avant la relève, dans
  l'instance qui l'a intégré ; l'instance neuve commence par le choix du ticket suivant.
- Assurer la relève du verrou sans intervalle où deux instances peuvent traiter un ticket.
  Un enfant autorisé reprend le verrou ; une seconde commande ordinaire reste refusée.
  Conserver une identité de lancement dans les vues malgré le changement de PID, sans tronquer
  `events.jsonl` ni le fichier auquel stdout/stderr sont déjà redirigés. Un lancement détaché
  de l'extérieur reste autonome ; ce ticket n'ajoute pas une interface de détachement.
- Garder les validations de démarrage, les fichiers non suivis préexistants et le contrôle de
  l'état relu. Une donnée de relève n'autorise pas un démarrage ordinaire sur un arbre sale.
  Écrire un ADR court sur la relève, les compteurs et la continuité des lecteurs ; le lier avec
  une phrase dans `docs/architecture.md`, section Décisions, et compléter la carte si nécessaire.

## Critères d'acceptation

1. Dans un dépôt temporaire, un faux ticket autorisé modifie un module chargé de la boucle,
   puis un second ticket observe son nouveau comportement. Le second est exécuté par une
   instance neuve, exactement une fois ; les deux commits et les contrôles restent ceux de la boucle.
2. Le même scénario couvre un module de qualité. Un changement hors des préfixes ne relance pas ;
   une modification refusée par les contrôles ou un push refusé ne lance aucun successeur.
   Une intégration qui ne change que le plancher ne relance pas.
3. `--max 2`, `--ticket`, modèle/effort, moteur, absence de push/rétrospective et cadence
   d'harmonisation conservent leurs effets après relève. `--max 1` ne lance pas de ticket de plus.
   Aucun argument avec espaces ne passe par une reconstruction de commande shell.
4. Un test retient la relève : un seul propriétaire peut travailler, le verrou désigne ensuite
   le successeur, l'ancien ne peut pas l'effacer. En succès et en échec de lancement, aucun
   processus de test ne reste vivant ; l'échec laisse un message et une cause au journal.
5. Les événements précédents et suivants restent lisibles dans un même lancement par les lecteurs
   existants ; stdout/stderr gardent la même destination. La preuve de chargement repose sur le
   comportement du module remplacé, sans comparaison du texte source.
6. À l'implémentation, jouer `ticket-loop`, les suites des lecteurs modifiés et `quality-check`
   en séquentiel, puis `node scripts/check.mjs`. Aucun test supprimé, aucun plancher abaissé.

## Test d'acceptation attendu

Étendre `tests/ticket-loop.test.cjs` avec `harnessRepo` et un faux agent qui modifie un vrai
module copié dans le dépôt temporaire. Observer comportement, PID, verrou, options et événements
du successeur. Piloter les frontières de relève par signaux ; aucun vrai agent, push ou dépôt
de travail n'est utilisé pour cette intégration de test.

## Hypothèses bloquantes

Aucune décision n'est attendue.

« Même processus détaché » dans le plan désigne ici la continuité du lancement et de ses sorties,
pas la conservation du PID : le code actuel ne définit pas de détachement. Le mécanisme précis
de relève est à établir par son test. La première intégration de ce correctif par une boucle
déjà ancienne exige encore un redémarrage par l'orchestrateur ; le ticket ne peut modifier
rétroactivement le programme en mémoire. Cette limite doit figurer dans le journal de livraison.

## Journal

- Exploration : skill, règles, code, appelants, tests et ADR lus ; `git status --short` et `git diff` consultés. État initial et conception dans `.harness-state/tickets/T229/exploration.md`, aucun écart prévu (`ecarts.md`). Les dossiers non suivis préexistants restent hors travail.

- Rouge observé : `node --test --test-name-pattern='an integrated module is loaded' tests/ticket-loop.test.cjs`, code 1, deux échecs sur l'assertion de PID neuf (`red-reload.log`). Après implémentation de la relève, même commande : code 0, 2/2 (`green-reload.log`).
- Relève : superviseur conservant commande et sorties, enfants IPC successifs, options et compteurs globaux transmis, validations rejouées avant admission. Verrou remplacé atomiquement avec son instant initial. Décision sur le diff Git intégré, renommages et suppressions compris ; JSON et documentation exclus. Le superviseur recharge aussi son propre module.
- Preuves ciblées : remplacement comportemental boucle/qualité ; options avec espaces, moteur Codex, limite et cadence ; rétrospective et harmonisation dues avant la relève ; refus qualité/relecture/commit/push. `coverage-reload.log` a révélé le refus silencieux de commit mal interprété ; correction locale documentée dans `ecarts.md`, puis test vert (`green-commit-refusal.log`).
- Frontières pilotées par signaux : propriétaire exclusif, ancienne instance terminée, successeur propriétaire, lecteur dans le même lancement et fichier de sortie conservé (`handover-green.log`, code 0, 1/1). Le lecteur reçoit sa frontière `commandOf` injectée, car `ps` est refusé dans ce bac à sable. Première version du banc : `fs.watch` refusé avec EMFILE ; remplacé par notifications de signaux, sans attente temporelle. Le banc de chargement interrompu a révélé qu'un SIGTERM reste en attente sur SIGSTOP ; il est remplacé par une vraie erreur de chargement après reprise. Refus d'arbre sale et de chargement : code 0, 2/2, causes au journal et aucun processus restant (`failure-boundaries-green.log`).
- ADR 0056 ajouté et lié dans la carte et les Décisions de `docs/architecture.md`. Limite de livraison : la première intégration de ce correctif par une boucle déjà ancienne exige encore un redémarrage par l'orchestrateur ; le code en mémoire ne peut être changé rétroactivement.
- Première suite complète `node --test tests/ticket-loop.test.cjs` : code 1, 229/230. Un seul échec du banc : l'instrumentation réservée à `ratchet.mjs` était aussi ajoutée à `models.mjs`, sans son import `fs`. Le scénario est corrigé pour réserver cette instrumentation au module qualité ; aucune assertion assouplie. Les 229 autres cas passent, dont toutes les frontières de relève (`ticket-loop.log`).
- Suites des lecteurs et de qualité : `node --test --test-concurrency=1 tests/watch-loop.test.cjs tests/loop-view-events.test.cjs tests/quality-check.test.cjs`, code 0, 83/83 (`readers-quality.log`).
- Diagnostic de chargement renforcé tests d'abord : `node --test --test-name-pattern='failed successor.*module-load' tests/ticket-loop.test.cjs`, rouge sur le code de cause trop générique (`red-loader-cause.log`). Le propriétaire chargé en premier transmet désormais l'erreur d'évaluation par IPC sans intercepter la sortie native. `node --test --test-name-pattern='an integrated module is loaded|held handover|failed successor|successor still refuses|supervisor reloads' tests/ticket-loop.test.cjs` : code 0, 7/7 (`latest-reload-green.log`), y compris le banc corrigé et le contrôle de l'état relu après relève.
- `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel et cliquet verts ; suite complète de boucle **231/231** (`check-changed.log`). Amélioration mesurée du compteur harnais : 381 → 395 ; aucun plancher modifié par la session.
- Contrôle final `node scripts/check.mjs` : **code 0**, règles, format, lint, gel et cliquet verts ; **2583/2583 tests JavaScript dans 145 fichiers, 47 tests Python réussis** (`check-full.log`). `git diff --check` : code 0. Aucun test supprimé, aucun plancher ni gel modifié.
- Livraison : verdict `TERMINÉ` dans `.harness-state/tickets/T229/verdict.json`. Aucun commit ni push effectué par cette session dans le dépôt de travail ; aucun relecteur ni état relu enregistré par la session. La boucle reprend la relecture et l'intégration.
- Reprise après relecture 1 : rapport, ticket et journal, écarts, `git status --short` et `git diff` lus ; exploration de correction consignée. Les deux constats mineurs sont acceptés, sans nouvel écart : préserver la sortie native d'une instance hors échec de relève, puis extraire le protocole de verrou de `preflight`. Les fichiers non suivis préexistants restent préservés.
- Constat 1, rouge observé : `node --test --test-name-pattern='a stopped first instance' tests/ticket-loop.test.cjs`, code 1, trois échecs sur l'absence de `relance-echouee` (SIGINT, SIGTERM, exception) ; la sortie explicite 7 passe déjà. Sortie dans `correction-1-red-worker-exit.log`. Une première écriture a été refusée par le contrôle rapide pour ternaire imbriqué dans le nouveau test ; corrigé avant ce rouge comportemental.
- Constat 1, vert observé : `node --test --test-name-pattern='a stopped first instance|held handover|failed successor|the loop refuses to start|a dry run' tests/ticket-loop.test.cjs`, code 0, **11/11** (`correction-1-green-worker-exit.log`). Le superviseur distingue diagnostic d'exception et panne du protocole, propage code/signal hors échec de relève et garde la cause du successeur non admis. Ce même passage établit les preuves de démarrage/verrou avant l'extraction du constat 2.
- Constat 2 : prise et vérification du verrou extraites dans `acquireLock`, validations conservées dans `preflight`. Même commande ciblée après extraction : code 0, **11/11** (`correction-1-green-lock.log`). Mesure statique ESLint : complexités de 9 pour chacune de ces deux fonctions, sans changement de configuration ni de gel.
- Contrôle de correction `node scripts/check.mjs --changed` : code 0, règles, format, lint, gel et cliquet verts ; suite complète de boucle **235/235** (`correction-1-check-changed.log`). Compteur harnais 381 → 396, plancher inchangé. Les quatre nouveaux cas vérifient aussi l'absence de ticket suivant et de processus restant.
- Suites des lecteurs et de qualité rejouées après la boucle : `node --test --test-concurrency=1 tests/watch-loop.test.cjs tests/loop-view-events.test.cjs tests/quality-check.test.cjs`, code 0, **83/83** (`correction-1-readers-quality.log`).
- Contrôle final de correction `node scripts/check.mjs` : **code 0**, règles, format, lint, gel et cliquet verts ; **2587/2587 tests JavaScript dans 145 fichiers, 47 tests Python réussis** (`correction-1-check-full.log`). Aucun test supprimé, aucun plancher ni gel modifié.
- Nouveau verdict d'implémentation : `TERMINÉ`, deux constats mineurs corrigés, aucune contestation ni réserve propre. Commandes et sorties conservées dans `.harness-state/tickets/T229/correction-1-commandes.md` et les journaux associés ; verdict dans `verdict.json`. Aucun commit ni push dans le dépôt de travail ; la boucle garde la relecture et l'intégration.

### Réserves à la clôture

- .harness-state/tickets/T229/relecture-2.md : **Écart accepté, précision `commitPaths` (`run.mjs:395`), aucun critère concerné.** La décision de la relecture 1 est maintenue. La ligne n'a pas changé et le test `a refused module integration never starts a successor: commit` la protège toujours.
