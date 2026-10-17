---
id: T236
titre: Share the session coordinator from the headless lifecycle
statut: a-faire
bloque_par: T234, T235, T253
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: critique
---

## Ce que le ticket livre

Le serveur utilise `SessionCoordinator`, dans `runtime/library/`, issu de son coordinateur
actuel. Les capacités et étapes propres à un hôte sont explicites ; le coordinateur appelle
les obligations et conserve le cycle de ressources de chaque session. Le Mac migrera par lots suivants.

## Sources

- `docs/domaine.md`, sections Bibliothèque, 6, 8 et 10 ; ADR 0030 appliquée ici, ADR 0029,
  0002/0003/0004/0006/0007/0020/0023/0024. T234 est le contrat préalable ; T250 livre son
  résultat de fin et T253 déplace la traduction HTTP hors du cycle de vie avant cette extraction.
- Code vérifié à `1d8aa48` : `runtime/headless-session-lifecycle.cjs:10` possède transitions
  et faits de l'hôte ; `runtime/headless-session-lifecycle.cjs:53` sérialise ;
  `runtime/headless-session-lifecycle.cjs:75` adopte questions et session sans attente ;
  `runtime/headless-session-lifecycle.cjs:186` coalesce la fin et
  `runtime/headless-session-lifecycle.cjs:301` ferme l'hôte. `captureEpoch` appartient à ce propriétaire.
- `runtime/headless-runtime.cjs:55` le compose ; `runtime/headless-runtime.cjs:188` expose
  ses lectures de compatibilité et `runtime/headless-runtime.cjs:389` ses commandes.
  `server/session-routes.cjs:57` et `server/session-routes.cjs:66` adaptent les gestes HTTP.
- `runtime/headless-session-lifecycle.cjs:132` remet les étapes serveur au protocole
  `runtime/session-closing.cjs:53`, seul propriétaire actuel des sorts/diagnostics de fin.
  `runtime/session-lifecycle.cjs:32` conserve, pour chaque runtime, sa fermeture de ressources,
  sa confirmation de cette vie et son dernier refus ; il ne doit pas devenir un état global d'hôte.
- Dépendances actuelles à traiter : `runtime/headless-session-lifecycle.cjs:6` importe un
  constructeur de refus HTTP ; `runtime/headless-session-lifecycle.cjs:7` lit capture-intake.
  Les nouvelles sous-zones de T205 n'héritent pas des droits de la zone plate :
  `tests/architecture.test.cjs:17`. Une simple copie de fichier ne suffit pas à appliquer la cible.
- Filets : `tests/headless-session-lifecycle.test.cjs:11`,
  `tests/headless-session-lifecycle.test.cjs:261`, `tests/architecture-f07.test.cjs:305`,
  `tests/mac-ipc-contract.test.cjs:104` et `tests/wire-contract.test.cjs:51`.
  T235 apporte la fiche et son seul rédacteur ; ses dépendances impliquent toute la phase 1
  modifiant headless-runtime, session-runtime et ces bancs.

## Périmètre

- Créer `runtime/library/session-coordinator.cjs` et sa fabrique publique. Extraire les
  transitions existantes, sans second moteur de cycle de vie. Le serveur le compose à la
  place de `createHeadlessSessionLifecycle` ; l'ancien module peut rester une façade temporaire
  sans état/règle propre, avec condition de retrait décrite par son comportement, sans identifiant
  de ticket dans le code ni dans `TEMPORARY_IMPORT_EXCEPTIONS` (`tests/architecture.test.cjs:28-31`).
- Le coordinateur reste seul propriétaire de la session chargée, chaîne de transitions,
  origine fraîche, fin/arrêt en cours, dernière issue et époque de capture. Ne pas recopier
  ces faits dans `HeadlessRuntime` ou dans SessionRecord. Garder les getters/délégations utiles
  jusqu'au lot de contraction ; ne pas anticiper leur suppression.
- Définir les capacités par ports/étapes réels et testables, injectés par la composition :
  création/ouverture, bibliothèque, accès conversation/checkpoint, surveillance, admission,
  préparations, préchauffage, publication et diagnostic. Prévoir les étapes propres MCP/résumé
  sans importer Electron ni ajouter une fausse implémentation Mac. Une obligation déclarée
  manquante refuse la composition, elle ne devient pas un callback optionnel silencieux.
- Appeler directement le préambule et les étapes obligatoires du contrat T234, dans l'ordre
  commun serveur fixé par l'ADR 0030. Garder `session-closing` comme unique protocole ou lui
  déléguer explicitement ; ne pas recopier sort, journal ou collecte d'erreurs. Aucun abonné
  à EndStarted/SessionArchived ne porte seul annulation, révocation, sauvegarde ou scellement.
- Conserver les ressources de chaque session sous `runtime/session-lifecycle.cjs` : restauration,
  landed, révocation d'inspection, fermeture une fois, flush, manifeste final et seal. Le
  coordinateur orchestre ses commandes ; il ne remonte pas leurs champs privés dans son état.
  La fiche T235 reçoit les seuls faits déjà établis, jamais une confirmation anticipée.
- Les refus sont déjà codés et traduits par le serveur ; le coordinateur n'importe pas
  `runtime/errors.cjs`. Préserver exactement les refus et séquences `/v1`. Aucun adaptateur
  n'est importé dans ce module applicatif.
- Déclarer `runtime/library/**` et ses permissions exactes selon T205, accès aux domaines par
  leurs index publics. Pour les services encore plats nécessaires, nommer chaque exception
  temporaire exacte avec arête, raison et condition de retrait ; aucune ouverture générale.
  Ne pas importer `runtime/compose/` depuis le coordinateur. Injecter les minuteries nécessaires.
- Adapter le banc headless au nouveau propriétaire et exécuter le contrat T234 pour serveur
  et Mac actuel. La migration des gestes Mac, de sa fin et de ses variables appartient à
  T237/T238/T239/T245 ; pause TV, ciblage des requêtes et file par session restent hors lot.
  Ne pas réintroduire snapshot hérité, réglage de rétention ou vocabulaire retiré en phase 1.
- Écrire l'ADR d'application de 0030, avec matrice capacités/obligations, façades et exceptions,
  lié avec une phrase dans `docs/architecture.md`, Décisions, et mettre sa carte à jour.
  Le code extrait arrive sans gel ; élaguer les suppressions devenues inutiles sans les déplacer.

## Critères d'acceptation

1. Démarrage, pause, reprise explicite, ouverture silencieuse, fin, suppression et arrêt du serveur
   traversent le coordinateur partagé ; il existe une seule référence modifiable et une chaîne
   qui reprend après rejet. Fins et arrêts concurrents gardent leurs promesses coalescées.
2. Adoption atomique : un lecteur ne voit jamais session A avec les questions/projection de B.
   Une restauration refusée garde l'ancienne référence et interdit l'effacement sous elle.
   Le contrat de lecture cohérente T192 et l'origine fraîche T191 restent prouvés.
3. Le contrat T234 passe sans exemption nouvelle : préambule avant attente, toutes les obligations
   tentées, aucun succès global si l'une échoue, faits archive/scellement/déchargement distincts.
   L'échec d'une réaction facultative ou de son diagnostic ne porte pas ces obligations.
4. Écritures admises attendues, préparations annulées avant attente puis attendues dans leur borne
   à chaque fin nécessaire, aucune adoption d'une opération ancienne après réouverture du même id.
   Archive refusée non confirmée, réessai sans double fermeture, rien d'effacé sans scellement,
   aucun dossier recréé par des écritures tardives ; outils/baux gardent l'ADR 0004.
5. Archive lue seule : aucun fournisseur, préchauffage, indexation ni réécriture ; reprise refusée
   par le disque sans changement d'horloge ou de captures. Le serveur conserve ses réponses,
   codes/statuts, ETags/304 et séquences T038 ; le producteur T204 conserve son contrat.
6. La garde refuse adaptateur, domaine privé et composition importés depuis le coordinateur ;
   seules les arêtes de transition nommées sont permises. La garde
   `tests/architecture-f07.test.cjs:585-597` vise le nouveau propriétaire de la fin à la place
   de `runtime/headless-session-lifecycle.cjs`, avec les mêmes assertions ; la façade éventuelle
   n'appelle pas `closeSession`.
7. À l'implémentation, jouer contrat T234, `headless-session-lifecycle`, `session-lifecycle`,
   `capture-intake`, `server-sessions`, `server-routes`, `server-state-views`, `architecture-f06/f07`,
   banc Mac, `wire-contract`, banc Python T204 et gardes en séquentiel, puis
   `node scripts/check.mjs`. Aucun test, assertion de durabilité ou plancher affaibli.

## Test d'acceptation attendu

Les scénarios publics de `tests/headless-session-lifecycle.test.cjs` conduisent la nouvelle
fabrique avec ressources différées et vrai protocole/ingestion. Les tests HTTP et T038 passent
ensuite par la vraie composition serveur. Le contrat T234 exécute la même matrice de pannes
sur les deux hôtes, sans obliger le Mac à migrer dans ce lot et sans fournisseur réel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

L'interface exacte est celle du contrat T234 et de la fiche T235 livrés, pas une API
réputée présente à `1d8aa48`. Les refus de T253 sont déjà codés et traduits dans le serveur ;
ce lot extrait le coordinateur après ces prérequis et leur contrat vert.

## Journal
