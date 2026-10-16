---
id: T198
titre: Diagnose a private Codex tree left behind after a refused cleanup
statut: a-faire
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
