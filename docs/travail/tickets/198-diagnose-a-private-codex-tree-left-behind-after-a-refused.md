---
id: T198
titre: Diagnose a private Codex tree left behind after a refused cleanup
statut: termine
bloque_par: T199
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le journal signale un arbre privé Codex conservé après un nettoyage refusé, avec son identité locale,
l'étape et une cause stable. Le balayage poursuit les autres candidats et le démarrage reste possible.
Une suppression n'est jamais accélérée au détriment d'un processus vivant ou dont l'arrêt reste incertain.

## Sources

- `docs/audit-architecture.md`, rapport A, C, réserve T176 R2 ; rapport B, B4 et E.
  Décision du propriétaire, le 16/10 : diagnostiquer le résidu, sans supprimer sous un processus
  vivant. T178 est transitif par T199.
- Réserve versionnée :
  `docs/travail/tickets/176-handle-or-justify-every-empty-catch-in-the-adapters.md:226` et `:383`
  (R2) : refus de `lstat` ou de suppression sans diagnostic ; absence d'une preuve discriminante
  de cette branche.
- Code vérifié à `8340014`, confinement, client, transport, agents appelants, compositions et tests lus :
  - `adapters/codex-confinement.cjs:237` crée un arbre par processus ; `:257` y place les liens
    vers l'authentification. Supprimer les liens n'autorise pas à toucher à leurs cibles ;
  - `adapters/codex-confinement.cjs:275` sonde le propriétaire ; `:289` balaie les seuls préfixes
    connus, après l'âge minimal. `:305` examine le candidat et `:309` le supprime ; `:311` absorbe
    les refus de lecture ou suppression. Le résultat ne contient que les noms supprimés ;
  - `app/main.cjs:62` lance le balayage hors du chemin de démarrage et ignore son rejet ;
    `server/main.cjs:38` le lance et ne journalise à `:39` que les suppressions réussies ;
  - `adapters/codex-session-client.cjs:597` partage la fin du transport et de l'arbre. À `:601`,
    un arrêt non confirmé conserve déjà l'arbre et produit une ligne de journal ; à `:609`, un
    `rm` refusé rejette et le `finally` retire le fait `leaving`, sans diagnostic propre du résidu ;
  - `adapters/codex-rpc.cjs:38` ne confirme la disparition du groupe que sur ESRCH ;
    `adapters/codex-session-client.cjs:253` empêche le même client de repartir avant cette confirmation ;
  - `tests/codex-confinement.test.cjs:948` couvre âge, préfixes, propriétaire vivant et liens vers
    les identifiants. `tests/codex-connect-race.test.cjs:35` et les tests codex-abandoned-turn et
    codex-thread-rotation couvrent les fermetures, sans injecter ces refus disque ni observer ce diagnostic.
- ADR 0005 : barrière limitée au client, confirmation de disparition avant retrait de l'arbre,
  conservation d'un groupe non confirmé et résidus possibles entre clients successifs. Le rapport B
  ne démontre ni fuite mémoire ni fréquence de ces résidus.

## Périmètre

- Modifier `adapters/codex-confinement.cjs` et `adapters/codex-session-client.cjs`, leurs tests de
  nettoyage/fermeture, créer un module partagé `runtime/codex-cleanup.cjs` et son test direct
  `tests/codex-cleanup.test.cjs`. Les deux points de démarrage appellent ce même module pour
  raccorder le balayage et son diagnostic. Il reçoit balayeur, racine temporaire et journal injectés : chaque hôte lui passe le balayeur qu'il
  importe lui-même, et le module n'importe jamais `codex-confinement`, pour que les bancs qui neutralisent
  ce balayeur à l'import de l'hôte (`tests/mac-ipc-contract.test.cjs:184`,
  `tests/architecture-f05.test.cjs:662`, `tests/architecture-f07.test.cjs:259`) le neutralisent toujours.
  Réutiliser ou injecter le journal au bord adaptateur/hôte, sans sortie de données privées vers les clients.
  Garder l'ordonnancement actuel : balayage lancé en arrière-plan sur Mac, attendu avant écoute sur serveur.
- Signaler le candidat laissé, l'opération refusée et son code système, avec un code stable propre
  au diagnostic. Distinguer une disparition concurrente normale d'un refus et d'une appartenance
  impossible à vérifier. Une appartenance incertaine ne constitue pas une preuve de mort.
- Conserver le résultat utilisable du balayage et la poursuite des candidats suivants. Un canal
  injecté de diagnostic est préférable à faire rejeter le balayage entier au premier refus.
- Couvrir aussi le refus de suppression par `finish` après disparition confirmée du groupe : le
  résidu doit être annoncé même si l'appelant absorbe le rejet de fermeture. Le diagnostic n'écrase
  ni l'erreur primaire ni le contrat existant des fermetures partagées.
- Ne créer ni registre global de clients, ni service de relance, ni nouveau SIGKILL, ni baisse de
  l'âge minimal. Ne retirer aucun arbre sous un propriétaire vivant ou un groupe non confirmé ;
  conserver et diagnostiquer si une erreur empêche d'établir qu'un candidat est abandonné.
- Les tests travaillent dans leur racine temporaire, avec refus disque et sondes de vie maîtrisés.
  Ils ne balaient jamais le répertoire temporaire réel des sessions ni les identifiants du propriétaire.
  Aucun harnais, plancher, configuration d'accès ou politique de reconnexion n'est modifié.

## Critères d'acceptation

1. Le balayage reçoit deux candidats anciens de préfixe connu, avec propriétaires morts établis.
   Une suppression injectée échoue pour le premier et réussit pour le second. Le premier reste
   intact, son diagnostic nomme le candidat, l'opération et le code ; le second est supprimé et
   figure dans le résultat. Le balayage se termine sans rejet global ni fausse annonce de suppression.
2. Un `lstat` refusé et une lecture de propriétaire refusée sont diagnostiqués avec leur étape ;
   les candidats incertains restent en place. Un candidat disparu entre lecture et suppression
   n'est pas présenté comme une fuite. Les arbres récents, préfixes étrangers et propriétaires
   vivants restent exclus ; EPERM à la sonde de vie ne vaut jamais confirmation de disparition.
3. Le test de fermeture retient la réponse du transport : tant qu'elle n'annonce pas le groupe parti,
   aucun `rm` de l'arbre n'est tenté. Une réponse `false` conserve la barrière et l'arbre. Après
   confirmation, un `rm` injecté en refus laisse l'arbre et produit le diagnostic ; les appels
   simultanés gardent leur contrat, sans masquer l'erreur initiale par celle du journal.
4. Le test direct du module partagé de `runtime/`, appelé par les deux hôtes, injecte le balayeur,
   la racine et le journal : refus et suppressions réussies atteignent ce journal, sans rejet global
   après un refus de nettoyage. Il prouve aussi qu'un journal défaillant ne bloque pas ce raccord.
   Aucun test sur `server/main.cjs` n'est demandé : la preuve passe par ce module partagé. Les trois bancs
   d'hôte cités au périmètre ne balaient toujours rien de réel : leur balayeur neutralisé est le seul appelé. L'identité du candidat suffit à le retrouver localement ;
   aucun contenu de fichier d'authentification ou lien secret n'est exposé dans l'état ou une réponse.
5. Une suppression nominale retire l'arbre et ses liens, jamais les fichiers d'authentification
   pointés. Les tests existants de confinement, de rotation et de fermeture restent actifs ; aucune
   nouvelle connexion n'est autorisée parce qu'un simple délai a expiré.
6. À l'implémentation, exécuter en séquentiel codex-confinement, codex-connect-race,
   codex-abandoned-turn, codex-thread-rotation et le test direct codex-cleanup, puis
   `node scripts/check.mjs`. Aucune utilisation de Codex réel, TV, VPS ou quota n'est requise.

## Test d'acceptation attendu

`tests/codex-confinement.test.cjs` appelle le vrai balayage sur un arbre temporaire, injecte les refus
par opération et recueille le diagnostic. Un test du vrai client et d'un transport contrôlé vérifie
l'ordre confirmation/suppression et le refus disque après confirmation. Le test direct du module partagé de runtime vérifie que ce signal atteint le journal du balayage.
Les deux hôtes appellent ce module ; aucun banc de `server/main.cjs` n'est ajouté.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La fréquence des refus, la durée de survie des arbres et la consommation des groupes résiduels ne
sont pas mesurées. L'ADR 0005 admet le chevauchement entre clients successifs : ce ticket le rend
diagnosticable, sans promettre un propriétaire global ni une reprise automatique du nettoyage.
Le code actuel confond une lecture de propriétaire refusée avec un propriétaire mort ; la conservation
prudente du candidat incertain applique ici l'invariant de non-suppression, sans étendre le balayage.

## Journal

### Exploration Codex

- Lecture des règles, de la skill, des modules, de leurs appelants/tests et des ADR 0005, 0022 et 0032.
- `git status --short` et `git diff -- docs/travail/tickets/198-diagnose-a-private-codex-tree-left-behind-after-a-refused.md` : statut déjà en-cours ; deux répertoires non suivis hors périmètre.
- Exploration et absence d'écart prévues consignées dans `.harness-state/tickets/T198/`.

### Diagnostics et conservation prudente

- `node --test --test-name-pattern='a refused stale tree removal' tests/codex-confinement.test.cjs` : rouge observé (diagnostic absent), puis vert, 1/1.
- `node --test --test-name-pattern='refused candidate metadata|only ESRCH proves|invalid owner|candidate disappearing|failed diagnostic never' tests/codex-confinement.test.cjs` : rouge observé sur les lectures et sondes incertaines, puis commande élargie aux suppressions et exclusions nominales : 15/15 verts.
- `node --test --test-name-pattern='shared closings keep|refused client cleanup reaches' tests/codex-connect-race.test.cjs` : 2 rouges sur les diagnostics absents, puis 2/2 verts. Confirmation retenue, réponse false, suppression unique partagée et erreur EACCES d'origine conservée malgré un journal qui lève.
- `node --test tests/codex-cleanup.test.cjs` : 5 rouges sur les assertions avec une façade initialement sans comportement, puis 5/5 verts avec le vrai balayeur injecté, racines isolées et journaux synchrones/asynchrones défaillants.
- Sorties rouge/vert conservées dans `.harness-state/tickets/T198/*-red.log` et `*-green.log`.

### Contrôles ciblés et lisibilité

- Premier `node scripts/check.mjs --changed` : 45/45 tests verts, contrôle rouge au lint (complexité du balayage et taille du fichier). Traitement d'un candidat séparé du parcours ; listes de constantes regroupées. Aucun gel ni plancher modifié.
- `node_modules/.bin/eslint adapters/codex-confinement.cjs adapters/codex-session-client.cjs runtime/codex-cleanup.cjs tests/codex-confinement.test.cjs tests/codex-connect-race.test.cjs tests/codex-cleanup.test.cjs` : sortie 0, aucun diagnostic.
- `node --test --test-concurrency=1 tests/codex-confinement.test.cjs tests/codex-connect-race.test.cjs tests/codex-abandoned-turn.test.cjs tests/codex-thread-rotation.test.cjs tests/codex-cleanup.test.cjs` : 60/60 verts, aucun ignoré.

### Raccord Mac et contrôle complet initial

- `node scripts/check.mjs --changed` après découpage : vert, 45/45 tests ; règles, format, lint, gel et cliquet verts.
- Premier `node scripts/check.mjs` complet : règles/format/lint/gel/cliquet verts ; 1 977/1 979 tests JS verts, 22/22 Python verts. Deux assertions Mac attendaient les anciens arguments vides du balayeur.
- `node --test --test-name-pattern='every bridge call has its handler|a Mac session is archived instead' tests/mac-ipc-contract.test.cjs` : 2/2 rouges reproduits sur ce contrat d'arguments, puis 2/2 verts après adaptation explicite au raccord injecté.
- Le banc vérifie toujours le balayeur neutralisé unique, le démarrage sans attendre sa réponse, l'absence de nouvel appel pendant la session/fermeture, et désormais la racine, le callback de diagnostic et le refus effectivement journalisé. Adaptation consignée dans `ecarts.md` ; aucune preuve retirée.

### Validation finale Codex

- `node scripts/check.mjs --changed` : vert ; règles, format, lint, gel et cliquet verts ; 75/75 tests JS sur les quatre fichiers modifiés.
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet verts ; 1 979/1 979 tests JS sur 128 fichiers et 22/22 tests Python. Les trois bancs d'hôte cités restent actifs et leurs balayeurs neutralisés restent appelés.
- Le diagnostic stable indique l'identité locale du candidat, l'opération et le code système ; aucune erreur brute ni contenu d'authentification n'est ajouté au journal ou aux réponses.
- Les propriétaires incertains restent protégés ; une fermeture partagée conserve son erreur initiale ; les deux hôtes utilisent le raccord partagé avec leur balayeur injecté.
- Verdict `TERMINÉ` remis dans `.harness-state/tickets/T198/verdict.json`. Aucun commit ni push ; la boucle garde la relecture et l'intégration.

### Reprise après relecture 1

- Rapport, ticket/journal, écarts, `git status --short` et diff relus ; les deux constats mineurs sont retenus.
- Extraction prévue dans `adapters/codex-context-cleanup.cjs`, déclarée dans `ecarts.md` conformément à la correction demandée ; les exports du confinement et les coutures des hôtes restent conservés.
- Le banc de refus utilisera une racine contenant `private` pour reproduire le second constat sans dépendre du chemin temporaire de la machine.

### Correction des deux constats mineurs

- Avant correction, les cinq suites ciblées en séquentiel restent vertes : 60/60 (`correction-1-baseline.log`).
- `node --test --test-name-pattern='a refused stale tree removal' tests/codex-confinement.test.cjs` avec une racine contenant `private` : rouge observé sur l'ancienne assertion, puis 1/1 vert en visant `contains private details`. La comparaison exacte du diagnostic reste active.
- Restauration des listes : le contrôle rapide du hook puis `node_modules/.bin/eslint adapters/codex-confinement.cjs` signalent 409 lignes utiles, au-delà de 400.
- Extraction sans changement de comportement vers `adapters/codex-context-cleanup.cjs` : balayage, préfixes et diagnostic. Réexports conservés par le confinement ; `ENVIRONMENT_KEYS` retrouve sa présentation initiale, et les préfixes déplacés gardent une entrée par ligne.
- `node_modules/.bin/eslint adapters/codex-confinement.cjs adapters/codex-context-cleanup.cjs` : sortie 0, aucun diagnostic. Aucun gel ou plancher modifié.

### Validation après correction de la relecture 1

- `node --test --test-concurrency=1 tests/codex-confinement.test.cjs tests/codex-connect-race.test.cjs tests/codex-abandoned-turn.test.cjs tests/codex-thread-rotation.test.cjs tests/codex-cleanup.test.cjs` : 60/60 verts après extraction, aucun ignoré (`correction-1-targeted-tests.log`).
- `node scripts/check.mjs --changed` : vert ; règles, format, lint, gel et cliquet verts ; 75/75 tests JS (`correction-1-check-changed.log`).
- `node scripts/check.mjs` : vert ; règles, format, lint, gel et cliquet verts ; 1 979/1 979 tests JS sur 128 fichiers et 22/22 tests Python (`correction-1-check-full.log`). Les trois bancs d'hôte restent actifs.
- Les deux mineurs sont corrigés sans contestation ni retrait de preuve. Nouveau verdict `TERMINÉ` remis à la boucle ; aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T198/relecture-2.md : Nombre de constats discordant : CONSTATS annonce 2 hors périmètre ; 0 constat(s) extrait(s). Consulter le rapport pour l'ensemble des constats hors périmètre.
