---
id: T229
titre: Restart the loop after integrating its own code
statut: a-faire
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
